import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addPrdVersion, getPrdVersions } from "./documents";
import { getFeatureTree } from "./features";
import { replaceSections, splitSections } from "./prd-parse";
import type { ChatOpInput } from "./prompts/chat";
import { refreshRuleFindings } from "./quality";
import { getTaskBoard } from "./tasks";

type Priority = "high" | "medium" | "low";
type Layer = "db" | "backend" | "frontend" | "test";

/** A proposal row ready to insert: the op with references resolved to ids plus "before" values for the diff. */
export type ResolvedOp = { kind: string; op: Record<string, unknown>; status: "pending" | "failed"; error: string | null };

/**
 * Codes like "F2" or "F2-T3" shift when features or tasks are added or removed, so every reference is resolved
 * to a stable id now, while the proposal is created. Unknown references become failed proposals the user can see.
 */
export async function resolveOps(planId: string, ops: ChatOpInput[]): Promise<ResolvedOp[]> {
  const tree = await getFeatureTree(planId);
  const board = await getTaskBoard(planId);
  const [prd] = await getPrdVersions(planId);
  const feature = (code: string) => tree.find((f) => f.code.toUpperCase() === code.trim().toUpperCase());
  const task = (code: string) => board.find((t) => t.code.toUpperCase() === code.trim().toUpperCase());
  const fail = (o: ChatOpInput, error: string): ResolvedOp => ({ kind: o.type, op: { ...o }, status: "failed", error });

  return ops.map((o): ResolvedOp => {
    switch (o.type) {
      case "prd_section": {
        if (!prd) return fail(o, "There is no PRD yet.");
        const current = splitSections(prd.content).sections.find((s) => s.num === o.section);
        return { kind: o.type, op: { ...o, base: current?.text ?? "" }, status: "pending", error: null };
      }
      case "feature_update": {
        const f = feature(o.feature);
        if (!f) return fail(o, `Unknown feature ${o.feature}.`);
        const after = Object.fromEntries(
          (["name", "summary", "phase", "priority"] as const).filter((k) => o[k] !== null && o[k] !== f[k]).map((k) => [k, o[k]]),
        );
        if (!Object.keys(after).length) return fail(o, "No actual change.");
        return { kind: o.type, op: { featureId: f.id, code: f.code, before: { name: f.name, summary: f.summary, phase: f.phase, priority: f.priority }, after, reason: o.reason }, status: "pending", error: null };
      }
      case "feature_add":
        return { kind: o.type, op: { ...o }, status: "pending", error: null };
      case "feature_remove": {
        const f = feature(o.feature);
        if (!f) return fail(o, `Unknown feature ${o.feature}.`);
        const taskCount = board.filter((t) => t.featureId === f.id).length;
        return { kind: o.type, op: { featureId: f.id, code: f.code, name: f.name, subCount: f.subFeatures.length, taskCount, reason: o.reason }, status: "pending", error: null };
      }
      case "subfeature_add":
      case "subfeature_rename":
      case "subfeature_remove": {
        const f = feature(o.feature);
        if (!f) return fail(o, `Unknown feature ${o.feature}.`);
        if (o.type === "subfeature_add") {
          return { kind: o.type, op: { featureId: f.id, code: f.code, featureName: f.name, name: o.name, summary: o.summary, reason: o.reason }, status: "pending", error: null };
        }
        const name = o.type === "subfeature_rename" ? o.from : o.name;
        const sub = f.subFeatures.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (!sub) return fail(o, `${f.code} has no sub-feature "${name}".`);
        return o.type === "subfeature_rename"
          ? { kind: o.type, op: { featureId: f.id, code: f.code, subId: sub.id, from: sub.name, to: o.to, reason: o.reason }, status: "pending", error: null }
          : { kind: o.type, op: { featureId: f.id, code: f.code, subId: sub.id, name: sub.name, reason: o.reason }, status: "pending", error: null };
      }
      case "task_update": {
        const t = task(o.task);
        if (!t) return fail(o, `Unknown task ${o.task}.`);
        const before = { title: t.title, description: t.description, acceptance: t.acceptance, layer: t.layer, priority: t.priority };
        const after = Object.fromEntries(
          (["title", "description", "acceptance", "layer", "priority"] as const)
            .filter((k) => o[k] !== null && JSON.stringify(o[k]) !== JSON.stringify(before[k]))
            .map((k) => [k, o[k]]),
        );
        if (!Object.keys(after).length) return fail(o, "No actual change.");
        return { kind: o.type, op: { taskId: t.id, code: t.code, before, after, reason: o.reason }, status: "pending", error: null };
      }
      case "task_add": {
        const f = feature(o.feature);
        if (!f) return fail(o, `Unknown feature ${o.feature}.`);
        const deps = o.dependsOn.map((c) => task(c)).filter((t) => t !== undefined);
        return {
          kind: o.type,
          op: { featureId: f.id, featureCode: f.code, featureName: f.name, title: o.title, description: o.description, layer: o.layer, priority: o.priority, acceptance: o.acceptance, dependsOn: deps.map((d) => ({ id: d.id, code: d.code })), reason: o.reason },
          status: "pending",
          error: null,
        };
      }
      case "task_remove": {
        const t = task(o.task);
        if (!t) return fail(o, `Unknown task ${o.task}.`);
        return { kind: o.type, op: { taskId: t.id, code: t.code, title: t.title, dependents: t.dependents, reason: o.reason }, status: "pending", error: null };
      }
    }
  });
}

