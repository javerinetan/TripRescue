# One-click trip import demo

## Objective

Show how Trip Rescue receives a traveller's existing itinerary without claiming live Gmail access. A first-time visitor performs one clear action, sees the import process, and arrives at the existing monitoring dashboard with the seeded trips presented as imported results.

## Experience

The home route initially shows a focused onboarding card titled “Bring your itinerary into one place.” It explains the production model: a one-time scan of travel confirmations, retention of only structured booking fields, and inbox disconnection after import.

The primary action is **Import my trips**. A permanent demo disclosure beside it states: “Demo mode — sample confirmations only; no inbox is accessed.” This disclosure remains visible during the import and cannot be mistaken for production Gmail integration.

After activation, the card advances automatically through three status messages:

1. Finding travel confirmations
2. Grouping bookings into trips
3. Starting provider monitoring

The sequence lasts about two seconds. It then reveals the existing monitoring dashboard and confirms the counts returned by the current trips API. A compact provenance strip says that the trips were imported once, the inbox is disconnected, and provider feeds are now being monitored.

The completed state is stored in `sessionStorage`, so navigation and refreshes in the same tab do not interrupt the pitch. A small **Replay import demo** control on the dashboard clears only this local presentation state and returns to onboarding.

## Architecture

- `TripImport.tsx` owns the onboarding presentation and timed status sequence.
- A small pure import-state module defines the ordered stages and completion transition so behavior can be tested without timers or the DOM.
- `App.tsx` owns whether import is complete and decides whether to show `TripImport` or `TripsHome`.
- `TripsHome.tsx` receives import provenance and replay callbacks and renders the compact source strip.
- Existing `/api/trips` data continues loading in the background. The simulated import does not mutate server data or change recovery, payment, XRPL, or incident behavior.

## Privacy and honesty

The interface must distinguish the production concept from the hackathon implementation. It must not display a Google consent screen, request credentials, claim to have searched a real inbox, or imply that raw emails were actually processed.

Production-oriented copy may explain the intended controls: travel confirmations only, minimum structured fields retained, raw messages discarded, and revocable access. The demo disclosure must accompany those statements.

## Failure and accessibility

The sequence is deterministic and local, so there is no simulated network failure. If the trips API fails, the existing application error remains responsible for explaining how to start the API.

The stages use an accessible live status, the main action is keyboard reachable, focus remains visible, and reduced-motion preferences remove decorative transitions without skipping the state changes.

## Verification

- Unit tests cover stage ordering, completion, and session-state parsing.
- Component integration is checked through TypeScript and the existing application suite.
- Production build must succeed.
- Browser QA covers the initial disclosure, one-click progression, dashboard provenance, replay behavior, mobile layout, and refresh persistence.

## Non-goals

- Gmail or Outlook OAuth
- Real email parsing
- Provider-account authentication
- Persistent user accounts or database storage
- Changes to the seeded itinerary or recovery engine
