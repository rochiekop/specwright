import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { streamText } from "@/lib/ai";
import { addPrdVersion, getPrdVersions } from "@/lib/documents";
import { featureMapText, getFeatureTree } from "@/lib/features";
import { PRD_SYSTEM, prdPrompt } from "@/lib/prompts/prd";
import { refreshRuleFindings } from "@/lib/quality";

// Sent instead of more text when generation fails mid-stream; the client shows the message after it.
const ERROR_MARK = "\u001eERROR ";

/** Streams a newly written PRD as plain text and saves it as a new version once complete. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/plans/[id]/prd">) {
  const { id } = await ctx.params;
  const db = await getDb();
  const plan = await db.query.plans.findFirst({ where: (p, { eq }) => eq(p.id, id) });
  if (!plan) return new Response("Plan not found", { status: 404 });
  const reason = (await getPrdVersions(id)).length ? "regenerate" : "generate";

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const map = featureMapText(await getFeatureTree(id));
        const args = { system: PRD_SYSTEM, prompt: prdPrompt(plan, map), effort: "high" as const, signal: req.signal };
        for await (const chunk of streamText({ step: "prd", planId: id }, args)) {
          // The user left or pressed Stop: discard the partial document.
          if (req.signal.aborted) return;
          text += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        if (text.trim().length < 200) throw new Error("The model returned an almost empty PRD. Try again or pick another model.");
        const version = await addPrdVersion(id, text.trim() + "\n", reason);
        await refreshRuleFindings(id, version, text);
        if (plan.currentStep === "idea" || plan.currentStep === "questions" || plan.currentStep === "features") {
          await db.update(schema.plans).set({ currentStep: "prd" }).where(eq(schema.plans.id, id));
        }
      } catch (e) {
        if (!req.signal.aborted) controller.enqueue(encoder.encode(ERROR_MARK + (e instanceof Error ? e.message : String(e))));
      } finally {
        try {
          controller.close();
        } catch {
          // already closed because the client disconnected
        }
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
