import {
  claimForItem,
  formatEur,
  formatKm,
  hasBlockingFlag,
  itemTitle,
  mileageGap,
  questionFor,
  renderFinding,
  type Evidence,
  type EvidenceKind,
  type Finding,
  type PurchaseCase,
  type VerificationItem,
} from '@firstcar/core';
import * as Clipboard from 'expo-clipboard';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Radius, Spacing, type StatusTone } from '@/constants/theme';
import { useCaseId } from '@/hooks/use-case-id';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { Badge, Button, Card, Choice, Screen, Section, Txt } from '@/ui/primitives';
import { confirmAction } from '@/ui/dialog';
import { StatusPill } from '@/ui/status';

const USER_EVIDENCE: EvidenceKind[] = ['service_record', 'receipt', 'photo', 'test_drive_note', 'seller_message'];

const FINDING_TONE: Record<Finding['kind'], StatusTone> = { contradiction: 'danger', red_flag: 'danger', stale: 'warning', missing: 'warning', match: 'success' };

export default function ItemDetail() {
  const { itemId: rawItemId } = useLocalSearchParams<{ itemId: string | string[] }>();
  const itemId = Array.isArray(rawItemId) ? rawItemId[0] : rawItemId;
  const c = useCase(useCaseId());
  const { t, prefs } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const item = c?.items.find((i) => i.id === itemId);
  if (!c || !item) return <Redirect href="/" />;

  const claim = claimForItem(c, item);
  const question = questionFor(c, item, prefs.locale);
  const blocking = hasBlockingFlag(item);
  const run = (err: string | undefined) => setError(err ? t('common.error', { error: err }) : undefined);
  const gap = claim?.type === 'odometer' ? mileageGap(c, new Date()) : undefined;

  const accept = () => run(caseEvent(c.id, { type: 'risk_accepted', itemId: item.id }));
  // A critical risk is accepted only after the buyer has seen what was found.
  const confirmAccept = () =>
    item.criticality === 'critical'
      ? confirmAction({
          title: t('item.acceptCriticalTitle'),
          message: t('item.acceptCriticalBody', { findings: item.findings.map((f) => renderFinding(f, prefs.locale)).join('\n\n') || '—' }),
          confirmLabel: t('item.acceptConfirm'),
          cancelLabel: t('common.cancel'),
          onConfirm: accept,
        })
      : accept();

  const copy = async () => {
    if (!question) return;
    try {
      await Clipboard.setStringAsync(question.sellerText);
      setCopied(true);
    } catch (e) {
      setError(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: itemTitle(item, prefs.locale) }} />
      <View style={styles.badges}>
        <StatusPill status={item.status} t={t} />
        <Badge tone="neutral" label={t(`criticality.${item.criticality}`)} />
        {item.acceptedRisk ? <Badge tone="warning" label={t('ledger.acceptedRisk')} /> : null}
      </View>

      {claim ? (
        <Card>
          <Txt variant="caption">{t('item.adSays')}</Txt>
          <Txt variant="bodyStrong">“{claim.quote}”</Txt>
        </Card>
      ) : null}
      <Txt variant="small">{t('item.needs', { strength: t(`strength.${item.minStrength}`) })}</Txt>

      {item.findings.length ? (
        <Section title={t('item.findings')}>
          {item.findings.map((f, i) => (
            <Card key={`${f.code}-${i}`} tone={FINDING_TONE[f.kind]}>
              <Txt variant="bodyStrong">{renderFinding(f, prefs.locale)}</Txt>
            </Card>
          ))}
        </Section>
      ) : null}

      {gap ? (
        <Section title={t('mileage.title')}>
          <Card tone="warning">
            <Badge tone="neutral" label={t('common.estimate')} />
            <Txt>{t('mileage.value', { amount: formatEur(gap.valueImpact), adKm: formatKm(gap.adKm), diffKm: formatKm(gap.diffKm), perKm: gap.eurPerKm.toFixed(2) })}</Txt>
            {gap.maintenanceDue.map((m) => (
              <Txt key={m.kind}>{t('mileage.belt', { km: formatKm(m.dueAtKm), amount: formatEur(m.cost) })}</Txt>
            ))}
            <Txt variant="bodyStrong">{t('mileage.total', { amount: formatEur(gap.total) })}</Txt>
          </Card>
        </Section>
      ) : null}

      {error ? <Txt color={p.danger}>{error}</Txt> : null}
      <MandatoryControls c={c} item={item} onResult={run} />

      {question && item.status !== 'verified' ? (
        <Section title={t('item.question')}>
          <Card>
            <Txt>{question.buyerText}</Txt>
            {prefs.locale !== 'fi' ? <Txt variant="small">🇫🇮 {question.sellerText}</Txt> : null}
            <Button kind="secondary" label={copied ? t('common.copied') : t('item.copyQuestion')} onPress={copy} />
            <Button
              kind="ghost"
              label={item.questionAsked ? `✓ ${t('item.asked')}` : t('item.markAsked')}
              disabled={item.questionAsked}
              onPress={() => run(caseEvent(c.id, { type: 'question_asked', itemId: item.id }))}
            />
          </Card>
        </Section>
      ) : null}

      {item.origin.kind !== 'mandatory' ? <AddEvidence c={c} item={item} onResult={run} /> : null}

      {item.evidenceIds.length ? (
        <Section title={t('item.evidence')}>
          {c.evidence
            .filter((e) => item.evidenceIds.includes(e.id))
            .map((e) => (
              <EvidenceRow key={e.id} e={e} />
            ))}
        </Section>
      ) : null}

      {item.status !== 'verified' ? (
        blocking ? (
          <Card tone="danger">
            <Txt variant="bodyStrong" color={p.danger}>
              {t('item.cannotAccept')}
            </Txt>
          </Card>
        ) : item.acceptedRisk ? (
          <Button kind="ghost" label={t('item.unaccept')} onPress={() => run(caseEvent(c.id, { type: 'risk_unaccepted', itemId: item.id }))} />
        ) : (
          <Button kind="secondary" label={t('item.acceptRisk')} onPress={confirmAccept} />
        )
      ) : null}
    </Screen>
  );
}

