"use client";

import { useActionState, useState, useTransition } from "react";
import { listProviderModels, saveModels, testModel } from "@/app/actions";

type Provider = { id: string; label: string; apiKeyEnv: string; baseUrl: string | null; configured: boolean; kind: string };
type Step = { id: string; label: string; hint: string };

export function ModelSettings({
  providers,
  models,
  steps,
}: {
  providers: Provider[];
  models: Record<string, string>;
  steps: Step[];
}) {
  const [state, formAction, saving] = useActionState(saveModels, {});
  const [values, setValues] = useState(models);
  const [known, setKnown] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string; ms: number } | "pending">>({});
  const [, startTransition] = useTransition();

  function loadModels(providerId: string) {
    setLoadState((s) => ({ ...s, [providerId]: "Loading…" }));
    startTransition(async () => {
      const res = await listProviderModels(providerId);
      if (res.models) {
        setKnown((k) => [...new Set([...k, ...res.models!.map((m) => `${providerId}:${m}`)])].sort());
        setLoadState((s) => ({ ...s, [providerId]: `${res.models!.length} models added to suggestions` }));
      } else {
        setLoadState((s) => ({ ...s, [providerId]: res.error ?? "Failed" }));
      }
    });
  }

  function runTest(key: string) {
    const spec = values[key] || values.default;
    setTests((t) => ({ ...t, [key]: "pending" }));
    startTransition(async () => {
      const res = await testModel(spec);
      setTests((t) => ({ ...t, [key]: res }));
    });
  }

  const rows: Step[] = [{ id: "default", label: "Default model", hint: "Used by every step left empty below." }, ...steps];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Providers</h2>
        <div className="card divide-y divide-border">
          {providers.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <span className={`h-2 w-2 rounded-full ${p.configured ? "bg-accent" : "bg-border"}`} aria-hidden />
                  {p.label}
                  <span className="font-mono text-xs text-muted">{p.id}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {p.configured
                    ? "Configured"
                    : p.id === "ollama"
                      ? "Set OLLAMA_BASE_URL to enable"
                      : `Set ${p.apiKeyEnv}${p.id === "custom" ? " and CUSTOM_BASE_URL" : ""}`}
                  {p.kind !== "anthropic" && p.baseUrl ? ` · ${p.baseUrl}` : ""}
                </div>
                {loadState[p.id] && <div className="mt-1 text-xs text-muted">{loadState[p.id]}</div>}
              </div>
              <button type="button" disabled={!p.configured} onClick={() => loadModels(p.id)} className="btn btn-ghost">
                Load models
              </button>
            </div>
          ))}
        </div>
      </section>

      <form action={formAction}>
        <h2 className="mb-3 text-lg font-semibold">Model per step</h2>
        <datalist id="known-models">
          {known.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <div className="card divide-y divide-border">
          {rows.map((s) => {
            const t = tests[s.id];
            return (
              <div key={s.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[14rem_1fr_auto] sm:items-center">
                <div>
                  <label htmlFor={`m-${s.id}`} className="text-sm font-medium">{s.label}</label>
                  <div className="text-xs text-muted">{s.hint}</div>
                </div>
                <div>
                  <input
                    id={`m-${s.id}`}
                    name={s.id}
                    list="known-models"
                    required={s.id === "default"}
                    value={values[s.id] ?? ""}
                    onChange={(e) => setValues({ ...values, [s.id]: e.target.value })}
                    placeholder={s.id === "default" ? "anthropic:claude-opus-5-5" : `(default) ${values.default}`}
                    className="input font-mono"
                  />
                  {t && (
                    <div className={`mt-1 text-xs ${t === "pending" ? "text-muted" : t.ok ? "text-accent" : "text-danger"}`}>
                      {t === "pending" ? "Testing…" : `${t.ok ? "Replied" : "Failed"} in ${(t.ms / 1000).toFixed(1)}s: ${t.message}`}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => runTest(s.id)} className="btn btn-ghost">Test</button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save models"}</button>
          {state.ok && <span className="text-sm text-muted">Saved.</span>}
          {state.error && <span className="text-sm text-danger">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}
