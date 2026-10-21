import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { ReviseButton } from "@/components/chat-drawer";
import { PrdWorkspace } from "@/components/prd-workspace";
import { QualityPanel } from "@/components/quality-panel";
import { Stepper } from "@/components/stepper";
import { getPrdVersions } from "@/lib/documents";

export default async function PrdPage(props: PageProps<"/plans/[id]/prd">) {
  const { id } = await props.params;
  const db = await getDb();
  const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, id) });
  if (!plan) notFound();
  const versions = await getPrdVersions(id);
  const findings = await db.query.qualityFindings.findMany({ where: (f, { eq }) => eq(f.planId, id) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/plans/${plan.id}/features`} className="text-sm text-muted hover:text-text">← Feature map</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.title}: PRD</h1>
        </div>
        {versions.length > 0 && (
          <div className="flex gap-2">
            <ReviseButton planId={plan.id} />
            <Link href={`/plans/${plan.id}/tasks`} className="btn btn-primary">
              {plan.currentStep === "tasks" ? "Open tasks →" : "Continue to tasks →"}
            </Link>
          </div>
        )}
      </div>
      <Stepper current={plan.currentStep} />
      {versions.length > 0 && <QualityPanel planId={plan.id} latestVersion={versions[0].version} findings={findings} />}
      <PrdWorkspace planId={plan.id} title={plan.title} versions={versions} />
    </div>
  );
}
