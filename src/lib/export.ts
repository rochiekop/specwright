import "server-only";
import { getDb } from "@/db";
import { getPrdVersions } from "./documents";
import { type FeatureNode, getFeatureTree } from "./features";
import { coveredRequirements, featureBlock } from "./prd-parse";
import { type BoardTask, getTaskBoard } from "./tasks";

export type ExportFile = { path: string; content: string };
export type ExportBundle = { folderName: string; files: ExportFile[]; prdVersion: number; taskCount: number };

export function slug(s: string, max = 48) {
  const out = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
  return out || "item";
}

const featureFile = (f: FeatureNode) => `features/${f.code}-${slug(f.name)}.md`;
// Build order is already a valid run order: dependencies only point to earlier tasks.
const taskFile = (t: BoardTask, i: number) => `tasks/${String(i + 1).padStart(3, "0")}-${t.code}-${t.layer}-${slug(t.title, 40)}.md`;

function featureMd(f: FeatureNode, block: string | null, tasks: { t: BoardTask; file: string }[]) {
  return `# ${f.code} · ${f.name}

- **Phase:** ${f.phase}
- **Priority:** ${f.priority ?? "medium"}
- **Summary:** ${f.summary || "(none)"}

## Sub-features
${f.subFeatures.map((s) => `- **${s.name}**${s.summary ? `: ${s.summary}` : ""}`).join("\n") || "- (none)"}

## From the PRD
${block ? block.replace(/^####\s+/, "### ") : "_This feature is not described in PRD.md section 5. Treat the summary above as the scope._"}

## Tasks (in run order)
${tasks.map(({ t, file }) => `- [${t.status === "done" ? "x" : " "}] [${t.code}](../${file}) · ${t.layer} · ${t.title}`).join("\n") || "- (no tasks yet)"}
`;
}

function taskMd(t: BoardTask, f: FeatureNode, requirements: string[], files: Map<string, string>) {
  const deps = t.dependsOn.length ? t.dependsOn.map((d) => `[${d.code}](../${files.get(d.id)})`).join(", ") : "none";
  const neededBy = t.dependents.length ? t.dependents.join(", ") : "none";
  return `# ${t.code} · ${t.title}

| | |
|---|---|
| Feature | [${f.code} ${f.name}](../${featureFile(f)})${t.subFeatureName ? ` › ${t.subFeatureName}` : ""} |
| Layer | ${t.layer} |
| Priority | ${t.priority} |
| Depends on | ${deps} |
| Needed by | ${neededBy} |
| Status | ${t.status} |

## What to build
${t.description || t.title}

## Acceptance criteria
${t.acceptance.map((a) => `- [ ] ${a}`).join("\n") || "- [ ] (none written; agree them before starting)"}

## Context
- Feature goal: ${f.summary || f.name}
${requirements.length ? `- Requirements: ${requirements.join(", ")} (PRD.md §4)\n` : ""}- Use the names in PRD.md §7 Architecture and §8 Data Model; the stack in §9 is fixed.
- Check PRD.md §10 Assumptions before deciding anything the PRD leaves open.

## When done
1. Every acceptance criterion above passes${t.layer === "test" ? " as an automated test" : ""}.
2. Tick \`${t.code}\` in AGENTS.md.
3. Commit with the code in the message, e.g. \`${t.code}: ${t.title}\`.
`;
}

