# My First Car (Ensimmäinen autoni)

Ownership readiness plus a used-car purchase-safety guide for first-time buyers. Junction hackathon, If P&C Insurance challenge.

- **Part A, Readiness:** five taps give a verdict ("23 % of your take-home: manageable"), a monthly budget, risk scenarios and a savings buffer tied to the deductible.
- **Part B, Purchase case (main focus):** paste a used-car ad. The app extracts each seller claim, checks the registry, and keeps one verification ledger (verified / not verified / needs inspection) through test drive, inspection and written contract. The AI only proposes claims; only documents, the registry or an inspector can verify them. When the user buys, it hands off to motor liability insurance and registration.

Architecture: [docs/architecture.md](docs/architecture.md)

## Layout

```
firstcar/
├─ packages/core/     Pure TypeScript engine, zero runtime deps: types, redaction, rule extractor,
│                     LLM-output validation, ledger, case state machine, gate, generators,
│                     budget, scenarios, reminders, demo fixtures. 61 Vitest tests.
└─ apps/mobile/       Expo SDK 58 app (expo-router): encrypted vault + biometric lock,
                      Part A screens, Part B case flow, insurance hand-off, My car, settings.
```

## Run

```bash
npm install                      # from firstcar/ (npm workspaces)
npm test                         # core engine tests
cd apps/mobile
npx expo start                   # scan with Expo Go, or press w for web
npx tsc --noEmit && npx eslint src
```

Face ID needs a development build (`npx expo run:ios` or `eas build --profile development`); Expo Go and Android fingerprint work as-is. On web the vault is unencrypted localStorage (demo only) and there is no lock.

## Demo path

Settings → demo menu keeps **Mock AI extraction** on (no API cost). Home → *Check a car ad* → demo ad **VW Golf 2012 (odometer story)** → confirm claims → Registry `ABC-123` → the mileage turns red (180 000 km in the ad vs 212 400 km at inspection), the timing belt becomes due, and the per-car budget gets the belt job. Other demo plates: `XYZ-789` (clean), `FIN-456` (finance-company owner), `GHI-321` (unpaid tax), `GOL-777` (injection ad).

## Status

| Real | Mocked / pending |
|---|---|
| Rule extractor + redaction on device, LLM-output validation (schema, clamps, quote grounding) | LLM: fixture output for demo ads (`llm-mock`); Supabase `extract-claims` + Haiku not wired yet |
| Ledger, case machine, gate, questions (en + fi), contract, inspection plan | Traficom registry (`traficom-mock`, 5 plates) |
| AES-256-GCM vault, key in SecureStore, biometric lock + relock after 5 min | If quote / bind / registration (`if-mock`) |
| Budget engine, scenarios, deductible trade-off, local reminders | All budget figures are labelled team assumptions ⚠️; the norauto statistic is **pending** (never invented) |
