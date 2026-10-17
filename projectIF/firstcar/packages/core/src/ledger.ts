/**
 * Verification ledger (§4.1). Pure functions over plain data.
 * Item status is always *derived* from evidence + rules, never set directly, and never by the LLM.
 */
import {
  CLAIM_RULES,
  CLAIM_TITLES,
  EVIDENCE_STRENGTH,
  FINDING_TEXTS,
  MANDATORY_CHECKS,
  MANDATORY_TITLES,
  SCENARIO_ITEM_TITLES,
  STRENGTH_RANK,
  findModelNote,
  renderTemplate,
} from './content';
import { eur, formatEur, formatKm } from './money';
import type {
  CarSpec,
  Evidence,
  EvidenceFact,
  EvidenceKind,
  Finding,
  Locale,
  PurchaseCase,
  RegistryCheck,
  SellerClaim,
  VerificationItem,
  VerificationStatus,
} from './types';

const AGE_FOR_SERVICE_HISTORY_ITEM = 8;

export const claimItemId = (claimId: string) => `claim:${claimId}`;
export const mandatoryItemId = (checkId: string) => `mandatory:${checkId}`;

/** Creates ledger items from confirmed claims, mandatory checks and "missing claim" scenarios. */
export function buildItems(claims: SellerClaim[], car: Partial<CarSpec>, now: Date): VerificationItem[] {
  const claimItems: VerificationItem[] = claims
    .filter((c) => CLAIM_RULES[c.type].createsItem)
    .map((c) => {
      const rule = CLAIM_RULES[c.type];
      return {
        id: claimItemId(c.id),
        origin: { kind: 'claim', claimId: c.id, claimType: c.type },
        status: 'unchecked',
        criticality: rule.criticality,
        minStrength: rule.minStrength,
        inspectable: rule.inspectable,
        evidenceIds: [],
        findings: [],
      };
    });

  const claimedTypes = new Set(claims.map((c) => c.type));
  const mandatoryItems: VerificationItem[] = MANDATORY_CHECKS
    // The ad's own "inspection valid" claim already covers this check.
    .filter((m) => !(m.checkId === 'inspection_valid' && claimedTypes.has('inspection_valid')))
    .map((m) => ({
      id: mandatoryItemId(m.checkId),
      origin: { kind: 'mandatory', checkId: m.checkId },
      status: 'unchecked',
      criticality: m.criticality,
      minStrength: m.minStrength,
      inspectable: false,
      evidenceIds: [],
      findings: [],
    }));

  const scenarioItems: VerificationItem[] = [];
  const note = findModelNote(car.make, car.model);
  if (note?.hasTimingBelt && !claimedTypes.has('timing_belt')) {
    scenarioItems.push(scenarioItem('belt_history_missing', 'critical', 'document', true));
  }
  const age = car.modelYear ? now.getUTCFullYear() - car.modelYear : 0;
  if (age > AGE_FOR_SERVICE_HISTORY_ITEM && !claimedTypes.has('service_history')) {
    scenarioItems.push(scenarioItem('service_history_missing', 'important', 'document', false));
  }

  return [...claimItems, ...mandatoryItems, ...scenarioItems];
}

function scenarioItem(scenarioId: string, criticality: VerificationItem['criticality'], minStrength: VerificationItem['minStrength'], inspectable: boolean): VerificationItem {
  return {
    id: `scenario:${scenarioId}`,
    origin: { kind: 'scenario', scenarioId },
    status: 'unchecked',
    criticality,
    minStrength,
    inspectable,
    evidenceIds: [],
    findings: [],
  };
}

export function itemTitle(item: VerificationItem, locale: Locale): string {
  switch (item.origin.kind) {
    case 'claim':
      return CLAIM_TITLES[item.origin.claimType][locale];
    case 'mandatory':
      return MANDATORY_TITLES[item.origin.checkId][locale];
    case 'scenario':
      return SCENARIO_ITEM_TITLES[item.origin.scenarioId]?.[locale] ?? item.origin.scenarioId;
  }
}

export function renderFinding(f: Finding, locale: Locale): string {
  return renderTemplate(FINDING_TEXTS[f.code][locale], f.params);
}

export function claimForItem(c: Pick<PurchaseCase, 'claims'>, item: VerificationItem): SellerClaim | undefined {
  return item.origin.kind === 'claim' ? c.claims.find((cl) => cl.id === (item.origin as { claimId: string }).claimId) : undefined;
}

/* ---------- evidence creation ---------- */

