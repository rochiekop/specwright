import "server-only";
import { getDb } from "@/db";

export type FeatureNode = {
  id: string;
  code: string; // F1, F2, ... in build order
  name: string;
  summary: string;
  icon: string;
  phase: number;
  priority: "high" | "medium" | "low" | null;
  source: "ai" | "user";
  subFeatures: { id: string; name: string; summary: string; source: "ai" | "user" }[];
};

/** Root features in build order (phase, then position), each with its sub-features. */
export async function getFeatureTree(planId: string): Promise<FeatureNode[]> {
  const db = await getDb();
  const rows = await db.query.features.findMany({ where: (f, { eq }) => eq(f.planId, planId) });
  const roots = rows.filter((r) => !r.parentId).sort((a, b) => a.phase - b.phase || a.position - b.position);
  return roots.map((r, i) => ({
    id: r.id,
    code: `F${i + 1}`,
    name: r.name,
    summary: r.summary,
    icon: r.icon,
    phase: r.phase,
    priority: r.priority,
    source: r.source,
    subFeatures: rows
      .filter((c) => c.parentId === r.id)
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, summary: c.summary, source: c.source })),
  }));
}

/** The map as plain text, used as fixed input for the PRD. */
export function featureMapText(tree: FeatureNode[]) {
  return tree
    .map(
      (f) =>
        `${f.code}. ${f.name} (phase ${f.phase}, priority: ${f.priority ?? "medium"}): ${f.summary}\n` +
        f.subFeatures.map((s) => `   - ${s.name}: ${s.summary}`).join("\n"),
    )
    .join("\n");
}
