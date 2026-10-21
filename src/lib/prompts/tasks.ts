import "server-only";
import { z } from "zod";
import type { FeatureNode } from "@/lib/features";
import { featureBlock, splitSections } from "@/lib/prd-parse";
import { languageName } from "./questions";

export const TasksOutput = z.object({
  tasks: z
    .array(
      z.object({
        key: z.string().describe('short id unique within this feature, e.g. "t1"'),
        title: z.string().describe("imperative, specific, under 10 words"),
        description: z.string().describe("1-3 sentences: what to build and where (component, endpoint, table)"),
        layer: z.enum(["db", "backend", "frontend", "test"]),
        priority: z.enum(["high", "medium", "low"]),
        subFeature: z.string().nullable().describe("exact name of the sub-feature it delivers, or null for shared groundwork"),
        acceptance: z.array(z.string()).min(1).max(5).describe("checkable yes/no criteria"),
        dependsOn: z.array(z.string()).describe('keys of tasks that must be done first: this feature\'s keys ("t1") or earlier features\' codes ("F1-T2")'),
      }),
    )
    .min(2)
    .max(14),
});

export const TASKS_SYSTEM = `You break ONE feature of a PRD into implementation tasks for an AI coding agent.

A good task:
- is one focused change an agent can finish and verify in a single session (roughly one pull request),
- names the concrete thing to build: the table/migration, endpoint, component or screen, using names from the PRD,
- has 1-5 acceptance criteria that can be checked yes/no, taken from the feature's "Done when" and requirements.

Rules:
- Cover every sub-feature (set "subFeature" to its exact name) and every "Done when" item of this feature.
- Layers: "db" (schema, migrations, seed), "backend" (API, jobs, integrations), "frontend" (screens, components),
  "test" (automated tests for the feature's acceptance criteria). Include at least one "test" task.
- Order tasks in build order. Typical order: db → backend → frontend → test, but keep it to what this feature needs.
- dependsOn: only real prerequisites. Use this feature's keys, or earlier features' task codes from the list given
  (e.g. reuse "F1-T1" instead of creating the users table again). Never depend on a later task.
- Do not create tasks for other features, project setup that already exists, or anything outside the PRD.
- Priority: high = needed for the feature to work at all, medium = expected, low = polish.`;

/** Gives the model only what it needs: requirements, this feature's PRD block, architecture, data model and stack. */
export function tasksPrompt(
  prd: string,
  feature: FeatureNode,
  earlier: { code: string; title: string; layer: string }[],
  language: string,
) {
  const { sections } = splitSections(prd);
  const get = (n: number) => sections.find((s) => s.num === n)?.text ?? "";
  const block = featureBlock(prd, feature.code) ?? "(not found in the PRD; use the map entry)";

  return `Feature to break down: ${feature.code}. ${feature.name} (phase ${feature.phase}, priority ${feature.priority ?? "medium"})
Summary: ${feature.summary}
Sub-features (use these exact names in "subFeature"):
${feature.subFeatures.map((s) => `- ${s.name}: ${s.summary}`).join("\n") || "- (none)"}

This feature in the PRD:
${block}

Tasks already planned for earlier features (you may depend on them by code):
${earlier.length ? earlier.map((t) => `- ${t.code} [${t.layer}] ${t.title}`).join("\n") : "(none)"}

PRD context:
${get(4)}

${get(7)}

${get(8)}

${get(9)}

Write titles, descriptions and criteria in ${languageName(language)}. Keep JSON keys and enum values in English.`;
}
