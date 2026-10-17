/**
 * Domain model for FirstCar. Mirrors §3 of docs/architecture.md.
 * Everything here is plain data: no functions, no classes, safe to serialise into the vault.
 */

export type ISO = string; // UTC ISO-8601
export type Country = 'FI' | 'SE' | 'NO' | 'DK';
export type Locale = 'fi' | 'en';
export type Currency = 'EUR';

export interface Money {
  minor: number; // cents
  currency: Currency;
}

export interface Range<T> {
  low: T;
  high: T;
}

export type ProvenanceKind = 'default' | 'user' | 'ad' | 'registry' | 'content' | 'stat' | 'evidence';

export interface Provenance {
  kind: ProvenanceKind;
  sourceId?: string;
  asOf?: string;
  isMock?: boolean;
  isAssumption?: boolean; // team assumption, not a verified figure: UI shows "estimate"
}

/* ---------- Part A ---------- */

export type AgeBand = '18-19' | '20-25' | '26-34' | '35+';
export type Density = 'urban' | 'suburban' | 'rural';
export type Fuel = 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'ev' | 'other';
export type CoverIntent = 'liability_only' | 'liability_plus_partial' | 'liability_plus_comprehensive';

export interface BuyerProfile {
  country: Country;
  locale: Locale;
  density: Density;
  ageBand: AgeBand;
  firstTimeDriver: boolean;
  netMonthlyIncome?: Range<Money>; // optional: every input is skippable
  savings?: Range<Money>;
  annualKm?: number;
  coverIntent: CoverIntent;
  deductible: Money;
  /** How the purchase price is paid. Undefined = not asked (older profiles). */
  payment?: PaymentMethod;
}

export type PaymentMethod = 'savings' | 'loan' | 'unsure';

export interface CarSpec {
  make: string;
  model: string;
  modelYear: number;
  fuel: Fuel;
  price?: Money;
  odometerKm?: number;
  co2GPerKm?: number;
  massKg?: number;
  hasWinterTyres?: boolean;
  fieldProvenance: Partial<Record<'make' | 'model' | 'modelYear' | 'fuel' | 'price' | 'odometerKm' | 'co2GPerKm' | 'massKg' | 'hasWinterTyres', Provenance>>;
}

export type BudgetLineKey =
  | 'loan'
  | 'insurance'
  | 'energy'
  | 'parking'
  | 'vehicle_tax'
  | 'maintenance'
  | 'tyres'
  | 'inspection'
  | 'repair_reserve';

export interface BudgetLine {
  key: BudgetLineKey;
  monthly: Money;
  oneOff?: Money;
  provenance: Provenance;
}

export type VerdictLevel = 'comfortable' | 'manageable' | 'tight' | 'over_budget' | 'unknown';

export interface Verdict {
  level: VerdictLevel;
  shareOfIncome?: number; // 0..1
  /** Middle of the income range the share was computed against. */
  incomeMid?: Money;
}

/** Can the price and the savings buffer be paid up front? */
export interface CashCheck {
  price: Money;
  buffer: Money;
  needed: Money;
  /** Middle of the savings range; undefined when savings were skipped. */
  available?: Money;
  /** Borrowed amount behind the loan line, if any. */
  loanPrincipal?: Money;
  coveredWithoutLoan?: boolean;
}

export interface SavingsBuffer {
  deductible: Money;
  firstYearRepair: Money;
  oneMonthCosts: Money;
  oneOffs: Money;
  recommended: Money;
  coveredBySavings?: boolean;
}

export type EvidenceStatStatus = 'computed' | 'pending';

/**
 * A statistic shown next to a risk scenario. `value` is null while `status` is 'pending':
 * the number must be computed from the named dataset, never invented.
 */
export interface EvidenceStat {
  metric: 'claim_freq_relativity' | 'team_curated';
  value: number | null;
  status: EvidenceStatStatus;
  sourceId: string;
  sourceLabel: string;
  dataYear?: string;
  caveat: string;
}

export type ScenarioCategory = 'driving_claim' | 'mechanical' | 'financial' | 'legal_admin';

export interface RiskScenario {
  id: string;
  category: ScenarioCategory;
  severity: 1 | 2 | 3;
  relevanceWeight: number;
  title: string;
  body: string;
  stat: EvidenceStat;
  actions: string[];
  linksToChecklist?: string[];
}

