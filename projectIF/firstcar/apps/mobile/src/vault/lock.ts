/** Biometric unlock (§8.1) with device-passcode fallback. */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type LockAvailability = 'biometric' | 'passcode_only' | 'none';

export async function lockAvailability(): Promise<LockAvailability> {
  if (Platform.OS === 'web') return 'none';
  const [hasHardware, enrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  if (hasHardware && enrolled) return 'biometric';
  return level >= LocalAuthentication.SecurityLevel.SECRET ? 'passcode_only' : 'none';
}

export type AuthResult = { ok: true } | { ok: false; error: string };

export async function authenticate(promptMessage: string, cancelLabel: string): Promise<AuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel, disableDeviceFallback: false });
    return result.success ? { ok: true } : { ok: false, error: result.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Relock after this long in the background. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;
