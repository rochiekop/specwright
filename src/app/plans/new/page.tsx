import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { PlanForm } from "@/components/plan-form";
import { Stepper } from "@/components/stepper";
import { createPlan } from "../../actions";

export default async function NewPlanPage(props: PageProps<"/plans/new">) {
  const { project: projectId } = await props.searchParams;
  if (typeof projectId !== "string") notFound();
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.id, projectId) });
  if (!project) notFound();
  const presets = await db.query.stackPresets.findMany();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/projects/${project.id}`} className="text-sm text-muted hover:text-text">← {project.name}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">What are you building?</h1>
        <p className="mt-1 text-sm text-muted">Start with the idea. Next, a few targeted questions fill in what the PRD needs.</p>
      </div>
      <Stepper current="idea" />
      <PlanForm action={createPlan} presets={presets} hidden={{ projectId: project.id }} submitLabel="Create plan" />
    </div>
  );
}
