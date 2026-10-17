/**
 * Deterministic generators (§4.3): seller questions, inspection plan, contract clauses.
 * Template-based, no LLM. Seller-facing text is Finnish for FI cases.
 */
import {
  ASSURANCE_TEXT,
  CLAIM_TITLES,
  CLAUSE_TEXTS,
  DISCLOSED_DEFECTS_TEXT,
  DISPUTED_ODOMETER_TEXT,
  DISPUTED_TEXT,
  QUESTION_TEMPLATES,
  findModelNote,
  renderTemplate,
} from './content';
import { claimForItem, isStale, itemTitle, monthYear } from './ledger';
import { formatEur, formatKm } from './money';
import type { ChecklistItem, ContractClause, ContractField, InspectionPlan, Locale, PurchaseCase, SellerClaim, VerificationItem } from './types';

export interface SellerQuestion {
  itemId: string;
  buyerText: string;
  sellerText: string;
}

const SELLER_LOCALE: Locale = 'fi';

function questionKey(c: PurchaseCase, item: VerificationItem): keyof typeof QUESTION_TEMPLATES | undefined {
  if (item.findings.some((f) => f.code === 'odometer_rollback')) return 'odometer_rollback';
  switch (item.origin.kind) {
    case 'claim':
      return item.origin.claimType as keyof typeof QUESTION_TEMPLATES;
    case 'mandatory':
      return item.origin.checkId as keyof typeof QUESTION_TEMPLATES;
    case 'scenario':
      return item.origin.scenarioId as keyof typeof QUESTION_TEMPLATES;
  }
}

/** The question to send the seller for an item, in the buyer's and the seller's language. */
export function questionFor(c: PurchaseCase, item: VerificationItem, buyerLocale: Locale): SellerQuestion | undefined {
  const key = questionKey(c, item);
  const template = key ? QUESTION_TEMPLATES[key] : undefined;
  if (!template) return undefined;
  const params = item.findings.find((f) => f.code === 'odometer_rollback')?.params ?? {};
  return {
    itemId: item.id,
    buyerText: renderTemplate(template[buyerLocale], params),
    sellerText: renderTemplate(template[SELLER_LOCALE], params),
  };
}

/** Questions for every item that is not yet settled. */
export function openQuestions(c: PurchaseCase, buyerLocale: Locale): SellerQuestion[] {
  return c.items
    .filter((i) => i.status !== 'verified')
    .map((i) => questionFor(c, i, buyerLocale))
    .filter((q): q is SellerQuestion => q !== undefined);
}

/* ---------- inspection plan ---------- */

const PRE_PURCHASE_AGE = 8;
const PRE_PURCHASE_KM = 150_000;

const TEST_DRIVE: Record<Locale, Array<{ id: string; label: string; why: string }>> = {
  en: [
    { id: 'cold_start', label: 'Start the engine cold', why: 'Problems hide once the engine is warm. Ask the seller not to warm it up.' },
    { id: 'warning_lights', label: 'Warning lights go out after start', why: 'A light that stays on can mean an expensive fault.' },
    { id: 'clutch_bite', label: 'Clutch bites low and does not slip', why: 'A slipping clutch is a repair of several hundred euros.' },
    { id: 'brakes', label: 'Brakes pull straight, no noise', why: 'Uneven braking can mean worn discs or callipers.' },
    { id: 'vin_plate', label: 'VIN on the car matches the papers', why: 'A mismatch is a stop sign: the car may be stolen or rebuilt.' },
    { id: 'tyres', label: 'Tyre tread and age (winter tyres too)', why: 'Missing or worn tyres add a one-off cost.' },
    { id: 'rust_check', label: 'Look under sills and wheel arches', why: 'Rust is the most common hidden cost on older cars.' },
  ],
  fi: [
    { id: 'cold_start', label: 'Käynnistä moottori kylmänä', why: 'Viat piiloutuvat, kun moottori on lämmin. Pyydä myyjää olemaan lämmittämättä autoa.' },
    { id: 'warning_lights', label: 'Varoitusvalot sammuvat käynnistyksen jälkeen', why: 'Palamaan jäävä valo voi tarkoittaa kallista vikaa.' },
    { id: 'clutch_bite', label: 'Kytkin tarttuu alhaalta eikä luista', why: 'Luistava kytkin on usean sadan euron korjaus.' },
    { id: 'brakes', label: 'Jarrut vetävät suoraan, ei ääniä', why: 'Epätasainen jarrutus voi tarkoittaa kuluneita levyjä.' },
    { id: 'vin_plate', label: 'Valmistenumero täsmää papereihin', why: 'Jos numero ei täsmää, älä osta: auto voi olla varastettu.' },
    { id: 'tyres', label: 'Renkaiden kulutuspinta ja ikä (myös talvirenkaat)', why: 'Puuttuvat tai kuluneet renkaat ovat lisäkulu.' },
    { id: 'rust_check', label: 'Katso kynnysten ja pyörän kaarien alle', why: 'Ruoste on vanhemman auton yleisin piilokulu.' },
  ],
};

