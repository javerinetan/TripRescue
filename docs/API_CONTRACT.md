# TripRescue API Contract

**Contract version:** `1.0.0`

This file is the integration boundary between Min Xie's domain/agent work and
Javerine's supplier, payment, and frontend work. JSON field names and meanings
must not change silently. A breaking change requires both owners to agree and
update this file in the same pull request.

## General conventions

- API base: `/api`.
- Content type: `application/json`.
- Times: ISO 8601 strings with an explicit offset, for example
  `2026-09-05T09:30:00+09:00`.
- Money: integer minor units plus an ISO 4217 currency; never floating-point
  amounts.
- XRP IDs: stable lowercase kebab-case fixture IDs.
- XRPL amounts: integer drops encoded as strings.
- Error responses use the shared `ApiError` shape.
- `contractVersion` is always `1.0.0` for this contract.

## Shared types

```ts
type ContractVersion = "1.0.0";

type BookingType =
  | "flight"
  | "transfer"
  | "hotel"
  | "rental"
  | "activity";

type BookingStatus = "safe" | "at-risk" | "broken";

interface Money {
  currency: "SGD";
  minorUnits: number;
}

interface Booking {
  id: string;
  type: BookingType;
  provider: string;
  title: string;
  startTime: string;
  endTime?: string;
  dependsOn: string[];
  cost: Money;
  refundable: boolean;
  changeDeadline?: string;
}

interface BookingAssessment {
  bookingId: string;
  status: BookingStatus;
  reasonCode:
    | "service-cancelled"
    | "dependency-unavailable"
    | "time-window-missed"
    | "no-show-risk"
    | "dependency-at-risk"
    | "unaffected";
  explanation: string;
}

interface RecoveryAction {
  id: string;
  kind: "preserve" | "cancel" | "change" | "purchase" | "notify";
  bookingId?: string;
  supplierId?: string;
  description: string;
  incrementalCost: Money;
  reversible: boolean;
  dependsOnActionIds: string[];
}

type RecoveryPlanKind = "fastest" | "cheapest" | "most-reliable";

interface RecoveryPlan {
  id: string;
  kind: RecoveryPlanKind;
  title: string;
  actions: RecoveryAction[];
  additionalCost: Money;
  arrivalTime: string;
  riskScore: number;
  preservesBookingIds: string[];
  accommodationType: "private" | "shared" | "unchanged";
  mandateCompliant: boolean;
  violations: MandateViolation[];
  explanation: string;
}

interface RescueMandate {
  id: string;
  maximumAdditionalSpend: Money;
  arrivalDeadline: string;
  preserveBookingIds: string[];
  accommodationRules: string[];
  allowedSupplierIds: string[];
  // CAIP-2 Testnet. Canonical across domain and payment layers.
  network: "xrpl:1";
}

interface MandateViolation {
  code:
    | "budget-exceeded"
    | "arrival-too-late"
    | "required-booking-lost"
    | "accommodation-rule-violated"
    | "supplier-not-allowed"
    | "wrong-network"
    | "invalid-offer";
  explanation: string;
}

interface SupplierOffer {
  id: string;
  supplierId: string;
  title: string;
  description: string;
  price: Money;
  expiresAt: string;
  resourcePath: string;
  supportsX402: true;
  arrivalTime: string;
  riskScore: number;
  preservesBookingIds: string[];
  accommodationType?: "private" | "shared" | "unchanged";
}

interface DecisionTrace {
  selectedOfferId: string;
  consideredOfferIds: string[];
  reasons: string[];
  mandateCompliant: boolean;
  violations: MandateViolation[];
}

interface PaymentRequirement {
  requirementId: string;
  scheme: "exact";
  network: "xrpl:1";
  asset: "XRP";
  amountDrops: string;
  destination: string;
  memo: string;
  expiresAt: string;
}

interface ExecutionReceipt {
  executionId: string;
  planId: string;
  offerId: string;
  status: "pending-payment" | "settled" | "delivered" | "failed";
  transactionHash?: string;
  explorerUrl?: string;
  deliveredResource?: {
    type: "reservation-hold";
    reference: string;
    description: string;
    expiresAt: string;
  };
}

interface ApiError {
  contractVersion: ContractVersion;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}
```

`riskScore` is an integer from `0` to `100`, where lower is safer.
`minorUnits: 30000` means S$300.00.

## 1. Analyze disruption

`POST /api/recovery/analyze`

### Request

```json
{
  "contractVersion": "1.0.0",
  "trigger": {
    "type": "flight-cancelled",
    "bookingId": "flight-sin-nrt",
    "replacementArrivalTime": "2026-09-05T09:30:00+09:00"
  },
  "bookings": []
}
```

