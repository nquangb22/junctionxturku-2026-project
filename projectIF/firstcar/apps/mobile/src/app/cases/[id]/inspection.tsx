import { inspectionPlan, itemTitle, type CaseEvent, type PurchaseCase } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useCaseId } from '@/hooks/use-case-id';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { confirmAction, notify } from '@/ui/dialog';
import { Badge, Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';
import { DemoBadge } from '@/ui/status';

type Mark = 'ok' | 'issue';

/** Demo partners for the mock booking sheet. */
const PARTNERS = ['Demo Katsastus Oy', 'Esimerkki Kuntotarkastus'];

/** The next three weekdays at 10:00 local time. */
function nextWeekdays(from: Date): Date[] {
  const days: Date[] = [];
  const d = new Date(from);
  d.setHours(10, 0, 0, 0);
  while (days.length < 3) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
  }
  return days;
}

/** The saved inspection outcome per item, from its latest inspection report. */
function savedOutcomes(c: PurchaseCase): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const e of c.evidence) if (e.kind === 'inspection_report' && e.itemIds.length === 1) out[e.itemIds[0]!] = e.outcome === 'contradicts' ? 'issue' : 'ok';
  return out;
}

export default function Inspection() {
  const c = useCase(useCaseId());
  const { t, prefs } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  const [drive, setDrive] = useState<Record<string, Mark>>(() => c?.testDriveAnswers ?? {});
  const [editingDrive, setEditingDrive] = useState(false);
  const [insp, setInsp] = useState<Record<string, Mark>>(() => (c ? savedOutcomes(c) : {}));
  const [booking, setBooking] = useState<{ partner?: string; date?: string } | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (!c) return <Redirect href="/" />;
  const plan = inspectionPlan(c, prefs.locale, new Date());
  const saved = savedOutcomes(c);
  // Rows stay after saving: an item verified by the inspection is still listed with its saved result.
  const inspectable = c.items.filter((i) => i.inspectable && (i.status !== 'verified' || saved[i.id]));
  const answered = plan.testDrive.filter((x) => drive[x.id]).length;
  const driveLocked = c.testDriveDone && !editingDrive;
  const savedCounts = Object.values(saved).reduce((acc, m) => ({ ...acc, [m]: acc[m] + 1 }), { ok: 0, issue: 0 });
  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(prefs.locale === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' });

  const report = (err: string | undefined) => setError(err ? t('common.error', { error: err }) : undefined);

  // Applies events in order and stops at the first failure, so a later success cannot hide an earlier error.
  const finishDrive = () => {
    const events: CaseEvent[] = [];
    const vin = drive.vin_plate;
    if (vin) events.push({ type: 'vin_confirmed', matches: vin === 'ok' });
    const rustIssue = drive.rust_check === 'issue';
    const rustItems = plan.testDrive.find((x) => x.id === 'rust_check')?.linkedItemIds ?? [];
    const rustAlreadyNoted = c.evidence.some((e) => e.kind === 'test_drive_note' && e.outcome === 'contradicts' && rustItems.every((id) => e.itemIds.includes(id)));
    if (rustIssue && rustItems.length && !rustAlreadyNoted) events.push({ type: 'evidence_added', kind: 'test_drive_note', itemIds: rustItems, outcome: 'contradicts', note: 'rust seen on test drive' });
    events.push({ type: 'test_drive_done', answers: drive });
    for (const event of events) {
      const err = caseEvent(c.id, event);
      if (err) return report(err);
    }
    setEditingDrive(false);
    report(undefined);
  };

  const requestBooking = () => {
    if (!booking?.partner || !booking.date) return;
    const err = caseEvent(c.id, { type: 'inspection_booked', partner: booking.partner, date: booking.date });
    report(err);
    if (!err) {
      setBooking(undefined);
      notify(t('insp.partner'), t('insp.bookSent'));
    }
  };

  const saveInspection = () => report(caseEvent(c.id, { type: 'inspection_result', outcomes: insp }));

  const atContract = c.status === 'contract_prep' || c.status === 'ready_to_buy';
  const needsInspection = plan.prePurchase.recommended && !c.inspectionDone && !c.inspectionSkipped;
  // Why "next" is disabled, shown right above it: the footer button is never an enabled-looking no-op.
  const blocked = atContract ? undefined : !c.testDriveDone ? t('insp.needDrive') : needsInspection ? t('insp.needInspection') : undefined;

  const skipInspection = () =>
    confirmAction({
      title: t('insp.skip'),
      message: t('insp.skipConfirm'),
      confirmLabel: t('insp.skip'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => report(caseEvent(c.id, { type: 'inspection_skipped' })),
    });

  const toContract = () => {
    if (c.status === 'checking') {
      const startErr = caseEvent(c.id, { type: 'start_inspection' });
      if (startErr) return report(startErr);
    }
    const err = atContract ? undefined : caseEvent(c.id, { type: 'start_contract' });
    if (err) {
      setError(err === 'test_drive_missing' ? t('insp.needDrive') : err === 'inspection_missing' ? t('insp.needInspection') : t('common.error', { error: err }));
      return;
    }
    router.push({ pathname: '/cases/[id]/contract', params: { id: c.id } });
  };

  return (
    <Screen
      footer={
        <View style={{ gap: Spacing.sm }}>
          {blocked ? <Txt variant="small">{blocked}</Txt> : null}
          <Button label={t('common.next', { step: t('case.step.contract') })} disabled={!!blocked} onPress={toContract} />
          {needsInspection && c.testDriveDone && !atContract ? <Button kind="ghost" label={t('insp.skip')} onPress={skipInspection} /> : null}
        </View>
      }>
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
              disabled={driveLocked}
              onChange={(v) => setDrive((d) => ({ ...d, [item.id]: v }))}
              options={[
                { value: 'ok', label: `✓ ${t('insp.ok')}` },
                { value: 'issue', label: `✕ ${t('insp.issue')}` },
              ]}
            />
          </Card>
        ))}
        <Txt variant="small" accessibilityLiveRegion="polite">
          {t('insp.answered', { n: answered, total: plan.testDrive.length })}
        </Txt>
        {driveLocked ? (
          <>
            <Badge tone="success" label={`✓ ${t('insp.done')}`} />
            <Button kind="ghost" label={t('insp.editAnswers')} onPress={() => setEditingDrive(true)} />
          </>
        ) : (
          <Button label={c.testDriveDone ? t('insp.saveAnswers') : t('insp.done')} disabled={answered < plan.testDrive.length} onPress={finishDrive} />
        )}
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
          {c.inspectionBooking ? <Badge tone="info" icon="📅" label={t('insp.booked', { date: dateLabel(c.inspectionBooking.date), partner: c.inspectionBooking.partner })} /> : null}
          {booking ? (
            <Card>
              <Choice label={t('insp.bookPartner')} value={booking.partner} onChange={(partner) => setBooking((b) => ({ ...b, partner }))} options={PARTNERS.map((x) => ({ value: x, label: x }))} />
              <Choice
                label={t('insp.bookDate')}
                value={booking.date}
                onChange={(date) => setBooking((b) => ({ ...b, date }))}
                options={nextWeekdays(new Date()).map((d) => ({ value: d.toISOString(), label: dateLabel(d.toISOString()) }))}
              />
              <Button label={t('insp.bookRequest')} disabled={!booking.partner || !booking.date} onPress={requestBooking} />
              <Button kind="ghost" label={t('common.cancel')} onPress={() => setBooking(undefined)} />
            </Card>
          ) : (
            <Button kind="secondary" label={t('insp.partner')} onPress={() => setBooking({})} />
          )}
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
            {c.inspectionDone ? (
              <Txt variant="small" accessibilityLiveRegion="polite">
                ✓ {t('insp.saved', { ok: savedCounts.ok, issue: savedCounts.issue })}
              </Txt>
            ) : null}
            <Button label={c.inspectionDone ? t('insp.update') : t('insp.save')} disabled={Object.keys(insp).length === 0} onPress={saveInspection} />
          </Card>
        ) : null}
      </Section>
    </Screen>
  );
}