export interface OwnershipBudget {
  car: CarSpec;
  lines: BudgetLine[];
  monthlyTotal: Money;
  verdict: Verdict;
  buffer: SavingsBuffer;
  /** Only when the car has a price. */
  cashCheck?: CashCheck;
  scenarioIds: string[];
  computedAt: ISO;
}

/* ---------- Part B ---------- */

export type SellerType = 'private' | 'dealer' | 'unknown';

export interface Listing {
  inputKind: 'pasted_text' | 'demo_fixture';
  rawTextLocal: string; // DEVICE ONLY
  redactedText: string; // what a server/LLM would see
  textHash: string;
  plateLocal?: string; // DEVICE ONLY
  vinLocal?: string; // DEVICE ONLY
  sellerType: SellerType;
  car: Partial<CarSpec>;
  injectionSuspected: boolean;
  extractor: 'llm+rules' | 'rules' | 'cache' | 'mock';
  capturedAt: ISO;
}

export type ClaimType =
  | 'odometer'
  | 'model_year'
  | 'first_registration'
  | 'owners_count'
  | 'imported'
  | 'service_history'
  | 'timing_belt'
  | 'clutch'
  | 'recent_repair'
  | 'inspection_valid'
  | 'no_rust'
  | 'no_accidents'
  | 'tyres_included'
  | 'keys_count'
  | 'known_defects'
  | 'seller_situation'
  | 'price'
  | 'other';

export type ClaimValue =
  | { kind: 'km'; km: number }
  | { kind: 'date'; date: string } // 'YYYY-MM' or 'YYYY'
  | { kind: 'count'; n: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'enum'; value: string }
  | { kind: 'event'; atKm?: number; atDate?: string }
  | { kind: 'money'; eur: number }
  | { kind: 'text'; text: string };

export type Confidence = 'high' | 'medium' | 'low';
export type Criticality = 'critical' | 'important' | 'minor';

export interface SellerClaim {
  id: string;
  type: ClaimType;
  value: ClaimValue;
  quote: string; // verbatim span of redactedText (grounding)
  quoteStart: number; // offset in redactedText
  rawStart?: number; // DEVICE ONLY: re-matched offset in rawTextLocal
  rawEnd?: number;
  extractor: 'llm' | 'rules' | 'user';
  confidence: Confidence;
}

export type EvidenceStrength = 'official' | 'professional' | 'document' | 'observed' | 'seller_statement';

export type EvidenceKind =
  | 'registry_result'
  | 'inspection_report'
  | 'service_record'
  | 'receipt'
  | 'photo'
  | 'test_drive_note'
  | 'seller_message';

export interface EvidenceFact {
  claimType: ClaimType;
  value: ClaimValue;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  strength: EvidenceStrength;
  itemIds: string[];
  facts: EvidenceFact[];
  outcome: 'supports' | 'contradicts' | 'neutral';
  findings?: Finding[]; // findings this evidence produced (e.g. odometer rollback)
  note?: string;
  capturedAt: ISO;
}

export type VerificationStatus = 'unchecked' | 'awaiting_evidence' | 'verified' | 'not_verified' | 'needs_inspection';

export type FindingKind = 'match' | 'contradiction' | 'missing' | 'red_flag' | 'stale';

export type FindingCode =
  | 'odometer_rollback'
  | 'odometer_consistent'
  | 'owners_mismatch'
  | 'year_mismatch'
  | 'inspection_expired'
  | 'tax_unpaid'
  | 'finance_owner'
  | 'owner_not_seller'
  | 'owner_matches'
  | 'vin_mismatch'
  | 'scam_pattern'
  | 'injection_text'
  | 'belt_due'
  | 'unsafe_payment'
  | 'evidence_contradicts';

export interface Finding {
  kind: FindingKind;
  code: FindingCode; // rendered per locale by renderFinding()
  params: Record<string, string | number>;
  blocking?: boolean; // red flags that can never be accepted as a risk
  evidenceId?: string;
}

export type MandatoryCheckId =
  | 'owner_matches_seller'
  | 'not_finance_owned'
  | 'vehicle_tax_paid'
  | 'inspection_valid'
  | 'vin_matches'
  | 'safe_payment';

