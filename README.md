# Trip Rescue

> **When one booking breaks, fix the whole trip.**
> Built by **Team Peanutss** for SingHacks 2026 — Ripple Challenge 2.

**Team:** Javerine Tan · Min Xie

Travel providers understand their booking. Trip Rescue understands your trip.

## The problem

Independent travellers assemble one trip from many unrelated providers — airline,
airport bus, hotel, rental car, activity. Those bookings are purchased
independently but are **operationally dependent** on each other:

```
Flight arrival → airport bus → hotel check-in → rental pickup → next-day activity
```

When the flight is cancelled, the traveller becomes the integration layer. They
have to work out which downstream reservations are now impossible, which are
merely at risk, which can still be refunded, which cancellation deadlines are
about to expire, and what should be secured *before* anything is cancelled — all
while prices and availability keep moving.

Each provider sees only its own booking. Nobody sees the trip.

## What we are building

**V1 trigger:** a confirmed flight cancellation.

1. **Trip graph** — the traveller's bookings, modelled with their time and
   dependency constraints.
2. **Cascade reasoning** — traverse the graph to mark what is broken,
   at risk, or unaffected.
3. **Recovery strategies** — generate complete whole-trip plans (fastest /
   cheapest / most reliable), not just replacement flights.
4. **Rescue Mandate** — the traveller picks a strategy, which becomes a bounded
   authorisation: max additional spend, arrival deadline, hard constraints.
5. **Bounded execution** — inside the mandate the agent discovers services,
   pays for what it needs over x402, and settles on the XRP Ledger. Outside the
   mandate it stops and comes back to the traveller.

Strategic human control, tactical agent autonomy.

## Status

Early. The XRPL payment layer works and is carried over from an earlier
prototype; the travel domain logic is not built yet.

| Component | State |
| --- | --- |
| XRPL payment engine (`server/xrpl.js`) | ✅ prepare / sign / submit / verify, Testnet |
| Wallet setup (`scripts/setup-wallets.js`) | ✅ generates and funds Testnet wallets |
| API + web scaffold | ✅ boots, health check only |
| Trip graph, cascade, strategies, mandate | ⬜ not started |

## Setup

Requires Node 18+.

```bash
npm install
cp .env.example .env
npm run wallet:setup    # creates and funds two Testnet wallets, writes seeds to .env
npm run dev             # api on :8787, web on :5173
```

Verify the API and wallets:

```bash
curl http://localhost:8787/api/health
```

`npm run check` runs the typecheck and unit tests.

> `.env` holds XRPL Testnet seeds and is gitignored. Never commit it, and never
> put Mainnet keys in it.

## Repo layout

```
server/xrpl.js        XRPL payment engine (Testnet)
server/index.js       Express API
src/                  React + Vite front end
scripts/              wallet setup
skills/               xrpl-agentic-resources agent skill
hook/                 XRPL builder-feedback hook (see below)
BUILDER_FEEDBACK.md   XRPL developer feedback collected during the build
```

## Builder feedback hook

The hackathon feedback hook is installed project-scoped in
`.claude/settings.json` and `.codex/hooks.json`. Team and hacker names live in
`~/.xrpl-feedback-hook.json` — each teammate runs this once after cloning:

```bash
TEAM_NAME="Peanutss" HACKER_NAME="<your name>" node hook/setup.mjs --non-interactive
```

## Agent skill

```bash
bash skills/install.sh
```

On Windows, git checks the symlinks out as plain text files. Copy the folder
into `.claude/skills/` instead.

## History

An earlier idea, **ClearSpend** (an autonomous due-diligence buyer), is preserved
on the `archive/clearspend` branch. Trip Rescue reuses its XRPL payment layer.
