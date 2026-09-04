# Trip Rescue

> **When one booking breaks, fix the whole trip.**

Travel providers understand their booking. Trip Rescue understands your trip.

**Team Peanutss** — Javerine Tan · Min Xie
SingHacks 2026, Ripple Challenge: AI-native business on XRPL with x402.

---

## The problem

Independent travellers assemble one trip from many unrelated providers. Those
bookings are purchased independently but are **operationally dependent** on each
other:

```
flight arrival → airport bus → hotel check-in → rental pickup → next-day activity
```

When the flight is cancelled, the traveller becomes the integration layer. They
have to work out which downstream reservations are now impossible, which are
merely at risk, which cancellation deadlines are about to expire, and what must
be secured *before* anything is cancelled — while prices and availability keep
moving.

Each provider sees only its own booking. Nobody sees the trip.

**The real problem is not "find me another flight." It is "one booking broke, fix
the consequences across my whole trip."**

## What Trip Rescue does

A confirmed flight cancellation disrupts a five-provider Tokyo itinerary:

| Booking | Provider | Status after cancellation |
| --- | --- | --- |
| Singapore → Narita flight | Demo Air | 🔴 broken — service cancelled |
| Narita → Hakone bus | Hakone Express | 🔴 broken — departs before the replacement lands |
| Hakone hotel | Hakone Springs | 🟠 at risk — no-show risk |
| Rental car pickup | Hakone Drive | 🟠 at risk — pickup before arrival |
| Mount Fuji activity | Fuji Day Tours | 🔴 broken — prerequisites unmet |

The agent then:

1. Traverses the **trip dependency graph** and classifies every booking.
2. Generates **three whole-trip recovery strategies** — Fastest, Cheapest, Most
   Reliable — each with its actions, cost, arrival time, risk and irreversible
   steps.
3. The traveller **authorises one strategy**. That becomes a bounded **Rescue
   Mandate**.
4. Inside the mandate the agent **discovers suppliers at runtime**, is challenged
   with **HTTP 402**, decides whether the resource is worth buying, **settles on
   the XRP Ledger**, and receives the protected resource only after the supplier
   verifies the payment on-ledger.

The traveller makes one strategic decision. The agent does the operational and
economic work inside explicit limits.

## Architecture

```mermaid
flowchart TB
    subgraph client["Browser"]
        UI["Trip Rescue UI<br/>cascade · strategies · mandate · receipt"]
    end

    subgraph api["Node / Express API"]
        REC["recovery.js<br/>dependency graph, cascade,<br/>strategy generation"]
        MAN["mandate.js<br/>deterministic policy<br/>enforced at payment time"]
        EXE["executions.js<br/>idempotency + state"]
        X402["x402.js<br/>PAYMENT-REQUIRED / SIGNATURE<br/>/ RESPONSE"]
        XRPL["xrpl.js<br/>sign · submit · verify"]
    end

    subgraph suppliers["Simulated independent suppliers"]
        REG["Runtime registry"]
        S1["Protected transfer<br/>402-gated"]
        S2["Flex shuttle<br/>402-gated"]
        S3["Express rail<br/>402-gated"]
    end

    LEDGER[("XRP Ledger<br/>Testnet")]

    UI --> REC
    UI --> MAN
    REC --> MAN
    MAN --> EXE
    EXE --> X402
    X402 --> XRPL
    UI -.discovers at runtime.-> REG
    REG --- S1 & S2 & S3
    X402 <-->|"402 challenge<br/>+ payment proof"| S1
    XRPL <-->|"submit · verify"| LEDGER
```

### The commercial loop

```mermaid
sequenceDiagram
    autonumber
    participant T as Traveller
    participant A as Trip Rescue agent
    participant S as Supplier
    participant L as XRP Ledger

    T->>A: Authorise a strategy (Rescue Mandate)
    A->>S: GET registry — discover suppliers
    S-->>A: 3 offers, prices unknown until challenged
    A->>S: GET protected resource (no payment)
    S-->>A: 402 + PAYMENT-REQUIRED (scheme exact, xrpl:1, drops, invoiceId)
    A->>A: Re-check mandate: budget, allow-list,<br/>network, deadline, preserved bookings
    A->>A: Sign payment intent (does not submit)
    A->>S: Submit signed intent
    S->>L: submitAndWait(signedTxBlob)
    L-->>S: validated, tesSUCCESS
    S->>L: Re-verify destination, amount,<br/>SourceTag, invoice memo
    A->>S: Retry with PAYMENT-SIGNATURE
    S-->>A: 200 + reservation hold + PAYMENT-RESPONSE
    A-->>T: Recovered itinerary + on-chain receipt
```

**The agent signs the payment but does not submit it.** The supplier submits,
waits for validation, and independently re-verifies the transaction against the
ledger before releasing anything. Delivery before settlement is therefore
*structurally impossible*, not merely checked.

## Why x402 and XRPL, and not a card

The honest version: a card can buy a hotel room. What a card cannot do is let an
agent transact with a service it has **no account with, no API key for, and no
prior relationship to**.

Trip Rescue's agent is not pre-provisioned with any supplier. It reads a
registry at runtime, meets services it has never seen, learns their price from
their own `402` response, decides whether each is worth buying against a budget,
and pays — in one round trip, with no onboarding, no checkout flow and no human
re-entering card details for each provider.

That is the capability x402 adds, and XRPL is what makes it economical: sub-cent
fees and validated settlement in seconds, with escrow and payments as native
protocol primitives.

### x402 implementation

