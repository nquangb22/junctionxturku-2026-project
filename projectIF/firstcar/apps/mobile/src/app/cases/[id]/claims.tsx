import { CLAIM_TITLES, type ClaimType, type SellerClaim } from '@firstcar/core';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { describeValue } from '@/ui/case-helpers';
import { Badge, Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';
import { QuoteHighlight, StatusPill } from '@/ui/status';

const ADDABLE: ClaimType[] = ['service_history', 'timing_belt', 'clutch', 'no_rust', 'no_accidents', 'tyres_included', 'known_defects', 'other'];

export default function ClaimsReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCase(id);
  const { t, prefs } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  const [focus, setFocus] = useState<string | undefined>();
  const [addType, setAddType] = useState<ClaimType | undefined>();
  const [addNote, setAddNote] = useState('');

  if (!c) return <Redirect href="/" />;
  const editable = c.status === 'reviewing_claims';

  const confirm = () => {
    const err = caseEvent(c.id, { type: 'claims_confirmed' });
    if (!err) router.replace({ pathname: '/cases/[id]', params: { id: c.id } });
  };

  const add = () => {
    if (!addType || !addNote.trim()) return;
    caseEvent(c.id, { type: 'claim_added', claimType: addType, value: { kind: 'text', text: addNote.trim().slice(0, 140) }, quote: addNote.trim() });
    setAddType(undefined);
    setAddNote('');
  };

  return (
    <Screen footer={editable ? <Button label={t('claims.confirm')} onPress={confirm} /> : undefined}>
      <Stack.Screen options={{ title: t('claims.title') }} />
      <Txt>{t('claims.body')}</Txt>
      <View style={styles.badges}>
        <Badge tone="info" label={t(`claims.extractor.${c.listing.extractor}`)} />
        <Badge tone="neutral" label={t(`seller.${c.listing.sellerType}`)} />
      </View>
      {c.listing.injectionSuspected ? (
        <Card tone="danger">
          <Txt variant="bodyStrong" color={p.danger}>
            ⚠️ {t('claims.injection')}
          </Txt>
        </Card>
      ) : null}

      <Section title={t('claims.adText')}>
        <QuoteHighlight text={c.listing.rawTextLocal} claims={c.claims} focusId={focus} />
      </Section>

      <Section title={t('claims.title')}>
        {c.claims.length === 0 ? <Txt>{t('claims.none')}</Txt> : null}
        {c.claims.map((cl) => (
          <ClaimRow key={cl.id} claim={cl} t={t} locale={prefs.locale} focused={focus === cl.id} onFocus={() => setFocus(cl.id)} onRemove={editable ? () => caseEvent(c.id, { type: 'claim_removed', claimId: cl.id }) : undefined} />
        ))}
      </Section>

      {editable ? (
        <Section title={t('claims.add')}>
          <Choice label={t('claims.add')} value={addType} onChange={setAddType} options={ADDABLE.map((ct) => ({ value: ct, label: CLAIM_TITLES[ct][prefs.locale] }))} />
          {addType ? (
            <>
              <TextInput
                value={addNote}
                onChangeText={setAddNote}
                placeholder={t('claims.addNote')}
                placeholderTextColor={p.textSecondary}
                accessibilityLabel={t('claims.addNote')}
                style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
              />
              <Button kind="secondary" label={t('claims.addButton')} onPress={add} disabled={!addNote.trim()} />
            </>
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}

function ClaimRow({ claim, t, locale, focused, onFocus, onRemove }: { claim: SellerClaim; t: Translate; locale: 'en' | 'fi'; focused: boolean; onFocus: () => void; onRemove?: () => void }) {
  return (
    <Card tone={focused ? 'info' : undefined}>
      <View style={styles.row}>
        <Txt variant="bodyStrong" style={{ flex: 1 }} onPress={onFocus} accessibilityRole="button">
          {CLAIM_TITLES[claim.type][locale]}: {describeValue(claim.value, t)}
        </Txt>
        <StatusPill status="unchecked" t={t} />
      </View>
      <Txt variant="small">“{claim.quote}”</Txt>
      {onRemove ? <Button kind="ghost" label={t('claims.remove')} onPress={onRemove} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 15 },
});
