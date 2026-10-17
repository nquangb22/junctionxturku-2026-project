import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { Button, Txt } from '@/ui/primitives';

type Props =
  | { t: Translate; onUnlock: () => void; error?: string; overlay?: boolean; keyLost?: false }
  | { t: Translate; keyLost: true; onReset: () => void };

/** Full-screen lock. As an overlay it hides everything underneath (relock after background). */
export function LockScreen(props: Props) {
  const p = usePalette();
  const { t } = props;
  return (
    <View style={[styles.root, { backgroundColor: p.background }, !props.keyLost && props.overlay ? StyleSheet.absoluteFill : null]} accessibilityViewIsModal>
      <View style={styles.inner}>
        <Txt style={styles.icon} importantForAccessibility="no">
          🔒
        </Txt>
        <Txt variant="title" accessibilityRole="header" style={styles.center}>
          {t('lock.title')}
        </Txt>
        {props.keyLost ? (
          <>
            <Txt style={styles.center}>{t('lock.keyLost')}</Txt>
            <Button label={t('lock.reset')} kind="danger" onPress={props.onReset} />
          </>
        ) : (
          <>
            <Txt style={styles.center}>{t('lock.body')}</Txt>
            {props.error ? (
              <Txt color={p.danger} style={styles.center} accessibilityLiveRegion="polite">
                {props.error}
              </Txt>
            ) : null}
            <Button label={t('lock.unlock')} onPress={props.onUnlock} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  inner: { width: '100%', maxWidth: 420, gap: Spacing.lg },
  icon: { fontSize: 48, lineHeight: 56, textAlign: 'center' },
  center: { textAlign: 'center' },
});
