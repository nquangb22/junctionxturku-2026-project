/** Text normalisation, distance parsing and quote span matching. Pure, zero deps. */

const ZERO_WIDTH = /[​-‍⁠﻿]/g;

export const MAX_AD_CHARS = 8000;

/** Slices to `max` UTF-16 units without splitting a surrogate pair. */
function truncateSafely(s: string, max: number): string {
  if (s.length <= max) return s;
  const last = s.charCodeAt(max - 1);
  return s.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/** Cleans pasted ad text: NFKC (matches redaction), no zero-width chars, unified line breaks, capped length. */
export function cleanAdText(raw: string): string {
  const cleaned = raw.normalize('NFKC').replace(ZERO_WIDTH, '').replace(/\r\n?/g, '\n');
  return truncateSafely(cleaned, MAX_AD_CHARS);
}

/** Canonical form used for cache keys and grounding comparisons. */
export function normaliseForMatch(text: string): string {
  return text
    .normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .toLowerCase()
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses "180 000", "180.000", "180000" into a number; returns undefined for junk. */
export function parseGroupedNumber(text: string): number | undefined {
  const digits = text.replace(/[\s.  ]/g, '');
  if (!/^\d+$/.test(digits)) return undefined;
  return Number(digits);
}

export const MIL_IN_KM = 10; // Swedish/Norwegian "mil"

/**
 * Converts a number + unit as written in an ad into km.
 * "tkm" / "t.km" = thousands of km; "mil" = 10 km.
 */
export function toKm(value: number, unit: string): number {
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u === 'tkm' || u === 't.km' || u === 'tkm.') return value * 1000;
  if (u === 'mil') return value * MIL_IN_KM;
  return value;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds `quote` inside `text`, ignoring case and whitespace differences.
 * Redaction tokens like [PHONE] in the quote match any run of characters,
 * so a quote taken from redacted text can be located in the raw ad.
 */
export function findSpan(text: string, quote: string): { start: number; end: number } | undefined {
  const parts = quote.trim().split(/(\[[A-Z]+\])/);
  const pattern = parts
    .filter((p) => p.length > 0)
    .map((p) => (/^\[[A-Z]+\]$/.test(p) ? '[\\s\\S]+?' : escapeRegExp(p).replace(/\s+/g, '\\s+')))
    .join('');
  if (!pattern) return undefined;
  const match = new RegExp(pattern, 'i').exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : undefined;
}

/** True when `quote` appears verbatim (modulo case/whitespace) in `text`. Used for LLM grounding. */
export function isGrounded(text: string, quote: string): boolean {
  const q = normaliseForMatch(quote);
  return q.length >= 3 && normaliseForMatch(text).includes(q);
}
