/**
 * Purchase case state machine (§4.2). applyEvent is pure: it returns a new case or an error,
 * never mutates its input. Every change bumps `version`.
 */
import { generateClauses, inspectionPlan } from './generators';
import {
  buildItems,
  hasBlockingFlag,
  isStale,
  makeEvidence,
  mandatoryItemId,
  nextNumericId,
  ownerComparisonEvidence,
  recomputeItems,
  registryEvidence,
} from './ledger';
import type { AnalysedAd } from './pipeline';
import type {
  AgeBand,
  CaseStatus,
  ClaimType,
  ClaimValue,
  CoverIntent,
  Evidence,
  EvidenceFact,
  EvidenceKind,
  Locale,
  Money,
  PurchaseCase,
  RegistryCheck,
} from './types';

export const OWNERSHIP_NOTIFICATION_DAYS = 7; // ⚠️ verify (Traficom)

export type CaseEvent =
  | { type: 'claim_edited'; claimId: string; value: ClaimValue }
  | { type: 'claim_removed'; claimId: string }
  | { type: 'claim_added'; claimType: ClaimType; value: ClaimValue; quote: string }
  | { type: 'claims_confirmed' }
  | { type: 'question_asked'; itemId: string }
  | { type: 'evidence_added'; kind: EvidenceKind; itemIds: string[]; outcome: Evidence['outcome']; facts?: EvidenceFact[]; note?: string }
  | { type: 'registry_result'; registry: RegistryCheck }
  | { type: 'owner_compared'; sellerNameFromId: string }
  | { type: 'vin_confirmed'; matches: boolean }
  | { type: 'payment_confirmed'; safe: boolean }
  | { type: 'risk_accepted'; itemId: string }
  | { type: 'risk_unaccepted'; itemId: string }
  | { type: 'start_inspection' }
  | { type: 'test_drive_done' }
  | { type: 'inspection_result'; outcomes: Record<string, 'ok' | 'issue'> }
  | { type: 'inspection_skipped' }
  | { type: 'start_contract' }
  | { type: 'clause_toggled'; clauseId: string }
  | { type: 'mark_ready' }
  | { type: 'walk_away' }
  | { type: 'reopen' }
  | { type: 'buy' }
  | { type: 'handoff_consented'; buyer: { ageBand: AgeBand; firstTimeDriver: boolean; coverIntent: CoverIntent; deductible: Money } }
  | { type: 'handoff_quote'; monthly: Money }
  | { type: 'handoff_bound' }
  | { type: 'registered' }
  | { type: 'take_ownership' };

export interface Ctx {
  now: Date;
  locale: Locale;
}

export type ApplyResult = { ok: true; next: PurchaseCase } | { ok: false; error: string };

const PRE_PURCHASE: ReadonlySet<CaseStatus> = new Set(['draft', 'reviewing_claims', 'checking', 'inspecting', 'contract_prep', 'ready_to_buy']);
const LEDGER_OPEN: ReadonlySet<CaseStatus> = new Set(['checking', 'inspecting', 'contract_prep', 'ready_to_buy']);

export function createCase(id: string, ad: AnalysedAd, now: Date): PurchaseCase {
  const iso = now.toISOString();
  return {
    id,
    country: 'FI',
    status: 'reviewing_claims',
    version: 1,
    listing: ad.listing,
    claims: ad.claims,
    items: [],
    evidence: [],
    testDriveDone: false,
    inspectionDone: false,
    clauses: [],
    createdAt: iso,
    updatedAt: iso,
  };
}

/* ---------- gate ---------- */

export type GateBlocker =
  | { kind: 'unresolved'; itemId: string }
  | { kind: 'red_flag'; itemId: string }
  | { kind: 'contradiction'; itemId: string }
  | { kind: 'missing_assurance'; itemId: string };

export interface GateResult {
  passes: boolean;
  blockers: GateBlocker[];
  acceptedRisks: number;
  staleWarnings: number;
}

/**
 * Gate contract_prep → ready_to_buy (§4.2). No score: blockers and accepted risks only.
 * - blocking red flags can never pass;
 * - a critical item contradicted by evidence must be explicitly accepted as a risk
 *   (a contract clause alone does not make a known problem go away);
 * - other unverified critical claims need an included seller-assurance clause or acceptance.
 */
