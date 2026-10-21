"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fixFinding, runQualityCheck, setFindingStatus } from "@/app/plan-actions";

export type FindingRow = {
  id: string;
  rule: string;
  severity: "error" | "warning" | "info";
  source: "rule" | "ai";
  prdVersion: number;
  section: number | null;
  targetRef: string;
  message: string;
  suggestion: string;
  status: "open" | "fixed" | "dismissed";
  fixedInVersion: number | null;
};

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;
const SEVERITY_STYLE = {
  error: "bg-danger-soft text-danger",
  warning: "bg-surface-2 text-warn",
  info: "bg-surface-2 text-muted",
} as const;

export function QualityPanel({ planId, latestVersion, findings }: { planId: string; latestVersion: number; findings: FindingRow[] }) {
  const router = useRouter();
  const [checking, startCheck] = useTransition();
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [, startFix] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();

  const open = findings.filter((f) => f.status === "open").sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const done = findings.filter((f) => f.status !== "open");
  const aiVersions = findings.filter((f) => f.source === "ai").map((f) => f.prdVersion);
  const hasRun = findings.length > 0;
  const aiCheckedAt = aiVersions.length ? Math.max(...aiVersions) : null;
  const count = (s: FindingRow["severity"]) => open.filter((f) => f.severity === s).length;
  const busy = checking || fixingId !== null;

  function check() {
    setMessage(undefined);
    startCheck(async () => {
      const res = await runQualityCheck(planId);
      if (res.error) setMessage({ kind: "error", text: res.error });
      else if (res.note) setMessage({ kind: "error", text: res.note });
      router.refresh();
    });
  }

  function fix(f: FindingRow) {
    setMessage(undefined);
    setFixingId(f.id);
    startFix(async () => {
      const res = await fixFinding(f.id);
      setFixingId(null);
      if (res.error) setMessage({ kind: "error", text: res.error });
      else setMessage({ kind: "ok", text: `Saved as v${res.version}: ${res.summary} Use Compare in the toolbar below to see the change.` });
      router.refresh();
    });
  }

  function setStatus(f: FindingRow, status: "open" | "dismissed") {
    startFix(async () => {
      await setFindingStatus(f.id, status);
      router.refresh();
    });
  }

  return (
    <details open className="card group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>›</span>
            Quality check
          </div>
          <div className="mt-0.5 text-sm text-muted">
            {!hasRun
              ? "Finds untestable criteria, uncovered requirements, contradictions and gaps before features and tasks are generated."
              : open.length === 0
                ? "No open findings."
                : [
                    plural(count("error"), "error"),
                    plural(count("warning"), "warning"),
                    plural(count("info"), "note"),
                  ].join(" · ")}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            check();
          }}
          className={hasRun ? "btn btn-ghost" : "btn btn-primary"}
        >
          {checking && <Spinner />}
          {checking ? "Reviewing the PRD…" : hasRun ? "Run full check again" : "Run quality check"}
        </button>
      </summary>

      <div className="space-y-3 border-t border-border p-4">
        {checking && <p className="text-sm text-muted">Automatic checks are instant; the AI review usually takes 30–90 seconds.</p>}
        {aiCheckedAt !== null && aiCheckedAt < latestVersion && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
            The PRD changed since the AI review (v{aiCheckedAt} → v{latestVersion}). Automatic checks are up to date; run the
            full check again to refresh the AI findings.
          </p>
        )}
        {message && (
          <p className={`rounded-md px-3 py-2 text-sm ${message.kind === "ok" ? "bg-accent-soft" : "bg-danger-soft text-danger"}`}>{message.text}</p>
        )}

        {open.length > 0 && (
          <ul className="space-y-2">
            {open.map((f) => (
              <li key={f.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className={`rounded px-1.5 py-0.5 font-medium ${SEVERITY_STYLE[f.severity]}`}>{f.severity}</span>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">{f.source === "ai" ? "AI review" : "rule"} · {f.rule}</span>
                      {f.section && <span className="text-muted">§{f.section}</span>}
                      <span className="font-mono text-muted">{f.targetRef}</span>
                      {f.prdVersion < latestVersion && f.source === "ai" && <span className="text-warn">from v{f.prdVersion}</span>}
                    </div>
                    <p className="mt-1.5 text-sm">{f.message}</p>
                    {f.suggestion && <p className="mt-1 text-sm text-muted">→ {f.suggestion}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => setStatus(f, "dismissed")} className="btn btn-ghost px-2.5 py-1.5 text-xs">
                      Dismiss
                    </button>
                    <button type="button" disabled={busy} onClick={() => fix(f)} className="btn btn-primary px-2.5 py-1.5 text-xs">
                      {fixingId === f.id && <Spinner />}
                      {fixingId === f.id ? `Rewriting §${f.section ?? "?"}…` : "Fix with AI"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Fixed or dismissed ({done.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {done.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-muted">
                  <span className="min-w-0 flex-1">
                    <span className={f.status === "fixed" ? "text-accent" : ""}>
                      {f.status === "fixed" ? `Fixed in v${f.fixedInVersion}` : "Dismissed"}
                    </span>{" "}
                    · <span className="font-mono">{f.targetRef}</span> · {f.message}
                  </span>
                  {f.status === "dismissed" && (
                    <button type="button" disabled={busy} onClick={() => setStatus(f, "open")} className="underline-offset-2 hover:underline">
                      Undo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}
