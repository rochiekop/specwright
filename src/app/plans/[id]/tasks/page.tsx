import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { ReviseButton } from "@/components/chat-drawer";
import { ExportButton } from "@/components/export-dialog";
import { Stepper } from "@/components/stepper";
import { TaskBoard } from "@/components/task-board";
import { getPrdVersions } from "@/lib/documents";
import { getFeatureTree } from "@/lib/features";
import { getTaskBoard } from "@/lib/tasks";

export default async function TasksPage(props: PageProps<"/plans/[id]/tasks">) {
  const { id } = await props.params;
  const db = await getDb();
  const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, id) });
  if (!plan) notFound();
  const [tree, tasks, versions] = await Promise.all([getFeatureTree(id), getTaskBoard(id), getPrdVersions(id)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/plans/${plan.id}/prd`} className="text-sm text-muted hover:text-text">← PRD</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.title}: tasks</h1>
          <p className="mt-1 text-sm text-muted">Work top to bottom: a task is ready when everything it depends on is done.</p>
        </div>
        {versions.length > 0 && (
          <div className="flex gap-2">
            <ReviseButton planId={plan.id} />
            <ExportButton planId={plan.id} />
          </div>
        )}
      </div>
      <Stepper current={plan.currentStep} />
      <TaskBoard
        planId={plan.id}
        hasPrd={versions.length > 0}
        features={tree.map((f) => ({ id: f.id, code: f.code, name: f.name, subFeatures: f.subFeatures.map((s) => s.name) }))}
        tasks={tasks}
      />
    </div>
  );
}