export function evaluateGate(c: PurchaseCase): GateResult {
  const blockers: GateBlocker[] = [];
  const includedAssurance = (itemId: string) => c.clauses.some((cl) => cl.included && cl.kind === 'seller_assurance' && cl.sourceItemIds.includes(itemId));

  for (const item of c.items) {
    if (hasBlockingFlag(item)) {
      blockers.push({ kind: 'red_flag', itemId: item.id });
      continue;
    }
    if (item.criticality !== 'critical' || item.status === 'verified' || item.acceptedRisk) continue;
    if (item.findings.some((f) => f.kind === 'contradiction')) {
      blockers.push({ kind: 'contradiction', itemId: item.id });
    } else if (item.status === 'unchecked' || item.status === 'awaiting_evidence') {
      blockers.push({ kind: 'unresolved', itemId: item.id });
    } else if (item.origin.kind === 'claim' ? !includedAssurance(item.id) : true) {
      blockers.push({ kind: item.origin.kind === 'claim' ? 'missing_assurance' : 'unresolved', itemId: item.id });
    }
  }

  return {
    passes: blockers.length === 0,
    blockers,
    acceptedRisks: c.items.filter((i) => i.acceptedRisk).length,
    staleWarnings: c.items.filter(isStale).length,
  };
}

/* ---------- transitions ---------- */

const fail = (error: string): ApplyResult => ({ ok: false, error });

/** Recomputes derived data after any ledger change and keeps the gate honest. */
function settle(c: PurchaseCase, ctx: Ctx): PurchaseCase {
  const items = recomputeItems(c);
  const assuranceChoices = {
    ...c.assuranceChoices,
    ...Object.fromEntries(c.clauses.filter((cl) => cl.kind === 'seller_assurance').map((cl) => [cl.id, cl.included])),
  };
  const withItems = { ...c, items, assuranceChoices };
  const clauses = generateClauses(withItems, ctx.locale, c.clauses);
  const next = { ...withItems, clauses };
  // New evidence can break a passed gate: step back to contract_prep (§4.2).
  if (next.status === 'ready_to_buy' && !evaluateGate(next).passes) return { ...next, status: 'contract_prep' };
  return next;
}

function bump(prev: PurchaseCase, next: PurchaseCase, ctx: Ctx): ApplyResult {
  return { ok: true, next: { ...next, version: prev.version + 1, updatedAt: ctx.now.toISOString() } };
}

function addEvidence(c: PurchaseCase, evidence: Evidence[], ctx: Ctx): PurchaseCase {
  return settle({ ...c, evidence: [...c.evidence, ...evidence] }, ctx);
}

/** One-answer-per-item evidence: drops earlier single-item evidence of `kind` for `itemId`, then adds `make`'s result. */
function replaceAnswer(c: PurchaseCase, kind: EvidenceKind, itemId: string, make: (base: PurchaseCase) => Evidence, ctx: Ctx): PurchaseCase {
  const base = { ...c, evidence: c.evidence.filter((ev) => !(ev.kind === kind && ev.itemIds.length === 1 && ev.itemIds[0] === itemId)) };
  return addEvidence(base, [make(base)], ctx);
}