const REASONS: Record<string, Record<Locale, string>> = {
  needs_inspection: { en: 'Some claims can only be confirmed by a professional', fi: 'Osan väitteistä voi vahvistaa vain ammattilainen' },
  age: { en: 'The car is over 8 years old', fi: 'Auto on yli 8 vuotta vanha' },
  km: { en: 'Over 150 000 km driven', fi: 'Ajettu yli 150 000 km' },
  contradiction: { en: 'The ad contradicts the registry', fi: 'Ilmoitus on ristiriidassa rekisterin kanssa' },
  belt: { en: 'Timing belt is due', fi: 'Jakohihna on vaihdettava' },
};

export function inspectionPlan(c: PurchaseCase, locale: Locale, now: Date): InspectionPlan {
  const linked = (id: string) =>
    id === 'vin_plate' ? ['mandatory:vin_matches'] : id === 'rust_check' ? c.items.filter((i) => i.origin.kind === 'claim' && i.origin.claimType === 'no_rust').map((i) => i.id) : [];
  const testDrive: ChecklistItem[] = TEST_DRIVE[locale].map((t) => ({ ...t, linkedItemIds: linked(t.id) }));

  const reasons: string[] = [];
  const critical = c.items.filter((i) => i.criticality === 'critical');
  if (critical.some((i) => i.status === 'needs_inspection')) reasons.push(REASONS.needs_inspection![locale]);
  const year = c.listing.car.modelYear;
  if (year && now.getUTCFullYear() - year > PRE_PURCHASE_AGE) reasons.push(REASONS.age![locale]);
  const km = Math.max(c.listing.car.odometerKm ?? 0, c.registry?.inspection?.odometerKmAtLast ?? 0);
  if (km > PRE_PURCHASE_KM) reasons.push(REASONS.km![locale]);
  if (c.items.some((i) => i.findings.some((f) => f.kind === 'contradiction'))) reasons.push(REASONS.contradiction![locale]);
  if (c.items.some(isStale)) reasons.push(REASONS.belt![locale]);

  const focus = c.items
    .filter((i) => i.inspectable && i.status !== 'verified')
    .map((i) => (i.origin.kind === 'claim' ? CLAIM_TITLES[i.origin.claimType][locale] : i.id));

  return { testDrive, prePurchase: { recommended: reasons.length > 0, reasons, focus } };
}

/* ---------- contract ---------- */

const ASSURANCE_EXCLUDED = new Set(['seller_situation', 'other', 'price']);

const BLANK = '______';

/**
 * Contract blank values: what the buyer typed, else what the case already knows
 * (a verified owner's name, the registry VIN), else a blank line to fill by hand.
 */
export function contractFieldValues(c: PurchaseCase): Record<ContractField, string> {
  const typed = c.contractFields ?? {};
  const ownerVerified = c.items.some((i) => i.origin.kind === 'mandatory' && i.origin.checkId === 'owner_matches_seller' && i.status === 'verified');
  const known: Partial<Record<ContractField, string>> = {
    seller: ownerVerified ? c.registry?.ownership?.ownerNameLocal : undefined,
    vin: c.registry?.vin,
  };
  const pick = (f: ContractField) => typed[f]?.trim() || known[f] || BLANK;
  return { seller: pick('seller'), buyer: pick('buyer'), vin: pick('vin'), odometer: pick('odometer'), handover: pick('handover') };
}

/** Evidence or a finding says the claim is false. */
export function isContradicted(c: PurchaseCase, item: VerificationItem): boolean {
  return item.findings.some((f) => f.kind === 'contradiction') || c.evidence.some((e) => e.outcome === 'contradicts' && e.itemIds.includes(item.id));
}

