"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addTask,
  deleteTask,
  generateTasksForFeature,
  resetTasks,
  setTaskStatus,
  updateTask,
} from "@/app/plan-actions";

type Status = "todo" | "doing" | "done" | "failed";
type Layer = "frontend" | "backend" | "db" | "test";

export type BoardTaskView = {
  id: string;
  code: string;
  featureId: string;
  featureCode: string;
  featureName: string;
  subFeatureName: string | null;
  title: string;
  description: string;
  acceptance: string[];
  layer: Layer;
  priority: "high" | "medium" | "low";
  status: Status;
  source: "ai" | "user";
  dependsOn: { id: string; code: string; title: string; status: Status }[];
  dependents: string[];
  blocked: boolean;
};

export type BoardFeature = { id: string; code: string; name: string; subFeatures: string[] };

const COLUMNS: { id: Status; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "In progress" },
  { id: "done", label: "Done" },
  { id: "failed", label: "Failed" },
];

const LAYER_STYLE: Record<Layer, string> = {
  db: "bg-surface-2 text-warn",
  backend: "bg-surface-2 text-accent",
  frontend: "bg-accent-soft text-accent",
  test: "bg-surface-2 text-muted",
};

type Progress = { featureCode: string; name: string; state: "waiting" | "running" | "done" | "error"; detail?: string };