export type ItemOrigin =
  | { kind: 'claim'; claimId: string; claimType: ClaimType }
  | { kind: 'mandatory'; checkId: MandatoryCheckId }
  | { kind: 'scenario'; scenarioId: string };

export interface VerificationItem {
  id: string;
  origin: ItemOrigin;
  status: VerificationStatus;
  criticality: Criticality;
  minStrength: EvidenceStrength;
  inspectable: boolean;
  evidenceIds: string[];
  findings: Finding[];
  acceptedRisk?: { at: ISO };
  questionAsked?: boolean;
}

export interface RegistryCheck {
  adapterId: string;
  isMock: boolean;
  plate: string;
  technical?: Partial<Pick<CarSpec, 'make' | 'model' | 'modelYear' | 'fuel' | 'co2GPerKm' | 'massKg'>>;
  inspection?: { lastDate: string; result: 'pass' | 'fail' | 'conditional'; nextDue: string; odometerKmAtLast?: number };
  tax?: { status: 'paid' | 'unpaid' | 'unknown' };
  ownership?: {
    ownerKind: 'private' | 'company' | 'finance_company' | 'unknown';
    holderDiffersFromOwner: boolean;
    ownerNameLocal?: string; // DEVICE ONLY
    ownersCount?: number;
  };
  vin?: string;
  fetchedAt: ISO;
}

export interface ChecklistItem {
  id: string;
  label: string;
  why: string;
  linkedItemIds: string[];
  result?: 'ok' | 'issue' | 'skipped';
}

export interface InspectionPlan {
  testDrive: ChecklistItem[];
  prePurchase: { recommended: boolean; reasons: string[]; focus: string[] };
}

export type ClauseKind =
  | 'parties'
  | 'vehicle_identity'
  | 'price_payment'
  | 'handover_time'
  | 'seller_assurance'
  | 'disputed_claim'
  | 'disclosed_defects'
  | 'documents_keys'
  | 'ownership_notification'
  | 'insurance_note';

export interface ContractClause {
  id: string;
  kind: ClauseKind;
  text: string;
  sourceItemIds: string[];
  included: boolean;
}

export type CaseStatus =
  | 'draft'
  | 'reviewing_claims'
  | 'checking'
  | 'inspecting'
  | 'contract_prep'
  | 'ready_to_buy'
  | 'walked_away'
  | 'bought'
  | 'insuring'
  | 'registered'
  | 'owned'
  | 'closed';

export type HandoffStatus = 'draft' | 'consented' | 'quote_received' | 'bound' | 'registered';

export interface InsuranceHandoff {
  isMock: boolean;
  payload: {
    plate: string;
    make: string;
    model: string;
    modelYear: number;
    purchaseDate: string;
    buyerAgeBand: AgeBand;
    firstTimeDriver: boolean;
    coverIntent: CoverIntent;
    deductible: Money;
    registrationRequested: boolean;
  };
  status: HandoffStatus;
  quoteMonthly?: Money;
  consentAt?: ISO;
  ownershipNotificationBy: ISO;
}

export interface PurchaseCase {
  id: string;
  country: Country;
  status: CaseStatus;
  version: number;
  listing: Listing;
  claims: SellerClaim[];
  items: VerificationItem[];
  evidence: Evidence[];
  registry?: RegistryCheck;
  testDriveDone: boolean;
  inspectionDone: boolean;
  /** The buyer chose to go on without a pre-purchase inspection; inspectable items stay open. */
  inspectionSkipped?: boolean;
  /** Last saved test-drive checklist answers, by checklist item id. */
  testDriveAnswers?: Record<string, 'ok' | 'issue'>;
  /** Demo partner booking for the pre-purchase inspection. */
  inspectionBooking?: { partner: string; date: ISO };
  clauses: ContractClause[];
  /** Last include/exclude choice per assurance clause id, kept while the clause is absent (item verified). */
  assuranceChoices?: Record<string, boolean>;
  decision?: { kind: 'buy' | 'walk_away'; at: ISO };
  handoff?: InsuranceHandoff;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface Reminder {
  id: string;
  kind: 'tyre_change' | 'inspection' | 'service' | 'insurance_renewal' | 'vehicle_tax';
  title: string;
  dueAt: ISO;
}
