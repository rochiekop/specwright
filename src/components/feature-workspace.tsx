"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { addFeature, deleteFeature, generateFeatures, moveFeature, saveFeature } from "@/app/plan-actions";
import { FEATURE_ICONS } from "@/lib/plan-steps";
import { FeatureIcon } from "./feature-icon";
import { FeatureMap, type MapFeature } from "./feature-map";

export function FeatureWorkspace({
  planId,
  title,
  features,
  hasPrd,
}: {
  planId: string;
  title: string;
  features: MapFeature[];
  hasPrd: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"generate" | "add" | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const selected = features.find((f) => f.id === selectedId) ?? null;
  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  function generate() {
    if (features.length && !confirm("Rebuild the whole map from your idea and answers? Your edits to the current map will be replaced.")) return;
    setError(undefined);
    setBusy("generate");
    setSelectedId(null);
    start(async () => {
      const res = await generateFeatures(planId);
      if (res.error) setError(res.error);
      setBusy(null);
      router.refresh();
    });
  }

  function add() {
    setBusy("add");
    start(async () => {
      const res = await addFeature(planId);
      setBusy(null);
      if (res.error) setError(res.error);
      else if (res.id) setSelectedId(res.id);
      router.refresh();
    });
  }

  if (!features.length) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold">Build the feature map</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Turns your idea and answers into the app&apos;s features (menus and modules) and the screens or actions inside
          each one, grouped into build phases. You can edit everything before the PRD is written. Takes about 20–40 seconds.
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button type="button" disabled={pending} onClick={generate} className="btn btn-primary mt-5">
          {busy === "generate" && <Spinner />}
          {busy === "generate" ? "Building the map…" : "Build feature map"}
        </button>
      </div>
    );
  }

  const phases = [...new Set(features.map((f) => f.phase))].sort();
  const subCount = features.reduce((n, f) => n + f.subFeatures.length, 0);

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center justify-between gap-2 p-2">
        <span className="px-2 text-sm text-muted" aria-live="polite">
          {notice ?? (
            <>
              {features.length} features · {subCount} sub-features · {phases.length} phase{phases.length === 1 ? "" : "s"}.
              Click a feature to edit it.
            </>
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={add} className="btn btn-ghost">
            {busy === "add" ? "Adding…" : "Add feature"}
          </button>
          <button type="button" disabled={pending} onClick={generate} className="btn btn-ghost">
            {busy === "generate" && <Spinner />}
            {busy === "generate" ? "Rebuilding…" : "Rebuild with AI"}
          </button>
          <Link href={`/plans/${planId}/prd`} className="btn btn-primary">
            {hasPrd ? "Open PRD →" : "Continue to PRD →"}
          </Link>
        </div>
      </div>
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="relative">
        <FeatureMap title={title} features={features} selectedId={selectedId} onSelect={onSelect} />
        {selected && (
          <FeatureEditor
            key={selected.id + JSON.stringify(selected)}
            feature={selected}
            isFirstInPhase={features.filter((f) => f.phase === selected.phase)[0]?.id === selected.id}
            isLastInPhase={features.filter((f) => f.phase === selected.phase).at(-1)?.id === selected.id}
            onClose={() => setSelectedId(null)}
            onChanged={(msg) => {
              setNotice(msg);
              router.refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

type SubDraft = { id?: string; key: string; name: string; summary: string };

function FeatureEditor({
  feature,
  isFirstInPhase,
  isLastInPhase,
  onClose,
  onChanged,
}: {
  feature: MapFeature;
  isFirstInPhase: boolean;
  isLastInPhase: boolean;
  onClose: () => void;
  onChanged: (notice?: string) => void;
}) {
  const [name, setName] = useState(feature.name);
  const [summary, setSummary] = useState(feature.summary);
  const [icon, setIcon] = useState(feature.icon);
  const [phase, setPhase] = useState(feature.phase);
  const [priority, setPriority] = useState(feature.priority ?? "medium");
  const [subs, setSubs] = useState<SubDraft[]>(feature.subFeatures.map((s) => ({ ...s, key: s.id })));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const updateSub = (key: string, patch: Partial<SubDraft>) => setSubs((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const moveSub = (i: number, d: -1 | 1) =>
    setSubs((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  function save() {
    setError(undefined);
    start(async () => {
      const res = await saveFeature(feature.id, {
        name,
        summary,
        icon: icon as (typeof FEATURE_ICONS)[number],
        phase,
        priority,
        subFeatures: subs.map(({ id, name, summary }) => ({ id, name, summary })),
      });
      if (res.error) setError(res.error);
      else onChanged(`Saved ${feature.code} ${name}.`);
    });
  }

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    start(async () => {
      const res = await action();
      if (res.error) setError(res.error);
      else {
        after?.();
        onChanged();
      }
    });
  }

  return (
    <aside
      aria-label={`Edit ${feature.name}`}
      className="absolute inset-y-0 right-0 z-10 flex w-full max-w-md flex-col overflow-hidden rounded-r-lg border-l border-border bg-surface shadow-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FeatureIcon name={icon} className="h-4 w-4 text-accent" />
          <span className="font-mono text-xs text-muted">{feature.code}</span> Edit feature
        </div>
        <div className="flex items-center gap-1">
          <button type="button" disabled={pending || isFirstInPhase} onClick={() => run(() => moveFeature(feature.id, -1))} className="btn btn-ghost px-2 py-1 text-xs" title="Move up within the phase">↑</button>
          <button type="button" disabled={pending || isLastInPhase} onClick={() => run(() => moveFeature(feature.id, 1))} className="btn btn-ghost px-2 py-1 text-xs" title="Move down within the phase">↓</button>
          <button type="button" onClick={onClose} className="btn px-2 py-1 text-muted hover:text-text" aria-label="Close">✕</button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <label className="label" htmlFor="f-name">Name</label>
          <input id="f-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="f-summary">Summary</label>
          <textarea id="f-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} className="input resize-y" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="f-phase">Phase</label>
            <select id="f-phase" value={phase} onChange={(e) => setPhase(Number(e.target.value))} className="input">
              {[1, 2, 3, 4].map((p) => <option key={p} value={p}>Phase {p}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-priority">Priority</label>
            <select id="f-priority" value={priority} onChange={(e) => setPriority(e.target.value as "high" | "medium" | "low")} className="input">
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-icon">Icon</label>
            <select id="f-icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="input">
              {FEATURE_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Sub-features ({subs.length})</span>
            <button
              type="button"
              onClick={() => setSubs((l) => [...l, { key: crypto.randomUUID(), name: "", summary: "" }])}
              className="text-sm text-accent hover:underline"
            >
              + Add
            </button>
          </div>
          <ul className="space-y-2">
            {subs.map((s, i) => (
              <li key={s.key} className="rounded-md border border-border p-2">
                <div className="flex gap-1">
                  <input
                    aria-label={`Sub-feature ${i + 1} name`}
                    value={s.name}
                    onChange={(e) => updateSub(s.key, { name: e.target.value })}
                    placeholder="Screen or action, e.g. Add expense"
                    maxLength={80}
                    className="input py-1.5"
                  />
                  <button type="button" disabled={i === 0} onClick={() => moveSub(i, -1)} className="btn btn-ghost px-2 py-1 text-xs" aria-label="Move up">↑</button>
                  <button type="button" disabled={i === subs.length - 1} onClick={() => moveSub(i, 1)} className="btn btn-ghost px-2 py-1 text-xs" aria-label="Move down">↓</button>
                  <button type="button" onClick={() => setSubs((l) => l.filter((x) => x.key !== s.key))} className="btn btn-ghost px-2 py-1 text-xs text-danger" aria-label="Remove">✕</button>
                </div>
                <input
                  aria-label={`Sub-feature ${i + 1} summary`}
                  value={s.summary}
                  onChange={(e) => updateSub(s.key, { summary: e.target.value })}
                  placeholder="One sentence (optional)"
                  className="input mt-1.5 py-1.5 text-xs"
                />
              </li>
            ))}
          </ul>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete "${feature.name}" and its sub-features?`)) run(() => deleteFeature(feature.id), onClose);
          }}
          className="btn btn-ghost text-danger"
        >
          Delete
        </button>
        <div className="flex items-center gap-2">
          <button type="button" disabled={pending} onClick={save} className="btn btn-primary">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}
