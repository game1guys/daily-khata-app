import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';
import { LogOut, User, Mail, Phone, Crown, ChevronRight, Edit2, X, Check, Lock, Bell, Clock } from 'lucide-react-native';
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
  sendTestNotificationNow,
  type DailyReminderPrefs,
} from '../reminders/dailyExpenseReminder';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Me'>,
  NativeStackScreenProps<RootStackParamList>
>;

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  premium_mon: 'Premium (Monthly)',
  premium_yr: 'Premium (Yearly)',
  premium_life: 'Premium (Lifetime)',
};

function tierLabel(tier: string) {
  return TIER_LABELS[tier] ?? tier;
}

function formatEndDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [reminderPrefsLoaded, setReminderPrefsLoaded] = useState(false);
  const [reminderScheduleInfo, setReminderScheduleInfo] = useState<string | null>(null);
  const [testNotifLoading, setTestNotifLoading] = useState(false);

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
    const r = await syncDailyExpenseReminder();
    if (!r.ok && r.reason === 'notification_permission') {
      await saveReminderPrefs({ ...prefs, enabled: false });
      setReminderEnabled(false);
      setReminderScheduleInfo(null);
      showAlert({
        title: 'Notifications off',
        message: 'Allow notifications for Daily Khata so the daily reminder can appear.',
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
    if (r.ok && prefs.enabled && 'nextFireLabel' in r && r.nextFireLabel) {
      const exactHint =
        Platform.OS === 'android' && r.usedExactAlarm === false
          ? ' — bilkul fix time ke liye Settings → Apps → Daily Khata → Alarms & reminders → Allow.'
          : '';
      setReminderScheduleInfo(`Pehli reminder: ${r.nextFireLabel}${exactHint}`);
    } else {
      setReminderScheduleInfo(null);
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
        if (p.enabled) await syncDailyExpenseReminder();
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchMe(true, true)} tintColor={theme.black} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.yellow}>
            <Text style={styles.screenTitle}>Me</Text>
            {me && (
              <TouchableOpacity style={styles.editBtn} onPress={openEditProfile}>
                <Edit2 size={20} color={theme.black} />
              </TouchableOpacity>
            )}
          </View>

          {loading && !me ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.black} />
            </View>
          ) : null}

          {me ? (
            <>
              <View style={styles.avatarRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarTxt}>{initials(me.user.full_name)}</Text>
                </View>
                <View style={styles.avatarMeta}>
                  <Text style={styles.displayName}>{me.user.full_name}</Text>
                  <Text style={styles.memberSince}>
                    Member since {formatEndDate(me.member_since ?? undefined)}
                  </Text>
                </View>
              </View>

              <View style={styles.planBanner}>
                <View style={styles.planHeaderRow}>
                  <Crown size={22} color={theme.black} />
                  <Text style={styles.planTitle}>Your plan</Text>
                </View>
                <Text style={styles.planTier}>{tierLabel(tier)}</Text>
                <Text style={styles.planRenew}>
                  {tier === 'free'
                    ? 'Upgrade for full analytics and exports.'
                    : `Renews / valid until ${formatEndDate(me.subscription.end_date)}`}
                </Text>
                <TouchableOpacity
                  style={[styles.upgradeBannerBtn, tier === 'free' && styles.upgradeBannerBtnFree]}
                  onPress={openUpgrade}
                  activeOpacity={0.9}
                >
                  {tier === 'free' && <Crown size={18} color={theme.black} />}
                  <Text style={styles.upgradeBannerBtnTxt}>
                    {tier === 'free' ? 'Upgrade to Premium' : 'Manage Subscription'}
                  </Text>
                  <ChevronRight size={20} color={theme.black} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Account</Text>
              <View style={styles.detailRow}>
                <Mail size={18} color={theme.textMuted} />
                <View style={styles.detailTextWrap}>
                  <Text style={styles.detailMuted}>Email</Text>
                  <Text style={styles.detailValue}>{me.user.email ?? '—'}</Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <Phone size={18} color={theme.textMuted} />
                <View style={styles.detailTextWrap}>
                  <Text style={styles.detailMuted}>Phone</Text>
                  <Text style={styles.detailValue}>{me.user.phone ?? '—'}</Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <User size={18} color={theme.textMuted} />
                <View style={styles.detailTextWrap}>
                  <Text style={styles.detailMuted}>User ID</Text>
                  <Text style={styles.detailValueMono} numberOfLines={1}>
                    {me.user.id}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Security</Text>
              <TouchableOpacity style={styles.detailRow} onPress={toggleAppLock} activeOpacity={0.7}>
                <Lock size={18} color={theme.textMuted} />
                <View style={styles.detailTextWrap}>
                  <Text style={styles.detailMuted}>App Lock (PIN/Fingerprint)</Text>
                  <Text style={[styles.detailValue, { color: appLockEnabled ? '#10B981' : theme.textMuted }]}>
                    {appLockEnabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
                <Check size={20} color={appLockEnabled ? '#10B981' : 'transparent'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.detailRow, !biometricSupported ? { opacity: 0.5 } : null]}
                onPress={toggleBiometric}
                activeOpacity={0.7}
                disabled={!biometricSupported}
              >
                <Lock size={18} color={theme.textMuted} />
                <View style={styles.detailTextWrap}>
                  <Text style={styles.detailMuted}>Biometric Unlock</Text>
                  <Text style={[styles.detailValue, { color: biometricEnabled ? '#10B981' : theme.textMuted }]}>
                    {biometricSupported ? (biometricEnabled ? 'Enabled' : 'Disabled') : 'Not supported'}
                  </Text>
                </View>
                <Check size={20} color={biometricEnabled ? '#10B981' : 'transparent'} />
              </TouchableOpacity>

              <Text style={styles.sectionLabel}>Reminders</Text>
              <View style={styles.reminderCard}>
                <View style={styles.reminderTopRow}>
                  <Bell size={18} color={theme.textMuted} />
                  <View style={styles.reminderTextWrap}>
                    <Text style={styles.detailMuted}>Daily expense reminder</Text>
                    <Text style={styles.reminderHint}>
                      Roz isi samay notification. Agar aaj ka time nikal gaya ho to pehli alert kal aayegi — neeche time dikhega.
                    </Text>
                  </View>
                  <Switch
                    value={reminderEnabled}
                    onValueChange={(v) =>
                      persistReminderAndSync({
                        enabled: v,
                        hour: reminderHour,
                        minute: reminderMinute,
                        message: reminderMessage.trim() || 'Ab apne expenses add karein.',
                      })
                    }
                    trackColor={{ false: theme.border, true: '#fde047' }}
                    thumbColor={theme.white}
                  />
                </View>
                {reminderEnabled ? (
                  <>
                    <TouchableOpacity
                      style={styles.reminderTimeRow}
                      onPress={() => setShowTimePicker(true)}
                      activeOpacity={0.75}
                    >
                      <Clock size={18} color={theme.textMuted} />
                      <View style={styles.reminderTextWrap}>
                        <Text style={styles.detailMuted}>Samay</Text>
                        <Text style={styles.detailValue}>{formatReminderTime(reminderHour, reminderMinute)}</Text>
                      </View>
                      <ChevronRight size={20} color={theme.textMuted} />
                    </TouchableOpacity>
                    <View style={styles.reminderMessageBox}>
                      <Text style={styles.detailMuted}>Reminder ka text</Text>
                      <TextInput
                        style={styles.reminderTextInput}
                        value={reminderMessage}
                        onChangeText={setReminderMessage}
                        onEndEditing={(e) =>
                          persistReminderAndSync({
                            enabled: reminderEnabled,
                            hour: reminderHour,
                            minute: reminderMinute,
                            message: e.nativeEvent.text.trim() || 'Ab apne expenses add karein.',
                          })
                        }
                        placeholder="e.g. Ab expenses add karo"
                        placeholderTextColor={theme.textMuted}
                        multiline
                        maxLength={200}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.reminderTestBtn}
                      disabled={testNotifLoading}
                      onPress={async () => {
                        try {
                          setTestNotifLoading(true);
                          const tr = await sendTestNotificationNow();
                          if (tr.ok) {
                            showAlert({
                              title: 'Test bheja',
                              message:
                                'Abhi ek notification aani chahiye. Nahi aaya? App info → Notifications ON, battery unrestricted.',
                              type: 'success',
                            });
                          } else {
                            showAlert({
                              title: 'Test fail',
                              message: 'Notification permission check karo.',
                              type: 'error',
                            });
                          }
                        } finally {
                          setTestNotifLoading(false);
                        }
                      }}
                    >
                      {testNotifLoading ? (
                        <ActivityIndicator size="small" color={theme.black} />
                      ) : (
                        <Text style={styles.reminderTestBtnTxt}>Abhi test notification bhejo</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>

              <TouchableOpacity style={styles.upgradeOutline} onPress={openUpgrade} activeOpacity={0.9}>
                <Crown size={20} color={theme.black} />
                <Text style={styles.upgradeOutlineTxt}>Plans & payment</Text>
                <ChevronRight size={20} color={theme.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.outBtn} onPress={onLogout} activeOpacity={0.9}>
                <LogOut size={20} color={theme.black} />
                <Text style={styles.outTxt}>Sign out</Text>
              </TouchableOpacity>
            </>
          ) : !loading ? (
            <Text style={styles.fallback}>Could not load profile. Pull to refresh.</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
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
        </KeyboardAvoidingView>
      </Modal>

      {Platform.OS === 'ios' ? (
        <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
          <TouchableOpacity
            style={styles.timeModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowTimePicker(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.timeModalSheet}>
                <DateTimePicker
                  value={new Date(new Date().setHours(reminderHour, reminderMinute, 0, 0))}
                  mode="time"
                  display="spinner"
                  onChange={(_, date) => {
                    if (date) {
                      void persistReminderAndSync({
                        enabled: reminderEnabled,
                        hour: date.getHours(),
                        minute: date.getMinutes(),
                        message: reminderMessage.trim() || 'Ab apne expenses add karein.',
                      });
                    }
                  }}
                />
                <TouchableOpacity style={styles.timeModalDone} onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.timeModalDoneTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      ) : showTimePicker ? (
        <DateTimePicker
          value={new Date(new Date().setHours(reminderHour, reminderMinute, 0, 0))}
          mode="time"
          display="default"
          onChange={(event, date) => {
            setShowTimePicker(false);
            if (event.type === 'dismissed' || !date) return;
            void persistReminderAndSync({
              enabled: reminderEnabled,
              hour: date.getHours(),
              minute: date.getMinutes(),
              message: reminderMessage.trim() || 'Ab apne expenses add karein.',
            });
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.yellow },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 32 },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: theme.white, minHeight: 400 },
  yellow: { backgroundColor: theme.yellow, paddingVertical: 18, alignItems: 'center', position: 'relative' },
  screenTitle: { fontSize: 18, fontWeight: '800', color: theme.black },
  editBtn: { position: 'absolute', right: 16, top: 18, padding: 4 },
  loadingBox: { padding: 40, alignItems: 'center' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { fontSize: 22, fontWeight: '900', color: theme.black },
  avatarMeta: { flex: 1 },
  displayName: { fontSize: 22, fontWeight: '900', color: theme.text },
  memberSince: { fontSize: 13, color: theme.textMuted, fontWeight: '600', marginTop: 4 },
  planBanner: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
    backgroundColor: theme.offWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTitle: { fontSize: 14, fontWeight: '800', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  planTier: { fontSize: 20, fontWeight: '900', color: theme.text, marginTop: 6 },
  planRenew: { fontSize: 14, color: theme.textMuted, marginTop: 6, fontWeight: '600', lineHeight: 20 },
  upgradeBannerBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.yellow,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  upgradeBannerBtnFree: {
    borderColor: theme.black,
    shadowColor: theme.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  upgradeBannerBtnTxt: { fontSize: 15, fontWeight: '800', color: theme.black },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 24,
    marginBottom: 10,
    marginHorizontal: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  detailTextWrap: { flex: 1 },
  detailMuted: { fontSize: 12, fontWeight: '700', color: theme.textMuted, marginBottom: 2 },
  detailValue: { fontSize: 16, fontWeight: '700', color: theme.text },
  detailValueMono: { fontSize: 12, fontWeight: '600', color: theme.text, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  upgradeOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.black,
    backgroundColor: theme.white,
  },
  upgradeOutlineTxt: { flex: 1, fontSize: 16, fontWeight: '800', color: theme.black },
  outBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 24,
    backgroundColor: theme.yellow,
    paddingVertical: 14,
    borderRadius: 14,
  },
  outTxt: { fontSize: 16, fontWeight: '800', color: theme.black },
  fallback: { padding: 24, textAlign: 'center', color: theme.textMuted, fontWeight: '600' },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: theme.black },
  modalBody: { gap: 20 },
  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 13, fontWeight: '800', color: theme.textMuted, textTransform: 'uppercase', marginLeft: 4 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.offWhite,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, fontWeight: '700', color: theme.text },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f1f5f9', padding: 12, borderRadius: 12 },
  infoText: { fontSize: 13, fontWeight: '600', color: theme.textMuted },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.yellow,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 10,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnTxt: { fontSize: 16, fontWeight: '900', color: theme.black },
  reminderCard: {
    marginHorizontal: 16,
    marginTop: 4,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.offWhite,
    gap: 12,
  },
  reminderTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  reminderTextWrap: { flex: 1 },
  reminderHint: { fontSize: 12, color: theme.textMuted, fontWeight: '600', marginTop: 4 },
  reminderMessageBox: { gap: 8 },
  reminderScheduleInfo: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textMuted,
    lineHeight: 18,
  },
  reminderTestBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.black,
    backgroundColor: theme.white,
    alignItems: 'center',
  },
  reminderTestBtnTxt: { fontSize: 14, fontWeight: '800', color: theme.black },
  reminderLinkBtn: { paddingVertical: 8, alignItems: 'center' },
  reminderLinkTxt: { fontSize: 12, fontWeight: '700', color: '#2563EB', textDecorationLine: 'underline' },
  reminderTextInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    backgroundColor: theme.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  timeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  timeModalSheet: {
    backgroundColor: theme.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
  },
  timeModalDone: { alignItems: 'center', paddingVertical: 14 },
  timeModalDoneTxt: { fontSize: 17, fontWeight: '800', color: theme.black },
});
