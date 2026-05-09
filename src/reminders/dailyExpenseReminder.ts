import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidVisibility,
  AuthorizationStatus,
  RepeatFrequency,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';

const STORAGE_ENABLED = 'daily_expense_reminder_enabled';
const STORAGE_HOUR = 'daily_expense_reminder_hour';
const STORAGE_MINUTE = 'daily_expense_reminder_minute';
const STORAGE_MESSAGE = 'daily_expense_reminder_message';

export const REMINDER_NOTIFICATION_ID = 'daily_expense_reminder';
/** Bump when changing channel defaults (Android locks importance/sound after first create). */
const CHANNEL_ID = 'daily-khata-reminder-v3';
/** One-time fallback trigger (same timestamp) to improve reliability. */
const ONEOFF_NOTIFICATION_ID = `${REMINDER_NOTIFICATION_ID}_oneoff`;

export type DailyReminderPrefs = {
  enabled: boolean;
  hour: number;
  minute: number;
  message: string;
};

const DEFAULT_PREFS: DailyReminderPrefs = {
  enabled: false,
  hour: 19,
  minute: 0,
  message: 'Time to add your expenses for today.',
};

export async function loadReminderPrefs(): Promise<DailyReminderPrefs> {
  const [[, en], [, h], [, m], [, msg]] = await AsyncStorage.multiGet([
    STORAGE_ENABLED,
    STORAGE_HOUR,
    STORAGE_MINUTE,
    STORAGE_MESSAGE,
  ]);
  return {
    enabled: en === 'true',
    hour: h != null ? Math.min(23, Math.max(0, parseInt(h, 10) || DEFAULT_PREFS.hour)) : DEFAULT_PREFS.hour,
    minute: m != null ? Math.min(59, Math.max(0, parseInt(m, 10) || 0)) : DEFAULT_PREFS.minute,
    message: (msg && msg.trim()) || DEFAULT_PREFS.message,
  };
}

export async function saveReminderPrefs(prefs: DailyReminderPrefs): Promise<void> {
  await AsyncStorage.multiSet([
    [STORAGE_ENABLED, prefs.enabled ? 'true' : 'false'],
    [STORAGE_HOUR, String(prefs.hour)],
    [STORAGE_MINUTE, String(prefs.minute)],
    [STORAGE_MESSAGE, prefs.message.trim() || DEFAULT_PREFS.message],
  ]);
}

/** Next local wall-clock fire time (today or tomorrow). */
export function getNextReminderMillis(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Daily expense reminder',
    description: 'Daily reminder notification (heads-up, not full-screen alarm).',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
      // Notifee validator requires: even count + all positive values.
      // Use 1ms instead of 0ms to satisfy "positive values" rule.
      vibrationPattern: [1, 300, 200, 300],
    lights: true,
    lightColor: '#FFCC00',
  });
}

export type SyncResult =
  | { ok: true; nextFireLabel?: string; usedExactAlarm?: boolean }
  | { ok: false; reason: 'notification_permission' | 'alarm_permission' | 'unknown'; error?: unknown };

