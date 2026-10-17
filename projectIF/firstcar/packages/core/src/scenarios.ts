/**
 * Part A risk scenarios (§6.3). Statistics are NEVER invented: the norauto relativity stays
 * `status: 'pending'` with `value: null` until data-pipeline/compute_stats.py produces it.
 * Paste the computed value into STATS below (with its CI and n) once it exists.
 */
import type { BuyerProfile, CarSpec, EvidenceStat, Locale, RiskScenario } from './types';

export const STATS: Record<'young_driver_freq' | 'team_parking' | 'team_belt' | 'team_buffer', EvidenceStat> = {
  young_driver_freq: {
    metric: 'claim_freq_relativity',
    value: null,
    status: 'pending',
    sourceId: 'casdatasets.norauto',
    sourceLabel: 'Anonymised Norwegian insurer data (CASdatasets norauto, ~184 000 policies)',
    caveat: 'Older, non-Finnish data: a comparison, not your price.',
  },
  team_parking: {
    metric: 'team_curated',
    value: null,
    status: 'pending',
    sourceId: 'team-curated',
    sourceLabel: 'Team-curated, source pending',
    caveat: 'No statistic yet. Shown as general advice.',
  },
  team_belt: {
    metric: 'team_curated',
    value: null,
    status: 'pending',
    sourceId: 'model-notes-demo',
    sourceLabel: 'Manufacturer service interval (demo value)',
    caveat: 'Verify the interval for the exact engine.',
  },
  team_buffer: {
    metric: 'team_curated',
    value: null,
    status: 'pending',
    sourceId: 'team-curated',
    sourceLabel: 'Team-curated, source pending',
    caveat: 'General guidance.',
  },
};

interface ScenarioDef {
  id: string;
  category: RiskScenario['category'];
  severity: RiskScenario['severity'];
  relevanceWeight: number;
  appliesWhen: (p: BuyerProfile, car?: CarSpec) => boolean;
  stat: EvidenceStat;
  text: Record<Locale, { title: string; body: string; actions: string[] }>;
  linksToChecklist?: string[];
}

const SCENARIOS: ScenarioDef[] = [
  {
    id: 'young_driver_claims',
    category: 'driving_claim',
    severity: 3,
    relevanceWeight: 1,
    appliesWhen: (p) => p.ageBand === '18-19' || p.ageBand === '20-25' || p.firstTimeDriver,
    stat: STATS.young_driver_freq,
    text: {
      en: {
        title: 'Young drivers claim more often',
        body: 'Drivers under 26 make insurance claims more often than older drivers, mostly small collisions in the first years.',
        actions: ['Keep the deductible in your savings buffer', 'Consider parking sensors or a rear camera'],
      },
      fi: {
        title: 'Nuoret kuljettajat tekevät enemmän vahinkoilmoituksia',
        body: 'Alle 26-vuotiaat tekevät vahinkoilmoituksia useammin kuin vanhemmat kuljettajat, useimmiten pieniä kolhuja ensimmäisinä vuosina.',
        actions: ['Pidä omavastuun verran säästöjä', 'Harkitse pysäköintitutkaa tai peruutuskameraa'],
      },
    },
  },
  {
    id: 'parking_damage',
    category: 'driving_claim',
    severity: 2,
    relevanceWeight: 0.8,
    appliesWhen: (p) => p.density === 'urban',
    stat: STATS.team_parking,
    text: {
      en: { title: 'Parking damage in the city', body: 'Tight city parking means scrapes and dents. Small damages add up when you pay them yourself.', actions: ['Choose the deductible you can actually pay', 'Photograph the car when you buy it'] },
      fi: { title: 'Pysäköintivauriot kaupungissa', body: 'Ahtaissa pysäköintipaikoissa tulee naarmuja ja lommoja. Pienet vahingot kasvavat, kun maksat ne itse.', actions: ['Valitse omavastuu, jonka pystyt oikeasti maksamaan', 'Kuvaa auto ostohetkellä'] },
    },
  },
  {
    id: 'timing_belt',
    category: 'mechanical',
    severity: 3,
    relevanceWeight: 0.9,
    appliesWhen: (_p, car) => !!car && car.fuel !== 'ev' && (car.odometerKm ?? 0) > 100_000,
    stat: STATS.team_belt,
    linksToChecklist: ['belt_history_missing'],
    text: {
      en: { title: 'Timing belt on high-mileage cars', body: 'Many engines need a new timing belt at a fixed interval. A snapped belt can destroy the engine.', actions: ['Ask for the belt receipt with date and mileage', 'Budget for the job if it is due'] },
      fi: { title: 'Jakohihna paljon ajetuissa autoissa', body: 'Monessa moottorissa jakohihna vaihdetaan tietyin välein. Katkennut hihna voi rikkoa moottorin.', actions: ['Pyydä hihnanvaihdon kuitti, jossa päivä ja kilometrit', 'Varaa rahaa vaihtoon, jos se on edessä'] },
    },
  },
  {
    id: 'no_buffer',
    category: 'financial',
    severity: 2,
    relevanceWeight: 0.7,
    appliesWhen: (p) => !p.savings || p.savings.high.minor < 100_000,
    stat: STATS.team_buffer,
    text: {
      en: { title: 'Repairs arrive without warning', body: 'Older cars need unplanned repairs. Without a buffer, one repair can mean a loan.', actions: ['Build the buffer before buying', 'Pick a cheaper car to keep money aside'] },
      fi: { title: 'Korjaukset tulevat yllättäen', body: 'Vanhemmat autot tarvitsevat odottamattomia korjauksia. Ilman puskuria yksi korjaus voi tarkoittaa lainaa.', actions: ['Kerää puskuri ennen ostoa', 'Valitse halvempi auto ja pidä rahaa sivussa'] },
    },
  },
];

/** Filter by appliesWhen, rank by severity × weight, at most one per category, max 3 (§6.3). */
export function selectScenarios(profile: BuyerProfile, car: CarSpec | undefined, locale: Locale): RiskScenario[] {
  const ranked = SCENARIOS.filter((s) => s.appliesWhen(profile, car)).sort((a, b) => b.severity * b.relevanceWeight - a.severity * a.relevanceWeight);
  const picked: ScenarioDef[] = [];
  for (const s of ranked) {
    if (picked.length < 3 && !picked.some((p) => p.category === s.category)) picked.push(s);
  }
  return picked.map((s) => ({
    id: s.id,
    category: s.category,
    severity: s.severity,
    relevanceWeight: s.relevanceWeight,
    title: s.text[locale].title,
    body: s.text[locale].body,
    actions: s.text[locale].actions,
    stat: s.stat,
    linksToChecklist: s.linksToChecklist,
  }));
}
