"use server";

// Local single-user app: no auth by design.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { Answers } from "@/db/schema";
import { generateObject } from "@/lib/ai";
import { addPrdVersion, getPrdVersions } from "@/lib/documents";
import { replaceSections } from "@/lib/prd-parse";
import { FIX_SYSTEM, FixOutput, fixPrompt, REVIEW_SYSTEM, ReviewOutput, reviewPrompt } from "@/lib/prompts/quality";
import { applyProposals, resolveOps } from "@/lib/chat-ops";
import { buildExport } from "@/lib/export";
import { CHAT_SYSTEM, ChatOutput, chatContext } from "@/lib/prompts/chat";
import { writeExportToFolder } from "@/lib/export-folder";
import { getFeatureTree } from "@/lib/features";
import { FEATURE_ICONS } from "@/lib/plan-steps";
import { FEATURES_SYSTEM, FeaturesOutput, featuresPrompt } from "@/lib/prompts/features";
import { TASKS_SYSTEM, TasksOutput, tasksPrompt } from "@/lib/prompts/tasks";
import { refreshRuleFindings } from "@/lib/quality";
import { getTaskBoard } from "@/lib/tasks";
import { type Finding, runRuleChecks } from "@/lib/quality-rules";
import {
  FOLLOWUPS_SYSTEM,
  FollowupsOutput,
  followupsPrompt,
  normalizeQuestions,
  QUESTIONS_SYSTEM,
  QuestionsOutput,
  questionsPrompt,
} from "@/lib/prompts/questions";

export type StepResult = { error?: string; followups?: number; assessment?: string; done?: boolean };

const AnswersInput = z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()]));

