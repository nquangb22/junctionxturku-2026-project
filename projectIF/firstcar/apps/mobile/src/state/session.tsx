/**
 * Session: boot → (biometric unlock) → decrypt vault → ready. Relocks after 5 min in the background.
 * Children only mount once the vault is decrypted, so nothing sensitive renders while locked.
 */
import * as SplashScreen from 'expo-splash-screen';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { makeT, type Translate } from '@/i18n';
import { LockScreen } from '@/ui/lock-screen';
import { authenticate, lockAvailability, RELOCK_AFTER_MS, type LockAvailability } from '@/vault/lock';
import { DEFAULT_PREFS, loadPrefs, loadVault, savePrefs, wipeVault, type VaultPrefs } from '@/vault/vault';

type Phase = 'booting' | 'locked' | 'key_lost' | 'ready';

interface Session {
  prefs: VaultPrefs;
  availability: LockAvailability;
  t: Translate;
  initialJson?: string;
  setPrefs(next: VaultPrefs): Promise<void>;
  wipeEverything(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('booting');
  const [prefs, setPrefsState] = useState<VaultPrefs>(DEFAULT_PREFS);
  const [availability, setAvailability] = useState<LockAvailability>('none');
  const [initialJson, setInitialJson] = useState<string | undefined>();
  const [lockError, setLockError] = useState<string | undefined>();
  const [relocked, setRelocked] = useState(false);
  const backgroundSince = useRef<number | null>(null);
  const t = makeT(prefs.locale);

  const lockRequired = useCallback((p: VaultPrefs, a: LockAvailability) => p.biometricLock && !p.skipLockInDemo && a !== 'none', []);

  const openVault = useCallback(async () => {
    const result = await loadVault();
    if (result.status === 'key_lost') {
      setPhase('key_lost');
      return;
    }
    setInitialJson(result.status === 'ok' ? result.json : undefined);
    setPhase('ready');
  }, []);

  const unlock = useCallback(async () => {
    setLockError(undefined);
    const res = await authenticate(t('lock.prompt'), t('common.cancel'));
    if (!res.ok) {
      setLockError(t('lock.failed'));
      return;
    }
    if (relocked) {
      setRelocked(false);
      return;
    }
    await openVault();
  }, [openVault, relocked, t]);

  // Boot: read prefs + availability, then unlock or open directly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, a] = await Promise.all([loadPrefs(), lockAvailability()]);
      if (cancelled) return;
      setPrefsState(p);
      setAvailability(a);
      await SplashScreen.hideAsync().catch(() => undefined);
      if (lockRequired(p, a)) setPhase('locked');
      else await openVault();
    })();
    return () => {
      cancelled = true;
    };
  }, [lockRequired, openVault]);

  // Relock after RELOCK_AFTER_MS in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundSince.current = Date.now();
      if (state === 'active' && backgroundSince.current !== null) {
        const away = Date.now() - backgroundSince.current;
        backgroundSince.current = null;
        if (away > RELOCK_AFTER_MS && phase === 'ready' && lockRequired(prefs, availability)) setRelocked(true);
      }
    });
    return () => sub.remove();
  }, [availability, lockRequired, phase, prefs]);

  const setPrefs = useCallback(async (next: VaultPrefs) => {
    setPrefsState(next);
    await savePrefs(next);
  }, []);

  const wipeEverything = useCallback(async () => {
    await wipeVault();
    setPrefsState(DEFAULT_PREFS);
    setInitialJson(undefined);
    setPhase('booting');
    await openVault();
  }, [openVault]);

  const session: Session = { prefs, availability, t, initialJson, setPrefs, wipeEverything };

  if (phase === 'booting') return null;
  if (phase === 'locked') return <LockScreen t={t} onUnlock={unlock} error={lockError} />;
  if (phase === 'key_lost') return <LockScreen t={t} keyLost onReset={wipeEverything} />;

  return (
    <SessionContext.Provider value={session}>
      {children}
      {relocked ? <LockScreen t={t} onUnlock={unlock} error={lockError} overlay /> : null}
    </SessionContext.Provider>
  );
}
