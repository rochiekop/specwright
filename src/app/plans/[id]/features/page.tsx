import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { ReviseButton } from "@/components/chat-drawer";
import { FeatureWorkspace } from "@/components/feature-workspace";
import { Stepper } from "@/components/stepper";
import { getPrdVersions } from "@/lib/documents";
import { getFeatureTree } from "@/lib/features";

export default async function FeaturesPage(props: PageProps<"/plans/[id]/features">) {
  const { id } = await props.params;
  const db = await getDb();
  const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, id) });
  if (!plan) notFound();
  const features = await getFeatureTree(id);
  const hasPrd = (await getPrdVersions(id)).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/plans/${plan.id}`} className="text-sm text-muted hover:text-text">← Idea &amp; answers</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.title}: feature map</h1>
          <p className="mt-1 text-sm text-muted">Agree on the menus and screens first. The PRD is written around this map.</p>
        </div>
        {features.length > 0 && <ReviseButton planId={plan.id} />}
      </div>
      <Stepper current={plan.currentStep} />
      <FeatureWorkspace planId={plan.id} title={plan.title} features={features} hasPrd={hasPrd} />
    </div>
  );
}
