import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const dbFile = process.env.DATABASE_FILE ?? "data/app.db";
// The path comes from the environment at runtime, so the bundler must not try to trace it.
fs.mkdirSync(path.dirname(path.resolve(/*turbopackIgnore: true*/ dbFile)), { recursive: true });

const client = createClient({ url: `file:${dbFile}` });
const db = drizzle(client, { schema });

const defaultPresets: (typeof schema.stackPresets.$inferInsert)[] = [
  {
    name: "Next.js + PostgreSQL",
    techStack: { frontend: "Next.js (App Router)", backend: "Next.js route handlers", database: "PostgreSQL", deployment: "Docker" },
  },
  {
    name: "React SPA + Node API (monorepo)",
    techStack: { frontend: "React + Vite", backend: "Node.js (Express or Hono)", database: "PostgreSQL", deployment: "Docker" },
  },
  {
    name: "Laravel + MySQL",
    techStack: { frontend: "Blade + Livewire", backend: "Laravel", database: "MySQL", deployment: "VPS" },
  },
  {
    name: "Mobile: Expo + Supabase",
    techStack: { frontend: "Expo (React Native)", backend: "Supabase", database: "PostgreSQL (Supabase)", deployment: "EAS + Supabase cloud" },
  },
];

async function init() {
  // Wait up to 5 s for another process (a second dev worker, a script, a build) instead of failing with SQLITE_BUSY.
  await client.execute("PRAGMA busy_timeout = 5000");
  // WAL lets pages read while a long generation is writing.
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const existing = await db.select({ id: schema.stackPresets.id }).from(schema.stackPresets).limit(1);
  if (existing.length === 0) await db.insert(schema.stackPresets).values(defaultPresets);
}

// Reuse across hot reloads so migrations run once per process.
const g = globalThis as unknown as { __dbReady?: Promise<void> };

export async function getDb() {
  g.__dbReady ??= init().catch((e) => {
    // Don't cache a failure: the next request retries instead of failing until a restart.
    g.__dbReady = undefined;
    throw e;
  });
  await g.__dbReady;
  return db;
}

export { schema };
