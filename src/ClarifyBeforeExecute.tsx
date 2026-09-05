// The last thing between a strategy and the traveller's money.
//
// The agent has already decided. This screen exists so that the parts of that
// decision it had to assume are said out loud, in the traveller's words, while
// they can still be changed. Each question already shows the assumption the
// agent would have made, so agreeing is a single click — the point is not to
// slow anyone down, it is that nothing important happens silently.
//
// Every answer rewrites the mandate and re-plans. If an answer makes the chosen
// strategy non-compliant, it is refused here rather than at the payment step,
// which is the honest outcome: the traveller changed the rules, and the rules
// are what the agent obeys.

import { useEffect, useState } from "react";
import { fetchClarifications } from "./api";
import type { Clarification, ClarificationPatch } from "./api";
import type { RecoveryPlan } from "./types";

function mergePatches(selected: Map<string, ClarificationPatch>): ClarificationPatch {
  const merged: ClarificationPatch = {};
  for (const patch of selected.values()) {
    if (patch.addPreserve?.length) {
      merged.addPreserve = [...new Set([...(merged.addPreserve ?? []), ...patch.addPreserve])];
    }
    if (patch.dropPreserve?.length) {
      merged.dropPreserve = [...new Set([...(merged.dropPreserve ?? []), ...patch.dropPreserve])];
    }
    if (patch.arrivalDeadline) merged.arrivalDeadline = patch.arrivalDeadline;
    if (patch.budgetMinorUnits) merged.budgetMinorUnits = patch.budgetMinorUnits;
    if (patch.allowedTiers?.length) merged.allowedTiers = patch.allowedTiers;
  }
  return merged;
}

export default function ClarifyBeforeExecute({
  plan,
  onConfirm,
  onCancel,
  refused,
  unlocked,
  working,
}: {
  plan: RecoveryPlan;
  onConfirm: (patch: ClarificationPatch, force: boolean) => void;
  onCancel: () => void;
  refused: string | null;
  unlocked: string | null;
  working: boolean;
}) {
  const [questions, setQuestions] = useState<Clarification[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setQuestions(null);
    setFailed(false);
    fetchClarifications(plan.id)
      .then((found) => {
        if (!live) return;
        setQuestions(found);
        // Pre-select the agent's own assumption so confirming everything is one
        // click. A traveller who agrees should not have to say so four times.
        setAnswers(
          Object.fromEntries(
            found.map((q) => [q.id, (q.options.find((o) => o.assumed) ?? q.options[0]).value]),
          ),
        );
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [plan.id]);

  if (failed) {
    // Never block execution on this screen failing. The mandate is still
    // enforced at prepare and at execute, so the agent stays safe either way.
    return (
      <section className="card clarify">
        <p className="muted small">Could not load the pre-flight questions.</p>
        <button onClick={() => onConfirm({}, true)}>Execute {plan.title} anyway</button>
      </section>
    );
  }

  if (questions === null) {
    return (
      <section className="card clarify">
        <span className="clarify-kicker">Pre-flight</span>
        <p className="muted small">Working out what I should not assume…</p>
      </section>
    );
  }

  const selected = new Map<string, ClarificationPatch>();
  for (const question of questions) {
    const chosen = question.options.find((o) => o.value === answers[question.id]);
    if (chosen) selected.set(question.id, chosen.patch);
  }
  const patch = mergePatches(selected);
  const changed = Object.keys(patch).length > 0;

  return (
    <section className="card clarify" aria-label="Confirm before executing">
      <div className="card-head">
        <div>
          <span className="clarify-kicker">Before I spend anything</span>
          <h2>
            {questions.length === 0
              ? "Nothing here is ambiguous."
              : `${questions.length} thing${questions.length === 1 ? "" : "s"} I will not assume`}
          </h2>
        </div>
        <span className="panel-sub">{plan.title}</span>
      </div>

      {questions.length === 0 ? (
        <p className="clarify-lede">
          Your mandate already decides everything this strategy touches — the budget, the
          arrival deadline, which suppliers are allowed, and what has to survive. There is
          nothing left for me to guess at.
        </p>
      ) : (
        <p className="clarify-lede">
          Each answer is already set to what I would have assumed. Change one and I re-plan
          before anything is paid.
        </p>
      )}

      <div className="clarify-list">
        {questions.map((question) => {
          const chosen = question.options.find((o) => o.value === answers[question.id]);
          const assumed = chosen?.assumed === true;
          return (
            <div key={question.id} className={`clarify-item ${assumed ? "" : "edited"}`}>
              <div className="clarify-q">
                <strong>{question.question}</strong>
                <p className="clarify-detail">{question.detail}</p>
                <p className="clarify-why">{question.why}</p>
              </div>

              <div className="clarify-answer">
                <label className="visually-hidden" htmlFor={`clarify-${question.id}`}>
                  {question.question}
                </label>
                <select
                  id={`clarify-${question.id}`}
                  value={answers[question.id] ?? ""}
                  disabled={working}
                  onChange={(event) =>
                    setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                  }
                >
                  {question.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                      {option.assumed ? "  (my assumption)" : ""}
                    </option>
                  ))}
                </select>
                {chosen && <p className="clarify-effect">{chosen.effect}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {unlocked && (
        <div className="clarify-unlocked" role="status">
          <strong>{unlocked}</strong>
          <p>
            Your answer opened up a strategy the mandate was refusing. Choose it above, or
            execute {plan.title} anyway.
          </p>
        </div>
      )}

      {refused && (
        <div className="clarify-refused" role="alert">
          <strong>{plan.title} is now refused.</strong>
          <p>{refused}</p>
          <p className="muted small">
            Your answers changed the mandate, and this strategy no longer satisfies it. Pick
            another strategy above, or relax the answer that caused it.
          </p>
        </div>
      )}

      <div className="clarify-actions">
        <button onClick={() => onConfirm(patch, unlocked !== null)} disabled={working}>
          {working
            ? "Re-checking…"
            : unlocked
              ? `Execute ${plan.title} anyway`
              : changed
                ? `Apply and execute ${plan.title}`
                : `Execute ${plan.title}`}
        </button>
        <button className="ghost" onClick={onCancel} disabled={working}>
          Choose a different strategy
        </button>
      </div>

      <p className="clarify-foot">
        Whatever you answer, the mandate is re-checked when the payment is prepared and again
        before it is signed. This screen can only make it stricter or looser — never optional.
      </p>
    </section>
  );
}