During V1, an empty `bookings` array means “use the fixed demo itinerary.”

### `200 OK`

```json
{
  "contractVersion": "1.0.0",
  "recoveryId": "recovery-tokyo-001",
  "assessments": [
    {
      "bookingId": "flight-sin-nrt",
      "status": "broken",
      "reasonCode": "service-cancelled",
      "explanation": "The original flight was cancelled."
    }
  ]
}
```

## 2. Generate recovery plans

`POST /api/recovery/plans`

### Request

```json
{
  "contractVersion": "1.0.0",
  "recoveryId": "recovery-tokyo-001",
  "mandate": {
    "id": "mandate-tokyo-001",
    "maximumAdditionalSpend": { "currency": "SGD", "minorUnits": 30000 },
    "arrivalDeadline": "2026-09-05T12:00:00+09:00",
    "preserveBookingIds": ["activity-fuji"],
    "accommodationRules": ["no-shared-accommodation"],
    "allowedSupplierIds": ["supplier-protected-transfer"],
    "network": "xrpl:1"
  }
}
```

### `200 OK`

```json
{
  "contractVersion": "1.0.0",
  "recoveryId": "recovery-tokyo-001",
  "plans": [],
  "recommendedPlanId": "plan-reliable-001"
}
```

`plans` contains exactly one `fastest`, one `cheapest`, and one
`most-reliable` `RecoveryPlan`.

## 3. Discover supplier offers

The monitoring UI may expose indicative offer metadata for comparison. The
server-side `PAYMENT-REQUIRED` challenge remains authoritative for the exact
amount, payee, invoice, timeout, and accepted wire entry.

`POST /api/recovery/offers`

### Request

```json
{
  "contractVersion": "1.0.0",
  "recoveryId": "recovery-tokyo-001",
  "planId": "plan-reliable-001",
  "mandateId": "mandate-tokyo-001"
}
```

### `200 OK`

```json
{
  "contractVersion": "1.0.0",
  "offers": [],
  "decisionId": "decision-abc123",
  "decision": {
    "selectedOfferId": "offer-protected-transfer-001",
    "consideredOfferIds": [
      "offer-protected-transfer-001",
      "offer-flex-transfer-002"
    ],
    "rankedOfferIds": ["offer-protected-transfer-001"],
    "rejectedOffers": [],
    "decisionMode": "deterministic-fallback",
    "reasons": [
      "The offer preserves the activity and meets the arrival deadline.",
      "Its price remains within the authorized budget."
    ],
    "mandateCompliant": true,
    "violations": []
  }
}
```

## 4. Request protected supplier resource

`GET /api/suppliers/:supplierId/offers/:offerId/resource`

The first unpaid request returns `402 Payment Required`.

### `402 Payment Required`

```json
{
  "contractVersion": "1.0.0",
  "error": {
    "code": "payment-required",
    "message": "A verified XRPL Testnet payment is required.",
    "retryable": true
  },
  "paymentRequirement": {
    "requirementId": "requirement-transfer-001",
    "scheme": "exact",
    "network": "xrpl:1",
    "asset": "XRP",
    "amountDrops": "51000",
    "destination": "<merchant testnet address>",
    "memo": "recovery-tokyo-001:offer-protected-transfer-001",
    "expiresAt": "2026-09-05T11:00:00+08:00"
  }
}
```

### Adopted x402 wire format (recorded at Gate 3)

