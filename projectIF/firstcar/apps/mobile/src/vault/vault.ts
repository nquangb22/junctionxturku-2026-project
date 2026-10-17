/**
 * Encrypted on-device vault (§8, §8.1).
 * - Data: one AES-256-GCM sealed blob in the app's document directory.
 * - Key: random, stored in SecureStore (Keychain / Android Keystore), this-device-only.
 *   The app only reads it after a successful biometric/passcode check (see lock.ts).
 * - Web (demo only): falls back to unencrypted localStorage, clearly not for real data.
 */
import type { Locale } from '@firstcar/core';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { utf8Decode, utf8Encode } from './utf8';

const KEY_NAME = 'fc.vaultKey';
const PREFS_NAME = 'fc.prefs';
const VAULT_FILE = 'firstcar-vault.bin';
const WEB_DATA = 'fc.webVault';

const isWeb = Platform.OS === 'web';
const secureOpts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** Readable before unlock, so the lock screen can be shown in the right language. Not sensitive. */
export interface VaultPrefs {
  locale: Locale;
  biometricLock: boolean;
  skipLockInDemo: boolean;
}

export const DEFAULT_PREFS: VaultPrefs = { locale: 'en', biometricLock: true, skipLockInDemo: false };

export type LoadResult = { status: 'empty' } | { status: 'ok'; json: string } | { status: 'key_lost' };

/* ---------- prefs (not sensitive, readable before unlock) ---------- */

export async function loadPrefs(): Promise<VaultPrefs> {
  try {
    const raw = isWeb ? globalThis.localStorage?.getItem(PREFS_NAME) : await SecureStore.getItemAsync(PREFS_NAME, secureOpts);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<VaultPrefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: VaultPrefs): Promise<void> {
  const raw = JSON.stringify(prefs);
  if (isWeb) globalThis.localStorage?.setItem(PREFS_NAME, raw);
  else await SecureStore.setItemAsync(PREFS_NAME, raw, secureOpts);
}

/* ---------- key ---------- */

async function readKey(): Promise<AESEncryptionKey | undefined> {
  const hex = await SecureStore.getItemAsync(KEY_NAME, secureOpts);
  return hex ? AESEncryptionKey.import(hex, 'hex') : undefined;
}

async function createKey(): Promise<AESEncryptionKey> {
  const key = await AESEncryptionKey.generate();
  await SecureStore.setItemAsync(KEY_NAME, await key.encoded('hex'), secureOpts);
  return key;
}

const vaultFile = () => new File(Paths.document, VAULT_FILE);

/* ---------- data ---------- */

/** Call only after the user has unlocked. */
export async function loadVault(): Promise<LoadResult> {
  if (isWeb) {
    const raw = globalThis.localStorage?.getItem(WEB_DATA);
    return raw ? { status: 'ok', json: raw } : { status: 'empty' };
  }
  const file = vaultFile();
  if (!file.exists) return { status: 'empty' };
  const key = await readKey();
  if (!key) return { status: 'key_lost' };
  try {
    const sealed = AESSealedData.fromCombined(await file.text());
    const bytes = await aesDecryptAsync(sealed, key);
    return { status: 'ok', json: utf8Decode(bytes) };
  } catch {
    return { status: 'key_lost' };
  }
}

export async function saveVault(json: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(WEB_DATA, json);
    return;
  }
  const key = (await readKey()) ?? (await createKey());
  const sealed = await aesEncryptAsync(utf8Encode(json), key);
  const combined = await sealed.combined('base64');
  const file = vaultFile();
  if (!file.exists) file.create();
  await file.write(combined as string);
}

/** "Delete everything": data file, key and prefs. Nothing exists server-side to delete. */
export async function wipeVault(): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(WEB_DATA);
    globalThis.localStorage?.removeItem(PREFS_NAME);
    return;
  }
  const file = vaultFile();
  if (file.exists) file.delete();
  await SecureStore.deleteItemAsync(KEY_NAME, secureOpts);
  await SecureStore.deleteItemAsync(PREFS_NAME, secureOpts);
}
