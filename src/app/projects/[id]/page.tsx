import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { PLAN_STEPS } from "@/lib/plan-steps";
import { deleteProject } from "../../actions";
import { ConfirmButton } from "@/components/confirm-button";

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.id, id) });
  if (!project) notFound();
  const plans = await db.query.plans.findMany({
    where: (p, { eq }) => eq(p.projectId, id),
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:text-text">← Projects</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && <p className="mt-1 text-sm text-muted">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/plans/new?project=${project.id}`} className="btn btn-primary">New plan</Link>
          <form action={deleteProject}>
            <input type="hidden" name="id" value={project.id} />
            <ConfirmButton message={`Delete "${project.name}" and all its plans?`} className="btn btn-ghost text-danger">
              Delete project
            </ConfirmButton>
          </form>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No plans yet. A plan starts from an idea and ends with a PRD, a feature map and tasks.
        </div>
      ) : (
        <ul className="card divide-y divide-border">
          {plans.map((p) => (
            <li key={p.id}>
              <Link href={`/plans/${p.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="truncate text-sm text-muted">{p.idea}</div>
                </div>
                <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent">
                  {PLAN_STEPS.find((s) => s.id === p.currentStep)?.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
