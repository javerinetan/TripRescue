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
  network: "xrpl-testnet";
}

interface MandateViolation {
  code:
    | "budget-exceeded"
    | "arrival-too-late"
    | "required-booking-lost"
    | "accommodation-rule-violated"
    | "supplier-not-allowed"
    | "wrong-network";
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
  scheme: "xrpl-direct";
  network: "xrpl-testnet";
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
    "network": "xrpl-testnet"
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
  "decision": {
    "selectedOfferId": "offer-protected-transfer-001",
    "consideredOfferIds": [
      "offer-protected-transfer-001",
      "offer-flex-transfer-002"
    ],
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
    "scheme": "xrpl-direct",
    "network": "xrpl-testnet",
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
  "executionId": "execution-tokyo-001",
  "planId": "plan-reliable-001",
  "offerId": "offer-protected-transfer-001",
  "mandateId": "mandate-tokyo-001",
  "paymentRequirement": {
    "requirementId": "requirement-transfer-001",
    "scheme": "xrpl-direct",
    "network": "xrpl-testnet",
    "asset": "XRP",
    "amountDrops": "51000",
    "destination": "<merchant testnet address>",
    "memo": "recovery-tokyo-001:offer-protected-transfer-001",
    "expiresAt": "2026-09-05T11:00:00+08:00"
  }
}
```

The server must re-evaluate the mandate. It must reject a client-supplied
destination, amount, supplier, network, or offer that does not match trusted
server state.

### `200 OK`

Returns the transaction preview needed for explicit demo authorization. Wallet
seeds and signed transaction blobs must not be returned.

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
x402 payment-proof headers and the same idempotency key.

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