export function TaskBoard({
  planId,
  hasPrd,
  features,
  tasks,
}: {
  planId: string;
  hasPrd: boolean;
  features: BoardFeature[];
  tasks: BoardTaskView[];
}) {
  const router = useRouter();
  const [featureFilter, setFeatureFilter] = useState("all");
  const [layerFilter, setLayerFilter] = useState<"all" | Layer>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress[] | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const generating = progress?.some((p) => p.state === "running" || p.state === "waiting") ?? false;

  /** Generates feature by feature so each one can reuse the tasks of the features before it. */
  async function generate(only?: BoardFeature) {
    const targets = only ? [only] : features;
    if (!only && tasks.length && !confirm("Regenerate all tasks? Current tasks, including statuses and edits, will be replaced.")) return;
    if (only) {
      // Later features may depend on this feature's tasks; those links cannot survive a regeneration.
      const ownIds = new Set(tasks.filter((t) => t.featureId === only.id).map((t) => t.id));
      const affected = [
        ...new Set(tasks.filter((t) => t.featureId !== only.id && t.dependsOn.some((d) => ownIds.has(d.id))).map((t) => t.featureCode)),
      ];
      const warning = affected.length
        ? `\n\nTasks in ${affected.join(", ")} depend on ${only.code}'s tasks. Those links will be lost; regenerate ${affected.join(", ")} afterwards to restore them.`
        : "";
      if (!confirm(`Regenerate the tasks of ${only.code} ${only.name}? Its current tasks will be replaced.${warning}`)) return;
    }
    setError(undefined);
    setOpenId(null);
    setProgress(targets.map((f) => ({ featureCode: f.code, name: f.name, state: "waiting" })));
    if (!only) {
      const res = await resetTasks(planId);
      if (res.error) {
        setError(res.error);
        setProgress(null);
        return;
      }
    }
    for (const [i, f] of targets.entries()) {
      setProgress((p) => p!.map((x, j) => (j === i ? { ...x, state: "running" } : x)));
      const res = await generateTasksForFeature(planId, f.id);
      setProgress((p) =>
        p!.map((x, j) => (j === i ? { ...x, state: res.error ? "error" : "done", detail: res.error ?? `${res.count} tasks` } : x)),
      );
      router.refresh();
    }
  }

  const visible = useMemo(
    () => tasks.filter((t) => (featureFilter === "all" || t.featureId === featureFilter) && (layerFilter === "all" || t.layer === layerFilter)),
    [tasks, featureFilter, layerFilter],
  );
  const open = tasks.find((t) => t.id === openId) ?? null;
  const done = tasks.filter((t) => t.status === "done").length;
  const ready = tasks.filter((t) => t.status === "todo" && !t.blocked).length;

  // Sub-features that no task delivers: a coverage gap worth fixing before handing tasks to an agent.
  const uncovered = features.flatMap((f) =>
    f.subFeatures.filter((s) => !tasks.some((t) => t.featureId === f.id && t.subFeatureName === s)).map((s) => `${f.code} ${s}`),
  );

  if (!hasPrd) {
    return (
      <div className="card p-8 text-center text-sm text-muted">
        Tasks are generated from the PRD. <Link href={`/plans/${planId}/prd`} className="text-accent underline">Write the PRD first</Link>.
      </div>
    );
  }

  const progressPanel = progress && (
    <div className="card space-y-1.5 p-4 text-sm">
      <div className="mb-1 font-medium">{generating ? "Generating tasks feature by feature…" : "Generation finished"}</div>
      {progress.map((p) => (
        <div key={p.featureCode} className="flex items-center gap-2">
          <span className="w-4 text-center">
            {p.state === "running" ? <Spinner /> : p.state === "done" ? <span className="text-accent">✓</span> : p.state === "error" ? <span className="text-danger">✕</span> : <span className="text-muted">·</span>}
          </span>
          <span className="font-mono text-xs text-muted">{p.featureCode}</span>
          <span className={p.state === "waiting" ? "text-muted" : ""}>{p.name}</span>
          {p.detail && <span className={`text-xs ${p.state === "error" ? "text-danger" : "text-muted"}`}>· {p.detail}</span>}
        </div>
      ))}
      {!generating && (
        <button type="button" onClick={() => setProgress(null)} className="mt-2 text-xs text-muted underline">
          Hide
        </button>
      )}
    </div>
  );

  if (!tasks.length && !progress) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold">Break the plan into tasks</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Each feature becomes focused tasks for a coding agent (database, backend, frontend and tests), with acceptance
          criteria from the PRD and dependencies on earlier work. Runs one feature at a time, about 10–20 seconds each.
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button type="button" onClick={() => generate()} className="btn btn-primary mt-5">Generate tasks</button>
      </div>
    );
  }

  const selectedFeature = features.find((f) => f.id === featureFilter);

  return (
    <div className="space-y-4">
      {progressPanel}
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-48 flex-1">
          <div className="text-sm">
            <span className="font-medium">{done}/{tasks.length} done</span>
            <span className="text-muted"> · {ready} ready to start · {tasks.filter((t) => t.status === "todo" && t.blocked).length} waiting on others</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filter by feature" value={featureFilter} onChange={(e) => setFeatureFilter(e.target.value)} className="input w-auto py-1.5">
            <option value="all">All features</option>
            {features.map((f) => <option key={f.id} value={f.id}>{f.code} {f.name}</option>)}
          </select>
          <select aria-label="Filter by layer" value={layerFilter} onChange={(e) => setLayerFilter(e.target.value as "all" | Layer)} className="input w-auto py-1.5">
            <option value="all">All layers</option>
            <option value="db">Database</option>
            <option value="backend">Backend</option>
            <option value="frontend">Frontend</option>
            <option value="test">Tests</option>
          </select>
          {selectedFeature ? (
            <>
              <button
                type="button"
                disabled={pending || generating}
                onClick={() => start(async () => {
                  const res = await addTask(selectedFeature.id);
                  if (res.error) setError(res.error);
                  else if (res.id) setOpenId(res.id);
                  router.refresh();
                })}
                className="btn btn-ghost"
              >
                Add task
              </button>
              <button type="button" disabled={generating} onClick={() => generate(selectedFeature)} className="btn btn-ghost">
                Regenerate {selectedFeature.code}
              </button>
            </>
          ) : (
            <button type="button" disabled={generating} onClick={() => generate()} className="btn btn-ghost">Regenerate all</button>
          )}
        </div>
      </div>

      {uncovered.length > 0 && !generating && (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-warn">
          No task delivers: {uncovered.join(" · ")}. Regenerate that feature or add a task by hand.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = visible
            .filter((t) => t.status === col.id)
            // Ready work first in "To do"; build order otherwise.
            .sort((a, b) => (col.id === "todo" ? Number(a.blocked) - Number(b.blocked) : 0));
          return (
            <section key={col.id} className="flex min-h-40 flex-col rounded-lg border border-border bg-surface-2/50">
              <h3 className="flex items-center justify-between px-3 py-2 text-sm font-medium">
                {col.label}
                <span className="text-xs text-muted">{items.length}</span>
              </h3>
              <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 xl:max-h-[65vh]">
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(t.id)}
                      className={`w-full rounded-md border bg-surface p-2.5 text-left text-sm transition-colors hover:border-accent ${
                        openId === t.id ? "border-accent" : "border-border"
                      } ${t.status === "todo" && t.blocked ? "opacity-70" : ""}`}
                    >
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="font-mono text-muted">{t.code}</span>
                        <span className={`rounded px-1.5 py-px ${LAYER_STYLE[t.layer]}`}>{t.layer}</span>
                        {t.priority === "high" && <span className="text-danger">high</span>}
                      </div>
                      <div className="mt-1 leading-snug">{t.title}</div>
                      <div className="mt-1 truncate text-xs text-muted">
                        {t.featureName}
                        {t.subFeatureName ? ` › ${t.subFeatureName}` : ""}
                      </div>
                      {t.status === "todo" && t.blocked && (
                        <div className="mt-1 text-xs text-warn">
                          Waits for {t.dependsOn.filter((d) => d.status !== "done").map((d) => d.code).join(", ")}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {open && (
        <TaskPanel
          key={open.id + open.status + open.title}
          task={open}
          onClose={() => setOpenId(null)}
          onOpen={(id) => setOpenId(id)}
          tasks={tasks}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function TaskPanel({
  task,
  tasks,
  onClose,
  onOpen,
  onChanged,
}: {
  task: BoardTaskView;
  tasks: BoardTaskView[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(task.source === "user" && task.title === "New task");
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [acceptance, setAcceptance] = useState(task.acceptance.join("\n"));
  const [layer, setLayer] = useState<Layer>(task.layer);
  const [priority, setPriority] = useState(task.priority);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        after?.();
        onChanged();
      }
    });

  const codeToId = (code: string) => tasks.find((t) => t.code === code)?.id;

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        aria-label={`Task ${task.code}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="text-sm">
            <span className="font-mono text-muted">{task.code}</span>
            <span className="ml-2 text-muted">{task.featureName}{task.subFeatureName ? ` › ${task.subFeatureName}` : ""}</span>
          </div>
          <button type="button" onClick={onClose} className="btn px-2 py-1 text-muted hover:text-text" aria-label="Close">✕</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
            {COLUMNS.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                aria-pressed={task.status === c.id}
                onClick={() => run(() => setTaskStatus(task.id, c.id))}
                className={`rounded-full border px-3 py-1 text-sm ${task.status === c.id ? "border-accent bg-accent-soft" : "border-border hover:border-accent"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {task.blocked && task.status === "todo" && (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-warn">
              Not ready: finish {task.dependsOn.filter((d) => d.status !== "done").map((d) => d.code).join(", ")} first.
            </p>
          )}

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="t-title">Title</label>
                <input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="t-desc">What to build</label>
                <textarea id="t-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="input resize-y" />
              </div>
              <div>
                <label className="label" htmlFor="t-acc">Acceptance criteria <span className="font-normal text-muted">(one per line)</span></label>
                <textarea id="t-acc" rows={5} value={acceptance} onChange={(e) => setAcceptance(e.target.value)} className="input resize-y" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="t-layer">Layer</label>
                  <select id="t-layer" value={layer} onChange={(e) => setLayer(e.target.value as Layer)} className="input">
                    <option value="db">Database</option>
                    <option value="backend">Backend</option>
                    <option value="frontend">Frontend</option>
                    <option value="test">Tests</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="t-prio">Priority</label>
                  <select id="t-prio" value={priority} onChange={(e) => setPriority(e.target.value as "high" | "medium" | "low")} className="input">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
                <div className="mt-1 flex gap-1.5 text-xs">
                  <span className={`rounded px-1.5 py-px ${LAYER_STYLE[task.layer]}`}>{task.layer}</span>
                  <span className="rounded bg-surface-2 px-1.5 py-px text-muted">{task.priority} priority</span>
                  {task.source === "user" && <span className="rounded bg-surface-2 px-1.5 py-px text-muted">edited</span>}
                </div>
              </div>
              {task.description && <p className="text-sm leading-relaxed">{task.description}</p>}
              {task.acceptance.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-medium">Done when</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">{task.acceptance.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-medium">Depends on</h3>
              {task.dependsOn.length === 0 ? (
                <p className="text-sm text-muted">Nothing; can start any time.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {task.dependsOn.map((d) => (
                    <li key={d.id}>
                      <button type="button" onClick={() => onOpen(d.id)} className="text-left hover:underline">
                        <span className={`font-mono text-xs ${d.status === "done" ? "text-accent" : "text-warn"}`}>{d.code}</span> {d.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium">Needed by</h3>
              {task.dependents.length === 0 ? (
                <p className="text-sm text-muted">No other task.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {task.dependents.map((c) => (
                    <li key={c}>
                      <button type="button" onClick={() => codeToId(c) && onOpen(codeToId(c)!)} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs hover:underline">
                        {c}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const note = task.dependents.length ? ` ${task.dependents.join(", ")} will no longer wait for it.` : "";
              if (confirm(`Delete ${task.code}?${note}`)) run(() => deleteTask(task.id), onClose);
            }}
            className="btn btn-ghost text-danger"
          >
            Delete
          </button>
          {editing ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost">Cancel</button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => updateTask(task.id, { title, description, acceptance, layer, priority }), () => setEditing(false))}
                className="btn btn-primary"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost">Edit</button>
          )}
        </div>
      </aside>
    </div>
  );
}

function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}
