/**
 * Rule/regex claim extractor (§5 fallback). Runs on the device first for an instant preview,
 * and alone when the LLM is off. Every claim's quote is a verbatim span of the input text.
 */
import { parseGroupedNumber, toKm } from './text';
import type { CarSpec, ClaimType, ClaimValue, Confidence, Fuel, SellerClaim, SellerType } from './types';

export interface Extraction {
  claims: SellerClaim[];
  car: Partial<CarSpec>;
  sellerType: SellerType;
  injectionSuspected: boolean;
}

interface Hit {
  type: ClaimType;
  value: ClaimValue;
  index: number;
  quote: string;
  confidence: Confidence;
}

// Leading boundary: "2015 180 000 km" must not parse as 15 180 000.
const NUM = String.raw`(?<![\d.])(?:\d{1,3}(?:[ .\u00A0\u202F]\d{3})+|\d+)`;
const KM_UNIT = String.raw`tkm\.?|t\.km|km|mil`;

const BELT_WORDS = /(jakohihna|hammashihna|kamrem|tidsreim|timing belt|cambelt)/i;
const ODOMETER_WORDS = /(ajettu|ajoa|mittari|km-lukema|mileage|odometer|miltal|mätarställning|körd|driven)/i;
const SKIP_KM_WORDS = /(katsast|besikt|inspect|huollettu|service|kytkin|clutch|koppling)/i;

const MAKES = [
  'volkswagen', 'vw', 'skoda', 'škoda', 'toyota', 'volvo', 'ford', 'opel', 'audi', 'bmw', 'mercedes-benz', 'mercedes',
  'nissan', 'kia', 'hyundai', 'peugeot', 'renault', 'mazda', 'honda', 'seat', 'citroen', 'citroën', 'tesla', 'suzuki',
];

const SIMPLE_PATTERNS: Array<{ type: ClaimType; re: RegExp; value: (m: RegExpExecArray) => ClaimValue | undefined; confidence: Confidence }> = [
  {
    type: 'service_history',
    re: /(täydellinen huoltohistoria|huoltokirja(?: mukana| löytyy)?|huoltohistoria|servicebok|full service history|service book|digitaalinen huoltohistoria)/i,
    value: (m) => ({ kind: 'enum', value: /täydellinen|full/i.test(m[0]) ? 'full' : 'mentioned' }),
    confidence: 'medium',
  },
  {
    type: 'no_rust',
    re: /(ei ruostetta|ruosteeton|rostfri|ingen rost|no rust|rust[- ]free)/i,
    value: () => ({ kind: 'bool', value: true }),
    confidence: 'high',
  },
  {
    type: 'no_accidents',
    re: /(kolariton|ei kolaroitu|ei kolareita|krockfri|ej krockad|no accidents|accident[- ]free|never crashed)/i,
    value: () => ({ kind: 'bool', value: true }),
    confidence: 'high',
  },
  {
    type: 'tyres_included',
    re: /(talvirenkaat|nastarenkaat|kitkarenkaat|vinterdäck|winter tyres|winter tires)(?:\s+(?:mukana|vanteilla|included|on rims))?/i,
    value: () => ({ kind: 'bool', value: true }),
    confidence: 'medium',
  },
  {
    type: 'imported',
    re: /(tuontiauto|maahantuotu|tuotu saksasta|imported|importerad)/i,
    value: () => ({ kind: 'bool', value: true }),
    confidence: 'high',
  },
  {
    type: 'seller_situation',
    re: /(olen ulkomailla|asun ulkomailla|olen tällä hetkellä ulkomailla|i am abroad|i'm abroad|currently abroad|kuriiri|courier|toimitamme kotiin|ennakkomaksu|varausmaksu|deposit before|pay a deposit|western union)/i,
    value: (m) => ({ kind: 'text', text: m[0].slice(0, 140) }),
    confidence: 'high',
  },
];

const INJECTION = [
  /ignore (all )?(previous|prior) (instructions|rules)/i,
  /\bas an ai\b/i,
  /\bai (assistant|model|tool)s?\b/i,
  /mark (this|the) (car|vehicle|ad) as (fully )?verified/i,
  /system prompt/i,
  /\bdisregard\b.*\binstructions\b/i,
  /verified by traficom/i,
];

const ZERO_WIDTH_RUN = /[\u200B-\u200D\u2060\uFEFF]{2,}/;
const ZERO_WIDTH_ANY = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

function pushHit(hits: Hit[], hit: Hit) {
  if (!hits.some((h) => h.type === hit.type && h.index === hit.index)) hits.push(hit);
}

function extractKmClaims(text: string, hits: Hit[]) {
  const re = new RegExp(String.raw`(${NUM})\s*(${KM_UNIT})\b`, 'gi');
  let odometerTaken = false;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const value = parseGroupedNumber(m[1] ?? '');
    if (value === undefined) continue;
    const km = toKm(value, m[2] ?? 'km');
    const windowStart = Math.max(0, m.index - 45);
    const before = text.slice(windowStart, m.index);
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const sameLineBefore = text.slice(Math.max(lineStart, windowStart), m.index);

    if (BELT_WORDS.test(sameLineBefore)) {
      const beltStart = sameLineBefore.search(BELT_WORDS) + Math.max(lineStart, windowStart);
      const end = m.index + m[0].length;
      pushHit(hits, { type: 'timing_belt', value: { kind: 'event', atKm: km }, index: beltStart, quote: text.slice(beltStart, end), confidence: 'high' });
      continue;
    }
    if (SKIP_KM_WORDS.test(sameLineBefore)) continue;
    if (odometerTaken || km < 1000 || km > 2_000_000) continue;

    const hasKeyword = ODOMETER_WORDS.test(before);
    const kwIndex = hasKeyword ? before.search(ODOMETER_WORDS) + windowStart : m.index;
    const start = hasKeyword && kwIndex >= lineStart ? kwIndex : m.index;
    pushHit(hits, {
      type: 'odometer',
      value: { kind: 'km', km },
      index: start,
      quote: text.slice(start, m.index + m[0].length),
      confidence: hasKeyword ? 'high' : 'medium',
    });
    odometerTaken = true;
  }
}

