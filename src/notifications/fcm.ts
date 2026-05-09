import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { getApps } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  onTokenRefresh,
  requestPermission as requestMessagingPermission,
} from '@react-native-firebase/messaging';
import { API_URL } from '../config/api';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function logFcm(message: string, extra?: unknown) {
  if (extra !== undefined) {
    console.warn('[FCM]', message, extra);
  } else {
    console.warn('[FCM]', message);
  }
}

function logAxiosErr(err: unknown, where: string) {
  if (axios.isAxiosError(err)) {
    logFcm(`${where} failed`, {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
    });
  } else {
    logFcm(`${where} failed`, err);
  }
}

/** Native Firebase init can lag JS — wait until default app exists. */
async function waitForFirebaseApps(maxWaitMs = 12000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      if (getApps().length > 0) return true;
    } catch (e) {
      logFcm('getApps() error (native module?)', e);
      return false;
    }
    await sleep(400);
  }
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}

async function ensureAndroidNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    // ignore
  }
}

function hasFirebaseNative() {
  return !!(NativeModules as any)?.RNFBAppModule;
}

async function getTokenWithRetry(messaging: ReturnType<typeof getMessaging>, attempts = 5) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const t = await getToken(messaging);
      if (t && t.length > 0) return t;
      logFcm(`getToken returned empty (attempt ${i + 1}/${attempts})`);
    } catch (e) {
      lastErr = e;
      logFcm(`getToken threw (attempt ${i + 1}/${attempts})`, e);
    }
    if (i < attempts - 1) await sleep(1200);
  }
  if (lastErr) logFcm('getToken failed after retries', lastErr);
  return null;
}

/**
 * FCM is optional. Without google-services.json / Firebase init, native calls can fail.
 */
export async function ensureFcmToken(sessionToken: string): Promise<string | null> {
  if (!hasFirebaseNative()) {
    logFcm('RN Firebase native module missing — rebuild Android with google-services plugin.');
    return null;
  }

  try {
    const ready = await waitForFirebaseApps();
    if (!ready) {
      logFcm(
        'Firebase app never became ready. Confirm google-services.json package_name matches applicationId (e.g. com.app).'
      );
      return null;
    }

    const messaging = getMessaging();

    try {
      await requestMessagingPermission(messaging);
    } catch (e) {
      logFcm('requestMessagingPermission', e);
    }

    await ensureAndroidNotificationPermission();

    const token = await getTokenWithRetry(messaging);
    if (!token) {
      logFcm(
        'No FCM token. If this is a release APK: add your release keystore SHA-1 and SHA-256 in Firebase Console → Project settings → Android app, then download a fresh google-services.json.'
      );
      return null;
    }

    await AsyncStorage.setItem('fcm_token', token);

    try {
      const res = await axios.put(
        `${API_URL}/profile/me`,
        { fcm_token: token },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      console.warn('[FCM] Saved to profile, status', res.status);
      return token;
    } catch (e) {
      logAxiosErr(e, 'PUT /profile/me');
      return null;
    }
  } catch (e) {
    logFcm('ensureFcmToken', e);
    return null;
  }
}

export function registerFcmRefreshListener(sessionToken: string): (() => void) | void {
  try {
    if (!hasFirebaseNative()) return;
    if (getApps().length === 0) return;

    const messaging = getMessaging();
    return onTokenRefresh(messaging, async (newToken: string) => {
      try {
        await AsyncStorage.setItem('fcm_token', newToken);
        await axios.put(
          `${API_URL}/profile/me`,
          { fcm_token: newToken },
          { headers: { Authorization: `Bearer ${sessionToken}` } }
        );
      } catch (e) {
        logAxiosErr(e, 'onTokenRefresh PUT /profile/me');
      }
    });
  } catch (e) {
    logFcm('registerFcmRefreshListener', e);
  }
}
