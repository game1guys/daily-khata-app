import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '../config/api';

let configured = false;

export function configureGoogleSignIn() {
  if (configured) {
    return;
  }
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
  });
  configured = true;
}

/**
 * Returns a Google ID token for Supabase `signInWithIdToken` (backend `/auth/google`).
 */
export async function getGoogleIdToken(): Promise<string> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Set GOOGLE_WEB_CLIENT_ID in src/config/api.ts');
  }

  configureGoogleSignIn();

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  try {
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      const err = new Error('SIGN_IN_CANCELLED');
      (err as Error & { code?: string }).code = statusCodes.SIGN_IN_CANCELLED;
      throw err;
    }

    let idToken = response.data.idToken;
    if (!idToken) {
      const tokens = await GoogleSignin.getTokens();
      idToken = tokens.idToken;
    }
    if (!idToken) {
      throw new Error('Google did not return an ID token. Use the Web (not Android) OAuth client ID in GOOGLE_WEB_CLIENT_ID.');
    }
    return idToken;
  } catch (e) {
    throw enrichGoogleSignInError(e);
  }
}

export function isGoogleSignInCancelled(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | undefined;
  return e?.code === statusCodes.SIGN_IN_CANCELLED || e?.message === 'SIGN_IN_CANCELLED';
}

/** Android: code 10 = DEVELOPER_ERROR; 12500 = SIGN_IN_FAILED (often SHA-1 / OAuth client mismatch). */
function enrichGoogleSignInError(error: unknown): Error {
  if (isGoogleSignInCancelled(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const e = error as { code?: string; message?: string } | undefined;
  const code = e?.code != null ? String(e.code) : '';
  const msg = e?.message ?? '';
  const hint =
    Platform.OS === 'android'
      ? ' In Google Cloud → Credentials, create an OAuth client type "Android" with package name com.app and SHA-1 from: cd android && ./gradlew signingReport (use debug variant). Keep GOOGLE_WEB_CLIENT_ID as the "Web" client. Wait a few minutes after saving.'
      : ' In Google Cloud / Xcode, add the iOS OAuth client and URL scheme from the setup guide.';
  if (
    code === '10' ||
    msg.includes('DEVELOPER_ERROR') ||
    code === '12500' ||
    msg.toLowerCase().includes('non-recoverable')
  ) {
    return new Error(
      `Google Sign-In setup incomplete.${hint} Details: ${msg || code || 'unknown'}`
    );
  }
  return error instanceof Error ? error : new Error(msg || 'Google sign-in failed');
}
