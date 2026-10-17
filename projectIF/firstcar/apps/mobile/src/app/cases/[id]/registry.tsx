import { formatEur, formatKm, mileageGap } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { lookupRegistry } from '@/adapters';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useCaseId } from '@/hooks/use-case-id';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { CaseProgress } from '@/ui/case-steps';
import { IconLine } from '@/ui/icon';
import { Badge, Button, Card, Row, Screen, Section, Txt } from '@/ui/primitives';
import { DemoBadge } from '@/ui/status';

const monthYear = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default function Registry() {
  const c = useCase(useCaseId());
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
  const gap = mileageGap(c, new Date());
  const odometerItem = c.items.find((i) => i.origin.kind === 'claim' && i.origin.claimType === 'odometer');

  return (
    <Screen footer={reg ? <Button label={t('common.next', { step: t('case.step.ledger') })} onPress={toLedger} /> : undefined} top={<CaseProgress c={c} current="registry" t={t} />}>
      <Stack.Screen options={{ title: t('registry.title') }} />
      <Txt>{t('registry.body')}</Txt>
      <DemoBadge t={t} />
      <TextInput
        value={plate}
        onChangeText={setPlate}
        placeholder="ABC-123"
        placeholderTextColor={p.textSecondary}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        accessibilityLabel={t('registry.plate')}
        style={[styles.input, { color: p.text, borderColor: p.borderStrong, backgroundColor: p.surface }]}
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
          {gap && reg.inspection ? (
            <Card tone="danger">
              <IconLine icon="warning" variant="bodyStrong" color={p.danger}>
                {t('registry.conflictTitle')}
              </IconLine>
              <Txt>{t('registry.conflict', { adKm: formatKm(gap.adKm), date: monthYear(reg.inspection.lastDate), regKm: formatKm(gap.registryKm) })}</Txt>
              <Txt variant="bodyStrong">{t('registry.conflictDiff', { km: formatKm(gap.diffKm), pct: gap.pct, eur: formatEur(gap.total) })}</Txt>
              {odometerItem?.acceptedRisk ? (
                <Badge tone="warning" icon="check" label={t('registry.conflictAccepted')} />
              ) : (
                <Txt variant="small">{t('registry.conflictExplain')}</Txt>
              )}
              {odometerItem ? (
                <Button
                  kind={odometerItem.acceptedRisk ? 'secondary' : 'primary'}
                  label={t('registry.conflictLink')}
                  onPress={() => router.push({ pathname: '/cases/[id]/item/[itemId]', params: { id: c.id, itemId: odometerItem.id } })}
                />
              ) : null}
            </Card>
          ) : null}
          <Card tone={reg.tax?.status === 'unpaid' ? 'danger' : 'success'}>
            <Txt variant="bodyStrong">{reg.tax?.status === 'unpaid' ? `✕ ${t('registry.taxUnpaid')}` : `✓ ${t('registry.taxPaid')}`}</Txt>
          </Card>
          {reg.ownership ? (
            <Card tone={reg.ownership.ownerKind === 'finance_company' || reg.ownership.holderDiffersFromOwner ? 'danger' : 'success'}>
              <Txt variant="bodyStrong">{t(`registry.owner.${reg.ownership.ownerKind}`)}</Txt>
              {reg.ownership.ownersCount !== undefined ? <Txt variant="small">{t(reg.ownership.ownersCount === 1 ? 'registry.owners.one' : 'registry.owners.other', { n: reg.ownership.ownersCount })}</Txt> : null}
              <IconLine icon="lock" variant="caption">{t('registry.ownerLocal')}</IconLine>
            </Card>
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 52, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontFamily: Fonts.bold, fontSize: 20, letterSpacing: 2 },
});
