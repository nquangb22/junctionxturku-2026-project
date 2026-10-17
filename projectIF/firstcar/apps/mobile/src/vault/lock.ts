/** Biometric unlock (§8.1) with device-passcode fallback. */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type LockAvailability = 'biometric' | 'passcode_only' | 'none';
export type BiometricKind = 'face' | 'fingerprint' | 'iris';

/** What this phone can unlock with. `kinds` is the hardware; `enrolled` says whether any of it is set up. */
export interface LockSupport {
  availability: LockAvailability;
  kinds: BiometricKind[];
  enrolled: boolean;
}

export const NO_LOCK: LockSupport = { availability: 'none', kinds: [], enrolled: false };

const KIND: Record<LocalAuthentication.AuthenticationType, BiometricKind> = {
  [LocalAuthentication.AuthenticationType.FINGERPRINT]: 'fingerprint',
  [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]: 'face',
  [LocalAuthentication.AuthenticationType.IRIS]: 'iris',
};

export async function lockSupport(): Promise<LockSupport> {
  if (Platform.OS === 'web') return NO_LOCK;
  const [hasHardware, enrolled, level, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const kinds = hasHardware ? types.map((x) => KIND[x]).filter(Boolean) : [];
  const availability = hasHardware && enrolled ? 'biometric' : level >= LocalAuthentication.SecurityLevel.SECRET ? 'passcode_only' : 'none';
  return { availability, kinds, enrolled: hasHardware && enrolled };
}

export type AuthResult = { ok: true } | { ok: false; error: string };

/** Biometrics first; the system offers the device passcode (labelled `fallbackLabel` on iOS) after failed tries. */
export async function authenticate(promptMessage: string, cancelLabel: string, fallbackLabel?: string): Promise<AuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel, fallbackLabel, disableDeviceFallback: false });
    return result.success ? { ok: true } : { ok: false, error: result.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Relock after this long in the background. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;