function agentsMd(
  title: string,
  prdVersion: number,
  stack: Record<string, string | undefined>,
  tree: FeatureNode[],
  ordered: { t: BoardTask; file: string }[],
) {
  const stackLines = Object.entries(stack)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  const phases = [...new Set(tree.map((f) => f.phase))].sort((a, b) => a - b);
  const runOrder = phases
    .map((p) => {
      const feats = tree.filter((f) => f.phase === p);
      return `### Phase ${p}\n\n${feats
        .map((f) => {
          const lines = ordered
            .filter(({ t }) => t.featureId === f.id)
            .map(({ t, file }) => {
              const after = t.dependsOn.length ? ` (after ${t.dependsOn.map((d) => d.code).join(", ")})` : "";
              return `- [${t.status === "done" ? "x" : " "}] **${t.code}** · ${t.layer} · ${t.title}${after} → [task](${file})`;
            });
          return `#### ${f.code} ${f.name} → [feature](${featureFile(f)})\n\n${lines.join("\n") || "- (no tasks)"}`;
        })
        .join("\n\n")}`;
    })
    .join("\n\n");

  return `# ${title}: build plan for coding agents

Exported from Specwright from PRD version ${prdVersion}. ${ordered.length} tasks across ${tree.length} features.

## Start here
1. Read [PRD.md](PRD.md) completely. It is the source of truth for scope, data model and acceptance criteria.
2. Work through the run order below from top to bottom. Each task file says what to build and when it is done.
3. Start a task only when every task it depends on (shown as "after …") is checked.
4. A task is done when all its acceptance criteria pass. Then check its box here: \`- [x]\`.
5. If you are blocked, write the reason under **Notes**, leave the box unchecked and continue with the next ready task.

## Rules
- Stay inside the PRD. Section 3 (Non-goals) is out of scope even if it seems useful.
- Before deciding something the PRD leaves open, read §10 Assumptions and §11 Open Questions. Record any new
  assumption under Notes instead of silently choosing.
- The tech stack is fixed: ${stackLines || "see PRD.md §9"}.
- Keep the IDs (FR-n, F<n>, task codes) in commit messages and test names so work stays traceable.
- One task per commit (or pull request). Don't mix tasks.

## Files
- \`PRD.md\`: the product requirements.
- \`features/\`: one file per feature, with its sub-features, PRD excerpt and task list.
- \`tasks/\`: one file per task, numbered in run order.
- \`tasks.json\`: the same tasks in machine-readable form.

## Run order

${runOrder}

## Notes

_(agents: add blockers and new assumptions here)_
`;
}

/** Everything a coding agent needs, as files. Paths are relative to the export folder. */
export async function buildExport(planId: string): Promise<ExportBundle> {
  const db = await getDb();
  const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, planId) });
  if (!plan) throw new Error("Plan not found");
  const [prd] = await getPrdVersions(planId);
  if (!prd) throw new Error("Write the PRD before exporting.");
  const tree = await getFeatureTree(planId);
  const board = await getTaskBoard(planId);

  const ordered = board.map((t, i) => ({ t, file: taskFile(t, i) }));
  const fileById = new Map(ordered.map(({ t, file }) => [t.id, file]));
  const files: ExportFile[] = [{ path: "PRD.md", content: prd.content }];

  for (const f of tree) {
    const block = featureBlock(prd.content, f.code);
    files.push({ path: featureFile(f), content: featureMd(f, block, ordered.filter(({ t }) => t.featureId === f.id)) });
    const reqs = coveredRequirements(block);
    for (const { t, file } of ordered.filter(({ t }) => t.featureId === f.id)) {
      files.push({ path: file, content: taskMd(t, f, reqs, fileById) });
    }
  }

  files.push({
    path: "tasks.json",
    content:
      JSON.stringify(
        ordered.map(({ t, file }) => ({
          code: t.code,
          title: t.title,
          feature: `${t.featureCode} ${t.featureName}`,
          subFeature: t.subFeatureName,
          layer: t.layer,
          priority: t.priority,
          status: t.status,
          dependsOn: t.dependsOn.map((d) => d.code),
          acceptance: t.acceptance,
          file,
        })),
        null,
        2,
      ) + "\n",
  });
  files.push({ path: "AGENTS.md", content: agentsMd(plan.title, prd.version, plan.techStack, tree, ordered) });

  return { folderName: `${slug(plan.title)}-plan`, files, prdVersion: prd.version, taskCount: board.length };
}
