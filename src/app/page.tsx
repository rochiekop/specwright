import Link from "next/link";
import { getDb } from "@/db";
import { listProviders } from "@/lib/ai/providers";
import { createProject } from "./actions";

export default async function ProjectsPage() {
  const db = await getDb();
  const projects = await db.query.projects.findMany({ orderBy: (p, { desc }) => [desc(p.createdAt)] });
  const plans = await db.query.plans.findMany({ columns: { id: true, projectId: true } });
  const anyProvider = listProviders().some((p) => p.configured);

  return (
    <div className="space-y-8">
      {!anyProvider && (
        <div className="rounded-lg border border-warn/40 bg-surface p-4 text-sm">
          No AI provider is configured yet. Add an API key to <code className="font-mono">.env.local</code> (see{" "}
          <code className="font-mono">.env.example</code>), restart the app, then pick models on the{" "}
          <Link href="/settings" className="text-accent underline">Models</Link> page.
        </div>
      )}

      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted">A project groups the plans (PRDs) for one product.</p>
      </section>

      <form action={createProject} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="name">New project</label>
          <input id="name" name="name" required maxLength={120} placeholder="e.g. Budget tracker" className="input" />
        </div>
        <div className="flex-[2]">
          <label className="label" htmlFor="description">Description <span className="font-normal text-muted">(optional)</span></label>
          <input id="description" name="description" placeholder="One line about the product" className="input" />
        </div>
        <button className="btn btn-primary">Create</button>
      </form>

      {projects.length === 0 ? (
        <p className="text-sm text-muted">No projects yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const count = plans.filter((x) => x.projectId === p.id).length;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="card block p-4 transition-colors hover:border-accent">
                  <div className="font-medium">{p.name}</div>
                  {p.description && <div className="mt-1 text-sm text-muted">{p.description}</div>}
                  <div className="mt-3 text-xs text-muted">{count} {count === 1 ? "plan" : "plans"}</div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
