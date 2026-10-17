import type { SellerClaim, VerificationStatus } from '@firstcar/core';
import { Text, View } from 'react-native';

import { STATUS_ICON, STATUS_TONE } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { Badge } from '@/ui/primitives';

/** Status = colour + icon + word, never colour alone (§10). */
export function StatusPill({ status, t }: { status: VerificationStatus; t: Translate }) {
  return <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} label={t(`status.${status}`)} />;
}

export function DemoBadge({ t }: { t: Translate }) {
  return <Badge tone="info" icon="ⓘ" label={t('common.demoData')} />;
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
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, padding: 16 }}>
      <Text style={{ color: p.text, fontSize: 15, lineHeight: 23 }}>
        {parts.map((part, i) =>
          part.claimId ? (
            <Text key={i} style={{ backgroundColor: p.highlight, fontWeight: part.claimId === focusId ? '800' : '600', textDecorationLine: part.claimId === focusId ? 'underline' : 'none' }}>
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
