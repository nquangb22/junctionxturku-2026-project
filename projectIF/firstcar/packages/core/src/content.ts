/**
 * FI content pack (§4.1, §6.2). Rule data and texts only; the engine reads it.
 * Values marked `assumption: true` or "demo value" are team placeholders that must be
 * verified before a pitch: they are shown in the UI as estimates.
 */
import type {
  ClaimType,
  Criticality,
  EvidenceKind,
  EvidenceStrength,
  FindingCode,
  Locale,
  MandatoryCheckId,
} from './types';

export const CONTENT_PACK_VERSION = 'fi-2026.10-demo';

export interface ClaimRule {
  criticality: Criticality;
  minStrength: EvidenceStrength;
  inspectable: boolean; // can a professional settle it?
  createsItem: boolean;
}

export const CLAIM_RULES: Record<ClaimType, ClaimRule> = {
  odometer: { criticality: 'critical', minStrength: 'official', inspectable: false, createsItem: true },
  model_year: { criticality: 'important', minStrength: 'official', inspectable: false, createsItem: true },
  first_registration: { criticality: 'important', minStrength: 'official', inspectable: false, createsItem: true },
  owners_count: { criticality: 'important', minStrength: 'official', inspectable: false, createsItem: true },
  imported: { criticality: 'important', minStrength: 'official', inspectable: false, createsItem: true },
  service_history: { criticality: 'important', minStrength: 'document', inspectable: false, createsItem: true },
  timing_belt: { criticality: 'critical', minStrength: 'document', inspectable: true, createsItem: true },
  clutch: { criticality: 'important', minStrength: 'document', inspectable: true, createsItem: true },
  recent_repair: { criticality: 'important', minStrength: 'document', inspectable: true, createsItem: true },
  inspection_valid: { criticality: 'critical', minStrength: 'official', inspectable: false, createsItem: true },
  no_rust: { criticality: 'critical', minStrength: 'professional', inspectable: true, createsItem: true },
  no_accidents: { criticality: 'critical', minStrength: 'professional', inspectable: true, createsItem: true },
  tyres_included: { criticality: 'minor', minStrength: 'observed', inspectable: false, createsItem: true },
  keys_count: { criticality: 'minor', minStrength: 'observed', inspectable: false, createsItem: true },
  known_defects: { criticality: 'important', minStrength: 'observed', inspectable: true, createsItem: true },
  seller_situation: { criticality: 'critical', minStrength: 'official', inspectable: false, createsItem: true },
  price: { criticality: 'minor', minStrength: 'observed', inspectable: false, createsItem: false },
  other: { criticality: 'minor', minStrength: 'observed', inspectable: false, createsItem: true },
};

export interface MandatoryRule {
  checkId: MandatoryCheckId;
  criticality: Criticality;
  minStrength: EvidenceStrength;
}

export const MANDATORY_CHECKS: MandatoryRule[] = [
  { checkId: 'owner_matches_seller', criticality: 'critical', minStrength: 'official' },
  { checkId: 'not_finance_owned', criticality: 'critical', minStrength: 'official' },
  { checkId: 'vehicle_tax_paid', criticality: 'critical', minStrength: 'official' },
  { checkId: 'inspection_valid', criticality: 'critical', minStrength: 'official' },
  { checkId: 'vin_matches', criticality: 'critical', minStrength: 'observed' },
  { checkId: 'safe_payment', criticality: 'important', minStrength: 'observed' },
];

export const STRENGTH_RANK: Record<EvidenceStrength, number> = {
  seller_statement: 0,
  observed: 1,
  document: 2,
  professional: 3,
  official: 4,
};

export const EVIDENCE_STRENGTH: Record<EvidenceKind, EvidenceStrength> = {
  registry_result: 'official',
  inspection_report: 'professional',
  service_record: 'document',
  receipt: 'document',
  photo: 'observed',
  test_drive_note: 'observed',
  seller_message: 'seller_statement',
};

/** Model notes (§4.1 rule 4). Belt intervals are DEMO VALUES: verify with the manufacturer. */
export interface ModelNote {
  make: string;
  model: string;
  hasTimingBelt: boolean;
  beltIntervalKm?: number;
  beltJobEur?: number;
  isDemoValue: true;
}

export const MODEL_NOTES: ModelNote[] = [
  { make: 'volkswagen', model: 'golf', hasTimingBelt: true, beltIntervalKm: 120_000, beltJobEur: 800, isDemoValue: true },
  { make: 'skoda', model: 'octavia', hasTimingBelt: true, beltIntervalKm: 120_000, beltJobEur: 750, isDemoValue: true },
  { make: 'toyota', model: 'corolla', hasTimingBelt: false, isDemoValue: true },
  { make: 'toyota', model: 'yaris', hasTimingBelt: false, isDemoValue: true },
];

