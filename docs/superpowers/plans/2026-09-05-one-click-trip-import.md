# One-click Trip Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transparent one-click simulated itinerary import that leads into the existing monitoring dashboard without claiming real inbox access.

**Architecture:** A pure state module owns stage order and safe session-state parsing. A focused React component presents the onboarding and timed import sequence; `App` gates the existing dashboard and `TripsHome` presents provenance plus replay. Existing trip APIs keep loading in the background and no server, recovery, payment, or XRPL behavior changes.

**Tech Stack:** React 19, TypeScript, CSS, Vite, Node test runner, sessionStorage

---

### Task 1: Import state model

**Files:**
- Create: `src/tripImportState.test.js`
- Create: `src/tripImportState.ts`

- [ ] **Step 1: Write the failing state tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_SESSION_KEY,
  IMPORT_STAGES,
  clearImportComplete,
  nextImportStage,
  readImportComplete,
  saveImportComplete,
} from "./tripImportState.ts";

test("import stages advance in the order shown to the traveller", () => {
  assert.deepEqual(IMPORT_STAGES.map(({ id }) => id), ["finding", "grouping", "monitoring"]);
  assert.equal(nextImportStage("idle"), "finding");
  assert.equal(nextImportStage("finding"), "grouping");
  assert.equal(nextImportStage("grouping"), "monitoring");
  assert.equal(nextImportStage("monitoring"), "complete");
  assert.equal(nextImportStage("complete"), "complete");
});

test("only the exact completed session value bypasses onboarding", () => {
  const storage = (value) => ({
    getItem: (key) => key === IMPORT_SESSION_KEY ? value : null,
    setItem() {},
    removeItem() {},
  });
  assert.equal(readImportComplete(storage("complete")), true);
  assert.equal(readImportComplete(storage("true")), false);
  assert.equal(readImportComplete(storage(null)), false);
  assert.equal(readImportComplete(null), false);
});

