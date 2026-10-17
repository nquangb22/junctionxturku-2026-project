import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { MessageKey, Translate } from '@/i18n';
import { confirmAction } from '@/ui/dialog';
import { Icon } from '@/ui/icon';
import { Button, Txt } from '@/ui/primitives';
import { METHOD_ICON, methodName, primaryMethod } from '@/ui/unlock-method';
import type { LockSupport } from '@/vault/lock';

/** Why the vault could not be opened. Only `reset` deletes anything, and only after a confirmation. */
export type VaultFailure = 'key_lost' | 'corrupt' | 'error';

const FAILURE_TEXT: Record<VaultFailure, MessageKey> = { key_lost: 'lock.keyLost', corrupt: 'lock.corrupt', error: 'lock.loadError' };

type Props =
  | { t: Translate; support: LockSupport; onUnlock: () => void; error?: string; overlay?: boolean; failure?: undefined }
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
export function LockScreen(props: Props) {
  const p = usePalette();
  const { t } = props;
  const method = props.failure ? undefined : primaryMethod(props.support);
  // Ask straight away, like a login screen. Only once per lock: after a cancel the button retries.
  const asked = useRef(false);
  const onUnlock = props.failure ? undefined : props.onUnlock;
  useEffect(() => {
    if (!onUnlock || asked.current) return;
    asked.current = true;
    onUnlock();
  }, [onUnlock]);
  return (
    <View style={[styles.root, { backgroundColor: p.background }, !props.failure && props.overlay ? StyleSheet.absoluteFill : null]} accessibilityViewIsModal>
      <View style={styles.inner}>
        <View style={styles.icon}>
          <View style={[styles.badge, { backgroundColor: p.primarySoft }]}>
            <Icon name={method ? METHOD_ICON[method] : 'lock'} size={44} color={p.primary} />
          </View>
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
            {props.error ? (
              <Txt color={p.danger} style={styles.center} accessibilityLiveRegion="polite">
                {props.error}
              </Txt>
            ) : null}
            <Button label={method ? t('lock.unlockWith', { method: methodName(method, t) }) : t('lock.unlock')} onPress={props.onUnlock} />
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
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
