import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';
import { User, Mail, Phone, X, Check } from 'lucide-react-native';
import type { MainTabParamList, RootStackParamList } from '../../App';
import { theme } from '../theme/colors';
import { API_URL } from '../config/api';
import type { MePayload } from '../utils/profileCache';
import { loadCachedMe, persistMePayload } from '../utils/profileCache';
import { useAlert } from '../context/AlertContext';
import { clearBiometricSessionToken, isBiometricSupported, setBiometricSessionToken } from '../auth/biometric';
import {
  loadReminderPrefs,
  saveReminderPrefs,
  syncDailyExpenseReminder,
  openAlarmSettingsIfNeeded,
  isBatteryOptimizationIssue,
  type DailyReminderPrefs,
} from '../reminders/dailyExpenseReminder';
import ProfileScrollBody from './ProfileScrollBody';
import { profileScreenStyles as styles } from './profileScreenStyles';
import { ModalKeyboardRoot } from '../components/KeyboardSafeViews';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Me'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ProfileScreen({ navigation }: Props) {
  const { showAlert } = useAlert();
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit Profile State
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // App Lock State
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(19);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderPrefsLoaded, setReminderPrefsLoaded] = useState(false);
  const [reminderScheduleInfo, setReminderScheduleInfo] = useState<string | null>(null);
  const [showBatteryWarn, setShowBatteryWarn] = useState(false);

  const formatReminderTime = (h: number, m: number) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const persistReminderAndSync = async (prefs: DailyReminderPrefs) => {
    await saveReminderPrefs(prefs);
    setReminderEnabled(prefs.enabled);
    setReminderHour(prefs.hour);
    setReminderMinute(prefs.minute);
    setReminderMessage(prefs.message);
    const r = await syncDailyExpenseReminder(prefs);
    if (!r.ok && r.reason === 'notification_permission') {
      await saveReminderPrefs({ ...prefs, enabled: false });
      setReminderEnabled(false);
      setReminderScheduleInfo(null);
      showAlert({
        title: 'Notifications off',
        message:
          'Daily Khata notifications are OFF. Go to Settings → Apps → Daily Khata → Notifications, turn it ON (and enable the channel), then try again.',
        type: 'warning',
      });
      return;
    }
    if (!r.ok && r.reason === 'unknown') {
      setReminderScheduleInfo(null);
      showAlert({
        title: 'Reminder schedule failed',
        message: String((r as { error?: unknown }).error ?? 'Unknown error'),
        type: 'error',
      });
      return;
    }
    if (!r.ok && r.reason === 'alarm_permission') {
      setReminderScheduleInfo(null);
      showAlert({
        title: 'Exact alarms required',
        message: 'Go to Settings → Apps → Daily Khata → Alarms & reminders → Allow, then toggle the reminder OFF and ON again.',
        type: 'warning',
        buttons: [
          { text: 'Open settings', onPress: () => openAlarmSettingsIfNeeded() },
          { text: 'OK', style: 'cancel' },
        ],
      });
      return;
    }
    if (r.ok && prefs.enabled && 'nextFireLabel' in r && r.nextFireLabel) {
      const exactHint =
        Platform.OS === 'android' && r.usedExactAlarm === false
          ? ' — for exact timing: Settings → Apps → Daily Khata → Alarms & reminders → Allow.'
          : '';
      setReminderScheduleInfo(`Scheduled: ${r.nextFireLabel}${exactHint}`);
      // Battery optimization check — common culprit on Xiaomi/Samsung/OnePlus etc.
      isBatteryOptimizationIssue().then(setShowBatteryWarn).catch(() => {});
    } else {
      setReminderScheduleInfo(null);
      setShowBatteryWarn(false);
    }
  };



  useEffect(() => {
    AsyncStorage.getItem('app_lock_enabled').then(val => {
      setAppLockEnabled(val === 'true');
    });
    AsyncStorage.getItem('biometric_enabled').then(val => {
      setBiometricEnabled(val === 'true');
    });
    isBiometricSupported().then(setBiometricSupported);
    loadReminderPrefs().then((p) => {
      setReminderEnabled(p.enabled);
      setReminderHour(p.hour);
      setReminderMinute(p.minute);
      setReminderMessage(p.message);
      setReminderPrefsLoaded(true);
    });
  }, []);

  const toggleAppLock = async () => {
    if (!appLockEnabled) {
      // Navigate to setup mode
      const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
      parent?.navigate('Lock', { mode: 'setup' });
    } else {
      setAppLockEnabled(false);
      await AsyncStorage.removeItem('app_lock_enabled');
      await AsyncStorage.removeItem('app_pin');
      setBiometricEnabled(false);
      await AsyncStorage.removeItem('biometric_enabled');
      await clearBiometricSessionToken();
      showAlert({
        title: 'App Lock',
        message: 'App Lock disabled.',
        type: 'success'
      });
    }
  };

  const toggleBiometric = async () => {
    if (!biometricSupported) {
      showAlert({
        title: 'Not supported',
        message: 'Your device does not support biometric authentication.',
        type: 'error',
      });
      return;
    }
    if (!appLockEnabled) {
      showAlert({
        title: 'Enable App Lock first',
        message: 'Turn on App Lock (PIN) before enabling biometrics.',
        type: 'warning',
      });
      return;
    }
    const next = !biometricEnabled;
    setBiometricEnabled(next);
    await AsyncStorage.setItem('biometric_enabled', next ? 'true' : 'false');
    if (next) {
      const token = await AsyncStorage.getItem('khata_session');
      if (token) await setBiometricSessionToken(token);
      showAlert({ title: 'Biometrics', message: 'Biometric unlock enabled.', type: 'success' });
    } else {
      await clearBiometricSessionToken();
      showAlert({ title: 'Biometrics', message: 'Biometric unlock disabled.', type: 'success' });
    }
  };

  const fetchMe = useCallback(async (isRefresh: boolean, hasCachedMe: boolean) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (!hasCachedMe) setLoading(true);
      const token = await AsyncStorage.getItem('khata_session');
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const { data } = await axios.get<MePayload>(`${API_URL}/profile/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMe(data);
      await persistMePayload(data);
    } catch {
      const cached = await loadCachedMe();
      if (cached) setMe(cached);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const cached = await loadCachedMe();
        if (cancelled) return;
        if (cached) setMe(cached);
        await fetchMe(false, !!cached);
      })();
      return () => {
        cancelled = true;
      };
    }, [fetchMe])
  );

  useFocusEffect(
    useCallback(() => {
      if (!reminderPrefsLoaded) return;
      (async () => {
        const p = await loadReminderPrefs();
        if (p.enabled) {
          const r = await syncDailyExpenseReminder();
          if (!r.ok && r.reason === 'alarm_permission') {
            showAlert({
              title: 'Exact alarms required',
              message:
                'Go to Settings → Apps → Daily Khata → Alarms & reminders → Allow, then toggle the reminder OFF and ON again.',
              type: 'warning',
              buttons: [
                { text: 'Open settings', onPress: () => openAlarmSettingsIfNeeded() },
                { text: 'OK', style: 'cancel' },
              ],
            });
          }
          if (!r.ok && r.reason === 'notification_permission') {
            showAlert({
              title: 'Notifications off',
              message: 'Please turn ON Daily Khata notifications and try again.',
              type: 'warning',
            });
          }
        }
      })();
    }, [reminderPrefsLoaded])
  );

  const onLogout = () => {
    showAlert({
      title: 'Sign out',
      message: 'Leave Daily-KHATA?',
      type: 'confirm',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove(['khata_session', 'khata_profile']);
            navigation.getParent()?.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
          },
        },
      ],
    });
  };

  const openUpgrade = () => {
    const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
    parent?.navigate('UpgradePlan');
  };

  const openEditProfile = () => {
    if (me) {
      setEditName(me.user.full_name);
      setEditPhone(me.user.phone || '');
      setIsEditModalVisible(true);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editName.trim()) {
      showAlert({
        title: 'Error',
        message: 'Name cannot be empty',
        type: 'error'
      });
      return;
    }

    try {
      setIsUpdating(true);
      const token = await AsyncStorage.getItem('khata_session');
      if (!token) return;

      const { data } = await axios.put(`${API_URL}/profile/me`, {
        full_name: editName.trim(),
        phone: editPhone.trim(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Update local state and cache
      const updatedMe = {
        ...me!,
        user: {
          ...me!.user,
          full_name: data.user.full_name,
          phone: data.user.phone,
        },
      };
      setMe(updatedMe);
      await persistMePayload(updatedMe);
      
      setIsEditModalVisible(false);
      showAlert({
        title: 'Success',
        message: 'Profile updated successfully',
        type: 'success'
      });
    } catch (error: any) {
      showAlert({
        title: 'Error',
        message: error.response?.data?.error || 'Failed to update profile',
        type: 'error'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const tier = me?.subscription?.tier ?? 'free';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.screenFill} collapsable={false}>
        <ProfileScrollBody
          refreshing={refreshing}
          onRefresh={() => fetchMe(true, true)}
          me={me}
          loading={loading}
          tier={tier}
          appLockEnabled={appLockEnabled}
          biometricEnabled={biometricEnabled}
          biometricSupported={biometricSupported}
          reminderEnabled={reminderEnabled}
          reminderHour={reminderHour}
          reminderMinute={reminderMinute}
          reminderMessage={reminderMessage}
          reminderScheduleInfo={reminderScheduleInfo}
          showBatteryWarn={showBatteryWarn}
          openEditProfile={openEditProfile}
          openUpgrade={openUpgrade}
          toggleAppLock={toggleAppLock}
          toggleBiometric={toggleBiometric}
          onLogout={onLogout}
          persistReminderAndSync={persistReminderAndSync}
          setReminderMessage={setReminderMessage}
          formatReminderTime={formatReminderTime}
        />

      </View>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <ModalKeyboardRoot style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)} hitSlop={12}>
                <X size={24} color={theme.black} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <View style={styles.inputWrapper}>
                  <User size={18} color={theme.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Enter your name"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <View style={styles.inputWrapper}>
                  <Phone size={18} color={theme.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="Enter phone number"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.infoBox}>
                <Mail size={16} color={theme.textMuted} />
                <Text style={styles.infoText}>Email cannot be changed.</Text>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, isUpdating && styles.saveBtnDisabled]}
                onPress={handleUpdateProfile}
                disabled={isUpdating}
                activeOpacity={0.8}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={theme.black} />
                ) : (
                  <>
                    <Check size={20} color={theme.black} />
                    <Text style={styles.saveBtnTxt}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ModalKeyboardRoot>
      </Modal>
    </SafeAreaView>
  );
}
