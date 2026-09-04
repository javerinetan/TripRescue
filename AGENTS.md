# TripRescue agent instructions

Before planning or changing code, read:

1. `docs/BUILD_PLAN.md`
2. `docs/API_CONTRACT.md`

These files are the product and integration source of truth.

- Do not expand V1 beyond the documented demo scope.
- Do not rename shared fields or endpoints without updating `docs/API_CONTRACT.md` in the same pull request and coordinating with both owners.
- Respect the ownership boundaries in `docs/BUILD_PLAN.md`.
- Use deterministic code for constraints, money, sequencing, and payment policy. AI may interpret or explain, but it must not bypass these checks.
- Never expose wallet seeds or commit `.env`.
- Before declaring a change complete, run `npm run check` and `npm run build`.
- Keep commits and pull requests small; each should leave `main` runnable.

