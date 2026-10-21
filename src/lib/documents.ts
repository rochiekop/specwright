import "server-only";
import { and, desc, eq, max } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Appends a new PRD version. Versions are never edited or deleted, so every change can be compared and restored. */
export async function addPrdVersion(planId: string, content: string, reason: string) {
  const db = await getDb();
  const [{ latest }] = await db
    .select({ latest: max(schema.documents.version) })
    .from(schema.documents)
    .where(and(eq(schema.documents.planId, planId), eq(schema.documents.kind, "prd")));
  const version = (latest ?? 0) + 1;
  await db.insert(schema.documents).values({ planId, kind: "prd", version, content, reason });
  await db
    .update(schema.plans)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(schema.plans.id, planId));
  return version;
}

export async function getPrdVersions(planId: string) {
  const db = await getDb();
  return db
    .select({
      version: schema.documents.version,
      reason: schema.documents.reason,
      createdAt: schema.documents.createdAt,
      content: schema.documents.content,
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.planId, planId), eq(schema.documents.kind, "prd")))
    .orderBy(desc(schema.documents.version));
}
