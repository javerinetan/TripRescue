// What the traveller values.
//
// Recovery is a trade-off, so the same cancellation should resolve differently
// for a business traveller who must be somewhere at 09:00 than for someone on
// holiday watching the bill. This is the only preference input in V1, and it
// changes the recommended strategy, the mandate, and which supplier the agent
// buys from.

import { useState } from "react";
import { formatSgd } from "./api";
import type { Priority } from "./api";

export default function PrioritySelector({
  priorities,
  selected,
  budget,
  onSelect,
  onBudgetChange,
  disabled,
}: {
  priorities: Priority[];
  selected: string;
  budget: number;
  onSelect: (id: string) => void;
  onBudgetChange: (minorUnits: number) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = priorities.find((p) => p.id === selected);

  return (
    <section className="card">
      <div className="card-head">
        <h2>The mandate this creates</h2>
        <button className="ghost small-btn" onClick={() => setOpen((v) => !v)}>
          {open ? "Done" : "Adjust"}
        </button>
      </div>

      <p className="mandate-summary">
        <strong>{current?.label ?? selected}</strong>
        <span> · up to {formatSgd(budget)} · ranks offers by {current?.rank}</span>
      </p>

      {!open ? null : (
        <>

      <div className="priorities">
        {priorities.map((priority) => (
          <button
            key={priority.id}
            className={`priority ${priority.id === selected ? "on" : ""}`}
            disabled={disabled}
            onClick={() => onSelect(priority.id)}
          >
            <span className="priority-label">{priority.label}</span>
            <span className="priority-summary">{priority.summary}</span>
            <span className="priority-rank">ranks offers by {priority.rank}</span>
          </button>
        ))}
      </div>

      <label className="budget-input">
        <span className="label">Maximum additional spend</span>
        <input
          type="range"
          min={5000}
          max={80000}
          step={1000}
          value={budget}
          disabled={disabled}
          onChange={(event) => onBudgetChange(Number(event.target.value))}
        />
        <output>{formatSgd(budget)}</output>
      </label>
        </>
      )}
    </section>
  );
}
