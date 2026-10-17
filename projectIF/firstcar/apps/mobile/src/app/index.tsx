import { CLAIM_TITLES, computeBudget, type PurchaseCase } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';

import { VERDICT_TONE, type StatusTone } from '@/constants/theme';
import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { Badge, Button, NavCard, Screen, Section, Txt } from '@/ui/primitives';
import { caseCounts, caseTitle } from '@/ui/case-helpers';

const OWNED = new Set(['owned', 'registered']);

export default function Home() {
  const { t } = useSession();
  const { data } = useStore();

  if (!data.welcomed) return <Redirect href="/welcome" />;

  const active = data.cases.filter((c) => !OWNED.has(c.status));
  const owned = data.cases.filter((c) => OWNED.has(c.status));
  const verdict = data.profile && data.readinessCar ? computeBudget({ profile: data.profile, car: data.readinessCar, now: new Date() }).verdict : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('appName'), headerRight: () => <Button kind="ghost" label={t('home.settings')} onPress={() => router.push('/settings')} /> }} />
      <Txt variant="title" accessibilityRole="header">
        {t('home.tagline')}
      </Txt>
      <Badge tone="success" icon="🔒" label={t('home.privacy')} />

      <NavCard
        title={t('home.readyTitle')}
        subtitle={verdict ? undefined : t('home.readyBody')}
        accessibilityLabel={verdict ? `${t('home.readyTitle')}. ${t(`verdict.${verdict.level}`)}` : undefined}
        onPress={() => router.push(verdict ? '/ready/result' : '/ready')}
        right={verdict ? <Badge tone={VERDICT_TONE[verdict.level]} label={t(`verdict.${verdict.level}`)} /> : undefined}
      />

      <Section title={t('home.casesTitle')}>
        {active.length === 0 ? <Txt variant="small">{t('home.noCases')}</Txt> : null}
        {active.map((c) => (
          <CaseCard key={c.id} c={c} />
        ))}
        <Button label={t('home.newCase')} onPress={() => router.push('/cases/new')} />
      </Section>

      <Section title={t('home.ownTitle')}>
        {owned.length === 0 ? (
          <Txt variant="small">{t('own.none')}</Txt>
        ) : (
          owned.map((c) => <NavCard key={c.id} title={caseTitle(c)} subtitle={t('home.ownBody')} onPress={() => router.push('/own')} tone="success" />)
        )}
      </Section>
    </Screen>
  );
}

function CaseCard({ c }: { c: PurchaseCase }) {
  const { t, prefs } = useSession();
  const counts = caseCounts(c);
  const tone: StatusTone = counts.problems > 0 ? 'danger' : c.status === 'ready_to_buy' ? 'success' : c.status === 'walked_away' ? 'neutral' : 'info';
  const firstProblem = c.items.find((i) => i.status === 'not_verified');
  const problemLabel =
    firstProblem?.origin.kind === 'claim' ? CLAIM_TITLES[firstProblem.origin.claimType][prefs.locale] : undefined;
  return (
    <NavCard
      title={caseTitle(c)}
      subtitle={[t(`caseStatus.${c.status}`), c.items.length ? t('case.summary', counts) : undefined, problemLabel ? `✕ ${problemLabel}` : undefined]
        .filter(Boolean)
        .join(' · ')}
      tone={tone}
      onPress={() => router.push({ pathname: '/cases/[id]', params: { id: c.id } })}
    />
  );
}
