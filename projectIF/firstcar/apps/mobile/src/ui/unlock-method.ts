/** Names and icons for the phone's unlock methods: Face ID / Touch ID on iOS, face unlock / fingerprint on Android. */
import { Platform } from 'react-native';

import type { MessageKey, Translate } from '@/i18n';
import type { IconName } from '@/ui/icon';
import type { BiometricKind, LockSupport } from '@/vault/lock';

export const METHOD_ICON: Record<BiometricKind | 'passcode', IconName> = { face: 'faceId', fingerprint: 'fingerprint', iris: 'iris', passcode: 'passcode' };

export function methodName(kind: BiometricKind | 'passcode', t: Translate): string {
  const ios = Platform.OS === 'ios';
  const key: Record<BiometricKind | 'passcode', MessageKey> = {
    face: ios ? 'lock.method.faceId' : 'lock.method.faceUnlock',
    fingerprint: ios ? 'lock.method.touchId' : 'lock.method.fingerprint',
    iris: 'lock.method.iris',
    passcode: 'lock.method.passcode',
  };
  return t(key[kind]);
}

/** The method the unlock button names: the set-up biometric, else the passcode. Fingerprint first when a phone has both. */
export function primaryMethod(s: LockSupport): BiometricKind | 'passcode' {
  if (!s.enrolled) return 'passcode';
  return (['fingerprint', 'face', 'iris'] as const).find((k) => s.kinds.includes(k)) ?? 'passcode';
}
