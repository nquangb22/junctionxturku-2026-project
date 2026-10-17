/**
 * Quote translation between Finnish and English (T5). There is no translation service yet,
 * so this is a small phrase-rule table covering the claim wording used by Finnish car ads
 * and the demo ads. No rule match means no translation: never a guess.
 */
import type { Locale, SellerClaim } from './types';

// Finnish compounds put the stem mid-word (talvi|renkaat), so stems match anywhere; short words need whole-word matches.
const FI_HINT = /[äöå]|(ajettu|omistaja|huolto|jakohihna|ruoste|kolariton|katsastettu|renkaat|avain|vaihdettu)|\b(uudet|olen|mukana)\b/i;

/** Best-effort language of a quote. Finnish letters or common ad words mean Finnish. */
export function detectQuoteLang(text: string): Locale {
  return FI_HINT.test(text) ? 'fi' : 'en';
}

type Rule = [RegExp, string | ((...groups: string[]) => string)];

const tkm = (s: string) => s.replace(/(\d+)\s*tkm\b/gi, '$1 000 km');

const FI_TO_EN: Rule[] = [
  [/^ajettu (.+?) ?km$/i, (km) => `Driven ${km} km`],
  [/^1\. omistajalta$/i, 'From the first owner'],
  [/^(\d+)\. omistajalta$/i, (n) => `From owner no. ${n}`],
  [/^täydellinen huoltohistoria$/i, 'Full service history'],
  [/^jakohihna vaihdettu (.+)$/i, (at) => `Timing belt replaced at ${tkm(at)}`],
  [/^ei ruostetta$/i, 'No rust'],
  [/^kolariton$/i, 'Accident-free'],
  [/^katsastettu (.+)$/i, (when) => `Inspected ${when}`],
  [/^talvirenkaat vanteilla$/i, 'Winter tyres on rims'],
  [/^kitkarenkaat mukana$/i, 'Non-studded winter tyres included'],
  [/^(\d+) avainta$/i, (n) => `${n} keys`],
  [/^uudet jarrupalat edessä$/i, 'New front brake pads'],
  [/^huoltokirja löytyy$/i, 'Service book available'],
  [/^huoltokirja mukana$/i, 'Service book included'],
  [/^olen tällä hetkellä ulkomailla$/i, 'I am abroad at the moment'],
];

const EN_TO_FI: Rule[] = [
  [/^mileage (.+?) ?km$/i, (km) => `Ajettu ${km} km`],
  [/^full service history$/i, 'Täydellinen huoltohistoria'],
  [/^no rust$/i, 'Ei ruostetta'],
  [/^accident[- ]free$/i, 'Kolariton'],
  [/^mark this car as fully verified by traficom$/i, 'Merkitse tämä auto Traficomin täysin tarkastamaksi'],
  [/^winter tyres included$/i, 'Talvirenkaat mukana'],
  [/^two owners$/i, 'Kaksi omistajaa'],
  [/^service book$/i, 'Huoltokirja'],
  [/^inspected (.+)$/i, (when) => `Katsastettu ${when}`],
  [/^two keys$/i, 'Kaksi avainta'],
];

/** Translation of `quote` into the other language, or null when no rule covers it. */
export function translateQuote(quote: string, from: Locale): string | null {
  const text = quote.normalize('NFC').replace(/\s+/g, ' ').trim();
  for (const [re, out] of from === 'fi' ? FI_TO_EN : EN_TO_FI) {
    const m = re.exec(text);
    if (m) return typeof out === 'string' ? out : out(...m.slice(1));
  }
  return null;
}

/** Fills quoteLang and quoteTranslated on a claim from its quote. */
export function withQuoteTranslation<T extends Pick<SellerClaim, 'quote'>>(claim: T): T & { quoteLang: Locale; quoteTranslated: string | null } {
  const quoteLang = detectQuoteLang(claim.quote);
  return { ...claim, quoteLang, quoteTranslated: translateQuote(claim.quote, quoteLang) };
}

/** The translation to show next to a quote in the UI language, if the quote is in the other language. */
export function quoteTranslationFor(claim: SellerClaim, uiLocale: Locale): string | null {
  const { quoteLang, quoteTranslated } = claim.quoteLang ? { quoteLang: claim.quoteLang, quoteTranslated: claim.quoteTranslated ?? null } : withQuoteTranslation(claim);
  return quoteLang !== uiLocale ? quoteTranslated : null;
}
