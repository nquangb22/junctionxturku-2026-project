import { CLAIM_TITLES, computeBudget, type PurchaseCase } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Spacing, VERDICT_TONE, type StatusTone } from '@/constants/theme';
import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { Badge, Button, Hero, NavCard, Screen, Section, Txt } from '@/ui/primitives';
import { caseCounts, caseTitle } from '@/ui/case-helpers';
import { confirmAction } from '@/ui/dialog';
import { carPhoto, PhotoCard, PhotoThumb, PHOTOS } from '@/ui/photos';

const OWNED = new Set(['owned', 'registered']);

export default function Home() {
  const { t } = useSession();
  const { data, caseEvent, deleteCase } = useStore();
  const [showPast, setShowPast] = useState(false);

  if (!data.welcomed) return <Redirect href="/welcome" />;

  const active = data.cases.filter((c) => !OWNED.has(c.status) && c.status !== 'walked_away');
  const past = data.cases.filter((c) => c.status === 'walked_away');
  const confirmDelete = (c: PurchaseCase) =>
    confirmAction({
      title: t('case.delete'),
      message: t('case.deleteConfirm'),
      confirmLabel: t('case.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () => deleteCase(c.id),
    });
  const owned = data.cases.filter((c) => OWNED.has(c.status));
  const verdict = data.profile && data.readinessCar ? computeBudget({ profile: data.profile, car: data.readinessCar, now: new Date() }).verdict : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('appName'), headerRight: () => <Button kind="ghost" label={t('home.settings')} onPress={() => router.push('/settings')} /> }} />
      <Hero icon="car" title={t('home.tagline')} image={<PhotoCard photo={PHOTOS.hero} t={t} alt={t('photo.heroAlt')} aspectRatio={3 / 2} />}>
        {Platform.OS === 'web' ? <Badge tone="warning" icon="warning" label={t('home.privacyWeb')} /> : <Badge tone="success" icon="lock" label={t('home.privacy')} />}
      </Hero>

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

      {past.length ? (
        <Section title={t('home.pastTitle')}>
          <Button kind="ghost" label={showPast ? t('home.hidePast') : t('home.showPast', { n: past.length })} onPress={() => setShowPast((v) => !v)} />
          {showPast
            ? past.map((c) => (
                <View key={c.id} style={{ gap: Spacing.xs }}>
                  <CaseCard c={c} />
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <Button kind="secondary" label={t('case.reopen')} onPress={() => caseEvent(c.id, { type: 'reopen' })} />
                    <Button kind="ghost" label={t('case.delete')} onPress={() => confirmDelete(c)} />
                  </View>
                </View>
              ))
            : null}
        </Section>
      ) : null}

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
  const photo = carPhoto(c.listing.car);
  const problemLabel =
    firstProblem?.origin.kind === 'claim' ? CLAIM_TITLES[firstProblem.origin.claimType][prefs.locale] : undefined;
  return (
    <NavCard
      title={caseTitle(c)}
      subtitle={[t(`caseStatus.${c.status}`), c.items.length ? t('case.summary', counts) : undefined, problemLabel ? `✕ ${problemLabel}` : undefined]
        .filter(Boolean)
        .join(' · ')}
      tone={tone}
      leading={photo ? <PhotoThumb photo={photo} /> : undefined}
      onPress={() => router.push({ pathname: '/cases/[id]', params: { id: c.id } })}
    />
  );
}
