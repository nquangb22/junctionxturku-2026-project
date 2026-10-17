import { lockoutRemainingMs } from '@firstcar/core';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { MessageKey, Translate } from '@/i18n';
import { confirmAction } from '@/ui/dialog';
import { Icon } from '@/ui/icon';
import { Button, Txt } from '@/ui/primitives';

/** Why the vault could not be opened. Only `reset` deletes anything, and only after a confirmation. */
export type VaultFailure = 'key_lost' | 'corrupt' | 'error';

const FAILURE_TEXT: Record<VaultFailure, MessageKey> = { key_lost: 'lock.keyLost', corrupt: 'lock.corrupt', error: 'lock.loadError' };

type Props =
  | { t: Translate; onUnlock: () => void; error?: string; overlay?: boolean; bannedUntil: number | null; lastSeen: number; failure?: undefined }
  | { t: Translate; failure: VaultFailure; onRetry: () => void; onReset: () => void };

/** Opaque cover shown the moment the app is inactive, so the OS app switcher never captures content. */
export function PrivacyCover() {
  const p = usePalette();
  return (
    <View style={[styles.root, StyleSheet.absoluteFill, { backgroundColor: p.background }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
      <Icon name="lock" size={48} color={p.textSecondary} />
    </View>
  );
}

/** Full-screen lock. As an overlay it hides everything underneath (relock after background). */
/** "m:ss" (or "h:mm:ss") for the wait shown on the lock screen. */
function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Milliseconds left on an unlock ban, ticking every second until it ends. */
function useBanRemaining(bannedUntil: number | null, lastSeen: number): number {
  const [now, setNow] = useState(() => Date.now());
  const remaining = lockoutRemainingMs({ failures: 0, bannedUntil, lastSeen }, now);
  const active = remaining > 0;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return remaining;
}

export function LockScreen(props: Props) {
  const p = usePalette();
  const { t } = props;
  const banned = useBanRemaining(props.failure ? null : props.bannedUntil, props.failure ? 0 : props.lastSeen);
  return (
    <View style={[styles.root, { backgroundColor: p.background }, !props.failure && props.overlay ? StyleSheet.absoluteFill : null]} accessibilityViewIsModal>
      <View style={styles.inner}>
        <View style={styles.icon}>
          <Icon name="lock" size={48} color={p.primary} />
        </View>
        <Txt variant="title" accessibilityRole="header" style={styles.center}>
          {t('lock.title')}
        </Txt>
        {props.failure ? (
          <>
            <Txt style={styles.center}>{t(FAILURE_TEXT[props.failure])}</Txt>
            <Button label={t('lock.retry')} onPress={props.onRetry} />
            <Button
              label={t('lock.reset')}
              kind="danger"
              onPress={() =>
                confirmAction({ title: t('lock.reset'), message: t('settings.deleteConfirm'), confirmLabel: t('lock.reset'), cancelLabel: t('common.cancel'), destructive: true, onConfirm: props.onReset })
              }
            />
          </>
        ) : (
          <>
            <Txt style={styles.center}>{t('lock.body')}</Txt>
            {banned > 0 ? (
              <View style={[styles.ban, { backgroundColor: p.dangerBg }]} accessibilityLiveRegion="polite">
                <Txt variant="bodyStrong" color={p.danger} style={styles.center}>
                  {t('lock.banned', { time: formatWait(banned) })}
                </Txt>
                <Txt variant="small" color={p.danger} style={styles.center}>
                  {t('lock.bannedHint')}
                </Txt>
              </View>
            ) : props.error ? (
              <Txt color={p.danger} style={styles.center} accessibilityLiveRegion="polite">
                {props.error}
              </Txt>
            ) : null}
            <Button label={banned > 0 ? t('lock.bannedButton', { time: formatWait(banned) }) : t('lock.unlock')} onPress={props.onUnlock} disabled={banned > 0} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  inner: { width: '100%', maxWidth: 420, gap: Spacing.lg },
  icon: { alignItems: 'center' },
  center: { textAlign: 'center' },
  ban: { borderRadius: 12, padding: Spacing.lg, gap: Spacing.xs },
});
