"use client";

import { diffLines } from "diff";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { restorePrdVersion, savePrdEdit } from "@/app/plan-actions";
import { Markdown } from "./markdown";

export type PrdVersion = { version: number; reason: string; createdAt: string; content: string };

const ERROR_MARK = "\u001eERROR ";

function reasonLabel(reason: string) {
  if (reason.startsWith("restore:")) return `restored from v${reason.slice(8)}`;
  return { generate: "AI draft", regenerate: "AI rewrite", manual: "your edit", quality_fix: "quality fix" }[reason] ?? reason;
}

// SQLite stores UTC ("YYYY-MM-DD HH:MM:SS"). The server and browser run on the same machine,
// so formatting in the local time zone gives the same text on both sides (no hydration mismatch).
const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function versionLabel(v: PrdVersion) {
  return `v${v.version} · ${reasonLabel(v.reason)} · ${timeFmt.format(new Date(v.createdAt.replace(" ", "T") + "Z"))}`;
}

type Mode = "view" | "edit" | "compare" | "stream";

export function PrdWorkspace({ planId, title, versions }: { planId: string; title: string; versions: PrdVersion[] }) {
  const router = useRouter();
  const latest = versions[0];
  const [selected, setSelected] = useState<number | null>(null); // null = always the newest
  const current = versions.find((v) => v.version === selected) ?? latest;
  const [mode, setMode] = useState<Mode>("view");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);

  // Stop an in-flight generation when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function write() {
    if (latest && !confirm("Write a new PRD from the idea and answers? It becomes a new version; older versions stay available.")) return;
    setError(undefined);
    setNotice(undefined);
    setStreamText("");
    setMode("stream");
    const ac = new AbortController();
    abortRef.current = ac;
    let text = "";
    try {
      const res = await fetch(`/api/plans/${planId}/prd`, { method: "POST", signal: ac.signal });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pendingFrame = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        // Re-render at most once per frame; markdown parsing on every chunk is wasteful.
        if (!pendingFrame) {
          pendingFrame = true;
          requestAnimationFrame(() => {
            pendingFrame = false;
            setStreamText(text);
          });
        }
      }
      const errAt = text.indexOf(ERROR_MARK);
      if (errAt >= 0) throw new Error(text.slice(errAt + ERROR_MARK.length));
      setSelected(null);
      setMode("view");
      setNotice("New version saved.");
      router.refresh();
    } catch (e) {
      if (ac.signal.aborted) {
        setNotice("Stopped. Nothing was saved.");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
      setMode("view");
    } finally {
      abortRef.current = null;
    }
  }

  function download() {
    if (!current) return;
    const blob = new Blob([current.content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "prd"}-v${current.version}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- empty state ----------
  if (!latest && mode !== "stream") {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold">Write the PRD</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Uses your idea, answers and stack. It streams in section by section and usually takes one to three minutes.
          Skipped answers become listed assumptions, not guesses.
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
        <button type="button" onClick={write} className="btn btn-primary mt-5">Write PRD</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="card sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 p-2">
        <div className="flex items-center gap-2">
          {mode === "stream" ? (
            <span className="flex items-center gap-2 px-2 text-sm">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
              {/* Reasoning models think for a while before the first word arrives. */}
              {streamText
                ? `Writing… ${streamText.split(/\s+/).filter(Boolean).length} words`
                : "Planning the document… (this can take up to a minute)"}
            </span>
          ) : (
            <select
              aria-label="Version"
              value={current.version}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSelected(v === latest.version ? null : v);
              }}
              disabled={mode === "edit"}
              className="input w-auto py-1.5"
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {versionLabel(v)}
                  {v.version === latest.version ? " (latest)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "stream" ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="btn btn-ghost text-danger">Stop</button>
          ) : mode === "edit" ? null : (
            <>
              {current.version !== latest.version && <RestoreButton planId={planId} version={current.version} onDone={(v) => { setSelected(null); setNotice(`Restored as v${v}.`); router.refresh(); }} />}
              <button type="button" onClick={() => setMode(mode === "compare" ? "view" : "compare")} disabled={versions.length < 2} className="btn btn-ghost" title={versions.length < 2 ? "Needs two versions" : undefined}>
                {mode === "compare" ? "Close compare" : "Compare"}
              </button>
              <button type="button" onClick={() => setMode("edit")} className="btn btn-ghost">Edit</button>
              <button type="button" onClick={download} className="btn btn-ghost">Download .md</button>
              <button type="button" onClick={write} className="btn btn-ghost">Rewrite with AI</button>
            </>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && mode === "view" && <p className="text-sm text-muted">{notice}</p>}

      {mode === "stream" && (
        <article className="card p-6">
          <Markdown text={streamText} streaming />
        </article>
      )}
      {mode === "view" && (
        <article className="card p-6">
          {current.version !== latest.version && (
            <p className="mb-4 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
              You are viewing an older version. Restore it to make it the latest again.
            </p>
          )}
          <Markdown text={current.content} />
        </article>
      )}
      {mode === "edit" && (
        <Editor
          planId={planId}
          base={current}
          isLatest={current.version === latest.version}
          nextVersion={latest.version + 1}
          onCancel={() => setMode("view")}
          onSaved={(v) => {
            setSelected(null);
            setMode("view");
            setNotice(v === latest.version ? "No changes to save." : `Saved as v${v}.`);
            router.refresh();
          }}
        />
      )}
      {mode === "compare" && <Compare versions={versions} initialTo={current.version} />}
    </div>
  );
}

function RestoreButton({ planId, version, onDone }: { planId: string; version: number; onDone: (v: number) => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn btn-primary"
      onClick={() =>
        start(async () => {
          const res = await restorePrdVersion(planId, version);
          if (res.error) alert(res.error);
          else if (res.version) onDone(res.version);
        })
      }
    >
      {pending ? "Restoring…" : `Restore v${version}`}
    </button>
  );
}

function Editor({
  planId,
  base,
  isLatest,
  nextVersion,
  onCancel,
  onSaved,
}: {
  planId: string;
  base: PrdVersion;
  isLatest: boolean;
  nextVersion: number;
  onCancel: () => void;
  onSaved: (version: number) => void;
}) {
  const [text, setText] = useState(base.content);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const dirty = text !== base.content;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">
          Editing v{base.version}
          {!isLatest && " (an older version)"}. Saving creates v{nextVersion}.
        </span>
        <div className="flex gap-1 rounded-md bg-surface-2 p-0.5">
          <button type="button" onClick={() => setPreview(false)} className={`rounded px-3 py-1 ${!preview ? "bg-surface shadow-sm" : "text-muted"}`}>Markdown</button>
          <button type="button" onClick={() => setPreview(true)} className={`rounded px-3 py-1 ${preview ? "bg-surface shadow-sm" : "text-muted"}`}>Preview</button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-[60vh] rounded-md border border-border p-5">
          <Markdown text={text} />
        </div>
      ) : (
        <textarea
          aria-label="PRD markdown"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="input min-h-[70vh] resize-y font-mono text-[13px] leading-relaxed"
        />
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            if (!dirty || confirm("Discard your changes?")) onCancel();
          }}
          className="btn btn-ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const res = await savePrdEdit(planId, text);
              if (res.error) setError(res.error);
              else if (res.version) onSaved(res.version);
            })
          }
          className="btn btn-primary"
        >
          {pending ? "Saving…" : `Save as v${nextVersion}`}
        </button>
      </div>
    </div>
  );
}