test("storage restrictions never block import or replay", () => {
  const restricted = {
    getItem() { throw new Error("storage disabled"); },
    setItem() { throw new Error("storage disabled"); },
    removeItem() { throw new Error("storage disabled"); },
  };
  assert.equal(readImportComplete(restricted), false);
  assert.doesNotThrow(() => saveImportComplete(restricted));
  assert.doesNotThrow(() => clearImportComplete(restricted));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/tripImportState.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tripImportState.ts`.

- [ ] **Step 3: Implement the minimal state model**

```ts
export const IMPORT_SESSION_KEY = "trip-rescue:import-complete";

export const IMPORT_STAGES = [
  { id: "finding", label: "Finding travel confirmations" },
  { id: "grouping", label: "Grouping bookings into trips" },
  { id: "monitoring", label: "Starting provider monitoring" },
] as const;

export type ImportStage = "idle" | (typeof IMPORT_STAGES)[number]["id"] | "complete";

const NEXT_STAGE: Record<ImportStage, ImportStage> = {
  idle: "finding",
  finding: "grouping",
  grouping: "monitoring",
  monitoring: "complete",
  complete: "complete",
};

export function nextImportStage(stage: ImportStage): ImportStage {
  return NEXT_STAGE[stage];
}

export function readImportComplete(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(IMPORT_SESSION_KEY) === "complete";
  } catch {
    return false;
  }
}

export function saveImportComplete(storage: Pick<Storage, "setItem"> | null): void {
  try { storage?.setItem(IMPORT_SESSION_KEY, "complete"); } catch { /* Session persistence is optional. */ }
}

export function clearImportComplete(storage: Pick<Storage, "removeItem"> | null): void {
  try { storage?.removeItem(IMPORT_SESSION_KEY); } catch { /* Replay still works in memory. */ }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test src/tripImportState.test.js`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the state model**

```bash
git add src/tripImportState.ts src/tripImportState.test.js
git commit -m "test: define trip import state machine"
```

### Task 2: One-click onboarding component

**Files:**
- Create: `src/TripImport.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the onboarding component against the tested state API**

```tsx
import { useEffect, useState } from "react";
import { IMPORT_STAGES, nextImportStage } from "./tripImportState";
import type { ImportStage } from "./tripImportState";

export default function TripImport({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<ImportStage>("idle");
  const active = stage !== "idle" && stage !== "complete";

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => setStage((current) => nextImportStage(current)), 600);
    return () => window.clearTimeout(timer);
  }, [active, stage]);

  useEffect(() => {
    if (stage === "complete") onComplete();
  }, [stage, onComplete]);

  return (
    <section className="import-gate" aria-labelledby="import-title">
      <div className="import-copy">
        <span className="import-kicker">One-time itinerary import</span>
        <h2 id="import-title">Bring your whole trip into one place.</h2>
        <p>Trip Rescue turns travel confirmations into a connected itinerary, then watches the providers for changes.</p>
        <button disabled={active} onClick={() => setStage("finding")}>
          {active ? "Importing…" : "Import my trips"}
        </button>
        <p className="demo-disclosure"><strong>Demo mode</strong> — sample confirmations only; no inbox is accessed.</p>
      </div>
      <div className="privacy-boundary">
        <span className="boundary-label">Your inbox boundary</span>
        <ul className="privacy-list">
          <li><span aria-hidden="true">✓</span> Travel confirmations only</li>
          <li><span aria-hidden="true">✓</span> Structured booking fields retained</li>
          <li><span aria-hidden="true">✓</span> Inbox disconnected after import</li>
        </ul>
        <ol className="import-stages" aria-live="polite">
          {IMPORT_STAGES.map((item) => {
            const currentIndex = IMPORT_STAGES.findIndex(({ id }) => id === stage);
            const itemIndex = IMPORT_STAGES.findIndex(({ id }) => id === item.id);
            const state = stage === "complete" || itemIndex < currentIndex ? "done" : item.id === stage ? "active" : "idle";
            return <li key={item.id} className={state}><span className="import-stage-mark" />{item.label}</li>;
          })}
        </ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Gate the dashboard in `App.tsx`**

Import `useCallback`, `TripImport`, and the storage helpers. Initialize completion with a guarded browser read:

```tsx
const [importComplete, setImportComplete] = useState(() =>
  typeof window !== "undefined" ? readImportComplete(window.sessionStorage) : false,
);

const completeImport = useCallback(() => {
  saveImportComplete(window.sessionStorage);
  setImportComplete(true);
}, []);

const replayImport = useCallback(() => {
  clearImportComplete(window.sessionStorage);
  setImportComplete(false);
}, []);
```

Render `TripImport` when `view === "home" && !importComplete`; otherwise render `TripsHome`. Pass `onReplayImport={replayImport}` to `TripsHome`.

- [ ] **Step 3: Run typechecking and state tests**

Run: `node ./node_modules/typescript/bin/tsc --noEmit && node --test src/tripImportState.test.js`

Expected: TypeScript succeeds and 3 tests pass.

- [ ] **Step 4: Commit onboarding behavior**

```bash
git add src/App.tsx src/TripImport.tsx
git commit -m "feat: add one-click itinerary import"
```

### Task 3: Dashboard provenance and replay

**Files:**
- Modify: `src/TripsHome.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add provenance and replay to `TripsHome`**

Add `onReplayImport: () => void` to the props. Before the monitoring card render:

```tsx
<section className="import-provenance" aria-label="Trip import status">
  <div className="provenance-mark" aria-hidden="true">✓</div>
  <div>
    <strong>{summary ? `${summary.trips} trips · ${summary.bookings} bookings imported` : "Trips imported"}</strong>
    <p>One-time import complete · Inbox disconnected · Monitoring provider feeds</p>
  </div>
  <button className="ghost replay-import" onClick={onReplayImport}>Replay import demo</button>
</section>
```

- [ ] **Step 2: Add the Ripple-aligned visual treatment**

Add focused styles to `src/styles.css`:

```css
.import-gate {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg);
  box-shadow: 0 24px 70px rgba(20, 26, 31, 0.1);
}
.import-copy { padding: clamp(32px, 6vw, 64px); }
.import-kicker, .boundary-label { font: 600 11px/1 var(--mono); letter-spacing: 0.11em; text-transform: uppercase; }
.import-kicker { color: var(--accent); }
.import-copy h2 { max-width: 12ch; margin: 18px 0; font-size: clamp(38px, 6vw, 62px); line-height: 0.98; letter-spacing: -0.05em; }
.import-copy > p { max-width: 52ch; color: var(--muted); }
.import-copy button { margin-top: 16px; }
.demo-disclosure { margin: 20px 0 0; font-size: 12px; }
.demo-disclosure strong { color: var(--text); }
.privacy-boundary { padding: clamp(28px, 5vw, 48px); background: var(--ink); color: var(--on-ink); }
.boundary-label { color: var(--accent-on-ink); }
.privacy-list, .import-stages { list-style: none; margin: 28px 0 0; padding: 0; }
.privacy-list { display: grid; gap: 14px; color: var(--on-ink-dim); font-size: 14px; }
.privacy-list span { color: #38c98a; margin-right: 8px; }
.import-stages { display: grid; gap: 0; border-top: 1px solid var(--ink-line); }
.import-stages li { display: flex; gap: 12px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--ink-line); color: var(--on-ink-faint); font: 12px/1.4 var(--mono); }
.import-stages li.active { color: var(--on-ink); }
.import-stages li.done { color: #6ddba6; }
.import-stage-mark { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-line); }
.import-stages li.active .import-stage-mark { background: var(--accent-on-ink); animation: blink 0.9s ease-in-out infinite; }
.import-stages li.done .import-stage-mark { background: #38c98a; }
.import-provenance { display: flex; align-items: center; gap: 14px; padding: 15px 18px; border: 1px solid rgba(18, 138, 90, 0.28); border-radius: var(--r-md); background: var(--good-wash); }
.provenance-mark { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 50%; background: var(--good); color: white; }
.import-provenance strong { font-size: 14px; font-weight: 600; }
.import-provenance p { margin: 2px 0 0; color: var(--muted); font: 11px/1.5 var(--mono); }
.replay-import { margin-left: auto; white-space: nowrap; }
@media (max-width: 700px) {
  .import-gate { grid-template-columns: 1fr; }
  .import-copy h2 { font-size: 40px; }
  .import-provenance { align-items: flex-start; flex-wrap: wrap; }
  .replay-import { margin-left: 44px; }
}
```

Blend these declarations into existing responsive and reduced-motion sections rather than duplicating media queries.

- [ ] **Step 3: Run the full automated suite**

Run: `npm run check`

Expected: 83 tests pass, 0 fail.

- [ ] **Step 4: Commit the completed interface**

```bash
git add src/TripsHome.tsx src/styles.css
git commit -m "feat: show import provenance and replay"
```

### Task 4: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-05-one-click-trip-import.md`

- [ ] **Step 1: Correct the scope statement in `README.md`**

Replace “email itinerary ingestion” in the V1 out-of-scope paragraph with “live email-provider OAuth and parsing,” and add:

```md
**Simulated ingestion.** The one-click import uses sample confirmations and never
accesses an inbox. It demonstrates the intended privacy boundary: production
would retain structured booking fields, disconnect from email after import, and
monitor provider feeds thereafter.
```

- [ ] **Step 2: Run final checks**

Run: `npm run check && npm run build`

Expected: 83 tests pass, 0 fail; Vite production build succeeds.

- [ ] **Step 3: Perform browser QA at desktop and mobile widths**

Verify:

- First load shows the demo disclosure before any trip data.
- One click advances through all three stages and reveals the dashboard.
- Provenance counts match the monitoring summary.
- Refresh stays on the dashboard in the same tab.
- Replay returns to onboarding without changing server data.
- Keyboard focus is visible and reduced motion removes decorative animation.
- At 390 px width, no horizontal overflow or clipped controls appear.
- Browser console contains no application errors or React warnings.

- [ ] **Step 4: Commit documentation and verification notes**

```bash
git add README.md docs/superpowers/plans/2026-09-05-one-click-trip-import.md
git commit -m "docs: explain simulated itinerary ingestion"
```

- [ ] **Step 5: Push the feature branch and open a PR**

```bash
git push -u origin feature/one-click-trip-import
gh pr create --base main --head feature/one-click-trip-import --title "Add privacy-first one-click trip import demo" --body "Adds a transparent simulated itinerary import, session persistence, dashboard provenance, and replay. No inbox is accessed. Verified by the full test suite, production build, and desktop/mobile browser QA."
```
