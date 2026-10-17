import { formatKm } from '@firstcar/core';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { lookupRegistry } from '@/adapters';
import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { Button, Card, Row, Screen, Section, Txt } from '@/ui/primitives';
import { DemoBadge } from '@/ui/status';

const monthYear = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default function Registry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCase(id);
  const { t } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  const [plate, setPlate] = useState(c?.registry?.plate ?? c?.listing.plateLocal ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!c) return <Redirect href="/" />;
  const reg = c.registry;

  const check = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await lookupRegistry(plate, new Date());
      if (!res.ok) {
        setError(t('registry.unknownPlate', { plates: res.demoPlates.join(', ') }));
        return;
      }
      const err = caseEvent(c.id, { type: 'registry_result', registry: res.registry });
      if (err) setError(t('common.error', { error: err }));
    } catch (e) {
      setError(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const toLedger = () => router.push({ pathname: '/cases/[id]/ledger', params: { id: c.id } });
  const toTestDrive = () => {
    if (c.status === 'checking') caseEvent(c.id, { type: 'start_inspection' });
    router.push({ pathname: '/cases/[id]/inspection', params: { id: c.id } });
  };

  return (
    <Screen footer={reg ? <Button label={t('case.step.ledger')} onPress={toLedger} /> : undefined}>
      <Stack.Screen options={{ title: t('registry.title') }} />
      <Txt>{t('registry.body')}</Txt>
      <DemoBadge t={t} />
      <TextInput
        value={plate}
        onChangeText={setPlate}
        placeholder="ABC-123"
        placeholderTextColor={p.textSecondary}
        autoCapitalize="characters"
        accessibilityLabel={t('registry.plate')}
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      <Button label={t('registry.check')} onPress={check} loading={busy} disabled={!plate.trim()} />
      {error ? (
        <Txt color={p.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}

      {reg ? (
        <Section title={reg.plate}>
          <Card>
            {reg.technical ? <Row label={t('registry.technical')} value={`${reg.technical.make} ${reg.technical.model} ${reg.technical.modelYear}`} /> : null}
            {reg.inspection ? (
              <>
                <Txt>
                  {t('registry.inspection', {
                    date: monthYear(reg.inspection.lastDate),
                    result: t(`inspection.${reg.inspection.result}`),
                    km: reg.inspection.odometerKmAtLast !== undefined ? formatKm(reg.inspection.odometerKmAtLast) : '—',
                  })}
                </Txt>
                <Txt variant="small">{t('registry.nextDue', { date: monthYear(reg.inspection.nextDue) })}</Txt>
              </>
            ) : null}
          </Card>
          <Card tone={reg.tax?.status === 'unpaid' ? 'danger' : 'success'}>
            <Txt variant="bodyStrong">{reg.tax?.status === 'unpaid' ? `✕ ${t('registry.taxUnpaid')}` : `✓ ${t('registry.taxPaid')}`}</Txt>
          </Card>
          {reg.ownership ? (
            <Card tone={reg.ownership.ownerKind === 'finance_company' || reg.ownership.holderDiffersFromOwner ? 'danger' : 'success'}>
              <Txt variant="bodyStrong">{t(`registry.owner.${reg.ownership.ownerKind}`)}</Txt>
              {reg.ownership.ownersCount !== undefined ? <Txt variant="small">{t('registry.owners', { n: reg.ownership.ownersCount })}</Txt> : null}
              <Txt variant="caption">🔒 {t('registry.ownerLocal')}</Txt>
            </Card>
          ) : null}
          <Button kind="secondary" label={t('registry.next')} onPress={toTestDrive} />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 52, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 20, fontWeight: '700', letterSpacing: 2 },
});
