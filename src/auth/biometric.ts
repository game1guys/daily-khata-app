import * as Keychain from 'react-native-keychain';
import { Platform } from 'react-native';

const SERVICE = 'daily-khata-session';
const PROBE_SERVICE = 'daily-khata-biometric-probe';

export async function isBiometricSupported(): Promise<boolean> {
  try {
    // On Android, `getSupportedBiometryType()` can be null even when biometrics are enrolled.
    if (Platform.OS === 'android') {
      // 1) If the native module isn't linked, these will return null/false.
      const passcode = await Keychain.isPasscodeAuthAvailable().catch(() => false);
      const level = await Keychain.getSecurityLevel({ accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET }).catch(() => null);

      // 2) Best-effort probe: try to write a biometric-protected item.
      // If biometrics aren't enrolled / supported, Android keystore typically throws.
      try {
        await Keychain.setGenericPassword('probe', '1', {
          service: PROBE_SERVICE,
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        await Keychain.resetGenericPassword({ service: PROBE_SERVICE });
        return true;
      } catch {
        // If passcode is available but probe fails, biometrics likely not available to the app.
        return !!passcode && level != null;
      }
    }

    const biometryType = await Keychain.getSupportedBiometryType();
    return biometryType != null;
  } catch {
    return false;
  }
}

export async function setBiometricSessionToken(token: string) {
  // Store token protected by device biometrics (or passcode fallback depending on device settings)
  await Keychain.setGenericPassword('session', token, {
    service: SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getBiometricSessionToken(): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({
      service: SERVICE,
      authenticationPrompt: {
        title: 'Unlock Daily-KHATA',
        subtitle: 'Verify with biometrics',
        description: 'Authenticate to continue',
        cancel: 'Cancel',
      },
    });
    if (!creds) return null;
    return creds.password || null;
  } catch {
    return null;
  }
}

export async function clearBiometricSessionToken() {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    // ignore
  }
}

