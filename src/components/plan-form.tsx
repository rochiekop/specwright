"use client";

import { useActionState, useState } from "react";
import type { TechStack } from "@/db/schema";
import type { PlanFormState } from "@/app/actions";
import { LANGUAGES } from "@/lib/plan-steps";

type Preset = { id: string; name: string; techStack: TechStack };

const STACK_FIELDS = [
  { key: "frontend", label: "Frontend" },
  { key: "backend", label: "Backend" },
  { key: "database", label: "Database" },
  { key: "deployment", label: "Deployment" },
] as const;

export function PlanForm({
  action,
  presets,
  hidden,
  initial,
  submitLabel,
}: {
  action: (prev: PlanFormState, fd: FormData) => Promise<PlanFormState>;
  presets: Preset[];
  hidden: Record<string, string>;
  initial?: { title: string; idea: string; language: string; stackPresetId: string | null; techStack: TechStack };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // An existing plan with no preset is a custom stack; only new plans default to the first preset.
  const [presetId, setPresetId] = useState(initial ? (initial.stackPresetId ?? "") : (presets[0]?.id ?? ""));
  const [stack, setStack] = useState<TechStack>(initial?.techStack ?? presets[0]?.techStack ?? {});
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (fd) => {
        setSaved(false);
        await formAction(fd);
        if (initial) setSaved(true);
      }}
      className="space-y-5"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <div>
        <label className="label" htmlFor="title">Plan title</label>
        <input id="title" name="title" required maxLength={120} defaultValue={initial?.title} placeholder="e.g. Budget tracker v1" className="input" />
      </div>

      <div>
        <label className="label" htmlFor="idea">The idea</label>
        <textarea
          id="idea"
          name="idea"
          required
          minLength={20}
          rows={7}
          defaultValue={initial?.idea}
          placeholder="Who is it for, what problem it solves, and the few things it must do. Rough notes are fine; the next step asks follow-up questions."
          className="input resize-y leading-relaxed"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="language">PRD language</label>
          <select id="language" name="language" defaultValue={initial?.language ?? "en"} className="input">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="stackPresetId">Starting stack</label>
          <select
            id="stackPresetId"
            name="stackPresetId"
            value={presetId}
            onChange={(e) => {
              setPresetId(e.target.value);
              const p = presets.find((x) => x.id === e.target.value);
              if (p) setStack(p.techStack);
            }}
            className="input"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="">Custom</option>
          </select>
        </div>
      </div>

      <fieldset className="card grid gap-4 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm text-muted">Tech stack (edit freely; the PRD treats it as fixed)</legend>
        {STACK_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={f.key}>{f.label}</label>
            <input
              id={f.key}
              name={f.key}
              value={stack[f.key] ?? ""}
              onChange={(e) => {
                setStack({ ...stack, [f.key]: e.target.value });
                setPresetId("");
              }}
              className="input"
            />
          </div>
        ))}
      </fieldset>

      {state.error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn btn-primary">{pending ? "Saving…" : submitLabel}</button>
        {saved && !state.error && !pending && <span className="text-sm text-muted">Saved.</span>}
      </div>
    </form>
  );
}