/**
 * Applies accepted proposals in order. PRD section changes are combined into one new PRD version. Each proposal is
 * marked accepted, or failed with a reason (e.g. its target was deleted, or the PRD section changed since).
 */
export async function applyProposals(planId: string, ids: string[]) {
  const db = await getDb();
  // Apply in the order given (the order shown in the chat), skipping anything no longer pending.
  const all = await db.query.chatProposals.findMany({ where: (p, { eq }) => eq(p.planId, planId) });
  const rows = ids.map((id) => all.find((p) => p.id === id)).filter((p) => p !== undefined && p.status === "pending") as typeof all;

  const results: { id: string; ok: boolean; error?: string }[] = [];
  const sectionEdits: { id: string; num: number; markdown: string }[] = [];
  let [prd] = await getPrdVersions(planId);
  let structureChanged = false;

  for (const p of rows) {
    const op = p.op as Record<string, never>;
    try {
      switch (p.kind) {
        case "prd_section": {
          if (!prd) throw new Error("There is no PRD yet.");
          const current = splitSections(prd.content).sections.find((s) => s.num === op.section)?.text ?? "";
          if (current.trim() !== String(op.base).trim()) throw new Error(`PRD section ${op.section} changed since this was proposed. Ask again.`);
          sectionEdits.push({ id: p.id, num: op.section, markdown: op.markdown });
          // Later section edits in the same batch see this one.
          prd = { ...prd, content: replaceSections(prd.content, [{ num: op.section, markdown: op.markdown }]) };
          continue; // marked accepted after the version is saved
        }
        case "feature_update":
          await mustExist("features", op.featureId);
          await db.update(schema.features).set({ ...(op.after as object), source: "user" }).where(eq(schema.features.id, op.featureId));
          if ((op.after as { phase?: number }).phase) {
            await db.update(schema.features).set({ phase: (op.after as { phase: number }).phase }).where(eq(schema.features.parentId, op.featureId));
          }
          break;
        case "feature_add": {
          const siblings = await db.query.features.findMany({ where: (f, { and, eq, isNull }) => and(eq(f.planId, planId), isNull(f.parentId), eq(f.phase, op.phase)) });
          const [root] = await db
            .insert(schema.features)
            .values({ planId, name: op.name, summary: op.summary, phase: op.phase, priority: op.priority, icon: op.icon, position: siblings.length, source: "user" })
            .returning({ id: schema.features.id });
          const subs = op.subFeatures as { name: string; summary: string }[];
          if (subs.length) {
            await db.insert(schema.features).values(subs.map((s, j) => ({ planId, parentId: root.id, name: s.name, summary: s.summary, phase: op.phase, position: j, source: "user" as const })));
          }
          break;
        }
        case "feature_remove":
          await mustExist("features", op.featureId);
          await db.delete(schema.features).where(eq(schema.features.parentId, op.featureId));
          await db.delete(schema.features).where(eq(schema.features.id, op.featureId)); // its tasks cascade
          break;
        case "subfeature_add": {
          await mustExist("features", op.featureId);
          const root = await db.query.features.findFirst({ where: (f, { eq }) => eq(f.id, op.featureId) });
          const subs = await db.query.features.findMany({ where: (f, { eq }) => eq(f.parentId, op.featureId) });
          await db.insert(schema.features).values({ planId, parentId: op.featureId, name: op.name, summary: op.summary, phase: root!.phase, position: subs.length, source: "user" });
          break;
        }
        case "subfeature_rename":
          await mustExist("features", op.subId);
          await db.update(schema.features).set({ name: op.to, source: "user" }).where(eq(schema.features.id, op.subId));
          break;
        case "subfeature_remove":
          await mustExist("features", op.subId);
          await db.update(schema.tasks).set({ subFeatureId: null }).where(eq(schema.tasks.subFeatureId, op.subId));
          await db.delete(schema.features).where(eq(schema.features.id, op.subId));
          break;
        case "task_update": {
          await mustExist("tasks", op.taskId);
          const after = { ...(op.after as Record<string, unknown>) };
          if (Array.isArray(after.acceptance)) after.acceptance = (after.acceptance as string[]).join("\n");
          await db.update(schema.tasks).set({ ...(after as object), source: "user" }).where(eq(schema.tasks.id, op.taskId));
          break;
        }
        case "task_add": {
          await mustExist("features", op.featureId);
          const siblings = await db.query.tasks.findMany({ where: (t, { eq }) => eq(t.featureId, op.featureId), columns: { position: true } });
          const deps = (op.dependsOn as { id: string }[]).map((d) => d.id);
          await db.insert(schema.tasks).values({
            planId,
            featureId: op.featureId,
            title: op.title,
            description: op.description,
            layer: op.layer as Layer,
            priority: op.priority as Priority,
            acceptance: (op.acceptance as string[]).join("\n"),
            dependsOn: deps,
            position: siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0,
            source: "user",
          });
          break;
        }
        case "task_remove":
          await mustExist("tasks", op.taskId);
          await db.delete(schema.tasks).where(eq(schema.tasks.id, op.taskId));
          break;
        default:
          throw new Error(`Unknown change type ${p.kind}`);
      }
      structureChanged = true;
      await db.update(schema.chatProposals).set({ status: "accepted", error: null }).where(eq(schema.chatProposals.id, p.id));
      results.push({ id: p.id, ok: true });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.update(schema.chatProposals).set({ status: "failed", error }).where(eq(schema.chatProposals.id, p.id));
      results.push({ id: p.id, ok: false, error });
    }
  }

  if (structureChanged) await dropDanglingDependencies(planId);

  let version: number | undefined;
  if (sectionEdits.length && prd) {
    version = await addPrdVersion(planId, prd.content, "chat");
    for (const s of sectionEdits) {
      await db.update(schema.chatProposals).set({ status: "accepted", appliedVersion: version }).where(eq(schema.chatProposals.id, s.id));
      results.push({ id: s.id, ok: true });
    }
  }
  // Keep the free checks (incl. PRD ↔ map drift) in step with whatever changed.
  const [latest] = await getPrdVersions(planId);
  if (latest && (version || structureChanged)) await refreshRuleFindings(planId, latest.version, latest.content);
  return { results, version };
}

async function mustExist(table: "features" | "tasks", id: string) {
  const db = await getDb();
  const row =
    table === "features"
      ? await db.query.features.findFirst({ where: (f, { eq }) => eq(f.id, id), columns: { id: true } })
      : await db.query.tasks.findFirst({ where: (t, { eq }) => eq(t.id, id), columns: { id: true } });
  if (!row) throw new Error("Its target no longer exists (deleted or regenerated since this was proposed).");
}

/** Removed tasks or features must not leave other tasks waiting on something that no longer exists. */
async function dropDanglingDependencies(planId: string) {
  const db = await getDb();
  const all = await db.query.tasks.findMany({ where: (t, { eq }) => eq(t.planId, planId) });
  const ids = new Set(all.map((t) => t.id));
  for (const t of all) {
    const kept = t.dependsOn.filter((d) => ids.has(d));
    if (kept.length !== t.dependsOn.length) await db.update(schema.tasks).set({ dependsOn: kept }).where(eq(schema.tasks.id, t.id));
  }
}
