/**
 * Session: boot → (biometric unlock) → decrypt vault → ready. Relocks after 5 min in the background.
 * Children only mount once the vault is decrypted, so nothing sensitive renders while locked.
 * A privacy cover hides the content the moment the app goes inactive (OS app switcher).
 */
import * as SplashScreen from 'expo-splash-screen';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';

import { makeT, type Translate } from '@/i18n';
import { parseAppData } from '@/state/app-data';
import { notify } from '@/ui/dialog';
import { LockScreen, PrivacyCover, type VaultFailure } from '@/ui/lock-screen';
import { authenticate, lockAvailability, RELOCK_AFTER_MS, type LockAvailability } from '@/vault/lock';
import { DEFAULT_PREFS, loadPrefs, loadVault, savePrefs, wipeVault, type VaultPrefs } from '@/vault/vault';

type Phase = 'booting' | 'locked' | 'ready' | VaultFailure;

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
  const [covered, setCovered] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const backgroundSince = useRef<number | null>(null);
  const unlocking = useRef(false);
  const t = makeT(prefs.locale);

  // The "skip lock" demo toggle only counts in development builds.
  const lockRequired = useCallback((p: VaultPrefs, a: LockAvailability) => p.biometricLock && !(__DEV__ && p.skipLockInDemo) && a !== 'none', []);

  // Never throws: any failure becomes a recoverable phase. The vault file is not touched on failure.
  const openVault = useCallback(async () => {
    try {
      const result = await loadVault();
      if (result.status === 'key_lost' || result.status === 'corrupt' || result.status === 'error') {
        setPhase(result.status);
        return;
      }
      if (result.status === 'ok' && !parseAppData(result.json)) {
        setPhase('corrupt');
        return;
      }
      setInitialJson(result.status === 'ok' ? result.json : undefined);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  const unlock = useCallback(async () => {
    if (unlocking.current) return;
    unlocking.current = true;
    try {
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
    } finally {
      unlocking.current = false;
    }
  }, [openVault, relocked, t]);

  const retry = useCallback(() => {
    setPhase('booting');
    setBootAttempt((n) => n + 1);
  }, []);

  // Boot: read prefs + availability, then unlock or open directly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, a] = await Promise.all([loadPrefs(), lockAvailability()]);
        if (cancelled) return;
        setPrefsState(p);
        setAvailability(a);
        if (lockRequired(p, a)) setPhase('locked');
        else await openVault();
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootAttempt, lockRequired, openVault]);

  // Hide the splash only once a phase (screen) is decided, so a failed boot never leaves it up.
  useEffect(() => {
    if (phase !== 'booting') SplashScreen.hideAsync().catch(() => undefined);
  }, [phase]);

  // Cover content immediately on inactive/background; relock after RELOCK_AFTER_MS away.
  // Both state changes happen in one batch on return, so the lock overlay replaces the cover without a flash.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setCovered(true);
        if (state === 'background') backgroundSince.current = Date.now();
        return;
      }
      if (backgroundSince.current !== null) {
        const away = Date.now() - backgroundSince.current;
        backgroundSince.current = null;
        if (away > RELOCK_AFTER_MS && phase === 'ready' && lockRequired(prefs, availability)) setRelocked(true);
      }
      setCovered(false);
    });
    return () => sub.remove();
  }, [availability, lockRequired, phase, prefs]);

  // Android back must not pop screens hidden under the lock overlay.
  useEffect(() => {
    if (!relocked) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [relocked]);

  // Persist first, then update: a failed write leaves the UI and storage in agreement.
  const setPrefs = useCallback(
    async (next: VaultPrefs) => {
      try {
        await savePrefs(next);
        setPrefsState(next);
      } catch (e) {
        notify(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
      }
    },
    [t],
  );

  const wipeEverything = useCallback(async () => {
    setPhase('booting'); // unmounts the store first; wipeVault then drains pending saves and blocks new ones
    try {
      await wipeVault();
    } catch {
      setPhase('error');
      return;
    }
    setPrefsState(DEFAULT_PREFS);
    setInitialJson(undefined);
    await openVault();
  }, [openVault]);

  const session: Session = { prefs, availability, t, initialJson, setPrefs, wipeEverything };

  if (phase === 'booting') return null;
  if (phase === 'locked') return <LockScreen t={t} onUnlock={unlock} error={lockError} />;
  if (phase !== 'ready') return <LockScreen t={t} failure={phase} onRetry={retry} onReset={wipeEverything} />;

  const hidden = relocked || covered;
  return (
    <SessionContext.Provider value={session}>
      <View
        style={styles.fill}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hidden}
        aria-hidden={hidden}>
        {children}
      </View>
      {relocked ? <LockScreen t={t} onUnlock={unlock} error={lockError} overlay /> : covered ? <PrivacyCover /> : null}
    </SessionContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