export function findModelNote(make?: string, model?: string): ModelNote | undefined {
  if (!make || !model) return undefined;
  const mk = normaliseMake(make);
  const md = model.toLowerCase();
  return MODEL_NOTES.find((n) => n.make === mk && md.includes(n.model));
}

export function normaliseMake(make: string): string {
  const m = make.toLowerCase().trim();
  return m === 'vw' ? 'volkswagen' : m;
}

/* ---------- Texts ---------- */

type Texts = Record<Locale, string>;

export const CLAIM_TITLES: Record<ClaimType, Texts> = {
  odometer: { en: 'Mileage', fi: 'Mittarilukema' },
  model_year: { en: 'Model year', fi: 'Vuosimalli' },
  first_registration: { en: 'First registration', fi: 'Ensirekisteröinti' },
  owners_count: { en: 'Number of owners', fi: 'Omistajien määrä' },
  imported: { en: 'Imported car', fi: 'Tuontiauto' },
  service_history: { en: 'Service history', fi: 'Huoltohistoria' },
  timing_belt: { en: 'Timing belt replaced', fi: 'Jakohihna vaihdettu' },
  clutch: { en: 'Clutch replaced', fi: 'Kytkin uusittu' },
  recent_repair: { en: 'Recent repair', fi: 'Tuore korjaus' },
  inspection_valid: { en: 'Inspection valid', fi: 'Katsastus voimassa' },
  no_rust: { en: 'No rust', fi: 'Ei ruostetta' },
  no_accidents: { en: 'No accidents', fi: 'Kolariton' },
  tyres_included: { en: 'Winter tyres included', fi: 'Talvirenkaat mukana' },
  keys_count: { en: 'Number of keys', fi: 'Avainten määrä' },
  known_defects: { en: 'Known defects', fi: 'Tunnetut viat' },
  seller_situation: { en: 'Seller situation', fi: 'Myyjän tilanne' },
  price: { en: 'Price', fi: 'Hinta' },
  other: { en: 'Other claim', fi: 'Muu väite' },
};

export const MANDATORY_TITLES: Record<MandatoryCheckId, Texts> = {
  owner_matches_seller: { en: 'Seller is the registered owner', fi: 'Myyjä on rekisteröity omistaja' },
  not_finance_owned: { en: 'Not owned by a finance company', fi: 'Ei rahoitusyhtiön omistuksessa' },
  vehicle_tax_paid: { en: 'Vehicle tax paid', fi: 'Ajoneuvovero maksettu' },
  inspection_valid: { en: 'Inspection valid', fi: 'Katsastus voimassa' },
  vin_matches: { en: 'VIN on the car matches the papers', fi: 'Valmistenumero täsmää papereihin' },
  safe_payment: { en: 'Safe payment (no prepayment before viewing)', fi: 'Turvallinen maksu (ei ennakkomaksua)' },
};

export const SCENARIO_ITEM_TITLES: Record<string, Texts> = {
  belt_history_missing: { en: 'Timing belt history (not in the ad)', fi: 'Jakohihnan vaihtohistoria (ei mainittu)' },
  service_history_missing: { en: 'Service history (not in the ad)', fi: 'Huoltohistoria (ei mainittu)' },
};

