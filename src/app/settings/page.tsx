import { getModelSettings, getRecentRuns, STEPS } from "@/lib/ai";
import { listProviders } from "@/lib/ai/providers";
import { ModelSettings } from "@/components/model-settings";

export default async function SettingsPage() {
  const providers = listProviders().map(({ id, label, apiKeyEnv, baseUrl, configured, kind }) => ({
    id,
    label,
    apiKeyEnv,
    baseUrl: baseUrl ?? null,
    configured,
    kind,
  }));
  const models = await getModelSettings();
  const runs = await getRecentRuns(15);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
        <p className="mt-1 text-sm text-muted">
          Keys live in <code className="font-mono">.env.local</code> and never reach the browser. Pick a model per step
          as <code className="font-mono">provider:model</code>; an empty step uses the default.
        </p>
      </div>

      <ModelSettings providers={providers} models={models} steps={STEPS.map((s) => ({ ...s }))} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent AI calls</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Step</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Tokens in / out</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{r.createdAt}</td>
                    <td className="px-3 py-2">{r.step}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.provider}:{r.model}</td>
                    <td className="px-3 py-2">{r.inputTokens ?? "–"} / {r.outputTokens ?? "–"}</td>
                    <td className="px-3 py-2">{(r.durationMs / 1000).toFixed(1)}s</td>
                    <td className={`px-3 py-2 ${r.status === "ok" ? "text-accent" : "text-danger"}`}>
                      {r.status === "ok" ? "ok" : r.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
