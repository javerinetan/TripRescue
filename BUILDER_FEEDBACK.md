# XRPL builder feedback

## What worked well

- `xrpl.js` makes Testnet wallet generation, faucet funding, autofill, local signing, and validated submission compact enough for a hackathon prototype.
- The XRP drops representation maps naturally to exact, low-value machine payments.
- `submitAndWait` and transaction lookup make payment-gated delivery straightforward and auditable.
- A shared SourceTag gives the AI Starter Kit flow visible on-chain attribution without changing the commercial transaction.

## Friction encountered

- On Windows, the documented `bash skills/xrpl-agentic-resources/scripts/refresh.sh` selected the system WSL launcher and failed with `E_ACCESSDENIED`; explicitly invoking Git for Windows Bash worked. The setup guide should include a Windows command.
- The resource pack mixes multiple x402 generations and examples. The vendored `x402-secure` material primarily demonstrates Python/Base flows, while the live index includes XRPL TypeScript guides. A canonical, versioned TypeScript XRPL sample showing Testnet network identifiers, header names, and facilitator endpoints would remove ambiguity.
- Network naming is easy to misread: examples use values such as `xrpl:0`, while application developers also think in `testnet`, `devnet`, and WebSocket endpoints. A single mapping table across x402, CAIP-style IDs, xrpl.js endpoints, and explorers would help.
- The feedback submit script accepted the submission on Windows but Node 24 then emitted a libuv handle-closing assertion. The feedback appears to have reached the server, but the process should exit cleanly on current Node.

## Mainnet-readiness suggestions

- Publish a reference policy-gated agent signer backed by cloud KMS/HSM, with per-asset, per-destination, and time-window limits.
- Add idempotency and reconciliation recipes around signed-hash persistence and uncertain `submitAndWait` outcomes.
- Provide a standard x402 receipt schema binding the requested resource, exact transaction, provider response digest, and refund policy.
- Offer an official local facilitator sandbox with deterministic Testnet fixtures so teams can demo during faucet or external-service instability.

## Additional friction found building the x402 flow

- Browser clients cannot read the x402 response headers cross-origin. `PAYMENT-REQUIRED`
  and `PAYMENT-RESPONSE` are custom headers, so a browser-based agent sees them as
  absent unless the merchant sets `Access-Control-Expose-Headers`. Our client silently
  fell back to the JSON body and sent an empty `accepted` block in `PAYMENT-SIGNATURE`
  for some time before we noticed, because nothing errors. The XRPL x402 merchant
  guides show Express and FastAPI servers but do not mention CORS exposure, and a
  one-line note plus `cors({ exposedHeaders: [...] })` in the Express sample would
  save every browser-side integrator this bug.
- `client.autofill` sets a short `LastLedgerSequence`. That is right for machine-speed
  submission, but any flow with a human authorisation step between signing and
  submission can exceed it and fail with `tefMAX_LEDGER`. Guidance on choosing a
  validity window for human-in-the-loop agent flows, and a documented way to widen it
  without hand-editing the autofilled transaction, would help.
- The requested amount of a native XRP Payment is reported as `Amount` by rippled API
  v1 and `DeliverMax` by API v2. Verification code that reads only `Amount` silently
  fails against a v2 node. This is documented in the API changes page but is easy to
  miss when writing receipt verification, which is exactly where it matters. A note on
  the payment-verification tutorials would be well placed.
- CAIP-2 network identifiers and human network names coexist without a mapping. x402
  uses `xrpl:0` / `xrpl:1` / `xrpl:2`, while xrpl.js, faucets and explorers speak
  `mainnet` / `testnet` / `devnet` and WebSocket URLs. We shipped a bug where the domain
  layer said `xrpl-testnet` and the payment layer said `xrpl:1`. A single canonical
  mapping table would prevent it.
