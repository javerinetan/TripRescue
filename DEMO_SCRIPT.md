# ClearSpend — 3-minute demo

## 0:00–0:25 — The problem

“A small business is about to approve an $18,500 supplier invoice. Today, checking the company, sanctions exposure, bank details, and delivery history means four subscriptions and a manual analyst. ClearSpend turns that into one bounded agent decision.”

## 0:25–0:55 — Give the agent a policy

Show the default supplier brief. Emphasize the 0.060 XRP budget and balanced risk posture. Click **Ask ClearSpend**.

“The operator defines the outcome and the guardrails—not which APIs to call.”

## 0:55–1:35 — Agent discovery and decision

Show the risk score, provider ranking, and selected bundle.

“The agent inferred that identity, sanctions, and invoice forensics matter here. It ranked every provider on relevance, confidence, latency, and price, then selected three checks for 0.051 XRP. Nine thousand drops remain unspent.”

## 1:35–2:15 — x402 and XRPL

Click **Review transaction** and point out Testnet, payer, recipient, exact amount, fee, expiry, SourceTag `20260530`, and review memo.

“The evidence merchant first returned HTTP 402. ClearSpend interpreted the exact XRP payment requirement, built and autofilled a Payment, and stopped at a human checkpoint. The seed never leaves the backend.”

Click **Authorize & deliver**.

“The agent signs locally, persists the hash before submission, and uses `submitAndWait`. The provider independently verifies the validated ledger receipt before releasing anything.”

## 2:15–2:45 — Value delivered

Show the three evidence cards and open the XRPL explorer receipt.

“Payment is not the output—the decision is. Each provider earns per check, the business avoids subscriptions, and the full choice-and-payment trail is auditable.”

## 2:45–3:00 — Why now

“ClearSpend can expand from supplier onboarding into insurance, lending, logistics, and any workflow where an agent must buy trusted evidence before committing money. This business works because agents can discover, decide, pay, and deliver.”

## Backup notes

- Agent wallet: `rMmDQfbKv6GTr7KZZ4cSWKV9r5sv1Kyksm`
- Merchant wallet: `rnkMaVghfEbsgWx8GXidh5c1PJ4V9Mvn2y`
- Both wallets are funded on XRPL Testnet.
- If the network is slow, keep a screenshot of the delivered report and the explorer transaction ready.

