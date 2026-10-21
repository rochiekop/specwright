import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`);

export type TechStack = {
  frontend?: string;
  backend?: string;
  database?: string;
  deployment?: string;
  other?: string;
};

export type Question = {
  id: string;
  type: "text" | "single_choice" | "multi_choice";
  question: string;
  options?: string[];
  why?: string;
  // 1 = first round, 2 = follow-up asked because a round-1 answer was too thin
  round?: number;
};

export type Answers = Record<string, string | string[] | null>;

export type PlanStep = "idea" | "questions" | "prd" | "features" | "tasks";

export const projects = sqliteTable("projects", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: createdAt(),
});

export const stackPresets = sqliteTable("stack_presets", {
  id: id(),
  name: text("name").notNull(),
  techStack: text("tech_stack", { mode: "json" }).$type<TechStack>().notNull(),
  notes: text("notes").notNull().default(""),
});

export const plans = sqliteTable("plans", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  idea: text("idea").notNull(),
  language: text("language").notNull().default("en"),
  stackPresetId: text("stack_preset_id").references(() => stackPresets.id, {
    onDelete: "set null",
  }),
  techStack: text("tech_stack", { mode: "json" }).$type<TechStack>().notNull(),
  questions: text("questions", { mode: "json" }).$type<Question[]>().notNull().default([]),
  answers: text("answers", { mode: "json" }).$type<Answers>().notNull().default({}),
  currentStep: text("current_step").$type<PlanStep>().notNull().default("idea"),
  createdAt: createdAt(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// One row per PRD version; the highest version is the current one.
export const documents = sqliteTable("documents", {
  id: id(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("prd"),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  // What produced this version: generate | regenerate_section | quality_fix | manual
  reason: text("reason").notNull().default("generate"),
  createdAt: createdAt(),
});

// Root features and sub-features share this table, linked by parentId.
export const features = sqliteTable("features", {
  id: id(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  spec: text("spec").notNull().default(""),
  icon: text("icon").notNull().default("box"),
  phase: integer("phase").notNull().default(1),
  priority: text("priority").$type<"high" | "medium" | "low">(),
  status: text("status").notNull().default("planned"),
  // user = edited by hand; regeneration must not overwrite it silently
  source: text("source").$type<"ai" | "user">().notNull().default("ai"),
  isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
});

export const tasks = sqliteTable("tasks", {
  id: id(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  featureId: text("feature_id")
    .notNull()
    .references(() => features.id, { onDelete: "cascade" }),
  // Optional: the sub-feature (screen/action) this task delivers
  subFeatureId: text("sub_feature_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // One checkable criterion per line
  acceptance: text("acceptance").notNull().default(""),
  prompt: text("prompt").notNull().default(""),
  layer: text("layer").$type<"frontend" | "backend" | "db" | "test">().notNull(),
  priority: text("priority").$type<"high" | "medium" | "low">().notNull().default("medium"),
  status: text("status").$type<"todo" | "doing" | "done" | "failed">().notNull().default("todo"),
  dependsOn: text("depends_on", { mode: "json" }).$type<string[]>().notNull().default([]),
  source: text("source").$type<"ai" | "user">().notNull().default("ai"),
  position: integer("position").notNull().default(0),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: id(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  createdAt: createdAt(),
});

// One proposed change from the revision chat. Applied only when the user accepts it.
export const chatProposals = sqliteTable("chat_proposals", {
  id: id(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  messageId: text("message_id")
    .notNull()
    .references(() => chatMessages.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  kind: text("kind").notNull(),
  // The operation with references resolved to ids and a "before" snapshot (see src/lib/chat-ops.ts)
  op: text("op", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<"pending" | "accepted" | "rejected" | "failed">().notNull().default("pending"),
  error: text("error"),
  appliedVersion: integer("applied_version"),
});

export const qualityFindings = sqliteTable("quality_findings", {
  id: id(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  rule: text("rule").notNull(),
  severity: text("severity").$type<"error" | "warning" | "info">().notNull(),
  // rule = deterministic check, ai = model review
  source: text("source").$type<"rule" | "ai">().notNull().default("rule"),
  // PRD version the check ran against; findings on older versions may be stale
  prdVersion: integer("prd_version").notNull().default(0),
  section: integer("section"),
  targetRef: text("target_ref").notNull().default(""),
  message: text("message").notNull(),
  suggestion: text("suggestion").notNull().default(""),
  // open | fixed (by "Fix with AI", fixedInVersion set) | dismissed
  status: text("status").$type<"open" | "fixed" | "dismissed">().notNull().default("open"),
  fixedInVersion: integer("fixed_in_version"),
});

// Every LLM call is logged here for debugging and prompt tuning.
export const generationRuns = sqliteTable("generation_runs", {
  id: id(),
  planId: text("plan_id"),
  step: text("step").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull().default(""),
  status: text("status").$type<"ok" | "error">().notNull(),
  error: text("error"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  durationMs: integer("duration_ms").notNull(),
  createdAt: createdAt(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
