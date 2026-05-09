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
  message: 'Ab apne expenses add karein.',
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
    vibrationPattern: [0, 300, 200, 300],
    lights: true,
    lightColor: '#FFCC00',
  });
}

export type SyncResult =
  | { ok: true; nextFireLabel?: string; usedExactAlarm?: boolean }
  | { ok: false; reason: 'notification_permission' | 'unknown'; error?: unknown };

/** Immediate ping — proves notifications + channel work (debug). */
export async function sendTestNotificationNow(): Promise<{ ok: boolean; error?: unknown }> {
  try {
    await ensureAndroidChannel();
    const perm = await notifee.requestPermission();
    if (Platform.OS === 'ios') {
      if (
        perm.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
        perm.authorizationStatus !== AuthorizationStatus.PROVISIONAL
      ) {
        return { ok: false, error: new Error('notification_permission') };
      }
    }
    if (Platform.OS === 'android' && perm.authorizationStatus === AuthorizationStatus.DENIED) {
      return { ok: false, error: new Error('notification_permission') };
    }
    await notifee.displayNotification({
      title: 'Daily Khata',
      body: 'Test OK — daily reminder pipeline is working.',
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
 * Re-reads AsyncStorage and applies schedule (call after boot, login, or settings change).
 */
export async function syncDailyExpenseReminder(): Promise<SyncResult> {
  const prefs = await loadReminderPrefs();

  try {
    // Cancel trigger too, not only displayed notifications.
    // This avoids old scheduled triggers surviving across code/setting changes.
    await notifee.cancelTriggerNotifications([REMINDER_NOTIFICATION_ID]);
  } catch {
    // ignore
  }

  try {
    await notifee.cancelNotification(REMINDER_NOTIFICATION_ID);
  } catch {
    // ignore
  }

  if (!prefs.enabled) {
    return { ok: true };
  }

  await ensureAndroidChannel();

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
    };

    if (canUseExact) {
      try {
        await notifee.createTriggerNotification(notification, triggerExact);
        const ids = await notifee.getTriggerNotificationIds();
        if (!ids.includes(REMINDER_NOTIFICATION_ID)) {
          return {
            ok: false,
            reason: 'unknown',
            error: new Error('Trigger not created (exact)'),
          };
        }
        return { ok: true, nextFireLabel, usedExactAlarm: true };
      } catch {
        // fall through — try inexact
      }
    }

    try {
      await notifee.createTriggerNotification(notification, triggerInexact);
      const ids = await notifee.getTriggerNotificationIds();
      if (!ids.includes(REMINDER_NOTIFICATION_ID)) {
        return {
          ok: false,
          reason: 'unknown',
          error: new Error('Trigger not created (inexact)'),
        };
      }
      return { ok: true, nextFireLabel, usedExactAlarm: false };
    } catch (e) {
      return { ok: false, reason: 'unknown', error: e };
    }
  }

  try {
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: nextMs,
      repeatFrequency: RepeatFrequency.DAILY,
    };
    await notifee.createTriggerNotification(notification, trigger);
    const ids = await notifee.getTriggerNotificationIds();
    if (!ids.includes(REMINDER_NOTIFICATION_ID)) {
      return {
        ok: false,
        reason: 'unknown',
        error: new Error('Trigger not created (non-android)'),
      };
    }
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
