import { CONTRACT_DISCLAIMER, contractText } from '@firstcar/core';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { Badge, Button, Screen, Txt } from '@/ui/primitives';

const EDITABLE_STATUSES = new Set(['checking', 'inspecting', 'contract_prep', 'ready_to_buy']);

export default function Contract() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCase(id);
  const { t, prefs } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  if (!c) return <Redirect href="/" />;
  const editable = EDITABLE_STATUSES.has(c.status);

  const share = () =>
    Share.share({ message: contractText(c.clauses, t('contract.docTitle'), CONTRACT_DISCLAIMER[prefs.locale]) });

  return (
    <Screen footer={<Button label={t('contract.next')} onPress={() => router.push({ pathname: '/cases/[id]/decide', params: { id: c.id } })} />}>
      <Stack.Screen options={{ title: t('contract.title') }} />
      <Txt variant="h2">{t('contract.body')}</Txt>
      {c.clauses.map((cl) => (
        <Pressable
          key={cl.id}
          disabled={!editable}
          onPress={() => caseEvent(c.id, { type: 'clause_toggled', clauseId: cl.id })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: cl.included, disabled: !editable }}
          style={[styles.clause, { borderColor: cl.kind === 'seller_assurance' ? p.warning : p.border, backgroundColor: cl.included ? p.surface : p.surfaceAlt }]}>
          <View style={styles.head}>
            <Txt variant="h2" importantForAccessibility="no">
              {cl.included ? '☑' : '☐'}
            </Txt>
            {cl.kind === 'seller_assurance' ? <Badge tone="warning" label={t('contract.assurance')} /> : null}
          </View>
          <Txt style={{ opacity: cl.included ? 1 : 0.5 }}>{cl.text}</Txt>
        </Pressable>
      ))}
      <Txt variant="caption">{CONTRACT_DISCLAIMER[prefs.locale]}</Txt>
      <Button kind="secondary" label={t('contract.share')} onPress={share} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  clause: { borderWidth: 1.5, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
