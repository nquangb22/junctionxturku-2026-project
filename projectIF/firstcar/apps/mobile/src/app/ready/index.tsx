import { eur, formatEur, type AgeBand, type BuyerProfile, type CarSpec, type CoverIntent, type Density, type Money, type PaymentMethod, type Range } from '@firstcar/core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { carForCase, caseTitle } from '@/ui/case-helpers';
import { Badge, Button, Choice, Screen, Section, Txt } from '@/ui/primitives';

/** Typical first cars. Values are demo presets, labelled as such in the budget provenance. */
const CAR_PRESETS: Record<string, CarSpec> = {
  golf: { make: 'Volkswagen', model: 'Golf', modelYear: 2012, fuel: 'diesel', price: eur(6900), odometerKm: 180_000, hasWinterTyres: true, fieldProvenance: {} },
  corolla: { make: 'Toyota', model: 'Corolla', modelYear: 2014, fuel: 'petrol', price: eur(8400), odometerKm: 145_000, hasWinterTyres: true, fieldProvenance: {} },
  yaris: { make: 'Toyota', model: 'Yaris Hybrid', modelYear: 2018, fuel: 'hybrid', price: eur(12500), odometerKm: 90_000, hasWinterTyres: false, fieldProvenance: {} },
};

const INCOME: Record<string, Range<Money> | undefined> = {
  '<1500': { low: eur(1000), high: eur(1500) },
  '1500–2000': { low: eur(1500), high: eur(2000) },
  '2000–2500': { low: eur(2000), high: eur(2500) },
  '2500–3500': { low: eur(2500), high: eur(3500) },
  '3500+': { low: eur(3500), high: eur(5000) },
  skip: undefined,
};

const SAVINGS: Record<string, Range<Money> | undefined> = {
  '<500': { low: eur(0), high: eur(500) },
  '500–1500': { low: eur(500), high: eur(1500) },
  '1500–3000': { low: eur(1500), high: eur(3000) },
  '3000+': { low: eur(3000), high: eur(6000) },
  skip: undefined,
};

const OPEN_CASE = new Set(['reviewing_claims', 'checking', 'inspecting', 'contract_prep', 'ready_to_buy']);
const sameCar = (a?: CarSpec, b?: CarSpec) => !!a && !!b && a.make === b.make && a.model === b.model && a.modelYear === b.modelYear && a.price?.minor === b.price?.minor;

const bandKey = (table: Record<string, Range<Money> | undefined>, value?: Range<Money>) =>
  Object.entries(table).find(([, v]) => v && value && v.low.minor === value.low.minor)?.[0] ?? (value ? undefined : 'skip');

