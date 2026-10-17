/**
 * On-device redaction before any ad text leaves the phone (§1.1 A → B).
 * Removes phone numbers, emails, plates, VINs and probable names; keeps plate/VIN locally.
 */

export interface RedactionResult {
  redacted: string;
  plate?: string;
  vin?: string;
  counts: Record<'PHONE' | 'EMAIL' | 'PLATE' | 'VIN' | 'NAME', number>;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// +358 40 123 4567, 040-1234567, 0401234567 (7+ digits after the prefix)
const PHONE = /(?:\+\d{2,3}[\s-]?|\b0)\d{1,3}(?:[\s-]?\d){5,10}\b/g;
// FI plates: ABC-123, AB-12 (ÅÄÖ allowed). Space-separated SE plates are not matched: they
// collide with engine codes such as "TDI 105".
const PLATE = /\b[A-ZÅÄÖ]{2,3}-\d{1,3}\b/g;
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
// Name heuristics: a capitalised word after a contact keyword ("soita Mikko", "terveisin Anna").
// Case-sensitive on purpose: the name must start with a capital letter.
const NAME =
  /\b([Ss]oita|[Kk]ysy|[Tt]erveisin|[Mm]yyjä|[Rr]ing|[Hh]älsningar|[Cc]all|[Aa]sk for|[Rr]egards|[Cc]ontact)(:?,?\s+)([A-ZÅÄÖ][a-zåäöé]+(?:\s[A-ZÅÄÖ][a-zåäöé]+)?)/g;

export function redactAd(text: string): RedactionResult {
  const counts: RedactionResult['counts'] = { PHONE: 0, EMAIL: 0, PLATE: 0, VIN: 0, NAME: 0 };
  let plate: string | undefined;
  let vin: string | undefined;

  const replace = (input: string, re: RegExp, token: keyof RedactionResult['counts'], keep?: (m: string) => void) =>
    input.replace(re, (match) => {
      counts[token] += 1;
      keep?.(match);
      return `[${token}]`;
    });

  let out = replace(text, EMAIL, 'EMAIL');
  out = replace(out, VIN, 'VIN', (m) => (vin ??= m));
  out = replace(out, PLATE, 'PLATE', (m) => (plate ??= m.toUpperCase()));
  out = replace(out, PHONE, 'PHONE');
  out = out.replace(NAME, (_m, keyword: string, sep: string, name: string) => {
    // A word right after the keyword that is clearly not a name stays.
    if (/^(Heti|Now|Gärna|Lisää|More)$/i.test(name)) return `${keyword}${sep}${name}`;
    counts.NAME += 1;
    return `${keyword}${sep}[NAME]`;
  });

  return { redacted: out, plate, vin, counts };
}
