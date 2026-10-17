import { inspectionPlan, itemTitle, type CaseEvent } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useCaseId } from '@/hooks/use-case-id';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { notify } from '@/ui/dialog';
import { Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';
import { DemoBadge } from '@/ui/status';

type Mark = 'ok' | 'issue';

export default function Inspection() {
  const c = useCase(useCaseId());
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

  // Applies events in order and stops at the first failure, so a later success cannot hide an earlier error.
  const finishDrive = () => {
    const events: CaseEvent[] = [];
    const vin = drive.vin_plate;
    if (vin) events.push({ type: 'vin_confirmed', matches: vin === 'ok' });
    const rustIssue = drive.rust_check === 'issue';
    const rustItems = plan.testDrive.find((x) => x.id === 'rust_check')?.linkedItemIds ?? [];
    if (rustIssue && rustItems.length) events.push({ type: 'evidence_added', kind: 'test_drive_note', itemIds: rustItems, outcome: 'contradicts', note: 'rust seen on test drive' });
    events.push({ type: 'test_drive_done' });
    for (const event of events) {
      const err = caseEvent(c.id, event);
      if (err) return report(err);
    }
    report(undefined);
  };

  const saveInspection = () => report(caseEvent(c.id, { type: 'inspection_result', outcomes: insp }));

  const toContract = () => {
    if (c.status === 'checking') {
      const startErr = caseEvent(c.id, { type: 'start_inspection' });
      if (startErr) return report(startErr);
    }
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
          <Button kind="secondary" label={t('insp.partner')} onPress={() => notify(t('insp.partner'), t('insp.partnerBooked'))} />
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
