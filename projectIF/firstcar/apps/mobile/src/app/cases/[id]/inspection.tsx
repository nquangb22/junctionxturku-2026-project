import { inspectionPlan, itemTitle } from '@firstcar/core';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';
import { DemoBadge } from '@/ui/status';

type Mark = 'ok' | 'issue';

export default function Inspection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCase(id);
  const { t, prefs } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  const [drive, setDrive] = useState<Record<string, Mark>>({});
  const [insp, setInsp] = useState<Record<string, Mark>>({});
  const [error, setError] = useState<string | undefined>();

  if (!c) return <Redirect href="/" />;
  const plan = inspectionPlan(c, prefs.locale, new Date());
  const inspectable = c.items.filter((i) => i.inspectable && i.status !== 'verified');

  const report = (err: string | undefined) => setError(err ? t('common.error', { error: err }) : undefined);

  const finishDrive = () => {
    const vin = drive.vin_plate;
    if (vin) report(caseEvent(c.id, { type: 'vin_confirmed', matches: vin === 'ok' }));
    const rustIssue = drive.rust_check === 'issue';
    const rustItems = plan.testDrive.find((x) => x.id === 'rust_check')?.linkedItemIds ?? [];
    if (rustIssue && rustItems.length) report(caseEvent(c.id, { type: 'evidence_added', kind: 'test_drive_note', itemIds: rustItems, outcome: 'contradicts', note: 'rust seen on test drive' }));
    report(caseEvent(c.id, { type: 'test_drive_done' }));
  };

  const saveInspection = () => report(caseEvent(c.id, { type: 'inspection_result', outcomes: insp }));

  const toContract = () => {
    if (c.status === 'checking') caseEvent(c.id, { type: 'start_inspection' });
    const err = c.status === 'contract_prep' || c.status === 'ready_to_buy' ? undefined : caseEvent(c.id, { type: 'start_contract' });
    if (err) {
      setError(err === 'test_drive_missing' ? t('insp.needDrive') : err === 'inspection_missing' ? t('insp.needInspection') : t('common.error', { error: err }));
      return;
    }
    router.push({ pathname: '/cases/[id]/contract', params: { id: c.id } });
  };

  return (
    <Screen footer={<Button label={t('insp.next')} onPress={toContract} />}>
      <Stack.Screen options={{ title: t('insp.title') }} />
      {error ? (
        <Txt color={p.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}

      <Section title={t('insp.testDrive')}>
        {plan.testDrive.map((item) => (
          <Card key={item.id}>
            <Txt variant="bodyStrong">{item.label}</Txt>
            <Txt variant="small">{item.why}</Txt>
            <Choice
              label={item.label}
              value={drive[item.id]}
              onChange={(v) => setDrive((d) => ({ ...d, [item.id]: v }))}
              options={[
                { value: 'ok', label: `✓ ${t('insp.ok')}` },
                { value: 'issue', label: `✕ ${t('insp.issue')}` },
              ]}
            />
          </Card>
        ))}
        <Button kind={c.testDriveDone ? 'ghost' : 'primary'} label={c.testDriveDone ? `✓ ${t('insp.done')}` : t('insp.done')} disabled={c.testDriveDone} onPress={finishDrive} />
      </Section>

      <Section title={t('insp.preTitle')}>
        <Card tone={plan.prePurchase.recommended ? 'warning' : undefined}>
          {plan.prePurchase.recommended ? (
            <>
              <Txt variant="bodyStrong">{t('insp.recommended')}</Txt>
              {plan.prePurchase.reasons.map((r) => (
                <Txt key={r}>• {r}</Txt>
              ))}
            </>
          ) : (
            <Txt>{t('insp.notRecommended')}</Txt>
          )}
          {plan.prePurchase.focus.length ? (
            <>
              <Txt variant="bodyStrong">{t('insp.focus')}</Txt>
              {plan.prePurchase.focus.map((f) => (
                <Txt key={f}>• {f}</Txt>
              ))}
            </>
          ) : null}
        </Card>
        <View style={{ gap: Spacing.sm }}>
          <DemoBadge t={t} />
          <Button kind="secondary" label={t('insp.partner')} onPress={() => Alert.alert(t('insp.partner'), t('insp.partnerBooked'))} />
        </View>

        {inspectable.length ? (
          <Card>
            <Txt variant="bodyStrong">{t('insp.result')}</Txt>
            {inspectable.map((i) => (
              <View key={i.id} style={{ gap: Spacing.xs }}>
                <Txt>{itemTitle(i, prefs.locale)}</Txt>
                <Choice
                  label={itemTitle(i, prefs.locale)}
                  value={insp[i.id]}
                  onChange={(v) => setInsp((s) => ({ ...s, [i.id]: v }))}
                  options={[
                    { value: 'ok', label: `✓ ${t('insp.ok')}` },
                    { value: 'issue', label: `✕ ${t('insp.issue')}` },
                  ]}
                />
              </View>
            ))}
            <Button label={c.inspectionDone ? `✓ ${t('insp.save')}` : t('insp.save')} disabled={Object.keys(insp).length === 0} onPress={saveInspection} />
          </Card>
        ) : null}
      </Section>
    </Screen>
  );
}
