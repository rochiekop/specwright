import "server-only";
import { getDb } from "@/db";
import { getFeatureTree } from "./features";

export type TaskStatus = "todo" | "doing" | "done" | "failed";

export type BoardTask = {
  id: string;
  code: string; // F2-T3: feature code + build-order position
  featureId: string;
  featureCode: string;
  featureName: string;
  subFeatureName: string | null;
  title: string;
  description: string;
  acceptance: string[];
  layer: "frontend" | "backend" | "db" | "test";
  priority: "high" | "medium" | "low";
  status: TaskStatus;
  source: "ai" | "user";
  dependsOn: { id: string; code: string; title: string; status: TaskStatus }[];
  dependents: string[]; // codes
  blocked: boolean; // some prerequisite is not done yet
};

/** All tasks in build order (feature order, then position) with codes and dependency state resolved. */
export async function getTaskBoard(planId: string): Promise<BoardTask[]> {
  const db = await getDb();
  const tree = await getFeatureTree(planId);
  const rows = await db.query.tasks.findMany({ where: (t, { eq }) => eq(t.planId, planId) });
  const featureIndex = new Map(tree.map((f, i) => [f.id, i]));
  const subNames = new Map(tree.flatMap((f) => f.subFeatures.map((s) => [s.id, s.name] as const)));

  const ordered = rows
    .filter((r) => featureIndex.has(r.featureId))
    .sort((a, b) => featureIndex.get(a.featureId)! - featureIndex.get(b.featureId)! || a.position - b.position);

  const codes = new Map<string, string>();
  const counters = new Map<string, number>();
  for (const r of ordered) {
    const n = (counters.get(r.featureId) ?? 0) + 1;
    counters.set(r.featureId, n);
    codes.set(r.id, `${tree[featureIndex.get(r.featureId)!].code}-T${n}`);
  }
  const byId = new Map(ordered.map((r) => [r.id, r]));

  return ordered.map((r) => {
    const f = tree[featureIndex.get(r.featureId)!];
    const deps = r.dependsOn
      .filter((id) => byId.has(id))
      .map((id) => ({ id, code: codes.get(id)!, title: byId.get(id)!.title, status: byId.get(id)!.status }));
    return {
      id: r.id,
      code: codes.get(r.id)!,
      featureId: f.id,
      featureCode: f.code,
      featureName: f.name,
      subFeatureName: r.subFeatureId ? (subNames.get(r.subFeatureId) ?? null) : null,
      title: r.title,
      description: r.description,
      acceptance: r.acceptance.split("\n").map((s) => s.trim()).filter(Boolean),
      layer: r.layer,
      priority: r.priority,
      status: r.status,
      source: r.source,
      dependsOn: deps,
      dependents: ordered.filter((o) => o.dependsOn.includes(r.id)).map((o) => codes.get(o.id)!),
      blocked: deps.some((d) => d.status !== "done"),
    };
  });
}
