import type { SellerClaim, VerificationStatus } from '@firstcar/core';
import { Text, View } from 'react-native';

import { Fonts, Radius, STATUS_ICON, STATUS_TONE, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { Badge, Txt } from '@/ui/primitives';

/** Status = colour + icon + word, never colour alone (§10). */
export function StatusPill({ status, t }: { status: VerificationStatus; t: Translate }) {
  return <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} label={t(`status.${status}`)} />;
}

export function DemoBadge({ t }: { t: Translate }) {
  return <Badge tone="info" icon="info" label={t('common.demoData')} />;
}

/** The raw ad text with each claim's quote highlighted. Highlights come from device-only raw offsets. */
export function QuoteHighlight({ text, claims, focusId }: { text: string; claims: SellerClaim[]; focusId?: string }) {
  const p = usePalette();
  const spans = claims
    .filter((c): c is SellerClaim & { rawStart: number; rawEnd: number } => c.rawStart !== undefined && c.rawEnd !== undefined)
    .sort((a, b) => a.rawStart - b.rawStart);

  const parts: { text: string; claimId?: string }[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.rawStart < cursor) continue; // overlapping highlight: keep the first
    if (s.rawStart > cursor) parts.push({ text: text.slice(cursor, s.rawStart) });
    parts.push({ text: text.slice(s.rawStart, s.rawEnd), claimId: s.id });
    cursor = s.rawEnd;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });

  return (
    <View style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, padding: Spacing.lg }}>
      <Text style={{ color: p.text, fontFamily: Fonts.regular, fontSize: 15, lineHeight: 24 }}>
        {parts.map((part, i) =>
          part.claimId ? (
            <Text key={i} style={{ backgroundColor: p.highlight, fontFamily: part.claimId === focusId ? Fonts.bold : Fonts.semibold, textDecorationLine: part.claimId === focusId ? 'underline' : 'none' }}>
              {part.text}
            </Text>
          ) : (
            <Text key={i}>{part.text}</Text>
          ),
        )}
      </Text>
    </View>
  );
}

/** Second line under an ad quote when the ad is in the other language. The original stays first: it is the evidence. */
export function QuoteTranslation({ text, t }: { text: string | null; t: Translate }) {
  if (!text) return null;
  return (
    <Txt variant="small">
      <Txt variant="caption">{t('common.translation')}: </Txt>“{text}”
    </Txt>
  );
}