/** Finding texts. {param} placeholders are filled by renderTemplate(). */
export const FINDING_TEXTS: Record<FindingCode, Texts> = {
  odometer_rollback: {
    en: 'The ad says {adKm}. At its inspection on {date} the odometer read {regKm}.',
    fi: 'Ilmoituksessa lukee {adKm}. Katsastuksessa {date} mittarilukema oli {regKm}.',
  },
  odometer_consistent: {
    en: 'Consistent with the registry ({regKm} at inspection on {date}).',
    fi: 'Vastaa rekisteriä ({regKm} katsastuksessa {date}).',
  },
  owners_mismatch: {
    en: 'The ad says {adOwners} owner(s); the registry shows {regOwners}.',
    fi: 'Ilmoituksen mukaan omistajia {adOwners}, rekisterin mukaan {regOwners}.',
  },
  year_mismatch: {
    en: 'The ad says model year {adYear}; the registry says {regYear}.',
    fi: 'Ilmoituksen vuosimalli {adYear}, rekisterin mukaan {regYear}.',
  },
  inspection_expired: {
    en: 'Inspection is not valid (last result: {result}, next due {nextDue}).',
    fi: 'Katsastus ei ole voimassa (viimeisin tulos: {result}, seuraava {nextDue}).',
  },
  tax_unpaid: {
    en: 'Vehicle tax is unpaid. Unpaid tax blocks driving and can pass to the new owner.',
    fi: 'Ajoneuvovero on maksamatta. Maksamaton vero estää ajoneuvon käytön.',
  },
  finance_owner: {
    en: 'The registered owner is a finance company. The seller may not be able to transfer ownership. Do not buy until resolved.',
    fi: 'Omistaja on rahoitusyhtiö. Myyjä ei välttämättä voi luovuttaa omistusta. Älä osta ennen kuin asia on selvitetty.',
  },
  owner_not_seller: {
    en: 'The name on the seller\'s ID does not match the registered owner. Do not buy until resolved.',
    fi: 'Myyjän henkilöllisyystodistuksen nimi ei vastaa rekisteröityä omistajaa. Älä osta ennen kuin asia on selvitetty.',
  },
  vin_mismatch: {
    en: 'The VIN on the car does not match the papers. Do not buy.',
    fi: 'Auton valmistenumero ei vastaa papereita. Älä osta.',
  },
  scam_pattern: {
    en: 'This looks like a known scam pattern ("{quote}"). Never pay before you have seen the car and its papers.',
    fi: 'Tämä muistuttaa tunnettua huijausta ("{quote}"). Älä koskaan maksa ennen kuin olet nähnyt auton ja paperit.',
  },
  injection_text: {
    en: 'This ad contains text aimed at automated tools. It changes nothing here: only documents, the registry or an inspector can verify.',
    fi: 'Ilmoituksessa on automaattisille työkaluille suunnattua tekstiä. Se ei muuta mitään: vain asiakirjat, rekisteri tai tarkastaja voivat vahvistaa.',
  },
  belt_due: {
    en: 'Belt due again: changed at {beltKm}, interval {intervalKm} (demo value), the car has done {currentKm}. Budget about {cost}.',
    fi: 'Jakohihna on taas vaihdettava: vaihdettu {beltKm}, väli {intervalKm} (demoarvo), nyt ajettu {currentKm}. Varaa noin {cost}.',
  },
  unsafe_payment: {
    en: 'The seller asks for payment before viewing. Do not pay.',
    fi: 'Myyjä pyytää maksua ennen näyttöä. Älä maksa.',
  },
  evidence_contradicts: {
    en: 'New evidence contradicts this claim.',
    fi: 'Uusi näyttö on ristiriidassa väitteen kanssa.',
  },
};

export function renderTemplate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => String(params[key] ?? `{${key}}`));
}

/** Seller-question templates per claim type. Seller text is always Finnish for FI. */
export const QUESTION_TEMPLATES: Partial<Record<ClaimType | MandatoryCheckId | 'odometer_rollback' | 'belt_history_missing' | 'service_history_missing', Texts>> = {
  odometer: {
    en: 'Can you show the service book or inspection records that confirm the mileage?',
    fi: 'Voitko näyttää huoltokirjan tai katsastustiedot, jotka vahvistavat mittarilukeman?',
  },
  odometer_rollback: {
    en: 'The registry shows {regKm} at the {date} inspection. Your ad says {adKm}. Can you explain the difference?',
    fi: 'Rekisterin mukaan mittarilukema oli {regKm} katsastuksessa {date}. Ilmoituksessasi lukee {adKm}. Voitko selittää eron?',
  },
  timing_belt: {
    en: 'Do you have the receipt for the timing belt change, with the date and mileage?',
    fi: 'Onko sinulla kuitti jakohihnan vaihdosta, jossa näkyy päivämäärä ja kilometrit?',
  },
  belt_history_missing: {
    en: 'When was the timing belt last replaced? Is there a receipt?',
    fi: 'Milloin jakohihna on viimeksi vaihdettu? Onko siitä kuittia?',
  },
  service_history: {
    en: 'Can I see the service book or the digital service history?',
    fi: 'Voinko nähdä huoltokirjan tai digitaalisen huoltohistorian?',
  },
  service_history_missing: {
    en: 'Has the car been serviced regularly? Can I see the records?',
    fi: 'Onko autoa huollettu säännöllisesti? Voinko nähdä huoltotiedot?',
  },
  clutch: {
    en: 'Do you have the receipt for the clutch replacement?',
    fi: 'Onko sinulla kuitti kytkimen uusimisesta?',
  },
  no_rust: {
    en: 'Would you agree to a pre-purchase inspection at an inspection station?',
    fi: 'Sopiiko, että auto käy kuntotarkastuksessa ennen kauppaa?',
  },
  no_accidents: {
    en: 'Has the car ever been in a collision or repaired after one? Would you put that in writing in the contract?',
    fi: 'Onko auto ollut kolarissa tai korjattu kolarin jälkeen? Voitko vahvistaa sen kirjallisesti kauppakirjaan?',
  },
  owners_count: {
    en: 'How many owners has the car had? The registry shows a different number.',
    fi: 'Montako omistajaa autolla on ollut? Rekisterissä näkyy eri määrä.',
  },
  tyres_included: {
    en: 'Are the winter tyres included, and how old are they?',
    fi: 'Kuuluvatko talvirenkaat kauppaan ja minkä ikäiset ne ovat?',
  },
  keys_count: {
    en: 'How many keys come with the car?',
    fi: 'Montako avainta autoon kuuluu?',
  },
  owner_matches_seller: {
    en: 'Can you show your ID when we meet, so I can check it matches the registered owner?',
    fi: 'Voitko näyttää henkilöllisyystodistuksen tavatessamme, jotta voin tarkistaa omistajatiedot?',
  },
  vehicle_tax_paid: {
    en: 'Is the vehicle tax paid up to date?',
    fi: 'Onko ajoneuvovero maksettu ajan tasalle?',
  },
  not_finance_owned: {
    en: 'Is there any loan or finance on the car? Who is the registered owner?',
    fi: 'Onko autossa lainaa tai rahoitusta? Kuka on rekisteröity omistaja?',
  },
  inspection_valid: {
    en: 'When was the last inspection and when is the next one due?',
    fi: 'Milloin auto on viimeksi katsastettu ja milloin seuraava katsastus on?',
  },
};

