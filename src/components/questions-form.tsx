"use client";

import { useState, useTransition } from "react";
import type { Answers, Question } from "@/db/schema";
import { finishQuestions, saveAnswers, type StepResult } from "@/app/plan-actions";

type Draft = {
  picked: string[]; // chosen options (choice questions)
  otherOn: boolean;
  other: string; // free text: the "other" answer, or the whole answer for text questions
  skipped: boolean;
};

function toDraft(q: Question, a: Answers[string] | undefined): Draft {
  if (a === null) return { picked: [], otherOn: false, other: "", skipped: true };
  if (q.type === "text") return { picked: [], otherOn: false, other: typeof a === "string" ? a : "", skipped: false };
  const values = a === undefined ? [] : Array.isArray(a) ? a : [a];
  const opts = q.options ?? [];
  const picked = values.filter((v) => opts.includes(v));
  const extra = values.filter((v) => !opts.includes(v));
  return { picked, otherOn: extra.length > 0, other: extra.join("; "), skipped: false };
}

/** undefined = not answered yet, null = skipped on purpose */
function toAnswer(q: Question, d: Draft): Answers[string] | undefined {
  if (d.skipped) return null;
  const other = d.otherOn ? d.other.trim() : "";
  if (q.type === "text") return d.other.trim() || undefined;
  if (q.type === "single_choice") return other || d.picked[0] || undefined;
  const all = [...d.picked, ...(other ? [other] : [])];
  return all.length ? all : undefined;
}

export function QuestionsForm({ planId, questions, answers }: { planId: string; questions: Question[]; answers: Answers }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, toDraft(q, answers[q.id])])),
  );
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"save" | "finish" | null>(null);
  const [result, setResult] = useState<StepResult & { saved?: boolean }>({});

  const draftOf = (q: Question) => drafts[q.id] ?? toDraft(q, answers[q.id]);
  const update = (q: Question, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [q.id]: { ...draftOf(q), ...patch } }));

  const collected = Object.fromEntries(questions.map((q) => [q.id, toAnswer(q, draftOf(q))]));
  const answeredCount = Object.values(collected).filter((a) => a !== undefined).length;
  const hasFollowups = questions.some((q) => (q.round ?? 1) > 1);

  function submit(kind: "save" | "finish") {
    const unanswered = Object.values(collected).filter((a) => a === undefined).length;
    if (kind === "finish" && unanswered > 0 && !confirm(`${unanswered} question(s) are unanswered. Treat them as skipped?`)) return;
    // Unanswered questions are stored as skipped (null) when finishing, and left out when just saving.
    const payload: Answers = {};
    for (const [k, v] of Object.entries(collected)) {
      if (v !== undefined) payload[k] = v;
      else if (kind === "finish") payload[k] = null;
    }
    setBusy(kind);
    setResult({});
    start(async () => {
      const res = kind === "save" ? await saveAnswers(planId, payload) : await finishQuestions(planId, payload);
      setResult({ ...res, saved: kind === "save" && !res.error });
      setBusy(null);
    });
  }

  return (
    <div className="space-y-4">
      {result.followups ? (
        <div className="rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm">
          <div className="font-medium">A few follow-ups before writing the PRD</div>
          {result.assessment && <p className="mt-1 text-muted">{result.assessment}</p>}
        </div>
      ) : null}

      <ol className="space-y-3">
        {questions.map((q, i) => {
          const d = draftOf(q);
          const followup = (q.round ?? 1) > 1;
          return (
            <li key={q.id} className={`card p-4 ${d.skipped ? "opacity-60" : ""} ${followup ? "border-accent/50" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">
                    {followup ? "Follow-up" : `Question ${i + 1}`}
                    {q.type === "multi_choice" && " · choose any"}
                  </div>
                  <div className="mt-0.5 font-medium leading-snug">{q.question}</div>
                  {q.why && <div className="mt-1 text-sm text-muted">{q.why}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => update(q, { skipped: !d.skipped })}
                  className="shrink-0 text-sm text-muted underline-offset-2 hover:text-text hover:underline"
                >
                  {d.skipped ? "Answer" : "Skip"}
                </button>
              </div>

              {!d.skipped && (
                <div className="mt-3">
                  {q.type === "text" ? (
                    <textarea
                      rows={3}
                      value={d.other}
                      onChange={(e) => update(q, { other: e.target.value })}
                      className="input resize-y"
                      aria-label={q.question}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(q.options ?? []).map((opt) => {
                        const on = d.picked.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              q.type === "single_choice"
                                ? update(q, { picked: on ? [] : [opt], otherOn: false })
                                : update(q, { picked: on ? d.picked.filter((p) => p !== opt) : [...d.picked, opt] })
                            }
                            className={`rounded-full border px-3 py-1.5 text-left text-sm transition-colors ${
                              on ? "border-accent bg-accent-soft text-text" : "border-border hover:border-accent"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        aria-pressed={d.otherOn}
                        onClick={() =>
                          update(q, q.type === "single_choice" ? { otherOn: !d.otherOn, picked: [] } : { otherOn: !d.otherOn })
                        }
                        className={`rounded-full border border-dashed px-3 py-1.5 text-sm ${
                          d.otherOn ? "border-accent bg-accent-soft" : "border-border text-muted hover:border-accent"
                        }`}
                      >
                        Other…
                      </button>
                      {d.otherOn && (
                        <input
                          autoFocus
                          value={d.other}
                          onChange={(e) => update(q, { other: e.target.value })}
                          placeholder="Your own answer"
                          className="input mt-1 basis-full"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {answeredCount}/{questions.length} answered or skipped
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {result.saved && <span className="text-sm text-muted">Saved.</span>}
          {result.error && <span className="max-w-md text-sm text-danger">{result.error}</span>}
          <button type="button" disabled={pending} onClick={() => submit("save")} className="btn btn-ghost">
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button type="button" disabled={pending} onClick={() => submit("finish")} className="btn btn-primary">
            {busy === "finish" && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            )}
            {busy === "finish" ? "Checking your answers…" : hasFollowups ? "Continue to PRD" : "Check answers & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