function extractBeltWithoutKm(text: string, hits: Hit[]) {
  if (hits.some((h) => h.type === 'timing_belt')) return;
  const m = /(jakohihna|hammashihna|kamrem|tidsreim|timing belt|cambelt)\s+(vaihdettu|uusittu|bytt|replaced|changed|done)/i.exec(text);
  if (m) pushHit(hits, { type: 'timing_belt', value: { kind: 'event' }, index: m.index, quote: m[0], confidence: 'medium' });
}

function extractInspection(text: string, hits: Hit[]) {
  const m = /(katsastettu|katsastus voimassa|besiktigad|inspected|katsastus)\s*:?\s*(\d{1,2})[/.](\d{2,4})/i.exec(text);
  if (!m) return;
  const month = (m[2] ?? '').padStart(2, '0');
  const yearRaw = m[3] ?? '';
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  pushHit(hits, { type: 'inspection_valid', value: { kind: 'date', date: `${year}-${month}` }, index: m.index, quote: m[0], confidence: 'high' });
}

function extractOwners(text: string, hits: Hit[]) {
  const first = /(1\.\s*omistajalta|1\.\s*omistaja|ensimmäinen omistaja|ensimmäiseltä omistajalta|first owner|one owner|1st owner|en ägare|1 ägare)/i.exec(text);
  if (first) {
    pushHit(hits, { type: 'owners_count', value: { kind: 'count', n: 1 }, index: first.index, quote: first[0], confidence: 'high' });
    return;
  }
  const many = /(\d)\s*(omistajaa|owners|ägare)/i.exec(text);
  if (many) {
    pushHit(hits, { type: 'owners_count', value: { kind: 'count', n: Number(many[1]) }, index: many.index, quote: many[0], confidence: 'high' });
  }
}

function extractKeys(text: string, hits: Hit[]) {
  const words: Record<string, number> = { kaksi: 2, two: 2, två: 2, yksi: 1, one: 1, en: 1, kolme: 3, three: 3, tre: 3 };
  const m = /(\d|kaksi|two|två|yksi|kolme|three|tre)\s*(avainta|avaimet|avain|keys|key|nycklar)/i.exec(text);
  if (!m) return;
  const raw = (m[1] ?? '').toLowerCase();
  const n = /^\d$/.test(raw) ? Number(raw) : words[raw];
  if (n) pushHit(hits, { type: 'keys_count', value: { kind: 'count', n }, index: m.index, quote: m[0], confidence: 'high' });
}

function extractClutch(text: string, hits: Hit[]) {
  const m = /(kytkin|koppling|clutch)[^.\n]{0,30}?(uusittu|vaihdettu|bytt|replaced|new)/i.exec(text);
  if (m) pushHit(hits, { type: 'clutch', value: { kind: 'event' }, index: m.index, quote: m[0], confidence: 'medium' });
}

