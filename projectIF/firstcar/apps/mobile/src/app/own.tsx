import { beltDueCost, computeBudget, formatEur, remindersFor, type PurchaseCase } from '@firstcar/core';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { usePalette } from '@/hooks/use-palette';
import { scheduleReminders } from '@/reminders/schedule';
import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { carForCase, caseTitle, formatDate } from '@/ui/case-helpers';
import { Button, Card, Row, Screen, Section, Txt } from '@/ui/primitives';

export default function Own() {
  const { t, prefs } = useSession();
  const { data, patch } = useStore();
  const p = usePalette();
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const owned = data.cases.filter((c) => c.status === 'owned' || c.status === 'registered');
  const now = new Date();

  // Once on, useReminderSync (root layout) keeps the schedule current as cases change.
  const enable = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const all = owned.flatMap((c) => remindersFor(c, now, prefs.locale));
      const result = await scheduleReminders(all, now);
      setDenied(result !== 'scheduled');
      if (result === 'scheduled') patch({ remindersOn: true });
    } catch (e) {
      setError(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('own.title') }} />
      {owned.length === 0 ? <Txt>{t('own.none')}</Txt> : null}
      {owned.map((c) => (
        <OwnedCar key={c.id} c={c} />
      ))}
      {owned.length ? (
        <>
          <Button kind={data.remindersOn ? 'secondary' : 'primary'} label={data.remindersOn ? `✓ ${t('own.enabled')}` : t('own.enable')} onPress={enable} loading={busy} />
          {denied ? <Txt color={p.warning}>{t('own.denied')}</Txt> : null}
          {error ? <Txt color={p.danger}>{error}</Txt> : null}
        </>
      ) : null}
    </Screen>
  );
}

function OwnedCar({ c }: { c: PurchaseCase }) {
  const { t, prefs } = useSession();
  const { data } = useStore();
  const now = new Date();
  const car = carForCase(c);
  const budget = data.profile && car ? computeBudget({ profile: data.profile, car, extraOneOffEur: beltDueCost(c), now }) : undefined;
  return (
    <Section title={caseTitle(c)}>
      {budget ? (
        <Card>
          <Txt variant="bodyStrong">{t('own.budget', { amount: formatEur(budget.monthlyTotal) })}</Txt>
        </Card>
      ) : null}
      <Card>
        <Txt variant="bodyStrong">{t('own.reminders')}</Txt>
        {remindersFor(c, now, prefs.locale).map((r) => (
          <Row key={r.id} label={r.title} value={formatDate(r.dueAt, prefs.locale)} />
        ))}
      </Card>
    </Section>
  );
}