Wire format follows the [XRPL x402 specification](https://xrpl-x402.t54.ai/docs/xrpl-scheme):

| Direction | Header | Contents |
| --- | --- | --- |
| Supplier → agent | `PAYMENT-REQUIRED` | base64 JSON challenge |
| Agent → supplier | `PAYMENT-SIGNATURE` | base64 JSON signed payload |
| Supplier → agent | `PAYMENT-RESPONSE` | base64 JSON settlement result |

Challenge entries use `scheme: "exact"`, CAIP-2 `network: "xrpl:1"` (Testnet),
`asset: "XRP"`, `payTo`, `amount` in drops, `maxTimeoutSeconds`, and
`extra.invoiceId` / `extra.sourceTag`. Full detail in
[docs/API_CONTRACT.md](./docs/API_CONTRACT.md).

The `invoiceId` binds one payment to exactly one recovery and one offer, so a
receipt for a different offer can never unlock a resource.

### XRPL integration

Payments carry SourceTag `20260530` for AI Starter Kit attribution and a
`triprescue/x402` memo holding the invoice id. `server/xrpl.js` handles signing,
submission and independent on-ledger verification.

## Safeguards

Release-blocking invariants, each covered by tests:

| # | Invariant | Where |
| --- | --- | --- |
| 1 | The agent cannot exceed the Rescue Mandate | `mandate.js`, re-checked at prepare **and** execute |
| 2 | The supplier cannot deliver before verifying settlement | supplier submits, then re-reads the ledger |
| 3 | Repeating an execution cannot create a duplicate purchase | `executions.js` idempotency fingerprints |
| 4 | Failed, expired or mismatched payments cannot unlock delivery | `verifySettlement` checks 8 properties |
| 5 | Destination, amount, network, supplier and invoice must match | server state wins over client input |
| 6 | Wallet seeds stay server-side | never returned by any route; `.env` gitignored |
| 7 | Every economic decision has an inspectable reason | decision trace in the UI |

Budget is reserved *before* submission and released if settlement fails, so a
concurrent execution cannot double-spend the mandate.

## XRPL Testnet transactions

All validated on Testnet, `tesSUCCESS`, 48000 drops, SourceTag `20260530`:

| Ledger | Transaction |
| --- | --- |
| 20482189 | [`6BA53E5B…31D5`](https://testnet.xrpl.org/transactions/6BA53E5B56A41CECFA1D1960821079669C2AB7CC5ED4AB1E53157677F3B331D5) |
| 20482307 | [`7D2A9565…0A53`](https://testnet.xrpl.org/transactions/7D2A95654DE41ACBE249BAB9EAF8EE09BD30D76F4AEB126BE5F6FC28416E0A53) |
| 20482546 | [`F91CE25D…3971`](https://testnet.xrpl.org/transactions/F91CE25D2B4144935D00D1B3B554C1FA4861AA6A4054242217ABA234A1B33971) |

Agent wallet `rMmDQfbKv6GTr7KZZ4cSWKV9r5sv1Kyksm` → supplier wallet
`rnkMaVghfEbsgWx8GXidh5c1PJ4V9Mvn2y`.

## Setup

Requires Node 18+.

```bash
npm install
cp .env.example .env
npm run wallet:setup
npm run dev
```

`wallet:setup` creates and funds two XRPL Testnet wallets and writes their seeds
to `.env`. Then open <http://localhost:5173>.

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :8787, web on :5173 |
| `npm run check` | Typecheck and unit tests |
| `npm run build` | Production build |
| `npm run demo:x402` | Walks the whole commercial loop in the terminal |
| `curl -X POST localhost:8787/api/demo/reset` | Restore the mandate budget between runs |

> `.env` holds XRPL Testnet seeds and is gitignored. Never commit it, and never
> put Mainnet keys in it.

## Repo layout

```
server/recovery.js     trip graph, cascade analysis, strategy generation
server/mandate.js      deterministic mandate enforcement
server/x402.js         x402 wire format, the one translation point
server/xrpl.js         sign, submit, verify on XRPL Testnet
server/suppliers.js    simulated suppliers + runtime registry
server/executions.js   idempotency and execution state
server/routes.js       recovery, supplier, 402 and payment routes
src/                   React UI — cascade, strategies, mandate, receipt
docs/BUILD_PLAN.md     scope, gates, safety invariants
docs/API_CONTRACT.md   integration contract between both halves
BUILDER_FEEDBACK.md    XRPL developer feedback from this build
```

## Scope: what is real and what is simulated

Being precise about this, because it matters for judging.

**Real.** The XRPL Testnet settlement, signing and verification. The HTTP 402
challenge, payment proof and gated delivery. Mandate enforcement, idempotency
and failure handling. The cascade and strategy logic, which is deterministic and
tested.

**Simulated.** The travel suppliers. No airline, hotel or coach operator exposes
an x402 machine-purchasing interface today, so the three suppliers are our own
services implementing the real protocol. They are deliberately reached only
through a runtime registry, so the agent discovers them rather than being wired
to them — but they are not real inventory, and the reservation hold is not a real
booking.

**Out of scope for V1.** Real supplier integration, email itinerary ingestion,
disruption types beyond flight cancellation, initial trip planning, and Mainnet.

## Builder feedback

XRPL developer feedback gathered during this build is in
[BUILDER_FEEDBACK.md](./BUILDER_FEEDBACK.md), and was also submitted
continuously through the hackathon feedback hook.

The hook is installed project-scoped in `.claude/settings.json` and
`.codex/hooks.json`. Each teammate runs this once after cloning:

```bash
TEAM_NAME="Peanutss" HACKER_NAME="<your name>" node hook/setup.mjs --non-interactive
```
