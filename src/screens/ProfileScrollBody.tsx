import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Switch,
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import { LogOut, User, Mail, Phone, Crown, ChevronRight, Edit2, Check, Lock, Bell, Clock } from 'lucide-react-native';
import type { MePayload } from '../utils/profileCache';
import { theme } from '../theme/colors';
import { profileScreenStyles as styles } from './profileScreenStyles';
import { openBatterySettings, type DailyReminderPrefs } from '../reminders/dailyExpenseReminder';

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

export type ProfileScrollBodyProps = {
  refreshing: boolean;
  onRefresh: () => void;
  me: MePayload | null;
  loading: boolean;
  tier: string;
  appLockEnabled: boolean;
  biometricEnabled: boolean;
  biometricSupported: boolean;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  reminderMessage: string;
  reminderScheduleInfo: string | null;
  showBatteryWarn: boolean;
  openEditProfile: () => void;
  openUpgrade: () => void;
  toggleAppLock: () => void;
  toggleBiometric: () => void;
  onLogout: () => void;
  persistReminderAndSync: (prefs: DailyReminderPrefs) => Promise<void>;
  setReminderMessage: (s: string) => void;
  formatReminderTime: (h: number, m: number) => string;
};

function scrollBodyPropsEqual(prev: ProfileScrollBodyProps, next: ProfileScrollBodyProps) {
  return (
    prev.refreshing === next.refreshing &&
    prev.loading === next.loading &&
    prev.me === next.me &&
    prev.tier === next.tier &&
    prev.appLockEnabled === next.appLockEnabled &&
    prev.biometricEnabled === next.biometricEnabled &&
    prev.biometricSupported === next.biometricSupported &&
    prev.reminderEnabled === next.reminderEnabled &&
    prev.reminderHour === next.reminderHour &&
    prev.reminderMinute === next.reminderMinute &&
    prev.reminderMessage === next.reminderMessage &&
    prev.reminderScheduleInfo === next.reminderScheduleInfo &&
    prev.showBatteryWarn === next.showBatteryWarn
  );
}

function ProfileScrollBodyInner(props: ProfileScrollBodyProps) {
  const [inlinePickerOpen, setInlinePickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => {
    const d = new Date();
    d.setHours(19, 0, 0, 0);
    return d;
  });

  const {
    refreshing,
    onRefresh,
    me,
    loading,
    tier,
    appLockEnabled,
    biometricEnabled,
    biometricSupported,
    reminderEnabled,
    reminderHour,
    reminderMinute,
    reminderMessage,
    reminderScheduleInfo,
    showBatteryWarn,
    openEditProfile,
    openUpgrade,
    toggleAppLock,
    toggleBiometric,
    onLogout,
    persistReminderAndSync,
    setReminderMessage,
    formatReminderTime,
  } = props;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.black} />}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={false}
      collapsable={false}
    >
      <View style={styles.card} collapsable={false}>
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
                <Text style={styles.memberSince}>Member since {formatEndDate(me.member_since ?? undefined)}</Text>
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
                    Daily notification at this time. If today's time has passed, the first alert will arrive tomorrow — shown below.
                  </Text>
                </View>
                <Switch
                  value={reminderEnabled}
                  onValueChange={(v) =>
                    persistReminderAndSync({
                      enabled: v,
                      hour: reminderHour,
                      minute: reminderMinute,
                      message: reminderMessage.trim() || 'Time to add your expenses for today.',
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
                    onPress={() => {
                      const d = new Date();
                      d.setHours(reminderHour, reminderMinute, 0, 0);
                      setPickerDate(d);
                      setInlinePickerOpen((v) => !v);
                    }}
                    activeOpacity={0.75}
                  >
                    <Clock size={18} color={theme.textMuted} />
                    <View style={styles.reminderTextWrap}>
                      <Text style={styles.detailMuted}>Time</Text>
                      <Text style={styles.detailValue}>{formatReminderTime(reminderHour, reminderMinute)}</Text>
                    </View>
                    <ChevronRight
                      size={20}
                      color={theme.textMuted}
                      style={inlinePickerOpen ? { transform: [{ rotate: '90deg' }] } : undefined}
                    />
                  </TouchableOpacity>
                  {inlinePickerOpen ? (
                    <View style={styles.inlinePickerWrap}>
                      <DatePicker
                        date={pickerDate}
                        onDateChange={setPickerDate}
                        mode="time"
                        theme="light"
                        locale="en"
                        style={styles.inlinePicker}
                      />
                      <View style={styles.inlinePickerBtns}>
                        <TouchableOpacity
                          style={styles.inlinePickerCancel}
                          onPress={() => setInlinePickerOpen(false)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.inlinePickerCancelTxt}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.inlinePickerOk}
                          onPress={() => {
                            setInlinePickerOpen(false);
                            void persistReminderAndSync({
                              enabled: reminderEnabled,
                              hour: pickerDate.getHours(),
                              minute: pickerDate.getMinutes(),
                              message: reminderMessage.trim() || 'Time to add your expenses for today.',
                            });
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.inlinePickerOkTxt}>OK</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
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
                          message: e.nativeEvent.text.trim() || 'Time to add your expenses for today.',
                        })
                      }
                      placeholder="e.g. Time to add your expenses"
                      placeholderTextColor={theme.textMuted}
                      multiline
                      maxLength={200}
                    />
                  </View>
                  {reminderScheduleInfo ? <Text style={styles.reminderScheduleInfo}>{reminderScheduleInfo}</Text> : null}
                  {showBatteryWarn ? (
                    <TouchableOpacity style={styles.batteryWarnRow} onPress={() => void openBatterySettings()} activeOpacity={0.8}>
                      <Text style={styles.batteryWarnText}>
                        ⚠️ Battery optimization is ON — this may block your reminders.
                      </Text>
                      <Text style={styles.batteryWarnLink}>Fix now →</Text>
                    </TouchableOpacity>
                  ) : null}
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
  );
}

const ProfileScrollBody = React.memo(ProfileScrollBodyInner, scrollBodyPropsEqual);

export default ProfileScrollBody;
