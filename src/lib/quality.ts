import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getFeatureTree } from "./features";
import { runRuleChecks } from "./quality-rules";

/**
 * Re-runs the free rule checks against a PRD version, replacing open rule findings.
 * Called after every new version so rule results always match the current document.
 */
export async function refreshRuleFindings(planId: string, version: number, content: string) {
  const db = await getDb();
  await db
    .delete(schema.qualityFindings)
    .where(
      and(
        eq(schema.qualityFindings.planId, planId),
        eq(schema.qualityFindings.source, "rule"),
        eq(schema.qualityFindings.status, "open"),
      ),
    );
  const rules = runRuleChecks(content, await getFeatureTree(planId));
  if (rules.length) await db.insert(schema.qualityFindings).values(rules.map((f) => ({ ...f, planId, prdVersion: version })));
  return rules.length;
}