function extractCar(text: string): Partial<CarSpec> {
  const car: Partial<CarSpec> = { fieldProvenance: {} };
  const prov = { kind: 'ad' as const };
  const makeRe = new RegExp(String.raw`\b(${MAKES.map((m) => m.replace('-', '\\-')).join('|')})\b\s+([A-Za-z0-9-]+)`, 'i');
  const mm = makeRe.exec(text);
  if (mm) {
    const make = (mm[1] ?? '').toLowerCase() === 'vw' ? 'Volkswagen' : capitalise(mm[1] ?? '');
    car.make = make;
    car.model = capitalise(mm[2] ?? '');
    car.fieldProvenance = { ...car.fieldProvenance, make: prov, model: prov };
  }
  const year = /\b(vm\.?|vuosimalli|model year|årsmodell|year)\s*:?\s*(19[5-9]\d|20[0-3]\d)\b/i.exec(text) ?? /\b(19[89]\d|20[0-3]\d)\b(?!\s*(?:€|eur\b|euroa))/i.exec(text);
  if (year) {
    car.modelYear = Number(year[2] ?? year[1]);
    car.fieldProvenance = { ...car.fieldProvenance, modelYear: prov };
  }
  const fuel = detectFuel(text);
  if (fuel) {
    car.fuel = fuel;
    car.fieldProvenance = { ...car.fieldProvenance, fuel: prov };
  }
  const price = new RegExp(String.raw`(?:hinta|price|pris)?\s*:?\s*(${NUM})\s*(€|eur\b|euroa)`, 'i').exec(text);
  if (price) {
    const eurValue = parseGroupedNumber(price[1] ?? '');
    if (eurValue !== undefined && eurValue >= 300) {
      car.price = { minor: eurValue * 100, currency: 'EUR' };
      car.fieldProvenance = { ...car.fieldProvenance, price: prov };
    }
  }
  return car;
}

function detectFuel(text: string): Fuel | undefined {
  if (/\b(tdi|diesel|dci|crdi|hdi|cdi)\b/i.test(text)) return 'diesel';
  if (/\b(plug-in|phev|lataushybridi)\b/i.test(text)) return 'phev';
  if (/\b(hybrid|hybridi)\b/i.test(text)) return 'hybrid';
  if (/\b(tsi|tfsi|bensiini|bensin|petrol|gasoline|vvt-i)\b/i.test(text)) return 'petrol';
  // Bare "electric" also appears in "electric windows": require car/vehicle phrasing or an EV marker.
  if (/\b(sähköauto|elbil|(?:fully |all[- ])?electric (?:car|vehicle)|ev|bev)\b/i.test(text)) return 'ev';
  return undefined;
}

const capitalise = (s: string) => (s.length <= 3 && s === s.toUpperCase() ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());

export function detectInjection(text: string): boolean {
  // A single hidden char inside a phrase must not defeat the patterns, so match on stripped text.
  const stripped = text.replace(ZERO_WIDTH_ANY, '');
  return ZERO_WIDTH_RUN.test(text) || INJECTION.some((re) => re.test(stripped));
}

export function detectSellerType(text: string): SellerType {
  if (/\b(oy|ab|autoliike|autokauppa|bilfirma|dealer|rahoitus alkaen|vaihto ok|vaihtoauto)\b/i.test(text)) return 'dealer';
  if (/\b(yksityinen|yksityiseltä|privat|private seller|myyn autoni|selling my)\b/i.test(text)) return 'private';
  return 'unknown';
}

/** Extracts seller claims from (redacted) ad text. Claim ids are c1, c2, … in text order. */
export function extractWithRules(text: string): Extraction {
  const hits: Hit[] = [];
  extractKmClaims(text, hits);
  extractBeltWithoutKm(text, hits);
  extractInspection(text, hits);
  extractOwners(text, hits);
  extractKeys(text, hits);
  extractClutch(text, hits);
  for (const p of SIMPLE_PATTERNS) {
    const m = p.re.exec(text);
    const value = m ? p.value(m) : undefined;
    if (m && value) pushHit(hits, { type: p.type, value, index: m.index, quote: m[0], confidence: p.confidence });
  }

  const sorted = [...hits].sort((a, b) => a.index - b.index);
  const claims: SellerClaim[] = sorted.map((h, i) => ({
    id: `c${i + 1}`,
    type: h.type,
    value: h.value,
    quote: h.quote.trim(),
    quoteStart: h.index,
    extractor: 'rules',
    confidence: h.confidence,
  }));

  const car = extractCar(text);
  const odometer = claims.find((c) => c.type === 'odometer');
  if (odometer?.value.kind === 'km') {
    car.odometerKm = odometer.value.km;
    car.fieldProvenance = { ...car.fieldProvenance, odometerKm: { kind: 'ad' } };
  }
  if (claims.some((c) => c.type === 'tyres_included')) {
    car.hasWinterTyres = true;
  }

  return { claims, car, sellerType: detectSellerType(text), injectionSuspected: detectInjection(text) };
}
