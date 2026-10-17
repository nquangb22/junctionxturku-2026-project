# My First Car (Ensimmäinen autoni)

Ownership readiness plus a used-car purchase-safety guide for first-time buyers. Junction hackathon, If P&C Insurance challenge.

- **Part A, Readiness:** five taps give a verdict ("28% of your take-home: tight"), a realistic monthly budget, evidence-based risk scenarios (from open Nordic motor-claims datasets) and a savings buffer tied to the deductible.
- **Part B, Purchase case (main focus):** paste a used-car ad. The app extracts each seller claim, generates questions for the seller, checks the registry, and keeps one verification ledger (verified / not verified / needs inspection) through test drive, inspection and written contract. The AI only proposes claims; only documents, the registry or an inspector can verify them. When the user decides to buy, it hands off to motor liability insurance and registration.

- Architecture: [docs/architecture.md](docs/architecture.md)
- Stack: React Native (Expo) + Supabase (EU region)
- Status: design only, no code yet. Registry and If hand-off are mocked in the demo.
