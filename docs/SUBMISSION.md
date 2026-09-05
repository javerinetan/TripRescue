# Trip Rescue submission pack

## Short description

Trip Rescue restores a whole journey after one booking fails. It models the dependencies between a traveller's bookings, shows exactly what is broken or at risk, and proposes three complete recovery strategies. Once the traveller approves a bounded Rescue Mandate, the agent discovers suppliers, evaluates an HTTP 402 payment request, settles on XRPL Testnet, and releases a protected reservation only after the supplier verifies the payment on-ledger.

## Three-minute pitch and demo

| Time | Owner | What to show or say |
| --- | --- | --- |
| 0:00–0:20 | Partner 1 | Open with the problem: a cancelled flight breaks the bus, hotel, rental pickup, and activity. Each provider sees only its own booking. |
| 0:20–0:40 | Partner 1 | Show the trip dashboard and open **See what this affects**. Point out the three broken, two at-risk, and two safe bookings. |
| 0:40–1:05 | Partner 1 | Explain the three whole-trip strategies and select **Fastest recovery**. The traveller chooses the trade-off while the agent handles execution. |
| 1:05–1:30 | Partner 2 | Change both pre-flight answers. Apply them and show that the agent stops because **Cheapest recovery is now available — S$190.00 cheaper**. This proves that the mandate still controls the agent. |
| 1:30–1:50 | Partner 2 | Select **Cheapest recovery** and execute it. Narrate supplier discovery, the HTTP 402 challenge, and the deterministic policy checks. |
| 1:50–2:20 | Partner 2 | Show XRPL Testnet settlement and the supplier's independent verification. Point out that SourceTag `20260530` is signed and verified before delivery. |
| 2:20–2:40 | Partner 1 | Show the booking confirmation, QR code, transaction hash, and explorer link. State that replaying the same action cannot pay twice. |
| 2:40–3:00 | Partner 1 | Close with the business: Trip Guardian is free, Rescue Pass costs S$10–20 per trip, and insurers, card issuers, OTAs, and corporate travel providers can distribute it. |

## Demo reset and startup

```powershell
Invoke-RestMethod -Method Post http://localhost:8787/api/demo/reset
$env:API_PORT='8787'
npm run dev
```

Use `http://localhost:5173`. Before presenting, confirm that no older Vite process is holding the port. Keep a validated Testnet transaction open in a separate browser tab as backup evidence.

## Final submission checklist

- [x] Public README includes setup, architecture, safeguards, and Testnet transactions.
- [x] Twelve-slide 16:9 PowerPoint deck exists at `docs/TripRescue-pitch.pptx`.
- [x] Short description is ready above.
- [x] Team name is `Peanutss` everywhere in the project and local feedback configuration.
- [x] `npm run check` passes with 93 tests.
- [x] `npm run build` passes.
- [x] Record one clean backup demo using the script above.
- [ ] Add the team picture required by the submission form.
- [ ] Both teammates review the final repository, deck, recording, description, and submission links.
- [ ] Submit once through the official form.

## Final review rules

- Keep the network value as `xrpl:1`.
- Keep SourceTag `20260530` in signing and supplier verification.
- Never show wallet seeds in the browser, terminal recording, slides, or submission.
- Do not describe the simulated supplier hold as a real travel booking.