async function loadPlan(planId: string) {
  const db = await getDb();
  const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, planId) });
  if (!plan) throw new Error("Plan not found");
  return { db, plan };
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** First round of questions. Regenerating replaces all questions and clears the answers. */
export async function generateQuestions(planId: string): Promise<StepResult> {
  try {
    const { db, plan } = await loadPlan(planId);
    const { object } = await generateObject({ step: "questions", planId }, QuestionsOutput, {
      system: QUESTIONS_SYSTEM,
      prompt: questionsPrompt(plan),
      effort: "medium",
    });
    const questions = normalizeQuestions(object.questions, 1, new Set());
    await db
      .update(schema.plans)
      .set({ questions, answers: {}, currentStep: "questions", updatedAt: new Date().toISOString() })
      .where(eq(schema.plans.id, planId));
    revalidatePath(`/plans/${planId}`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

export async function saveAnswers(planId: string, answers: Answers): Promise<StepResult> {
  try {
    const parsed = AnswersInput.parse(answers);
    const { db } = await loadPlan(planId);
    await db
      .update(schema.plans)
      .set({ answers: parsed, updatedAt: new Date().toISOString() })
      .where(eq(schema.plans.id, planId));
    revalidatePath(`/plans/${planId}`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

/**
 * Saves the answers, then checks them once. Thin or contradictory answers get up to 3 follow-ups
 * (round 2); otherwise the plan moves on to the PRD step. The check runs only once per plan.
 */
export async function finishQuestions(planId: string, answers: Answers): Promise<StepResult> {
  try {
    const parsed = AnswersInput.parse(answers);
    const { db, plan } = await loadPlan(planId);
    const now = new Date().toISOString();
    await db.update(schema.plans).set({ answers: parsed, updatedAt: now }).where(eq(schema.plans.id, planId));

    if (!plan.questions.some((q) => (q.round ?? 1) > 1)) {
      const { object } = await generateObject({ step: "questions", planId }, FollowupsOutput, {
        system: FOLLOWUPS_SYSTEM,
        prompt: followupsPrompt(plan, plan.questions, parsed),
        effort: "medium",
      });
      if (object.followups.length > 0) {
        const taken = new Set(plan.questions.map((q) => q.id));
        const followups = normalizeQuestions(object.followups, 2, taken);
        await db
          .update(schema.plans)
          .set({ questions: [...plan.questions, ...followups], updatedAt: now })
          .where(eq(schema.plans.id, planId));
        revalidatePath(`/plans/${planId}`);
        return { followups: followups.length, assessment: object.assessment };
      }
    }

    // Never move a plan backwards: one that already has a map or a PRD keeps its step.
    if (plan.currentStep === "idea" || plan.currentStep === "questions") {
      await db.update(schema.plans).set({ currentStep: "features", updatedAt: now }).where(eq(schema.plans.id, planId));
    }
    revalidatePath(`/plans/${planId}`);
    return { done: true };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Saves a hand-edited PRD as a new version (no-op when nothing changed). */
export async function savePrdEdit(planId: string, content: string): Promise<StepResult & { version?: number }> {
  try {
    const text = z.string().min(1, "The PRD cannot be empty").parse(content.trim()) + "\n";
    const [latest] = await getPrdVersions(planId);
    if (latest && latest.content === text) return { version: latest.version };
    const version = await addPrdVersion(planId, text, "manual");
    await refreshRuleFindings(planId, version, text);
    revalidatePath(`/plans/${planId}/prd`);
    return { version };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Restoring copies an old version forward as the newest one, so nothing is ever lost. */
export async function restorePrdVersion(planId: string, version: number): Promise<StepResult & { version?: number }> {
  try {
    const versions = await getPrdVersions(planId);
    const source = versions.find((v) => v.version === version);
    if (!source) throw new Error(`Version ${version} not found`);
    const created = await addPrdVersion(planId, source.content, `restore:${version}`);
    await refreshRuleFindings(planId, created, source.content);
    revalidatePath(`/plans/${planId}/prd`);
    return { version: created };
  } catch (e) {
    return { error: message(e) };
  }
}

// ---- Feature map --------------------------------------------------------------

/** Builds the feature map from the idea and answers. Replaces any existing map (and its tasks). */
export async function generateFeatures(planId: string): Promise<StepResult> {
  try {
    const { db, plan } = await loadPlan(planId);
    const { object } = await generateObject({ step: "features", planId }, FeaturesOutput, {
      system: FEATURES_SYSTEM,
      prompt: featuresPrompt(plan),
      effort: "medium",
    });
    await db.delete(schema.features).where(eq(schema.features.planId, planId));
    for (const [i, f] of object.features.entries()) {
      const [root] = await db
        .insert(schema.features)
        .values({ planId, name: f.name, summary: f.summary, icon: f.icon, phase: f.phase, priority: f.priority, position: i })
        .returning({ id: schema.features.id });
      await db
        .insert(schema.features)
        .values(f.subFeatures.map((s, j) => ({ planId, parentId: root.id, name: s.name, summary: s.summary, phase: f.phase, position: j })));
    }
    if (plan.currentStep === "idea" || plan.currentStep === "questions") {
      await db.update(schema.plans).set({ currentStep: "features" }).where(eq(schema.plans.id, planId));
    }
    revalidatePath(`/plans/${planId}/features`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

const FeatureInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  summary: z.string().trim().max(400),
  icon: z.enum(FEATURE_ICONS),
  phase: z.number().int().min(1).max(4),
  priority: z.enum(["high", "medium", "low"]),
  subFeatures: z.array(
    z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Every sub-feature needs a name").max(80), summary: z.string().trim().max(400) }),
  ),
});

/** Saves one feature and its full sub-feature list (missing ones are deleted). Edited rows become source "user". */
export async function saveFeature(featureId: string, input: z.input<typeof FeatureInput>): Promise<StepResult> {
  try {
    const data = FeatureInput.parse(input);
    const db = await getDb();
    const root = await db.query.features.findFirst({ where: (f, { eq }) => eq(f.id, featureId) });
    if (!root) throw new Error("Feature not found");
    const changed =
      root.name !== data.name || root.summary !== data.summary || root.icon !== data.icon || root.phase !== data.phase || root.priority !== data.priority;
    await db
      .update(schema.features)
      .set({ name: data.name, summary: data.summary, icon: data.icon, phase: data.phase, priority: data.priority, ...(changed ? { source: "user" } : {}) })
      .where(eq(schema.features.id, featureId));

    const existing = await db.query.features.findMany({ where: (f, { eq }) => eq(f.parentId, featureId) });
    const keep = new Set(data.subFeatures.map((s) => s.id).filter(Boolean));
    for (const old of existing) if (!keep.has(old.id)) await db.delete(schema.features).where(eq(schema.features.id, old.id));
    for (const [j, s] of data.subFeatures.entries()) {
      const old = existing.find((o) => o.id === s.id);
      if (old) {
        const subChanged = old.name !== s.name || old.summary !== s.summary;
        await db
          .update(schema.features)
          .set({ name: s.name, summary: s.summary, phase: data.phase, position: j, ...(subChanged ? { source: "user" } : {}) })
          .where(eq(schema.features.id, old.id));
      } else {
        await db
          .insert(schema.features)
          .values({ planId: root.planId, parentId: featureId, name: s.name, summary: s.summary, phase: data.phase, position: j, source: "user" });
      }
    }
    revalidatePath(`/plans/${root.planId}/features`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

export async function addFeature(planId: string): Promise<StepResult & { id?: string }> {
  try {
    const db = await getDb();
    const siblings = await db.query.features.findMany({ where: (f, { and, eq, isNull }) => and(eq(f.planId, planId), isNull(f.parentId)) });
    const phase = siblings.length ? Math.max(...siblings.map((s) => s.phase)) : 1;
    const [row] = await db
      .insert(schema.features)
      .values({ planId, name: "New feature", summary: "", icon: "box", phase, priority: "medium", position: siblings.length, source: "user" })
      .returning({ id: schema.features.id });
    revalidatePath(`/plans/${planId}/features`);
    return { id: row.id };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function deleteFeature(featureId: string): Promise<StepResult> {
  try {
    const db = await getDb();
    const root = await db.query.features.findFirst({ where: (f, { eq }) => eq(f.id, featureId) });
    if (!root) return {};
    await db.delete(schema.features).where(eq(schema.features.parentId, featureId));
    await db.delete(schema.features).where(eq(schema.features.id, featureId));
    revalidatePath(`/plans/${root.planId}/features`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

/** Moves a feature one place up or down within its phase. */
export async function moveFeature(featureId: string, direction: -1 | 1): Promise<StepResult> {
  try {
    const db = await getDb();
    const root = await db.query.features.findFirst({ where: (f, { eq }) => eq(f.id, featureId) });
    if (!root) throw new Error("Feature not found");
    const tree = await getFeatureTree(root.planId);
    const samePhase = tree.filter((f) => f.phase === root.phase);
    const i = samePhase.findIndex((f) => f.id === featureId);
    const j = i + direction;
    if (j < 0 || j >= samePhase.length) return {};
    [samePhase[i], samePhase[j]] = [samePhase[j], samePhase[i]];
    // Rewrite positions for the whole phase so they are dense and unambiguous.
    for (const [k, f] of samePhase.entries()) await db.update(schema.features).set({ position: k }).where(eq(schema.features.id, f.id));
    revalidatePath(`/plans/${root.planId}/features`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

// ---- Tasks ----------------------------------------------------------------------

/** Deletes every task of the plan; the client then generates feature by feature. */
export async function resetTasks(planId: string): Promise<StepResult> {
  try {
    const db = await getDb();
    await db.delete(schema.tasks).where(eq(schema.tasks.planId, planId));
    revalidatePath(`/plans/${planId}/tasks`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

/**
 * Generates the tasks of one feature, replacing its old ones. Earlier features' tasks are passed as context so
 * shared groundwork is reused. Dependencies may only point backwards (earlier task in this feature, or an earlier
 * feature), which keeps the graph acyclic.
 */
export async function generateTasksForFeature(planId: string, featureId: string): Promise<StepResult & { count?: number }> {
  try {
    const { db, plan } = await loadPlan(planId);
    const prd = await latestPrd(planId);
    const tree = await getFeatureTree(planId);
    const fi = tree.findIndex((f) => f.id === featureId);
    if (fi < 0) throw new Error("Feature not found");
    const feature = tree[fi];

    await db.delete(schema.tasks).where(eq(schema.tasks.featureId, featureId));
    const board = await getTaskBoard(planId);
    const earlierIds = new Set(tree.slice(0, fi).map((f) => f.id));
    const earlier = board.filter((t) => earlierIds.has(t.featureId));

    const { object } = await generateObject({ step: "tasks", planId }, TasksOutput, {
      system: TASKS_SYSTEM,
      prompt: tasksPrompt(prd.content, feature, earlier.map((t) => ({ code: t.code, title: t.title, layer: t.layer })), plan.language),
      effort: "medium",
    });

    const subByName = new Map(feature.subFeatures.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const earlierByCode = new Map(earlier.map((t) => [t.code.toUpperCase(), t.id]));
    const inserted: { key: string; id: string }[] = [];
    for (const [i, t] of object.tasks.entries()) {
      const [row] = await db
        .insert(schema.tasks)
        .values({
          planId,
          featureId,
          subFeatureId: t.subFeature ? (subByName.get(t.subFeature.trim().toLowerCase()) ?? null) : null,
          title: t.title,
          description: t.description,
          acceptance: t.acceptance.join("\n"),
          layer: t.layer,
          priority: t.priority,
          position: i,
        })
        .returning({ id: schema.tasks.id });
      inserted.push({ key: t.key.trim().toLowerCase(), id: row.id });
    }
    // Second pass: resolve dependency keys now that every task has an id. Unknown, self and forward refs are dropped.
    for (const [i, t] of object.tasks.entries()) {
      const deps = new Set<string>();
      for (const ref of t.dependsOn) {
        const own = inserted.findIndex((x) => x.key === ref.trim().toLowerCase());
        if (own >= 0 && own < i) deps.add(inserted[own].id);
        const other = earlierByCode.get(ref.trim().toUpperCase());
        if (other) deps.add(other);
      }
      if (deps.size) await db.update(schema.tasks).set({ dependsOn: [...deps] }).where(eq(schema.tasks.id, inserted[i].id));
    }

    if (plan.currentStep !== "tasks") {
      await db.update(schema.plans).set({ currentStep: "tasks" }).where(eq(schema.plans.id, planId));
    }
    revalidatePath(`/plans/${planId}/tasks`);
    return { count: object.tasks.length };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function setTaskStatus(taskId: string, status: "todo" | "doing" | "done" | "failed"): Promise<StepResult> {
  try {
    const db = await getDb();
    const [row] = await db.update(schema.tasks).set({ status }).where(eq(schema.tasks.id, taskId)).returning({ planId: schema.tasks.planId });
    if (row) revalidatePath(`/plans/${row.planId}/tasks`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

const TaskInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  description: z.string().trim().max(2000),
  acceptance: z.string().trim().max(3000),
  layer: z.enum(["frontend", "backend", "db", "test"]),
  priority: z.enum(["high", "medium", "low"]),
});

export async function updateTask(taskId: string, input: z.input<typeof TaskInput>): Promise<StepResult> {
  try {
    const data = TaskInput.parse(input);
    const db = await getDb();
    const [row] = await db
      .update(schema.tasks)
      .set({ ...data, source: "user" })
      .where(eq(schema.tasks.id, taskId))
      .returning({ planId: schema.tasks.planId });
    if (row) revalidatePath(`/plans/${row.planId}/tasks`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

export async function addTask(featureId: string): Promise<StepResult & { id?: string }> {
  try {
    const db = await getDb();
    const feature = await db.query.features.findFirst({ where: (f, { eq }) => eq(f.id, featureId) });
    if (!feature) throw new Error("Feature not found");
    const siblings = await db.query.tasks.findMany({ where: (t, { eq }) => eq(t.featureId, featureId), columns: { position: true } });
    const [row] = await db
      .insert(schema.tasks)
      .values({
        planId: feature.planId,
        featureId,
        title: "New task",
        layer: "frontend",
        position: siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0,
        source: "user",
      })
      .returning({ id: schema.tasks.id });
    revalidatePath(`/plans/${feature.planId}/tasks`);
    return { id: row.id };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function deleteTask(taskId: string): Promise<StepResult> {
  try {
    const db = await getDb();
    const task = await db.query.tasks.findFirst({ where: (t, { eq }) => eq(t.id, taskId) });
    if (!task) return {};
    // Remove it from other tasks' prerequisites so nothing stays blocked on a task that no longer exists.
    const all = await db.query.tasks.findMany({ where: (t, { eq }) => eq(t.planId, task.planId) });
    for (const t of all) {
      if (t.dependsOn.includes(taskId)) {
        await db.update(schema.tasks).set({ dependsOn: t.dependsOn.filter((d) => d !== taskId) }).where(eq(schema.tasks.id, t.id));
      }
    }
    await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    revalidatePath(`/plans/${task.planId}/tasks`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

// ---- Revision chat ----------------------------------------------------------------

export type ChatProposalView = {
  id: string;
  kind: string;
  op: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected" | "failed";
  error: string | null;
  appliedVersion: number | null;
};
export type ChatMessageView = { id: string; role: "user" | "assistant"; content: string; createdAt: string; proposals: ChatProposalView[] };

export async function getChat(planId: string): Promise<ChatMessageView[]> {
  const db = await getDb();
  const msgs = await db.query.chatMessages.findMany({ where: (m, { eq }) => eq(m.planId, planId), orderBy: (m, { asc }) => [asc(m.createdAt)] });
  const props = await db.query.chatProposals.findMany({ where: (p, { eq }) => eq(p.planId, planId) });
  return msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    proposals: props
      .filter((p) => p.messageId === m.id)
      .sort((a, b) => a.position - b.position)
      .map(({ id, kind, op, status, error, appliedVersion }) => ({ id, kind, op, status, error, appliedVersion })),
  }));
}

/** Sends one message. The reply may carry proposed changes; nothing changes until the user accepts them. */
export async function sendChatMessage(planId: string, text: string): Promise<StepResult & { messages?: ChatMessageView[] }> {
  try {
    const content = z.string().trim().min(1).max(4000).parse(text);
    const { db, plan } = await loadPlan(planId);
    const history = await getChat(planId);
    await db.insert(schema.chatMessages).values({ planId, role: "user", content });

    const [prd] = await getPrdVersions(planId);
    const tree = await getFeatureTree(planId);
    const board = await getTaskBoard(planId);
    // Recent turns only, so long chats stay cheap; the current plan state is always sent in full.
    const recent = history
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Founder" : "You"}: ${m.content}${m.proposals.length ? ` [proposed ${m.proposals.length} change(s): ${m.proposals.map((p) => `${p.kind} ${p.status}`).join(", ")}]` : ""}`)
      .join("\n\n");

    const { object } = await generateObject({ step: "chat", planId }, ChatOutput, {
      system: CHAT_SYSTEM,
      prompt: `${chatContext(plan, prd?.content ?? null, tree, board)}\n\nCONVERSATION SO FAR\n${recent || "(none)"}\n\nFounder: ${content}`,
      effort: "medium",
    });

    const resolved = await resolveOps(planId, object.operations);
    const [msg] = await db.insert(schema.chatMessages).values({ planId, role: "assistant", content: object.reply }).returning({ id: schema.chatMessages.id });
    if (resolved.length) {
      await db.insert(schema.chatProposals).values(resolved.map((r, i) => ({ planId, messageId: msg.id, position: i, ...r })));
    }
    return { messages: await getChat(planId) };
  } catch (e) {
    return { error: message(e), messages: await getChat(planId).catch(() => undefined) };
  }
}

export async function acceptProposals(planId: string, ids: string[]): Promise<StepResult & { messages?: ChatMessageView[]; summary?: string }> {
  try {
    const { results, version } = await applyProposals(planId, ids);
    for (const p of ["prd", "features", "tasks"]) revalidatePath(`/plans/${planId}/${p}`);
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    const summary = `Applied ${ok} change${ok === 1 ? "" : "s"}${version ? ` (PRD saved as v${version})` : ""}${failed ? `; ${failed} could not be applied` : ""}.`;
    return { summary, messages: await getChat(planId) };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function rejectProposal(planId: string, id: string): Promise<StepResult & { messages?: ChatMessageView[] }> {
  try {
    const db = await getDb();
    await db.update(schema.chatProposals).set({ status: "rejected" }).where(eq(schema.chatProposals.id, id));
    return { messages: await getChat(planId) };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function clearChat(planId: string): Promise<StepResult> {
  try {
    const db = await getDb();
    await db.delete(schema.chatMessages).where(eq(schema.chatMessages.planId, planId));
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

// ---- Export -------------------------------------------------------------------

export type ExportPreview = {
  folderName: string;
  files: { path: string; bytes: number }[];
  prdVersion: number;
  taskCount: number;
  lastRoot: string;
  lastSubfolder: string;
};

export async function previewExport(planId: string): Promise<StepResult & { preview?: ExportPreview }> {
  try {
    const bundle = await buildExport(planId);
    const db = await getDb();
    const saved = await db.query.settings.findFirst({ where: (s, { eq }) => eq(s.key, `export.${planId}`) });
    const last = saved ? (JSON.parse(saved.value) as { root: string; subfolder: string }) : null;
    return {
      preview: {
        folderName: bundle.folderName,
        files: bundle.files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.content) })),
        prdVersion: bundle.prdVersion,
        taskCount: bundle.taskCount,
        lastRoot: last?.root ?? "",
        lastSubfolder: last?.subfolder ?? `docs/${bundle.folderName}`,
      },
    };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Writes the export into a folder on this machine (e.g. the project repo). Remembers the choice per plan. */
export async function exportToFolder(
  planId: string,
  root: string,
  subfolder: string,
): Promise<StepResult & { target?: string; written?: number; removed?: number }> {
  try {
    const bundle = await buildExport(planId);
    const res = await writeExportToFolder(planId, root, subfolder, bundle.files);
    const db = await getDb();
    const value = JSON.stringify({ root: root.trim(), subfolder: subfolder.trim() });
    await db
      .insert(schema.settings)
      .values({ key: `export.${planId}`, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
    return res;
  } catch (e) {
    return { error: message(e) };
  }
}

// ---- Quality check (M4) ----------------------------------------------------

async function latestPrd(planId: string) {
  const [latest] = await getPrdVersions(planId);
  if (!latest) throw new Error("Write the PRD first.");
  return latest;
}

/** Rule checks plus an AI review of the latest PRD. Replaces all previous findings. */
export async function runQualityCheck(planId: string): Promise<StepResult & { note?: string }> {
  try {
    const { db, plan } = await loadPlan(planId);
    const prd = await latestPrd(planId);
    const rules = runRuleChecks(prd.content, await getFeatureTree(planId));
    let ai: Finding[] = [];
    let note: string | undefined;
    try {
      const { object } = await generateObject({ step: "quality", planId }, ReviewOutput, {
        system: REVIEW_SYSTEM,
        prompt: reviewPrompt(prd.content, rules, plan.language),
        effort: "high",
      });
      ai = object.findings.map((f) => ({ ...f, source: "ai" as const }));
    } catch (e) {
      note = `Automatic checks ran, but the AI review failed: ${message(e)}`;
    }
    await db.delete(schema.qualityFindings).where(eq(schema.qualityFindings.planId, planId));
    const rows = [...rules, ...ai].map((f) => ({ ...f, planId, prdVersion: prd.version }));
    if (rows.length) await db.insert(schema.qualityFindings).values(rows);
    revalidatePath(`/plans/${planId}/prd`);
    return { note };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Rewrites only the sections a finding points at and saves the result as a new PRD version. */
export async function fixFinding(findingId: string): Promise<StepResult & { version?: number; summary?: string }> {
  try {
    const db = await getDb();
    const finding = await db.query.qualityFindings.findFirst({ where: (f, { eq }) => eq(f.id, findingId) });
    if (!finding) throw new Error("Finding not found");
    const { plan } = await loadPlan(finding.planId);
    const prd = await latestPrd(plan.id);
    const { object } = await generateObject({ step: "quality", planId: plan.id }, FixOutput, {
      system: FIX_SYSTEM,
      prompt: fixPrompt(prd.content, finding, plan.language),
      effort: "high",
    });
    const updated = replaceSections(prd.content, object.sections);
    if (updated === prd.content) throw new Error("The model returned no changes. Try again, or edit the PRD by hand.");
    const version = await addPrdVersion(plan.id, updated, "quality_fix");
    await db
      .update(schema.qualityFindings)
      .set({ status: "fixed", fixedInVersion: version })
      .where(eq(schema.qualityFindings.id, findingId));
    await refreshRuleFindings(plan.id, version, updated);
    revalidatePath(`/plans/${plan.id}/prd`);
    return { version, summary: object.summary };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function setFindingStatus(findingId: string, status: "open" | "dismissed"): Promise<StepResult> {
  try {
    const db = await getDb();
    const [row] = await db
      .update(schema.qualityFindings)
      .set({ status })
      .where(eq(schema.qualityFindings.id, findingId))
      .returning({ planId: schema.qualityFindings.planId });
    if (row) revalidatePath(`/plans/${row.planId}/prd`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}

/** Lets the user reopen the questions after moving on. */
export async function reopenQuestions(planId: string): Promise<StepResult> {
  try {
    const { db } = await loadPlan(planId);
    await db
      .update(schema.plans)
      .set({ currentStep: "questions", updatedAt: new Date().toISOString() })
      .where(eq(schema.plans.id, planId));
    revalidatePath(`/plans/${planId}`);
    return {};
  } catch (e) {
    return { error: message(e) };
  }
}