/** A contradicted claim is recorded as disputed, never assured: the seller must not sign what the buyer knows is false. */
function disputedClause(c: PurchaseCase, item: VerificationItem, claim: SellerClaim, title: string, locale: Locale): ContractClause {
  const regKm = c.registry?.inspection?.odometerKmAtLast;
  const text =
    claim.type === 'odometer' && claim.value.kind === 'km' && regKm !== undefined
      ? renderTemplate(DISPUTED_ODOMETER_TEXT[locale], { regKm: formatKm(regKm), date: monthYear(c.registry?.inspection?.lastDate ?? ''), adKm: formatKm(claim.value.km), odometer: contractFieldValues(c).odometer })
      : renderTemplate(DISPUTED_TEXT[locale], { claim: title, quote: claim.quote });
  return { id: `dispute:${item.id}`, kind: 'disputed_claim', text, sourceItemIds: [item.id], included: true };
}

/**
 * Builds the contract draft. Every seller claim the buyer relies on that is not verified
 * becomes a seller_assurance clause: what you could not verify, you get in writing.
 * `previous` keeps the user's include/exclude toggles across regenerations.
 */
export function generateClauses(c: PurchaseCase, locale: Locale, previous: ContractClause[] = []): ContractClause[] {
  const car = c.listing.car;
  const carLabel = [car.make, car.model, car.modelYear].filter(Boolean).join(' ') || '______';
  const plate = c.registry?.plate ?? c.listing.plateLocal ?? '______';
  const keysClaim = c.claims.find((cl) => cl.type === 'keys_count');
  const keys = keysClaim?.value.kind === 'count' ? keysClaim.value.n : '__';
  const price = car.price ? formatEur(car.price) : '______';

  const fields = contractFieldValues(c);
  const base: ContractClause[] = [
    clause('parties', renderTemplate(CLAUSE_TEXTS.parties[locale], fields), []),
    clause('vehicle_identity', renderTemplate(CLAUSE_TEXTS.vehicle_identity[locale], { car: carLabel, plate, ...fields }), ['mandatory:vin_matches']),
    clause('price_payment', renderTemplate(CLAUSE_TEXTS.price_payment[locale], { price }), ['mandatory:safe_payment']),
    clause('handover_time', renderTemplate(CLAUSE_TEXTS.handover_time[locale], fields), []),
  ];

  const assurances: ContractClause[] = c.items
    .filter((i) => i.origin.kind === 'claim' && i.status !== 'verified' && !ASSURANCE_EXCLUDED.has(i.origin.claimType))
    .map((i) => {
      const claim = claimForItem(c, i)!;
      const title = CLAIM_TITLES[claim.type][locale];
      if (isContradicted(c, i)) return disputedClause(c, i, claim, title, locale);
      return {
        id: `assurance:${i.id}`,
        kind: 'seller_assurance',
        text: renderTemplate(ASSURANCE_TEXT[locale], { claim: title, quote: claim.quote }),
        sourceItemIds: [i.id],
        included: c.assuranceChoices?.[`assurance:${i.id}`] ?? true,
      };
    });

  const accepted = c.items.filter((i) => i.acceptedRisk);
  const disclosed: ContractClause[] = accepted.length
    ? [clause('disclosed_defects', renderTemplate(DISCLOSED_DEFECTS_TEXT[locale], { defects: accepted.map((i) => itemTitle(i, locale)).join(', ') }), accepted.map((i) => i.id))]
    : [];

  const tail: ContractClause[] = [
    clause('documents_keys', renderTemplate(CLAUSE_TEXTS.documents_keys[locale], { keys }), keysClaim ? [`claim:${keysClaim.id}`] : []),
    clause('ownership_notification', CLAUSE_TEXTS.ownership_notification[locale], []),
    clause('insurance_note', CLAUSE_TEXTS.insurance_note[locale], []),
  ];

  const all = [...base, ...assurances, ...disclosed, ...tail];
  return all.map((cl) => {
    const prev = previous.find((p) => p.id === cl.id);
    return prev ? { ...cl, included: prev.included } : cl;
  });
}

function clause(kind: ContractClause['kind'], text: string, sourceItemIds: string[]): ContractClause {
  return { id: kind, kind, text, sourceItemIds, included: true };
}

/** Plain-text contract for sharing. */
export function contractText(clauses: ContractClause[], title: string, disclaimer: string): string {
  const body = clauses
    .filter((cl) => cl.included)
    .map((cl, i) => `${i + 1}. ${cl.text}`)
    .join('\n\n');
  return `${title}\n\n${body}\n\n— ${disclaimer}`;
}

/** Belt job cost for budget refinement when the belt is due (demo value). */
export function beltDueCost(c: PurchaseCase): number {
  if (!c.items.some(isStale)) return 0;
  return findModelNote(c.listing.car.make, c.listing.car.model)?.beltJobEur ?? 0;
}
