# TripRescue Build Plan

## North star

**When one booking breaks, fix the whole trip.**

TripRescue restores a viable end-to-end journey after a confirmed flight
cancellation. The traveller controls the important trade-offs through a bounded
Rescue Mandate; the agent handles the operational and economic work inside those
limits.

## Submission target

- Deadline: **Saturday, 5 September 2026 at 6:00 PM SGT**.
- Deliver one reliable three-minute demo, a public repository, a concise short
  description, a team picture, and a widescreen 16:9 `.pptx` pitch deck.
- Track: Ripple — AI-native business using XRPL and an agentic payment flow.

## V1 demo promise

A confirmed flight cancellation disrupts a fixed Tokyo itinerary. TripRescue:

1. Models the bookings and their operational dependencies.
2. Classifies downstream bookings as `safe`, `at-risk`, or `broken`.
3. Generates Fastest, Cheapest, and Most Reliable whole-trip recovery plans.
4. Lets the traveller authorize one plan through a bounded Rescue Mandate.
5. Discovers and compares supplier offers.
6. Encounters an HTTP `402 Payment Required` response for a useful resource.
7. Chooses whether to pay based on the mandate, then settles on XRPL Testnet.
8. Retries with payment evidence and receives the protected resource.
9. Shows the recovered itinerary, decision trace, transaction hash, and explorer
   link.

Removing the agent or its ability to transact should materially weaken this
workflow. The payment is part of restoring the trip; it is not the product by
itself.

## Fixed demonstration scenario

### Original itinerary

| ID | Booking | Scheduled time | Dependency |
| --- | --- | --- | --- |
| `flight-sin-nrt` | Singapore to Narita flight | Arrives 15:00 | None |
| `bus-nrt-hakone` | Narita to Hakone transfer | Departs 17:00 | Flight arrival |
| `hotel-hakone` | Hakone hotel | Check-in by 22:00 | Arrival in Hakone |
| `rental-hakone` | Rental-car pickup | Next day 08:00 | Presence in Hakone |
| `activity-fuji` | Mount Fuji activity | Next day 09:00 | Rental car and timely arrival |

### Trigger

`flight-sin-nrt` is cancelled. The airline's free replacement arrives at Narita
at 09:30 the next day.

### Expected cascade

| Booking | Expected status | Reason |
| --- | --- | --- |
| Flight | `broken` | Original service was cancelled. |
| Airport bus | `broken` | It departs before the replacement flight arrives. |
| Hotel | `at-risk` | The traveller may be recorded as a no-show without intervention. |
| Rental car | `at-risk` | Pickup occurs before the replacement arrival. |
| Mount Fuji activity | `broken` | Its prerequisites cannot be met under the airline replacement. |

The implementation may refine wording, but tests must preserve these outcomes.

## Recovery strategies

V1 must return exactly three complete alternatives. Each plan must state its
actions, incremental cost, arrival time, risk, affected bookings, mandate
compliance, and explanation.

1. **Fastest** — pay more for the earliest viable reroute and preserve the
   activity.
2. **Cheapest** — accept more delay or lost experience while minimizing
   incremental cost.
3. **Most Reliable** — prefer protected inventory and larger connection buffers.

The exact fixture values live with the domain tests and must remain internally
consistent. The UI must consume the domain output rather than independently
recreating prices or statuses.

## Rescue Mandate

The demo mandate is:

- Maximum additional spend: **S$300**.
- Arrival deadline: **12:00 PM the next day**.
- Preserve booking: `activity-fuji`.
- No shared accommodation.
- Pay only an allow-listed supplier on XRPL Testnet.
- Stop and request user approval when no valid plan exists.
- Stop when a transaction would exceed the remaining budget.
- Never deliver or claim a protected resource before payment verification.

Mandate enforcement is deterministic. An LLM may interpret the traveller's
request or explain a decision, but it cannot override hard policy checks.

## Commercial loop

The protected supplier resource should be something the recovery workflow can
actually use, such as a short-lived reservation hold or guaranteed transfer
inventory. The canonical sequence is:

```text
Agent requests protected supplier resource
  -> supplier returns HTTP 402 and structured payment requirements
  -> policy engine validates supplier, amount, asset, network and mandate
  -> agent settles payment on XRPL Testnet
  -> agent retries with transaction evidence and an idempotency key
  -> supplier verifies the on-chain receipt
  -> supplier returns the reservation hold/resource
  -> TripRescue completes the recovered itinerary
```

An XRPL payment containing an `x402` memo without the HTTP 402 challenge,
verification, retry, and gated delivery sequence does not satisfy this flow.

## Safety invariants

These are release-blocking requirements:

