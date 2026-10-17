import { CLAIM_TITLES, quoteTranslationFor, type ClaimType, type ClaimValue, type SellerClaim } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useCaseId } from '@/hooks/use-case-id';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { describeValue } from '@/ui/case-helpers';
import { IconLine } from '@/ui/icon';
import { Badge, Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';
import { QuoteHighlight, QuoteTranslation, StatusPill } from '@/ui/status';

const ADDABLE: ClaimType[] = ['service_history', 'timing_belt', 'clutch', 'no_rust', 'no_accidents', 'tyres_included', 'known_defects', 'other'];
/** These may appear more than once; every other type is one claim per ad. */
const REPEATABLE = new Set<ClaimType>(['known_defects', 'other']);

/** "Other" claims are titled by what the buyer typed, not by the generic type name. */
const claimTitle = (cl: SellerClaim, locale: 'en' | 'fi') => (cl.type === 'other' && cl.value.kind === 'text' ? cl.value.text : CLAIM_TITLES[cl.type][locale]);

export default function ClaimsReview() {
  const c = useCase(useCaseId());
  const { t, prefs } = useSession();
  const { caseEvent, getCase } = useStore();
  const p = usePalette();
  const [focus, setFocus] = useState<string | undefined>();
  const [addType, setAddType] = useState<ClaimType | undefined>();
  const [addTitle, setAddTitle] = useState('');
  const [addNote, setAddNote] = useState('');
  const [added, setAdded] = useState<string | undefined>();
  const [removed, setRemoved] = useState<{ claim: SellerClaim; index: number } | undefined>();

  // The undo row disappears after about five seconds.
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(undefined), 5000);
    return () => clearTimeout(timer);
  }, [removed]);

  if (!c) return <Redirect href="/" />;
  const editable = c.status === 'reviewing_claims';
  const present = new Set(c.claims.map((cl) => cl.type));
  const needsTitle = addType === 'other';
  const canAdd = !!addType && !!addNote.trim() && (!needsTitle || !!addTitle.trim());

  const confirm = () => {
    const err = caseEvent(c.id, { type: 'claims_confirmed' });
    if (!err) router.replace({ pathname: '/cases/[id]', params: { id: c.id } });
  };

  const add = () => {
    if (!addType || !canAdd) return;
    const title = needsTitle ? addTitle.trim().slice(0, 60) : CLAIM_TITLES[addType][prefs.locale];
    const err = caseEvent(c.id, { type: 'claim_added', claimType: addType, value: { kind: 'text', text: needsTitle ? title : addNote.trim().slice(0, 140) }, quote: addNote.trim() });
    if (err) return;
    // Highlight the new card and confirm inline, so it is clear the claim was added.
    setFocus(getCase(c.id)?.claims.at(-1)?.id);
    setAdded(t('claims.addedConfirm', { title }));
    setAddType(undefined);
    setAddTitle('');
    setAddNote('');
  };

  const remove = (claim: SellerClaim) => {
    const index = c.claims.findIndex((cl) => cl.id === claim.id);
    if (!caseEvent(c.id, { type: 'claim_removed', claimId: claim.id })) setRemoved({ claim, index });
  };

  const undoRemove = () => {
    if (!removed) return;
    caseEvent(c.id, { type: 'claim_restored', claim: removed.claim, index: removed.index });
    setFocus(removed.claim.id);
    setRemoved(undefined);
  };

  const selectType = (type: ClaimType) => {
    setAddType(type);
    setAdded(undefined);
  };

  return (
    <Screen footer={editable ? <Button label={t('claims.confirm')} onPress={confirm} /> : undefined}>
      <Stack.Screen options={{ title: t('claims.title') }} />
      <Txt>{t('claims.body')}</Txt>
      <View style={styles.badges}>
        <Badge tone="info" label={t(`claims.extractor.${c.listing.extractor}`)} />
        {c.listing.sellerType !== 'private' ? <Badge tone="neutral" label={t(`seller.${c.listing.sellerType}`)} /> : null}
      </View>
      {c.listing.sellerType === 'private' ? (
        <Card tone="info">
          <IconLine icon="info" variant="bodyStrong">{t('seller.privateTitle')}</IconLine>
          <Txt variant="small">{t('seller.privateBody')}</Txt>
        </Card>
      ) : null}
      {c.listing.injectionSuspected ? (
        <Card tone="danger">
          <IconLine icon="warning" variant="bodyStrong" color={p.danger}>
            {t('claims.injection')}
          </IconLine>
        </Card>
      ) : null}

      <Section title={t('claims.adText')}>
        <QuoteHighlight text={c.listing.rawTextLocal} claims={c.claims} focusId={focus} />
      </Section>

      <Section title={t('claims.title')}>
        {removed ? (
          <Card tone="neutral">
            <View style={styles.row}>
              <Txt style={{ flex: 1 }} accessibilityLiveRegion="polite">
                {t('claims.removed', { title: claimTitle(removed.claim, prefs.locale) })}
              </Txt>
              <Button kind="secondary" label={t('claims.undo')} onPress={undoRemove} />
            </View>
          </Card>
        ) : null}
        {c.claims.length === 0 ? <Txt>{t('claims.none')}</Txt> : null}
        {c.claims.map((cl) => (
          <ClaimRow
            key={cl.id}
            claim={cl}
            t={t}
            locale={prefs.locale}
            focused={focus === cl.id}
            onFocus={() => setFocus(cl.id)}
            onRemove={editable ? () => remove(cl) : undefined}
            onEdit={editable ? (value, quote) => caseEvent(c.id, { type: 'claim_edited', claimId: cl.id, value, quote }) : undefined}
          />
        ))}
      </Section>

      {editable ? (
        <Section title={t('claims.add')}>
          <Choice
            label={t('claims.add')}
            value={addType}
            onChange={selectType}
            options={ADDABLE.map((ct) => {
              const taken = present.has(ct) && !REPEATABLE.has(ct);
              return { value: ct, label: taken ? `${CLAIM_TITLES[ct][prefs.locale]} · ${t('claims.addedTag')}` : CLAIM_TITLES[ct][prefs.locale], disabled: taken };
            })}
          />
          {addType ? (
            <>
              {needsTitle ? (
                <TextInput
                  key="title"
                  autoFocus
                  value={addTitle}
                  onChangeText={setAddTitle}
                  placeholder={t('claims.otherTitle')}
                  placeholderTextColor={p.textSecondary}
                  accessibilityLabel={t('claims.otherTitle')}
                  maxLength={60}
                  style={[styles.input, { color: p.text, borderColor: p.borderStrong, backgroundColor: p.surface }]}
                />
              ) : null}
              {/* autoFocus scrolls the field into view above the footer (keyboard insets on native, the browser on web). */}
              <TextInput
                key={`note-${addType}`}
                autoFocus={!needsTitle}
                value={addNote}
                onChangeText={setAddNote}
                placeholder={t('claims.addNote')}
                placeholderTextColor={p.textSecondary}
                accessibilityLabel={t('claims.addNote')}
                maxLength={280}
                style={[styles.input, { color: p.text, borderColor: p.borderStrong, backgroundColor: p.surface }]}
              />
              <Button kind="secondary" label={t('claims.addButton')} onPress={add} disabled={!canAdd} />
            </>
          ) : null}
          {added ? (
            <Txt variant="bodyStrong" color={p.success} accessibilityLiveRegion="polite">
              ✓ {added}
            </Txt>
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}

/** Editable value as text, for the value kinds a person can sensibly retype. */
function valueText(v: ClaimValue): string | undefined {
  if (v.kind === 'km') return String(v.km);
  if (v.kind === 'count') return String(v.n);
  if (v.kind === 'text') return v.text;
  return undefined;
}

function parseValue(v: ClaimValue, text: string): ClaimValue | undefined {
  const n = Number(text.replace(/\s/g, ''));
  if (v.kind === 'km') return Number.isFinite(n) && n >= 0 ? { kind: 'km', km: Math.round(n) } : undefined;
  if (v.kind === 'count') return Number.isInteger(n) && n >= 0 ? { kind: 'count', n } : undefined;
  if (v.kind === 'text') return text.trim() ? { kind: 'text', text: text.trim().slice(0, 140) } : undefined;
  return undefined;
}

function ClaimRow({
  claim,
  t,
  locale,
  focused,
  onFocus,
  onRemove,
  onEdit,
}: {
  claim: SellerClaim;
  t: Translate;
  locale: 'en' | 'fi';
  focused: boolean;
  onFocus: () => void;
  onRemove?: () => void;
  onEdit?: (value: ClaimValue | undefined, quote: string) => string | undefined;
}) {
  const p = usePalette();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [quote, setQuote] = useState('');
  const editableValue = valueText(claim.value);
  const parsed = editableValue !== undefined ? parseValue(claim.value, value) : undefined;
  const valid = !!quote.trim() && (editableValue === undefined || !!parsed);

  const startEdit = () => {
    setValue(editableValue ?? '');
    setQuote(claim.quote);
    setEditing(true);
  };
  const save = () => {
    if (!onEdit || !valid) return;
    if (!onEdit(parsed, quote)) setEditing(false);
  };

  const isOther = claim.type === 'other';
  return (
    <Card tone={focused ? 'info' : undefined}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={onFocus} style={styles.claim}>
          <Txt variant="bodyStrong">{isOther ? claimTitle(claim, locale) : `${CLAIM_TITLES[claim.type][locale]}: ${describeValue(claim.value, t)}`}</Txt>
        </Pressable>
        <StatusPill status="unchecked" t={t} />
      </View>
      {editing ? (
        <>
          {editableValue !== undefined && !isOther ? (
            <TextInput
              value={value}
              onChangeText={setValue}
              accessibilityLabel={t('claims.editValue')}
              placeholder={t('claims.editValue')}
              placeholderTextColor={p.textSecondary}
              keyboardType={claim.value.kind === 'text' ? 'default' : 'number-pad'}
              style={[styles.input, { color: p.text, borderColor: p.borderStrong, backgroundColor: p.surface }]}
            />
          ) : null}
          <TextInput
            value={quote}
            onChangeText={setQuote}
            accessibilityLabel={t('claims.editQuote')}
            placeholder={t('claims.editQuote')}
            placeholderTextColor={p.textSecondary}
            maxLength={280}
            style={[styles.input, { color: p.text, borderColor: p.borderStrong, backgroundColor: p.surface }]}
          />
          <View style={styles.actions}>
            <Button kind="secondary" label={t('claims.save')} onPress={save} disabled={!valid} />
            <Button kind="ghost" label={t('common.cancel')} onPress={() => setEditing(false)} />
          </View>
        </>
      ) : (
        <>
          <Txt variant="small">“{claim.quote}”</Txt>
          <QuoteTranslation text={quoteTranslationFor(claim, locale)} t={t} />
          {onRemove || onEdit ? (
            <View style={styles.actions}>
              {onEdit ? <Button kind="ghost" label={t('claims.edit')} onPress={startEdit} /> : null}
              {onRemove ? <Button kind="ghost" label={t('claims.remove')} onPress={onRemove} /> : null}
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  claim: { flex: 1, minHeight: 48, justifyContent: 'center' },
  input: { fontFamily: Fonts.regular, minHeight: 48, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 15 },
});