/** Immediate ping — proves notifications + channel work (debug). */
export async function sendTestNotificationNow(): Promise<{ ok: boolean; error?: unknown }> {
  try {
    await ensureAndroidChannel();
    await notifee.displayNotification({
      title: 'Daily Khata',
      body: 'Test OK — reminder notification is working.',
      android: {
        channelId: CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
      },
      ios: { sound: 'default' },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

/**
 * Schedules (or cancels) the daily reminder.
 * Pass `prefs` directly to avoid a stale AsyncStorage re-read.
 * If omitted, falls back to reading from AsyncStorage (e.g. boot restore).
 */
export async function syncDailyExpenseReminder(inPrefs?: DailyReminderPrefs): Promise<SyncResult> {
  const prefs = inPrefs ?? (await loadReminderPrefs());

  try {
    // Cancel trigger too, not only displayed notifications.
    // This avoids old scheduled triggers surviving across code/setting changes.
    await notifee.cancelTriggerNotifications([REMINDER_NOTIFICATION_ID, ONEOFF_NOTIFICATION_ID]);
  } catch {
    // ignore
  }

  try {
    await notifee.cancelNotification(REMINDER_NOTIFICATION_ID);
  } catch {
    // ignore
  }

  try {
    await notifee.cancelNotification(ONEOFF_NOTIFICATION_ID);
  } catch {
    // ignore
  }

  if (!prefs.enabled) {
    return { ok: true };
  }

  await ensureAndroidChannel();
  if (Platform.OS === 'android') {
    const blocked = await notifee.isChannelBlocked(CHANNEL_ID);
    if (blocked) {
      return { ok: false, reason: 'notification_permission', error: new Error('channel_blocked') };
    }
  }

  const perm = await notifee.requestPermission();
  if (Platform.OS === 'ios') {
    if (
      perm.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
      perm.authorizationStatus !== AuthorizationStatus.PROVISIONAL
    ) {
      return { ok: false, reason: 'notification_permission' };
    }
  }
  if (Platform.OS === 'android' && perm.authorizationStatus === AuthorizationStatus.DENIED) {
    return { ok: false, reason: 'notification_permission' };
  }

  const nextMs = getNextReminderMillis(prefs.hour, prefs.minute);
  const msg = prefs.message.trim() || DEFAULT_PREFS.message;

  const notification = {
    id: REMINDER_NOTIFICATION_ID,
    title: 'Daily Khata',
    body: msg,
    android: {
      channelId: CHANNEL_ID,
      category: AndroidCategory.REMINDER,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: { id: 'default' },
      lightUpScreen: false,
    },
    ios: {
      sound: 'default' as const,
      interruptionLevel: 'timeSensitive' as const,
    },
  };

  const nextFireLabel = new Date(nextMs).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  /** Exact alarm = reliable fixed time. If disabled, we still schedule inexact (normal banner, time may drift). */
  if (Platform.OS === 'android') {
    const settings = await notifee.getNotificationSettings();
    const alarm = settings.android?.alarm;
    const canUseExact =
      alarm === AndroidNotificationSetting.ENABLED || alarm === AndroidNotificationSetting.NOT_SUPPORTED;

    const triggerExact: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextMs,
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
    };
    const triggerInexact: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextMs,
      repeatFrequency: RepeatFrequency.DAILY,
      // Use AlarmManager + allowWhileIdle to improve reliability even if exact alarm isn't allowed.
      // This reduces "nothing happens" cases on some OEMs.
      alarmManager: { type: AlarmType.SET_AND_ALLOW_WHILE_IDLE },
    };

    // 1) One-off notification (repeatFrequency omitted) at the exact same timestamp
    //    This ensures the user still gets a reminder even if daily repeat trigger doesn't fire.
    const oneoffNotification = { ...notification, id: ONEOFF_NOTIFICATION_ID };
    const triggerOneoffExact: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextMs,
      alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
    };
    const triggerOneoffInexact: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextMs,
      alarmManager: { type: AlarmType.SET_AND_ALLOW_WHILE_IDLE },
    };

    let oneoffOk = false;
    if (canUseExact) {
      try {
        await notifee.createTriggerNotification(oneoffNotification, triggerOneoffExact);
        oneoffOk = true;
      } catch {
        // fall through to inexact
      }
    }
    if (!oneoffOk) {
      try {
        await notifee.createTriggerNotification(oneoffNotification, triggerOneoffInexact);
        oneoffOk = true;
      } catch (e) {
        // keep going; daily trigger might still work
      }
    }

    // 2) Daily repeating notification
    let usedExactAlarm = false;
    if (canUseExact) {
      try {
        await notifee.createTriggerNotification(notification, triggerExact);
        usedExactAlarm = true;
      } catch {
        // fall through — try inexact daily
      }
    }

    if (!usedExactAlarm) {
      try {
        await notifee.createTriggerNotification(notification, triggerInexact);
        usedExactAlarm = false;
      } catch (e) {
        try {
          const triggerNoAlarm: TimestampTrigger = {
            type: TriggerType.TIMESTAMP,
            timestamp: nextMs,
            repeatFrequency: RepeatFrequency.DAILY,
          };
          await notifee.createTriggerNotification(notification, triggerNoAlarm);
          usedExactAlarm = false;
        } catch (e2) {
          if (oneoffOk) {
            const idsEarly = await notifee.getTriggerNotificationIds();
            if (idsEarly.includes(ONEOFF_NOTIFICATION_ID)) {
              return { ok: true, nextFireLabel, usedExactAlarm: false };
            }
          }
          return { ok: false, reason: 'unknown', error: e2 ?? e };
        }
      }
    }

    // Trust createTriggerNotification if it didn't throw.
    // getTriggerNotificationIds() can return stale/empty results due to a
    // brief async delay in notifee's internal state — checking it here
    // causes false-negative "No trigger registered" errors.
    return { ok: true, nextFireLabel, usedExactAlarm };
  }

  // iOS / other platforms
  try {
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextMs,
      repeatFrequency: RepeatFrequency.DAILY,
    };
    await notifee.createTriggerNotification(notification, trigger);
    return { ok: true, nextFireLabel, usedExactAlarm: false };
  } catch (e) {
    return { ok: false, reason: 'unknown', error: e };
  }
}

export async function openAlarmSettingsIfNeeded(): Promise<void> {
  if (Platform.OS === 'android') {
    await notifee.openAlarmPermissionSettings();
  }
}

/**
 * Schedules a one-shot notification 1 minute from now.
 * Use this to verify that scheduled (trigger) notifications work on this device.
 */
export async function scheduleTestIn1Minute(): Promise<{ ok: boolean; fireAt?: string; error?: unknown }> {
  try {
    await ensureAndroidChannel();
    const fireAt = Date.now() + 60_000;

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: fireAt,
      ...(Platform.OS === 'android'
        ? { alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE } }
        : {}),
    };

    await notifee.createTriggerNotification(
      {
        id: 'test_1min',
        title: 'Daily Khata — Test',
        body: 'Scheduled notification is working! ✓',
        android: {
          channelId: CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          pressAction: { id: 'default' },
        },
        ios: { sound: 'default' },
      },
      trigger,
    );

    return {
      ok: true,
      fireAt: new Date(fireAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  } catch (e) {
    return { ok: false, error: e };
  }
}

/** Returns true if this phone's OEM has battery optimization that may kill scheduled alarms. */
export async function isBatteryOptimizationIssue(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const info = await notifee.getPowerManagerInfo();
    return !!info.activity;
  } catch {
    return false;
  }
}

/** Opens the OEM-specific battery / power-manager settings screen. */
export async function openBatterySettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.openPowerManagerSettings();
  } catch {
    // not supported on this device
  }
}