function Compare({ versions, initialTo }: { versions: PrdVersion[]; initialTo: number }) {
  const older = versions.find((v) => v.version < initialTo);
  const [from, setFrom] = useState(older?.version ?? versions[versions.length - 1].version);
  const [to, setTo] = useState(initialTo);
  const a = versions.find((v) => v.version === from)!;
  const b = versions.find((v) => v.version === to)!;

  const parts = useMemo(() => diffLines(a.content, b.content), [a, b]);
  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);

  const select = (value: number, onChange: (v: number) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} className="input w-auto py-1.5">
      {versions.map((v) => (
        <option key={v.version} value={v.version}>{versionLabel(v)}</option>
      ))}
    </select>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 text-sm">
        {select(from, setFrom, "Compare from")}
        <span className="text-muted">→</span>
        {select(to, setTo, "Compare to")}
        <span className="ml-auto">
          <span className="text-accent">+{added}</span> <span className="text-danger">−{removed}</span> lines
        </span>
      </div>
      {added === 0 && removed === 0 ? (
        <p className="p-6 text-sm text-muted">These versions are identical.</p>
      ) : (
        <pre className="overflow-x-auto p-0 font-mono text-[12.5px] leading-relaxed">
          {parts.map((p, i) => {
            const lines = p.value.replace(/\n$/, "").split("\n");
            if (!p.added && !p.removed) {
              // Keep 3 lines of context around changes and fold the rest.
              if (lines.length <= 8) return lines.map((l, j) => <Line key={`${i}-${j}`} kind=" " text={l} />);
              const head = i === 0 ? [] : lines.slice(0, 3);
              const tail = i === parts.length - 1 ? [] : lines.slice(-3);
              return [
                ...head.map((l, j) => <Line key={`${i}-h${j}`} kind=" " text={l} />),
                <div key={`${i}-fold`} className="bg-surface-2 px-4 py-1 text-xs text-muted">… {lines.length - head.length - tail.length} unchanged lines</div>,
                ...tail.map((l, j) => <Line key={`${i}-t${j}`} kind=" " text={l} />),
              ];
            }
            return lines.map((l, j) => <Line key={`${i}-${j}`} kind={p.added ? "+" : "-"} text={l} />);
          })}
        </pre>
      )}
    </div>
  );
}

function Line({ kind, text }: { kind: "+" | "-" | " "; text: string }) {
  const cls = kind === "+" ? "bg-accent-soft" : kind === "-" ? "bg-danger-soft" : "";
  return (
    <div className={`whitespace-pre-wrap px-4 ${cls}`}>
      <span className="mr-3 select-none text-muted">{kind}</span>
      {text || " "}
    </div>
  );
}
