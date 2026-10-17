# Move-In Check

A first-week companion for people moving home, built on If's own data. Junction hackathon, If P&C Insurance challenge.

When an If customer reports an address change, Move-In Check opens with their profile prefilled from the policy. It shows a risk card comparing the old and new home (physical perils only, from If's aggregated claim statistics), a timeline checklist, and a cover check with one-tap policy update. The user builds a sealed move-in baseline (photos stay on their phone) that settles "was this pre-existing?" at claim time. Non-customers can buy a one-time Move Pass.

- Architecture: [docs/architecture.md](docs/architecture.md)
- Stack: React Native (Expo) + Supabase (EU region)
- Status: design only, no code yet. All If data in the demo is synthetic.