export function applyEvent(c: PurchaseCase, e: CaseEvent, ctx: Ctx): ApplyResult {
  const inReview = c.status === 'reviewing_claims';
  const ledgerOpen = LEDGER_OPEN.has(c.status);

  switch (e.type) {
    case 'claim_edited':
      if (!inReview) return fail('claims_locked');
      return bump(c, { ...c, claims: c.claims.map((cl) => (cl.id === e.claimId ? { ...cl, value: e.value, extractor: 'user', confidence: 'high' } : cl)) }, ctx);

    case 'claim_removed':
      if (!inReview) return fail('claims_locked');
      return bump(c, { ...c, claims: c.claims.filter((cl) => cl.id !== e.claimId) }, ctx);

    case 'claim_added': {
      if (!inReview) return fail('claims_locked');
      const id = nextNumericId(c.claims.map((cl) => cl.id), 'u');
      const claim = { id, type: e.claimType, value: e.value, quote: e.quote, quoteStart: Number.MAX_SAFE_INTEGER, extractor: 'user' as const, confidence: 'high' as const };
      return bump(c, { ...c, claims: [...c.claims, claim] }, ctx);
    }

    case 'claims_confirmed': {
      if (!inReview) return fail('invalid_transition');
      const items = buildItems(c.claims, c.listing.car, ctx.now);
      return bump(c, settle({ ...c, items, status: 'checking' }, ctx), ctx);
    }

    case 'question_asked':
      if (!ledgerOpen) return fail('ledger_closed');
      return bump(c, settle({ ...c, items: c.items.map((i) => (i.id === e.itemId ? { ...i, questionAsked: true } : i)) }, ctx), ctx);

    case 'evidence_added':
      if (!ledgerOpen) return fail('ledger_closed');
      if (e.itemIds.length === 0) return fail('no_items');
      return bump(c, addEvidence(c, [makeEvidence(c, e, ctx.now)], ctx), ctx);

    case 'registry_result': {
      if (!ledgerOpen) return fail('ledger_closed');
      const withRegistry: PurchaseCase = {
        ...c,
        registry: e.registry,
        listing: { ...c.listing, plateLocal: c.listing.plateLocal ?? e.registry.plate },
        // A repeated check replaces the previous registry evidence instead of stacking it.
        evidence: c.evidence.filter((ev) => ev.kind !== 'registry_result' || ev.itemIds.includes(mandatoryItemId('owner_matches_seller'))),
      };
      return bump(c, addEvidence(withRegistry, registryEvidence(withRegistry, e.registry, ctx.now), ctx), ctx);
    }

    case 'owner_compared': {
      if (!ledgerOpen) return fail('ledger_closed');
      if (!ownerComparisonEvidence(c, e.sellerNameFromId, ctx.now)) return fail('registry_missing');
      return bump(c, replaceAnswer(c, 'registry_result', mandatoryItemId('owner_matches_seller'), (base) => ownerComparisonEvidence(base, e.sellerNameFromId, ctx.now)!, ctx), ctx);
    }

    case 'vin_confirmed': {
      if (!ledgerOpen) return fail('ledger_closed');
      const itemId = mandatoryItemId('vin_matches');
      return bump(c, replaceAnswer(c, 'test_drive_note', itemId, (base) => {
        const ev = makeEvidence(base, { kind: 'test_drive_note', itemIds: [itemId], outcome: e.matches ? 'supports' : 'contradicts' }, ctx.now);
        return e.matches ? ev : { ...ev, findings: [{ kind: 'red_flag', code: 'vin_mismatch', params: {}, blocking: true }] };
      }, ctx), ctx);
    }

    case 'payment_confirmed': {
      if (!ledgerOpen) return fail('ledger_closed');
      const itemId = mandatoryItemId('safe_payment');
      return bump(c, replaceAnswer(c, 'seller_message', itemId, (base) => {
        const ev = makeEvidence(base, { kind: 'seller_message', itemIds: [itemId], outcome: e.safe ? 'supports' : 'contradicts' }, ctx.now);
        // The buyer's own observation of the payment terms counts as "observed".
        return { ...ev, strength: 'observed', findings: e.safe ? [] : [{ kind: 'red_flag', code: 'unsafe_payment', params: {}, blocking: true }] };
      }, ctx), ctx);
    }

    case 'risk_accepted': {
      if (!ledgerOpen) return fail('ledger_closed');
      const item = c.items.find((i) => i.id === e.itemId);
      if (!item) return fail('unknown_item');
      if (hasBlockingFlag(item)) return fail('risk_not_acceptable');
      return bump(c, settle({ ...c, items: c.items.map((i) => (i.id === e.itemId ? { ...i, acceptedRisk: { at: ctx.now.toISOString() } } : i)) }, ctx), ctx);
    }

    case 'risk_unaccepted':
      if (!ledgerOpen) return fail('ledger_closed');
      return bump(c, settle({ ...c, items: c.items.map((i) => (i.id === e.itemId ? { ...i, acceptedRisk: undefined } : i)) }, ctx), ctx);

    case 'start_inspection':
      if (c.status !== 'checking') return fail('invalid_transition');
      if (!c.registry) return fail('registry_missing');
      return bump(c, { ...c, status: 'inspecting' }, ctx);

    case 'test_drive_done':
      if (!ledgerOpen) return fail('ledger_closed');
      return bump(c, { ...c, testDriveDone: true }, ctx);

    case 'inspection_result': {
      if (!ledgerOpen) return fail('ledger_closed');
      const entries = Object.entries(e.outcomes).filter(([itemId]) => c.items.some((i) => i.id === itemId)).filter(([, outcome]) => outcome === 'ok' || outcome === 'issue');
      if (entries.length === 0) return fail('no_outcomes');
      let acc = c;
      for (const [itemId, outcome] of entries) {
        acc = { ...acc, evidence: [...acc.evidence, makeEvidence(acc, { kind: 'inspection_report', itemIds: [itemId], outcome: outcome === 'ok' ? 'supports' : 'contradicts' }, ctx.now)] };
      }
      return bump(c, settle({ ...acc, inspectionDone: true }, ctx), ctx);
    }

    case 'inspection_skipped':
      if (c.status !== 'checking' && c.status !== 'inspecting') return fail('invalid_transition');
      if (!c.registry) return fail('registry_missing');
      return bump(c, { ...c, status: 'inspecting', inspectionSkipped: true }, ctx);

    case 'start_contract': {
      if (c.status !== 'inspecting') return fail('invalid_transition');
      if (!c.testDriveDone) return fail('test_drive_missing');
      const plan = inspectionPlan(c, ctx.locale, ctx.now);
      if (plan.prePurchase.recommended && !c.inspectionDone && !c.inspectionSkipped) return fail('inspection_missing');
      return bump(c, { ...c, status: 'contract_prep' }, ctx);
    }

    case 'clause_toggled':
      if (!ledgerOpen) return fail('ledger_closed');
      return bump(c, settle({ ...c, clauses: c.clauses.map((cl) => (cl.id === e.clauseId ? { ...cl, included: !cl.included } : cl)) }, ctx), ctx);

    case 'mark_ready':
      if (c.status !== 'contract_prep') return fail('invalid_transition');
      if (!evaluateGate(c).passes) return fail('gate_blocked');
      return bump(c, { ...c, status: 'ready_to_buy' }, ctx);

    case 'walk_away':
      if (!PRE_PURCHASE.has(c.status)) return fail('invalid_transition');
      return bump(c, { ...c, status: 'walked_away', decision: { kind: 'walk_away', at: ctx.now.toISOString() } }, ctx);

    case 'reopen':
      if (c.status !== 'walked_away') return fail('invalid_transition');
      return bump(c, { ...c, status: c.items.length ? 'checking' : 'reviewing_claims', decision: undefined }, ctx);

    case 'buy':
      if (c.status !== 'ready_to_buy') return fail('invalid_transition');
      return bump(c, { ...c, status: 'bought', decision: { kind: 'buy', at: ctx.now.toISOString() } }, ctx);

    case 'handoff_consented': {
      if (c.status !== 'bought') return fail('invalid_transition');
      const car = c.listing.car;
      const deadline = new Date(ctx.now.getTime() + OWNERSHIP_NOTIFICATION_DAYS * 86_400_000);
      return bump(c, {
        ...c,
        status: 'insuring',
        handoff: {
          isMock: true,
          payload: {
            plate: c.registry?.plate ?? c.listing.plateLocal ?? '',
            make: car.make ?? '',
            model: car.model ?? '',
            modelYear: car.modelYear ?? 0,
            purchaseDate: ctx.now.toISOString().slice(0, 10),
            buyerAgeBand: e.buyer.ageBand,
            firstTimeDriver: e.buyer.firstTimeDriver,
            coverIntent: e.buyer.coverIntent,
            deductible: e.buyer.deductible,
            registrationRequested: true,
          },
          status: 'consented',
          consentAt: ctx.now.toISOString(),
          ownershipNotificationBy: deadline.toISOString(),
        },
      }, ctx);
    }

    case 'handoff_quote':
      if (c.status !== 'insuring' || !c.handoff) return fail('invalid_transition');
      return bump(c, { ...c, handoff: { ...c.handoff, status: 'quote_received', quoteMonthly: e.monthly } }, ctx);

    case 'handoff_bound':
      if (c.handoff?.status !== 'quote_received') return fail('invalid_transition');
      return bump(c, { ...c, handoff: { ...c.handoff, status: 'bound' } }, ctx);

    case 'registered':
      if (c.handoff?.status !== 'bound') return fail('invalid_transition');
      return bump(c, { ...c, status: 'registered', handoff: { ...c.handoff, status: 'registered' } }, ctx);

    case 'take_ownership':
      if (c.status !== 'registered') return fail('invalid_transition');
      return bump(c, { ...c, status: 'owned' }, ctx);
  }
}