function MandatoryControls({ c, item, onResult }: { c: PurchaseCase; item: VerificationItem; onResult: (err?: string) => void }) {
  const { t } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  const [name, setName] = useState('');
  if (item.origin.kind !== 'mandatory') return null;

  switch (item.origin.checkId) {
    case 'owner_matches_seller':
      if (!c.registry) return <Txt variant="small">{t('item.needsRegistry')}</Txt>;
      return (
        <Card>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('item.ownerName')}
            placeholderTextColor={p.textSecondary}
            accessibilityLabel={t('item.ownerName')}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={80}
            style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
          />
          <Button label={t('item.compare')} disabled={!name.trim()} onPress={() => onResult(caseEvent(c.id, { type: 'owner_compared', sellerNameFromId: name }))} />
          <Txt variant="caption">🔒 {t('registry.ownerLocal')}</Txt>
        </Card>
      );
    case 'vin_matches':
      return (
        <Card>
          {c.registry?.vin ? <Txt variant="small">Traficom VIN: {c.registry.vin}</Txt> : null}
          <Button label={t('item.vinMatches')} onPress={() => onResult(caseEvent(c.id, { type: 'vin_confirmed', matches: true }))} />
          <Button kind="danger" label={t('item.vinDiffers')} onPress={() => onResult(caseEvent(c.id, { type: 'vin_confirmed', matches: false }))} />
        </Card>
      );
    case 'safe_payment':
      return (
        <Card>
          <Button label={t('item.paymentSafe')} onPress={() => onResult(caseEvent(c.id, { type: 'payment_confirmed', safe: true }))} />
          <Button kind="danger" label={t('item.paymentUnsafe')} onPress={() => onResult(caseEvent(c.id, { type: 'payment_confirmed', safe: false }))} />
        </Card>
      );
    default:
      return c.registry ? null : <Txt variant="small">{t('item.needsRegistry')}</Txt>;
  }
}

function AddEvidence({ c, item, onResult }: { c: PurchaseCase; item: VerificationItem; onResult: (err?: string) => void }) {
  const { t } = useSession();
  const { caseEvent } = useStore();
  const p = usePalette();
  const [kind, setKind] = useState<EvidenceKind | undefined>();
  const [outcome, setOutcome] = useState<'supports' | 'contradicts'>('supports');
  const [note, setNote] = useState('');

  const add = () => {
    if (!kind) return;
    const err = caseEvent(c.id, { type: 'evidence_added', kind, itemIds: [item.id], outcome, note: note.trim() || undefined });
    onResult(err);
    if (err) return;
    setKind(undefined);
    setOutcome('supports');
    setNote('');
  };

  return (
    <Section title={t('item.addEvidence')}>
      <Choice label={t('item.addEvidence')} value={kind} onChange={setKind} options={USER_EVIDENCE.map((k) => ({ value: k, label: t(`evidence.${k}`) }))} />
      {kind ? (
        <Card>
          {kind === 'seller_message' ? <Txt variant="small">ⓘ {t('item.sellerNeverVerifies')}</Txt> : null}
          <Choice
            label={t('item.evidence')}
            value={outcome}
            onChange={setOutcome}
            options={[
              { value: 'supports', label: t('item.supports') },
              { value: 'contradicts', label: t('item.contradicts') },
            ]}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="…"
            placeholderTextColor={p.textSecondary}
            accessibilityLabel={t('item.evidence')}
            style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
          />
          <Button label={t('item.addEvidence')} onPress={add} />
        </Card>
      ) : null}
    </Section>
  );
}

function EvidenceRow({ e }: { e: Evidence }) {
  const { t } = useSession();
  return (
    <Card tone={e.outcome === 'contradicts' ? 'danger' : e.outcome === 'supports' && e.strength !== 'seller_statement' ? 'success' : undefined}>
      <Txt variant="bodyStrong">
        {t(`evidence.${e.kind}`)} · {t(e.outcome === 'contradicts' ? 'item.contradicts' : 'item.supports')}
      </Txt>
      <Txt variant="caption">
        {t(`strength.${e.strength}`)} · {e.capturedAt.slice(0, 10)}
        {e.note ? ` · ${e.note}` : ''}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 15 },
});