export default function ReadyInputs() {
  const { t, prefs } = useSession();
  const { data, patch } = useStore();
  const p = usePalette();
  // Where the flow was started from, so the result can send the user back there.
  const { from, caseId } = useLocalSearchParams<{ from?: string; caseId?: string }>();
  const prev = data.profile;

  // The user's own open cases come first, then the demo presets, then a custom price.
  const caseCars = data.cases
    .filter((c) => OPEN_CASE.has(c.status))
    .map((c) => ({ c, spec: carForCase(c) }))
    .filter((x): x is { c: (typeof data.cases)[number]; spec: CarSpec } => !!x.spec?.price);
  const initialCar = (): string | undefined => {
    const current = data.readinessCar;
    if (!current) return undefined;
    const fromCase = caseCars.find((x) => sameCar(x.spec, current));
    if (fromCase) return `case:${fromCase.c.id}`;
    const preset = Object.entries(CAR_PRESETS).find(([, c]) => sameCar(c, current));
    return preset ? preset[0] : 'other';
  };
  const [car, setCar] = useState<string | undefined>(initialCar);
  const [otherPrice, setOtherPrice] = useState(() => (car === 'other' && data.readinessCar?.price ? String(data.readinessCar.price.minor / 100) : ''));
  const otherEur = Number(otherPrice.replace(/\s/g, ''));
  const otherValid = Number.isFinite(otherEur) && otherEur >= 300 && otherEur <= 200_000;

  const resolveCar = (): CarSpec | undefined => {
    if (!car) return undefined;
    if (car.startsWith('case:')) return caseCars.find((x) => `case:${x.c.id}` === car)?.spec;
    // Custom price: other costs use a typical 10-year-old petrol car (team assumption, said on screen).
    if (car === 'other') return otherValid ? { make: t('ready.otherCar'), model: '', modelYear: new Date().getFullYear() - 10, fuel: 'petrol', price: eur(otherEur), fieldProvenance: {} } : undefined;
    return CAR_PRESETS[car];
  };
  const [density, setDensity] = useState<Density | undefined>(prev?.density);
  const [age, setAge] = useState<AgeBand | undefined>(prev?.ageBand);
  const [firstTime, setFirstTime] = useState<boolean | undefined>(prev?.firstTimeDriver);
  const [income, setIncome] = useState<string | undefined>(prev ? bandKey(INCOME, prev.netMonthlyIncome) : undefined);
  const [savings, setSavings] = useState<string | undefined>(prev ? bandKey(SAVINGS, prev.savings) : undefined);
  const [cover, setCover] = useState<CoverIntent>(prev?.coverIntent ?? 'liability_plus_partial');
  const [deductible, setDeductible] = useState<number>(prev ? prev.deductible.minor / 100 : 300);
  const [payment, setPayment] = useState<PaymentMethod | undefined>(prev?.payment);

  const complete = resolveCar() && density && age && firstTime !== undefined && income && savings && payment;

  const calculate = () => {
    if (!complete) return;
    const profile: BuyerProfile = {
      country: 'FI',
      locale: prefs.locale,
      density,
      ageBand: age,
      firstTimeDriver: firstTime,
      netMonthlyIncome: INCOME[income],
      savings: SAVINGS[savings],
      coverIntent: cover,
      deductible: eur(deductible),
      payment,
    };
    patch({ profile, readinessCar: resolveCar() });
    router.replace({ pathname: '/ready/result', params: from && caseId ? { from, caseId } : {} });
  };

  const bands = (table: Record<string, unknown>) => Object.keys(table).map((k) => ({ value: k, label: k === 'skip' ? t('common.skip') : `${k} €` }));

  return (
    <Screen footer={<Button label={t('ready.calculate')} onPress={calculate} disabled={!complete} />}>
      <Stack.Screen options={{ title: t('ready.title') }} />
      <Badge tone="success" icon="🔒" label={t('ready.privacy')} />

      <Section title={t('ready.car')}>
        <Choice
          label={t('ready.car')}
          value={car}
          onChange={setCar}
          options={[
            ...caseCars.map(({ c, spec }) => ({ value: `case:${c.id}`, label: t('ready.yourCase', { car: caseTitle(c), price: formatEur(spec.price!) }) })),
            ...Object.entries(CAR_PRESETS).map(([k, c]) => ({ value: k, label: `${c.make === 'Volkswagen' ? 'VW' : c.make} ${c.model} ${c.modelYear} · ${(c.price!.minor / 100).toLocaleString('fi-FI')} €` })),
            { value: 'other', label: t('ready.otherPrice') },
          ]}
        />
        {car === 'other' ? (
          <>
            <TextInput
              autoFocus
              value={otherPrice}
              onChangeText={setOtherPrice}
              keyboardType="number-pad"
              placeholder={t('ready.otherPriceInput')}
              placeholderTextColor={p.textSecondary}
              accessibilityLabel={t('ready.otherPriceInput')}
              maxLength={7}
              style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
            />
            <Txt variant="caption">{t('ready.otherCarNote')}</Txt>
          </>
        ) : null}
      </Section>
      <Section title={t('ready.region')}>
        <Choice label={t('ready.region')} value={density} onChange={setDensity} options={(['urban', 'suburban', 'rural'] as const).map((d) => ({ value: d, label: t(`density.${d}`) }))} />
      </Section>
      <Section title={t('ready.age')}>
        <Choice label={t('ready.age')} value={age} onChange={setAge} options={(['18-19', '20-25', '26-34', '35+'] as const).map((a) => ({ value: a, label: a }))} />
      </Section>
      <Section title={t('ready.firstTime')}>
        <Choice label={t('ready.firstTime')} value={firstTime} onChange={setFirstTime} options={[{ value: true, label: t('common.yes') }, { value: false, label: t('common.no') }]} />
      </Section>
      <Section title={t('ready.income')}>
        <Choice label={t('ready.income')} value={income} onChange={setIncome} options={bands(INCOME)} />
      </Section>
      <Section title={t('ready.savings')}>
        <Choice label={t('ready.savings')} value={savings} onChange={setSavings} options={bands(SAVINGS)} />
      </Section>
      <Section title={t('ready.payment')}>
        <Choice label={t('ready.payment')} value={payment} onChange={setPayment} options={(['savings', 'loan', 'unsure'] as const).map((m) => ({ value: m, label: t(`payment.${m}`) }))} />
      </Section>
      <Section title={t('ready.cover')}>
        <Choice
          label={t('ready.cover')}
          value={cover}
          onChange={setCover}
          options={(['liability_only', 'liability_plus_partial', 'liability_plus_comprehensive'] as const).map((c) => ({ value: c, label: t(`cover.${c}`) }))}
        />
      </Section>
      <Section title={t('ready.deductible')}>
        <Choice label={t('ready.deductible')} value={deductible} onChange={setDeductible} options={[150, 300, 500].map((d) => ({ value: d, label: `${d} €` }))} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 18 },
});
