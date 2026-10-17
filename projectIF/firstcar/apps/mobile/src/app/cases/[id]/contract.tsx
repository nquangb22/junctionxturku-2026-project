import { CONTRACT_DISCLAIMER, contractText } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useCaseId } from '@/hooks/use-case-id';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { notify } from '@/ui/dialog';
import { Badge, Button, Card, Screen, Txt } from '@/ui/primitives';

const EDITABLE_STATUSES = new Set(['checking', 'inspecting', 'contract_prep', 'ready_to_buy']);

export default function Contract() {
  const c = useCase(useCaseId());
  const { t, prefs } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  if (!c) return <Redirect href="/" />;
  const editable = EDITABLE_STATUSES.has(c.status);

  const text = contractText(c.clauses, t('contract.docTitle'), CONTRACT_DISCLAIMER[prefs.locale]);
  const isWeb = Platform.OS === 'web';

  // Web without navigator.share (most desktop browsers): copy instead, so the tap always does something visible.
  const share = async () => {
    try {
      if (isWeb && !globalThis.navigator?.share) {
        await Clipboard.setStringAsync(text);
        notify(t('contract.copied'));
        return;
      }
      await Share.share({ message: text });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return; // the user closed the share sheet
      notify(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('contract.docTitle')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Screen footer={<Button label={t('contract.next')} onPress={() => router.push({ pathname: '/cases/[id]/decide', params: { id: c.id } })} />}>
      <Stack.Screen options={{ title: t('contract.title') }} />
      <Txt variant="h2">{t('contract.body')}</Txt>
      {c.clauses.some((cl) => cl.kind === 'disputed_claim') ? (
        <Card tone="danger">
          <Txt variant="bodyStrong">⚠️ {t('contract.disputedWarning')}</Txt>
        </Card>
      ) : null}
      {c.clauses.map((cl) => (
        <Pressable
          key={cl.id}
          disabled={!editable}
          onPress={() => caseEvent(c.id, { type: 'clause_toggled', clauseId: cl.id })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: cl.included, disabled: !editable }}
          aria-checked={cl.included}
          style={[styles.clause, { borderColor: cl.kind === 'disputed_claim' ? p.danger : cl.kind === 'seller_assurance' ? p.warning : p.border, backgroundColor: cl.included ? p.surface : p.surfaceAlt }]}>
          <View style={styles.head}>
            <Txt variant="h2" importantForAccessibility="no">
              {cl.included ? '☑' : '☐'}
            </Txt>
            {cl.kind === 'seller_assurance' ? <Badge tone="warning" label={t('contract.assurance')} /> : null}
            {cl.kind === 'disputed_claim' ? <Badge tone="danger" label={t('contract.disputed')} /> : null}
          </View>
          <Txt style={{ opacity: cl.included ? 1 : 0.5 }}>{cl.text}</Txt>
        </Pressable>
      ))}
      <Txt variant="caption">{CONTRACT_DISCLAIMER[prefs.locale]}</Txt>
      <Button kind="secondary" label={t('contract.share')} onPress={share} />
      {isWeb ? <Button kind="ghost" label={t('contract.download')} onPress={download} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  clause: { borderWidth: 1.5, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