The wire format follows the XRPL x402 specification
(<https://xrpl-x402.t54.ai/docs/xrpl-scheme>), which differs from the placeholder
values sketched above. The spec wins; these are the adopted names:

| Direction | Header | Contents |
| --- | --- | --- |
| Server to client | `PAYMENT-REQUIRED` | base64 JSON payment challenge |
| Client to server | `PAYMENT-SIGNATURE` | base64 JSON signed payment payload |
| Server to client | `PAYMENT-RESPONSE` | base64 JSON settlement result |

Inside the challenge, `accepts[]` entries use `scheme: "exact"`, CAIP-2
`network: "xrpl:1"` for Testnet, `asset: "XRP"`, `payTo`, `amount` in drops,
`maxTimeoutSeconds`, and `extra.invoiceId` / `extra.sourceTag`. The
`PAYMENT-SIGNATURE` payload carries `x402Version: 2`, the `accepted`
requirement, and `payload.signedTxBlob`.

The internal `PaymentRequirement` shape above is retained for the UI and for
`/api/payments/*`; `server/x402.js` is the single translation point between it
and the wire format.

**Settlement ordering.** The agent signs the payment intent but does not submit
it. The supplier submits the signed blob, waits for validation, and independently
re-verifies destination, amount, `SourceTag` and invoice memo against the ledger
before releasing the resource. Delivery before settlement is therefore
structurally impossible, not merely checked.

Two fields differ from the placeholder sketch above and are now authoritative:
`scheme` is `"exact"` (not `"xrpl-direct"`) and `network` is `"xrpl:1"` (not
`"xrpl-testnet"`).

## 5. Prepare payment

`POST /api/payments/prepare`

### Request

```json
{
  "contractVersion": "1.0.0",
  "requirementId": "requirement-transfer-001",
  "planId": "plan-reliable-001",
  "decisionId": "decision-abc123",
  "mandateId": "mandate-tokyo-001"
}
```

The server resolves the requirement, plan, offer, mandate, incident snapshot,
and guarded decision from trusted state. It rejects unknown or expired
requirements/decisions, non-compliant plans, stale or mismatched decisions, and
any payment that would exceed the current mandate. The response includes an
opaque `paymentSignature`; clients forward it unchanged and must not expose its
`signedTxBlob` value.

### `200 OK`

Returns the transaction preview and opaque payment signature needed for the
protected-resource retry. Wallet seeds and a top-level signed transaction blob
are never returned.

The server re-evaluates the mandate immediately before signing and again before
submission. Client-supplied destination, amount, supplier, network, or offer
values never override trusted server state.

## 6. Execute payment

`POST /api/payments/execute`

### Request

```json
{
  "contractVersion": "1.0.0",
  "executionId": "execution-tokyo-001",
  "requirementId": "requirement-transfer-001",
  "idempotencyKey": "recovery-tokyo-001:offer-protected-transfer-001"
}
```

### `200 OK`

```json
{
  "contractVersion": "1.0.0",
  "receipt": {
    "executionId": "execution-tokyo-001",
    "planId": "plan-reliable-001",
    "offerId": "offer-protected-transfer-001",
    "status": "settled",
    "transactionHash": "<validated XRPL transaction hash>",
    "explorerUrl": "https://testnet.xrpl.org/transactions/<hash>"
  }
}
```

The same `idempotencyKey` must return the original execution result instead of
submitting another payment.

## 7. Retry and receive delivery

The agent retries the protected supplier-resource request using the adopted
x402 payment-proof headers and the same stable logical idempotency key. The
current browser flow sends the opaque `paymentSignature` returned by prepare in
`PAYMENT-SIGNATURE`; the supplier validates its accepted requirement and genuine
`signedTxBlob` against server-side execution state before settlement.

The stable key identifies the recovery action (`recoveryId`, incident, mandate,
plan, and offer), not a transient execution or 402 requirement ID. This allows a
fresh challenge or repeated prepare for the same action to replay the original
receipt without another payment.

### `200 OK`

```json
{
  "contractVersion": "1.0.0",
  "receipt": {
    "executionId": "execution-tokyo-001",
    "planId": "plan-reliable-001",
    "offerId": "offer-protected-transfer-001",
    "status": "delivered",
    "transactionHash": "<validated XRPL transaction hash>",
    "explorerUrl": "https://testnet.xrpl.org/transactions/<hash>",
    "deliveredResource": {
      "type": "reservation-hold",
      "reference": "TR-HOLD-001",
      "description": "Protected transfer inventory held for the recovered itinerary.",
      "expiresAt": "2026-09-05T11:15:00+08:00"
    }
  }
}
```

## Required error cases

| HTTP | Code | Condition |
| --- | --- | --- |
| `400` | `invalid-request` | Input does not match the contract. |
| `402` | `payment-required` | Protected supplier resource has no valid proof. |
| `403` | `mandate-violation` | Plan, supplier, network, or payment exceeds authorization. |
| `404` | `not-found` | Recovery, plan, offer, requirement, or execution is unknown. |
| `409` | `execution-conflict` | An idempotency key is reused for different parameters. |
| `410` | `requirement-expired` | Payment requirement or offer expired before execution. |
| `422` | `payment-mismatch` | Receipt does not match the requirement. |
| `502` | `settlement-failed` | XRPL settlement failed or could not be confirmed. |

## Contract acceptance tests

Before Gate 4, integration tests must prove:

1. The fixed cancellation produces the five expected assessments.
2. The plan endpoint returns exactly three plan kinds.
3. A compliant mandate permits the selected offer.
4. Budget, deadline, preserved-booking, supplier, and network violations fail
   deterministically.
5. An unpaid supplier request returns 402 and no resource.
6. An unvalidated or mismatched transaction returns no resource.
7. A validated matching payment returns the reservation hold.
8. Reusing an idempotency key returns the original receipt without another
   payment or delivery.
9. No API response contains an XRPL seed.

---

## Endpoints added after Gate 4

The sections above are the frozen integration boundary between the domain and
payment halves. These were added as the product grew past that boundary. They
follow the same conventions — `contractVersion`, minor-unit money, ISO 8601 with
offset, the shared `ApiError` shape — and none of them change the six above.

### Discovery

`GET /api/suppliers/registry` — the index the agent reads at runtime to learn
which suppliers exist at all. Scoped to the supplier category the live incident
needs, so a lost rental car surfaces car suppliers and a cancelled tour surfaces
tour operators. Each entry is a `SupplierOffer` with `resourcePath` pointing at
its 402-gated resource.

The agent is not pre-provisioned with any supplier: it learns identity and
resource path here, and price from the 402 challenge. That is what makes the
payment agent-native rather than a card transaction with extra steps.

### Monitoring

`GET /api/trips` — the dashboard. Returns every monitored trip, the one alert
that is live, and a `summary` for the header.

```json
{
  "trips": [{
    "id": "trip-tokyo-sep",
    "title": "Tokyo & Hakone",
    "dates": "4 – 8 September 2026",
    "purpose": "Client meeting in Tokyo on the 5th…",
    "bookingCount": 7,
    "providerCount": 5,
    "totalCommitted": { "currency": "SGD", "minorUnits": 184900 },
    "exposure": { "broken": 3, "atRisk": 2, "safe": 2 },
    "valueAtRisk": { "currency": "SGD", "minorUnits": 111700 },
    "alert": {
      "incidentId": "flight-cancelled",
      "severity": "critical",
      "headline": "Flight SQ634 cancelled",
      "detail": "…",
      "source": "Airline operations feed",
      "detectedMinutesAgo": 2
    }
  }],
  "summary": {
    "trips": 3, "bookings": 14, "providers": 12,
    "committed": { "currency": "SGD", "minorUnits": 386900 },
    "valueAtRisk": { "currency": "SGD", "minorUnits": 111700 },
    "alerts": 1
  },
  "incidents": [],
  "activeIncidentId": "flight-cancelled"
}
```

`POST /api/incidents/active` — `{ "incidentId": "rental-unavailable" }`. Chooses
which monitored incident is live and resets mandate, executions and faults. A
demo affordance: in production the feeds decide this. Incident ids are
`flight-cancelled`, `rental-unavailable`, `activity-cancelled`.

Every incident feeds the same `analyzeCancellation`, so the cascade genuinely
differs rather than being scripted per scenario.

### Traveller intent and the mandate

`GET /api/priorities` — the selectable priorities, each with a suggested budget
and the dimension it ranks offers by (`cost`, `time`, `risk`).

`POST /api/mandates/interpret` — `{ "text": "…" }`. Free text in, a **proposed**
mandate out. Never writes the mandate.

```json
{
  "source": "llm" | "fallback" | "deterministic" | "none",
  "model": "claude-sonnet-5",
  "llmConfigured": true,
  "proposal": { "priority": "business", "maximumAdditionalSpend": {}, "arrivalDeadline": "", "preserveBookingIds": [] },
  "reasons": [], "rejected": []
}
```

Every proposed field is validated against server-side truth before it is
returned. A budget outside the permitted range is **dropped, not clamped**; an
unknown booking id is discarded; an unparseable deadline is refused. Anything
removed is named in `rejected`. Without `ANTHROPIC_API_KEY` a deterministic
keyword parser is used and `source` says so.

`POST /api/mandates/configure` — `{ priority, maximumAdditionalSpend?,
arrivalDeadline?, preserveBookingIds? }`. Writes the mandate. Priority supplies
defaults; supplied fields override them. Priorities permit **tiers**
(`protected`, `express`, `budget`) which expand to concrete `allowedSupplierIds`
for whichever supplier category the live incident needs, so `RescueMandate`
keeps the shape defined above.

`GET /api/mandates/:mandateId` — the mandate plus `remaining` budget.

### Outcome

`GET /api/recovery/changes?planId=&offerId=` — the before/after of what the
agent changed, derived from the authorised plan and the offer actually bought.
Each entry is `replaced`, `kept`, `released` or `notified`, and `cost`
reconciles the plan estimate against what was really spent.

`GET /api/recovery/claim` — what remains recoverable, split into `claimable`,
`refund` and `at-risk`, with the trip's policy applied (gross loss, less excess,
expected payout, capped at the per-trip limit). Guidance only; filing is not
automated.

### Demo controls

`POST /api/demo/reset` — restores mandate budget, clears executions and faults,
returns to the default incident. Settled XRPL transactions are untouched.

`GET|POST /api/demo/fault` — `{ "mode": "none" | "supplier-unavailable" |
"settlement-fail" | "budget-exhausted" }`. Deliberate fault injection so failure
handling can be demonstrated rather than asserted. Demo-only state; never
touches the ledger.