1. The agent cannot exceed the Rescue Mandate.
2. The supplier cannot deliver before verifying settlement.
3. Repeating the same execution request cannot create a duplicate purchase.
4. A failed, expired, mismatched, or unvalidated payment cannot unlock delivery.
5. The verified destination, amount, network, plan ID, and supplier must match
   the payment requirement.
6. Wallet seeds remain server-side and never appear in logs or responses.
7. Every economic decision has an inspectable reason and result.

## Ownership

### Min Xie — domain and agent workflow

- Booking and dependency data model.
- Cascade analysis.
- Recovery-plan generation.
- Rescue Mandate enforcement.
- AI decision and explanation layer.
- Tests for constraints and action ordering.
- Problem, business model, README narrative, pitch deck, and demo script.

### Javerine — transaction and product experience

- Supplier and x402 endpoint.
- XRPL integration and receipt delivery.
- Wallet setup and stable Testnet demo.
- Frontend journey.
- Transaction receipt screen.
- Deployment and demo polish.

### Joint integration

Both owners verify the safety invariants, transaction explorer link, clean demo
run, and correspondence between the narrative and actual implementation.

Shared files such as `src/App.tsx`, `server/index.js`, `README.md`, and this
contract require coordination before simultaneous editing.

## Scope boundaries

### In scope

- One fixed, understandable Tokyo cancellation scenario.
- Deterministic trip dependency and policy logic.
- Three recovery strategies.
- A bounded, explainable economic decision.
- A real XRPL Testnet transaction.
- A demonstrable HTTP 402 challenge, payment verification, retry, and delivery.
- Clear failure states and an audit trail.

### Out of scope

- Real airline or hotel booking.
- Production travel-supplier integrations.
- Every disruption type or destination.
- Initial trip planning or cheapest-flight search.
- User accounts, compensation claims, and mobile applications.
- Mainnet funds.
- A generalized multi-agent platform.

## Integration gates

Do not postpone all integration until the final day. Merge small, green pull
requests as each gate passes.

### Gate 1 — Contract frozen

- [x] Both owners approve this build plan and `docs/API_CONTRACT.md`.
- [x] Paid resource and fixture values are agreed.
- [x] Documents are merged to `main`; both feature branches update from `main`.

### Gate 2 — Recovery engine

- [x] Fixed itinerary is represented by shared domain types.
- [x] Cascade tests produce the expected five statuses.
- [x] Three complete recovery plans are generated.
- [x] Mandate tests accept a compliant plan and reject budget, deadline,
  preserved-booking, accommodation, supplier, and network violations.

### Gate 3 — Payment vertical slice

- [x] Supplier responds with structured HTTP 402 requirements.
- [x] One XRPL Testnet payment settles successfully.
- [x] Supplier verifies the payment before returning the resource.
- [x] Idempotent retry does not pay or deliver twice.

### Agent decision layer

- [x] Only mandate-compliant offers can reach the AI ranker.
- [x] Invalid, incomplete, or unavailable AI output falls back to the safest
  compliant offer.
- [x] No-compliant-offer cases stop with a mandate violation.
- [ ] Connect a live model ranker after the team confirms an available provider
  and API key.

### Gate 4 — End-to-end UI

- [ ] The UI renders domain/API results instead of duplicate hardcoded logic.
- [ ] Agent decision, mandate use, payment status, delivered value, transaction
  hash, and explorer link are visible.
- [ ] Failure paths are understandable and recoverable.

### Gate 5 — Submission freeze

- [ ] `npm run check` passes.
- [ ] `npm run build` passes.
- [ ] A clean-browser demo completes in under three minutes.
- [ ] Public README contains setup, architecture, flow, safeguards, transaction
  hash, explorer link, and builder feedback.
- [ ] Backup demo recording, short description, team picture, and 16:9 `.pptx`
  are ready.
- [ ] Both teammates review the submission before its single allowed submission.

## Working rhythm

- One owner per shared file at a time.
- Open a pull request at each integration gate or smaller working increment.
- Run `npm run check` and `npm run build` before requesting review.
- Review pull requests within 15 minutes when the other owner is blocked.
- After a merge, update active branches from `main` before continuing dependent
  work.
- Stop adding features at Gate 5; fix only demo or submission blockers.

## Definition of done

TripRescue is ready when a reviewer can reproduce and understand the full loop:

```text
cancelled flight
-> cascading booking impact
-> three whole-trip strategies
-> bounded user mandate
-> explainable supplier selection
-> HTTP 402 challenge
-> XRPL Testnet settlement
-> verified resource delivery
-> viable recovered itinerary and audit receipt
```

All seven safety invariants must hold, the transaction must be inspectable, and
the demo narrative must accurately describe what the code performs.
