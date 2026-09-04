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

The deterministic recovery engine and complete XRPL Testnet commercial loop are
working. The remaining product work is to connect the recovery/cascade views and
safe agent selector to the existing payment journey, then complete the live
model integration and submission materials.

| Component | State |
| --- | --- |
| XRPL payment engine (`server/xrpl.js`) | ✅ prepare / sign / submit / verify, Testnet |
| Wallet setup (`scripts/setup-wallets.js`) | ✅ generates and funds Testnet wallets |
| Trip graph and cascade analysis (`server/recovery.js`) | ✅ dependency-aware fixed demo |
| Recovery strategies and Rescue Mandate | ✅ deterministic policy checks |
| Safe agent offer selection (`server/agent.js`) | ✅ injectable ranker with fail-safe fallback |
| x402 supplier and gated delivery | ✅ HTTP 402 → settlement → verified delivery |
| Payment journey UI | ✅ discovery, mandate, transaction and receipt flow |
| Full recovery UI and live model ranker | 🚧 integration remaining |

## Verified XRPL Testnet transaction

The complete demo was executed successfully on 5 September 2026:

- HTTP `402 Payment Required` with `PAYMENT-REQUIRED` challenge.
- Agent mandate check and signed XRPL payment intent.
- **0.048 XRP** settled to the simulated supplier.
- Supplier verified settlement before releasing reservation hold `TR-HOLD-001`.
- Replaying the same idempotency key returned the original transaction rather
  than paying twice.
- A supplier outside the mandate allow-list was rejected with HTTP `403`.

Transaction:
[8023CA6299565EA545843AF58568E19C1AE4AE3A57D9EAEC8862618966EF800B](https://testnet.xrpl.org/transactions/8023CA6299565EA545843AF58568E19C1AE4AE3A57D9EAEC8862618966EF800B)

## Architecture

```text
Cancelled flight + trip dependency graph
  -> deterministic cascade analysis
  -> three whole-trip recovery strategies
  -> user-authorized Rescue Mandate
  -> deterministic offer-policy filter
  -> AI ranker sees compliant offers only
  -> supplier returns HTTP 402 challenge
  -> XRPL Testnet settlement
  -> supplier verifies receipt
  -> reservation hold and audit receipt delivered
```

Money, deadlines, dependencies, action ordering, supplier permissions and
payment verification are deterministic. AI ranking cannot bypass those checks;
invalid or unavailable model output falls back to the lowest-risk compliant
offer.

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

Run the complete command-line commercial loop after the API is running:

```bash
npm run demo:x402
```

`npm run check` runs the typecheck and unit tests.

> `.env` holds XRPL Testnet seeds and is gitignored. Never commit it, and never
> put Mainnet keys in it.

## Repo layout

```
server/recovery.js      Trip graph, cascade, strategies and mandate policy
server/agent.js         Safe offer filtering and injectable AI ranker boundary
server/routes.js        Supplier, x402 and payment API routes
server/x402.js          XRPL x402 wire-format translation
server/xrpl.js          XRPL payment signing, settlement and verification
src/PaymentFlow.tsx     Visible agentic commercial-loop interface
scripts/demo-x402.js    Reproducible end-to-end command-line demo
scripts/setup-wallets.js Testnet wallet generation and faucet setup
skills/                 XRPL agentic-resources skill
hook/                   XRPL builder-feedback hook
BUILDER_FEEDBACK.md     XRPL developer feedback collected during the build
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
