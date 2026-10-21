import "server-only";
import { z } from "zod";
import { type FeatureNode, featureMapText } from "@/lib/features";
import { FEATURE_ICONS } from "@/lib/plan-steps";
import type { BoardTask } from "@/lib/tasks";
import { languageName } from "./questions";

const priority = z.enum(["high", "medium", "low"]);
const layer = z.enum(["db", "backend", "frontend", "test"]);
const reason = z.string().describe("one short sentence: why this change");

// Nullable instead of optional: "null" means "leave unchanged". This works with every provider's JSON output.
export const ChatOp = z.discriminatedUnion("type", [
  z.object({ type: z.literal("prd_section"), section: z.number().int().min(1).max(12), markdown: z.string().describe('the complete new section, starting with its "## <n>. <title>" heading'), reason }),
  z.object({ type: z.literal("feature_update"), feature: z.string().describe("feature code, e.g. F2"), name: z.string().nullable(), summary: z.string().nullable(), phase: z.number().int().min(1).max(4).nullable(), priority: priority.nullable(), reason }),
  z.object({ type: z.literal("feature_add"), name: z.string(), summary: z.string(), phase: z.number().int().min(1).max(4), priority, icon: z.enum(FEATURE_ICONS), subFeatures: z.array(z.object({ name: z.string(), summary: z.string() })), reason }),
  z.object({ type: z.literal("feature_remove"), feature: z.string(), reason }),
  z.object({ type: z.literal("subfeature_add"), feature: z.string(), name: z.string(), summary: z.string(), reason }),
  z.object({ type: z.literal("subfeature_rename"), feature: z.string(), from: z.string(), to: z.string(), reason }),
  z.object({ type: z.literal("subfeature_remove"), feature: z.string(), name: z.string(), reason }),
  z.object({ type: z.literal("task_update"), task: z.string().describe("task code, e.g. F2-T3"), title: z.string().nullable(), description: z.string().nullable(), acceptance: z.array(z.string()).nullable(), layer: layer.nullable(), priority: priority.nullable(), reason }),
  z.object({ type: z.literal("task_add"), feature: z.string(), title: z.string(), description: z.string(), layer, priority, acceptance: z.array(z.string()), dependsOn: z.array(z.string()).describe("task codes"), reason }),
  z.object({ type: z.literal("task_remove"), task: z.string(), reason }),
]);
export type ChatOpInput = z.infer<typeof ChatOp>;

export const ChatOutput = z.object({
  reply: z.string().describe("your answer to the founder, in Markdown; refer to any proposed changes briefly"),
  operations: z.array(ChatOp).max(12).describe("proposed changes; empty when the message is only a question"),
});

export const CHAT_SYSTEM = `You are the product manager helping a founder refine their plan: a PRD, a feature map (features F<n> with
sub-features) and implementation tasks (F<n>-T<m>). You can answer questions and propose changes.

How to respond:
- Questions ("why…", "what does…", "is X covered?"): answer from the plan, cite IDs, and propose no changes.
- Change requests: propose the smallest set of operations that does exactly what was asked, and keep the plan
  consistent: if a map change affects the PRD (section 5 lists the map's features exactly), also propose the PRD
  section update; if it affects tasks, propose the task changes too. Mention any follow-up the founder should consider
  instead of silently doing more.
- Never invent decisions the founder didn't make; add them as assumptions (PRD section 10) if needed.
- The founder accepts or rejects each operation individually, so each must make sense on its own where possible.

Operation rules:
- Refer to features by code (F2), tasks by code (F2-T3) and sub-features by their exact current name.
- prd_section returns the whole section, keeping every unchanged sentence, ID and diagram exactly as it was.
  Keep the labels "Covers:", "Sub-features:" and "Done when:" in English.
- In feature_update and task_update, use null for every field you are not changing.
- New tasks may depend only on existing task codes.
- At most 12 operations. If the request needs more, do the most important part and say what remains.`;

export function chatContext(
  plan: { title: string; language: string },
  prd: string | null,
  tree: FeatureNode[],
  tasks: BoardTask[],
) {
  const taskLines = tasks
    .map((t) => `- ${t.code} [${t.layer}, ${t.priority}, ${t.status}] ${t.title}${t.dependsOn.length ? ` (after ${t.dependsOn.map((d) => d.code).join(", ")})` : ""}`)
    .join("\n");
  return `Product: ${plan.title}. Reply in ${languageName(plan.language)}; write PRD text and names in that language too.

FEATURE MAP
${featureMapText(tree) || "(no feature map yet)"}

TASKS
${taskLines || "(no tasks yet)"}

PRD (latest version)
"""
${prd ?? "(no PRD yet)"}
"""`;
}