/** Next free `${prefix}${n}` id: highest existing numeric suffix + 1, so ids stay unique after removals. */
export function nextNumericId(ids: string[], prefix: string): string {
  const max = ids.reduce((m, id) => {
    const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${max + 1}`;
}

export function nextEvidenceId(c: Pick<PurchaseCase, 'evidence'>): string {
  return nextNumericId(c.evidence.map((e) => e.id), 'e');
}

/** Builds a user-entered piece of evidence. Strength is derived from the kind (§4.1 rule 1). */
export function makeEvidence(
  c: Pick<PurchaseCase, 'evidence'>,
  input: { kind: EvidenceKind; itemIds: string[]; outcome: Evidence['outcome']; facts?: EvidenceFact[]; note?: string },
  now: Date,
): Evidence {
  return {
    id: nextEvidenceId(c),
    kind: input.kind,
    strength: EVIDENCE_STRENGTH[input.kind],
    itemIds: input.itemIds,
    facts: input.facts ?? [],
    outcome: input.outcome,
    findings: input.outcome === 'contradicts' ? [{ kind: 'contradiction', code: 'evidence_contradicts', params: {} }] : [],
    note: input.note,
    capturedAt: now.toISOString(),
  };
}

const monthYear = (iso: string) => {
  const [y, m] = iso.split('-');
  return m ? `${m}/${y}` : (y ?? iso);
};

/**
 * Turns a registry result into official evidence for each item it can settle,
 * applying the deterministic cross-claim rules (§4.1 rule 4).
 */
export function registryEvidence(c: PurchaseCase, reg: RegistryCheck, now: Date): Evidence[] {
  const out: Evidence[] = [];
  const firstId = Number(nextEvidenceId(c).slice(1));
  const add = (itemId: string, outcome: Evidence['outcome'], findings: Finding[], facts: EvidenceFact[] = []) => {
    out.push({
      id: `e${firstId + out.length}`,
      kind: 'registry_result',
      strength: 'official',
      itemIds: [itemId],
      facts,
      outcome,
      findings,
      capturedAt: now.toISOString(),
    });
  };

  for (const item of c.items) {
    const claim = claimForItem(c, item);
    if (claim) {
      switch (claim.type) {
        case 'odometer': {
          const regKm = reg.inspection?.odometerKmAtLast;
          if (regKm === undefined || claim.value.kind !== 'km') break;
          const params = { adKm: formatKm(claim.value.km), regKm: formatKm(regKm), date: monthYear(reg.inspection?.lastDate ?? '') };
          if (claim.value.km < regKm) {
            add(item.id, 'contradicts', [{ kind: 'contradiction', code: 'odometer_rollback', params }], [{ claimType: 'odometer', value: { kind: 'km', km: regKm } }]);
          } else {
            add(item.id, 'supports', [{ kind: 'match', code: 'odometer_consistent', params }]);
          }
          break;
        }
        case 'owners_count': {
          const regOwners = reg.ownership?.ownersCount;
          if (regOwners === undefined || claim.value.kind !== 'count') break;
          if (claim.value.n < regOwners) {
            add(item.id, 'contradicts', [{ kind: 'contradiction', code: 'owners_mismatch', params: { adOwners: claim.value.n, regOwners } }]);
          } else {
            add(item.id, 'supports', []);
          }
          break;
        }
        case 'model_year': {
          const regYear = reg.technical?.modelYear;
          if (regYear === undefined || claim.value.kind !== 'date') break;
          const adYear = Number(claim.value.date.slice(0, 4));
          add(item.id, adYear === regYear ? 'supports' : 'contradicts', adYear === regYear ? [] : [{ kind: 'contradiction', code: 'year_mismatch', params: { adYear, regYear } }]);
          break;
        }
        case 'inspection_valid':
          addInspection(item.id);
          break;
        default:
          break;
      }
      continue;
    }

    if (item.origin.kind !== 'mandatory') continue;
    switch (item.origin.checkId) {
      case 'inspection_valid':
        addInspection(item.id);
        break;
      case 'vehicle_tax_paid':
        if (reg.tax?.status === 'paid') add(item.id, 'supports', []);
        else if (reg.tax?.status === 'unpaid') add(item.id, 'contradicts', [{ kind: 'red_flag', code: 'tax_unpaid', params: {} }]);
        break;
      case 'not_finance_owned': {
        const own = reg.ownership;
        if (!own) break;
        const flagged = own.ownerKind === 'finance_company' || own.holderDiffersFromOwner;
        add(item.id, flagged ? 'contradicts' : 'supports', flagged ? [{ kind: 'red_flag', code: 'finance_owner', params: {}, blocking: true }] : []);
        break;
      }
      default:
        break;
    }
  }
  return out;

  function addInspection(itemId: string) {
    const insp = reg.inspection;
    if (!insp) return;
    const valid = insp.result !== 'fail' && insp.nextDue >= now.toISOString().slice(0, 10);
    add(itemId, valid ? 'supports' : 'contradicts', valid ? [] : [{ kind: 'contradiction', code: 'inspection_expired', params: { result: insp.result, nextDue: monthYear(insp.nextDue) } }]);
  }
}

/** Order-insensitive set of lowercase, diacritic-free name tokens. */
const nameTokens = (s: string): string[] =>
  [...new Set(s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))].sort();

function sameName(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  return ta.length > 0 && ta.length === tb.length && ta.every((t, i) => t === tb[i]);
}

/** Compares the name the buyer read from the seller's ID with the registered owner (on device only). */
export function ownerComparisonEvidence(c: PurchaseCase, sellerNameFromId: string, now: Date): Evidence | undefined {
  const owner = c.registry?.ownership?.ownerNameLocal;
  if (!owner) return undefined;
  const matches = sameName(owner, sellerNameFromId);
  return {
    id: nextEvidenceId(c),
    kind: 'registry_result',
    strength: 'official',
    itemIds: [mandatoryItemId('owner_matches_seller')],
    facts: [],
    outcome: matches ? 'supports' : 'contradicts',
    findings: matches ? [] : [{ kind: 'red_flag', code: 'owner_not_seller', params: {}, blocking: true }],
    capturedAt: now.toISOString(),
  };
}

/* ---------- derived status ---------- */

/** Current odometer estimate: the highest of the ad claim and the registry reading. */
export function currentKm(c: PurchaseCase): number | undefined {
  const values = [c.listing.car.odometerKm, c.registry?.inspection?.odometerKmAtLast].filter((v): v is number => typeof v === 'number');
  return values.length ? Math.max(...values) : undefined;
}

/** Static (non-evidence) findings for an item: scam pattern, timing belt due. */
function staticFindings(c: PurchaseCase, item: VerificationItem): Finding[] {
  const claim = claimForItem(c, item);
  if (!claim) return [];
  if (claim.type === 'seller_situation') {
    return [{ kind: 'red_flag', code: 'scam_pattern', params: { quote: claim.quote }, blocking: true }];
  }
  if (claim.type === 'timing_belt' && claim.value.kind === 'event' && claim.value.atKm !== undefined) {
    const note = findModelNote(c.listing.car.make, c.listing.car.model);
    const km = currentKm(c);
    if (note?.beltIntervalKm && km !== undefined && km >= claim.value.atKm + note.beltIntervalKm) {
      return [{
        kind: 'stale',
        code: 'belt_due',
        params: {
          beltKm: formatKm(claim.value.atKm),
          intervalKm: formatKm(note.beltIntervalKm),
          currentKm: formatKm(km),
          cost: formatEur(eur(note.beltJobEur ?? 0)),
        },
      }];
    }
  }
  return [];
}

function deriveStatus(item: VerificationItem, evidence: Evidence[], findings: Finding[]): VerificationStatus {
  if (findings.some((f) => f.kind === 'red_flag' && f.blocking)) return 'not_verified';

  const rank = (e: Evidence) => STRENGTH_RANK[e.strength];
  const strongest = (list: Evidence[]) => (list.length ? Math.max(...list.map(rank)) : -1);
  const supporting = evidence.filter((e) => e.outcome === 'supports' && e.strength !== 'seller_statement');
  const contradicting = evidence.filter((e) => e.outcome === 'contradicts');
  const s = strongest(supporting);
  const k = strongest(contradicting);

  // Contradiction beats confirmation unless stronger evidence resolves it (rule 3).
  if (k >= 0 && s <= k) return 'not_verified';
  if (s >= STRENGTH_RANK[item.minStrength]) return 'verified';
  if (item.inspectable && STRENGTH_RANK[item.minStrength] >= STRENGTH_RANK.professional) return 'needs_inspection';
  if (item.inspectable && evidence.length > 0) return 'needs_inspection';
  if (evidence.length > 0 || item.questionAsked) return 'awaiting_evidence';
  return 'unchecked';
}

/** Recomputes findings and status of every item from the case's evidence. Returns new item objects. */
export function recomputeItems(c: PurchaseCase): VerificationItem[] {
  return c.items.map((item) => {
    const evidence = c.evidence.filter((e) => e.itemIds.includes(item.id));
    const findings = [...staticFindings(c, item), ...evidence.flatMap((e) => (e.findings ?? []).map((f) => ({ ...f, evidenceId: e.id })))];
    return { ...item, evidenceIds: evidence.map((e) => e.id), findings, status: deriveStatus(item, evidence, findings) };
  });
}

export function hasBlockingFlag(item: VerificationItem): boolean {
  return item.findings.some((f) => f.kind === 'red_flag' && f.blocking);
}

export function isStale(item: VerificationItem): boolean {
  return item.findings.some((f) => f.kind === 'stale');
}
