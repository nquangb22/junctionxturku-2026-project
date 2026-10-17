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
const BACKUP_FILE = 'firstcar-vault.bak';
const TEMP_FILE = 'firstcar-vault.tmp';
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

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; json: string }
  | { status: 'key_lost' } // no key in the keystore
  | { status: 'corrupt' } // key present but no copy of the blob decrypts
  | { status: 'error'; message: string }; // transient IO / keystore failure: retry, never wipe

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
const backupFile = () => new File(Paths.document, BACKUP_FILE);
const tempFile = () => new File(Paths.document, TEMP_FILE);

/* ---------- data ---------- */

/** Reads and decrypts one vault file. Undefined = not decryptable (corrupt); IO errors propagate. */
async function readSealed(file: File, key: AESEncryptionKey): Promise<string | undefined> {
  const raw = await file.text();
  try {
    return utf8Decode(await aesDecryptAsync(AESSealedData.fromCombined(raw), key));
  } catch {
    return undefined;
  }
}

/** Call only after the user has unlocked. Tells a missing key, a corrupt blob and IO errors apart. */
export async function loadVault(): Promise<LoadResult> {
  if (isWeb) {
    const raw = globalThis.localStorage?.getItem(WEB_DATA);
    return raw ? { status: 'ok', json: raw } : { status: 'empty' };
  }
  try {
    const file = vaultFile();
    const backup = backupFile();
    if (!file.exists && !backup.exists) return { status: 'empty' };
    const key = await readKey();
    if (!key) return { status: 'key_lost' };
    const json = file.exists ? await readSealed(file, key) : undefined;
    if (json !== undefined) return { status: 'ok', json };
    // The main file is unreadable: fall back to the previous good copy. Nothing is overwritten here.
    const previous = backup.exists ? await readSealed(backup, key) : undefined;
    return previous !== undefined ? { status: 'ok', json: previous } : { status: 'corrupt' };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

// Saves run in order. Wiping blocks new saves and drains the queue first, so none can resurrect data.
let saveQueue: Promise<void> = Promise.resolve();
let wiping = false;

export function saveVault(json: string): Promise<void> {
  const run = saveQueue.then(() => (wiping ? undefined : writeVault(json)));
  saveQueue = run.catch(() => undefined);
  return run;
}

/** Atomic: write a temp file, keep the previous vault as .bak, then move the temp file into place. */
async function writeVault(json: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(WEB_DATA, json);
    return;
  }
  const key = (await readKey()) ?? (await createKey());
  const sealed = await aesEncryptAsync(utf8Encode(json), key);
  const combined = await sealed.combined('base64');
  const temp = tempFile();
  temp.create({ overwrite: true });
  await temp.write(combined as string);
  const file = vaultFile();
  if (file.exists) await file.copy(backupFile(), { overwrite: true });
  await temp.move(file, { overwrite: true });
}

/** "Delete everything": data file, key and prefs. Nothing exists server-side to delete. */
export async function wipeVault(): Promise<void> {
  wiping = true;
  try {
    await saveQueue;
    if (isWeb) {
      globalThis.localStorage?.removeItem(WEB_DATA);
      globalThis.localStorage?.removeItem(PREFS_NAME);
      return;
    }
    for (const file of [vaultFile(), backupFile(), tempFile()]) if (file.exists) file.delete();
    await SecureStore.deleteItemAsync(KEY_NAME, secureOpts);
    await SecureStore.deleteItemAsync(PREFS_NAME, secureOpts);
  } finally {
    wiping = false;
  }
}
