"use server";

// Local single-user app: there is no auth by design, so these actions do not check a session.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { adapterFor, generateText, saveModelSetting, STEPS, type StepId } from "@/lib/ai";
import { getProvider } from "@/lib/ai/providers";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createProject(formData: FormData) {
  const name = z.string().min(1, "Name is required").max(120).parse(str(formData, "name"));
  const db = await getDb();
  const [row] = await db
    .insert(schema.projects)
    .values({ name, description: str(formData, "description") })
    .returning({ id: schema.projects.id });
  redirect(`/projects/${row.id}`);
}

export async function deleteProject(formData: FormData) {
  const db = await getDb();
  await db.delete(schema.projects).where(eq(schema.projects.id, str(formData, "id")));
  redirect("/");
}

const planInput = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1, "Give the plan a short title").max(120),
  idea: z.string().min(20, "Describe the idea in at least a sentence or two"),
  language: z.string().min(2),
  stackPresetId: z.string().optional(),
  frontend: z.string(),
  backend: z.string(),
  database: z.string(),
  deployment: z.string(),
});

export type PlanFormState = { error?: string };

export async function createPlan(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const parsed = planInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { projectId, title, idea, language, stackPresetId, frontend, backend, database, deployment } = parsed.data;
  const db = await getDb();
  const [row] = await db
    .insert(schema.plans)
    .values({
      projectId,
      title,
      idea,
      language,
      stackPresetId: stackPresetId || null,
      techStack: { frontend, backend, database, deployment },
    })
    .returning({ id: schema.plans.id });
  redirect(`/plans/${row.id}`);
}

export async function updatePlanIdea(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const parsed = planInput.omit({ projectId: true }).extend({ id: z.string() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, title, idea, language, stackPresetId, frontend, backend, database, deployment } = parsed.data;
  const db = await getDb();
  await db
    .update(schema.plans)
    .set({
      title,
      idea,
      language,
      stackPresetId: stackPresetId || null,
      techStack: { frontend, backend, database, deployment },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.plans.id, id));
  revalidatePath(`/plans/${id}`);
  return {};
}

export async function deletePlan(formData: FormData) {
  const db = await getDb();
  const id = str(formData, "id");
  const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, id) });
  await db.delete(schema.plans).where(eq(schema.plans.id, id));
  redirect(plan ? `/projects/${plan.projectId}` : "/");
}

// ---- Model settings -------------------------------------------------------

export type SettingsState = { ok?: boolean; error?: string };

export async function saveModels(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    await saveModelSetting("default", str(formData, "default"));
    for (const s of STEPS) await saveModelSetting(s.id as StepId, str(formData, s.id));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listProviderModels(providerId: string): Promise<{ models?: string[]; error?: string }> {
  try {
    getProvider(providerId);
    return { models: await adapterFor(providerId).listModels() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function testModel(spec: string): Promise<{ ok: boolean; message: string; ms: number }> {
  const started = Date.now();
  try {
    const res = await generateText(
      { step: "test", model: spec },
      { prompt: "Reply with exactly the word OK.", maxTokens: 2000, effort: "low" },
    );
    return { ok: true, message: res.text.trim().slice(0, 80) || "(empty reply)", ms: Date.now() - started };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  } finally {
    revalidatePath("/settings");
  }
}