/** Contract clause templates (Traficom/KKV checklist style ⚠️ to verify). */
export const CLAUSE_TEXTS: Record<'parties' | 'vehicle_identity' | 'price_payment' | 'handover_time' | 'documents_keys' | 'ownership_notification' | 'insurance_note', Texts> = {
  parties: {
    en: 'Seller: ______ (registered owner). Buyer: ______.',
    fi: 'Myyjä: ______ (rekisteröity omistaja). Ostaja: ______.',
  },
  vehicle_identity: {
    en: 'Vehicle: {car}, registration {plate}, VIN ______, odometer at handover ______ km.',
    fi: 'Ajoneuvo: {car}, rekisterinumero {plate}, valmistenumero ______, mittarilukema luovutettaessa ______ km.',
  },
  price_payment: {
    en: 'Price {price}, paid by bank transfer at handover. No payment before the buyer has seen the car and its papers.',
    fi: 'Kauppahinta {price}, maksetaan tilisiirtona luovutuksen yhteydessä. Ei maksuja ennen kuin ostaja on nähnyt auton ja paperit.',
  },
  handover_time: {
    en: 'Handover date and time: ______. Risk and responsibility pass to the buyer at this moment.',
    fi: 'Luovutuspäivä ja -aika: ______. Vastuu autosta siirtyy ostajalle tällä hetkellä.',
  },
  documents_keys: {
    en: 'Handed over: registration certificate, service book, {keys} key(s).',
    fi: 'Luovutetaan: rekisteröintitodistus, huoltokirja, {keys} avainta.',
  },
  ownership_notification: {
    en: 'The buyer files the ownership change with Traficom within 7 days ⚠️. The seller files a transfer notice.',
    fi: 'Ostaja tekee omistajanvaihdosilmoituksen Traficomiin 7 päivän kuluessa ⚠️. Myyjä tekee luovutusilmoituksen.',
  },
  insurance_note: {
    en: 'The buyer arranges motor liability insurance before driving the car.',
    fi: 'Ostaja hankkii liikennevakuutuksen ennen kuin ajaa autolla.',
  },
};

export const ASSURANCE_TEXT: Texts = {
  en: 'Seller assures that this is true: “{quote}” ({claim}). If it proves untrue, the buyer may claim a price reduction or cancel the sale.',
  fi: 'Myyjä vakuuttaa tämän pitävän paikkansa: ”{quote}” ({claim}). Jos se osoittautuu vääräksi, ostaja voi vaatia hinnanalennusta tai purkaa kaupan.',
};

export const DISCLOSED_DEFECTS_TEXT: Texts = {
  en: 'Defects disclosed by the seller and accepted by the buyer: {defects}.',
  fi: 'Myyjän ilmoittamat ja ostajan hyväksymät viat: {defects}.',
};

export const CONTRACT_DISCLAIMER: Texts = {
  en: 'Checklist-based draft, not legal advice. Private sales fall under the Sale of Goods Act ⚠️.',
  fi: 'Tarkistuslistaan perustuva luonnos, ei oikeudellinen neuvo. Yksityiskauppaan sovelletaan kauppalakia ⚠️.',
};
