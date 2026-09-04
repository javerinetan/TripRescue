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

