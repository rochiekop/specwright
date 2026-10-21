import "server-only";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb, schema } from "@/db";
import { anthropicAdapter } from "./anthropic";
import { openAiCompatibleAdapter } from "./openai-compatible";
import { getProvider, parseModelSpec } from "./providers";
import type { GenerateArgs, LlmAdapter, Usage } from "./types";

export const STEPS = [
  { id: "questions", label: "Clarifying questions", hint: "Short JSON output; a fast, cheap model is fine." },
  { id: "prd", label: "PRD writing", hint: "Long, careful writing; use your strongest model." },
  { id: "quality", label: "PRD quality check", hint: "Reviews the PRD; use a strong model." },
  { id: "features", label: "Feature breakdown", hint: "Large JSON tree; a strong model." },
  { id: "tasks", label: "Task breakdown", hint: "Many small JSON items; a mid-tier model is usually enough." },
  { id: "chat", label: "Revision chat", hint: "Interactive; balance speed and quality." },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export const FALLBACK_MODEL = "anthropic:claude-opus-5-5";

export async function getModelSettings(): Promise<Record<"default" | StepId, string>> {
  const db = await getDb();
  const rows = await db.select().from(schema.settings);
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const def = saved["model.default"] || process.env.MODEL_DEFAULT || FALLBACK_MODEL;
  const out = { default: def } as Record<"default" | StepId, string>;
  for (const s of STEPS) out[s.id] = saved[`model.${s.id}`] || "";
  return out;
}

async function modelFor(step: StepId | "test", override?: string) {
  if (override) return override;
  const s = await getModelSettings();
  return (step !== "test" && s[step]) || s.default;
}

export function adapterFor(providerId: string): LlmAdapter {
  const p = getProvider(providerId);
  if (!p.configured) {
    throw new Error(
      p.kind === "anthropic" || !p.keyOptional
        ? `${p.label} is not configured: set ${p.apiKeyEnv} in .env.local and restart.`
        : `${p.label} is not configured: set ${p.id.toUpperCase()}_BASE_URL in .env.local and restart.`,
    );
  }
  return p.kind === "anthropic" ? anthropicAdapter(p.apiKey!) : openAiCompatibleAdapter(p.baseUrl!, p.apiKey);
}

type RunMeta = { step: StepId | "test"; planId?: string; model?: string };

async function logRun(
  meta: RunMeta & { provider: string; model: string },
  args: GenerateArgs,
  started: number,
  result: { response?: string; usage?: Usage; error?: unknown },
) {
  const db = await getDb();
  await db.insert(schema.generationRuns).values({
    planId: meta.planId ?? null,
    step: meta.step,
    provider: meta.provider,
    model: meta.model,
    prompt: [args.system ? `[system]\n${args.system}` : "", `[user]\n${args.prompt}`].filter(Boolean).join("\n\n"),
    response: result.response ?? "",
    status: result.error ? "error" : "ok",
    error: result.error ? (result.error instanceof Error ? result.error.message : String(result.error)) : null,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
    durationMs: Date.now() - started,
  });
}

async function resolve(meta: RunMeta) {
  const spec = await modelFor(meta.step, meta.model);
  const { provider, model } = parseModelSpec(spec);
  return { provider, model, adapter: adapterFor(provider) };
}

export async function generateText(meta: RunMeta, args: GenerateArgs) {
  const { provider, model, adapter } = await resolve(meta);
  const started = Date.now();
  try {
    const res = await adapter.generateText(model, args);
    await logRun({ ...meta, provider, model }, args, started, { response: res.text, usage: res.usage });
    return res;
  } catch (error) {
    await logRun({ ...meta, provider, model }, args, started, { error });
    throw error;
  }
}

export async function generateObject<T>(meta: RunMeta, schemaDef: z.ZodType<T>, args: GenerateArgs) {
  const { provider, model, adapter } = await resolve(meta);
  const started = Date.now();
  try {
    const res = await adapter.generateObject(model, schemaDef, args);
    await logRun({ ...meta, provider, model }, args, started, { response: res.raw, usage: res.usage });
    return res;
  } catch (error) {
    await logRun({ ...meta, provider, model }, args, started, { error });
    throw error;
  }
}

export async function* streamText(meta: RunMeta, args: GenerateArgs) {
  const { provider, model, adapter } = await resolve(meta);
  const started = Date.now();
  let text = "";
  let usage: Usage = {};
  try {
    for await (const chunk of adapter.streamText(model, args, (u) => (usage = u))) {
      text += chunk;
      yield chunk;
    }
    await logRun({ ...meta, provider, model }, args, started, { response: text, usage });
  } catch (error) {
    await logRun({ ...meta, provider, model }, args, started, { response: text, error });
    throw error;
  }
}

export async function getRecentRuns(limit = 20) {
  const db = await getDb();
  return db.query.generationRuns.findMany({
    orderBy: (r, { desc }) => [desc(r.createdAt)],
    limit,
    columns: { prompt: false, response: false },
  });
}

export async function saveModelSetting(key: "default" | StepId, value: string) {
  const db = await getDb();
  const k = `model.${key}`;
  if (!value) {
    await db.delete(schema.settings).where(eq(schema.settings.key, k));
    return;
  }
  parseModelSpec(value);
  await db.insert(schema.settings).values({ key: k, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}
