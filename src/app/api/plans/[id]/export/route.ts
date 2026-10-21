import type { NextRequest } from "next/server";
import { strToU8, zipSync } from "fflate";
import { buildExport } from "@/lib/export";

/** Downloads the agent export as a ZIP with a single top-level folder. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/plans/[id]/export">) {
  const { id } = await ctx.params;
  try {
    const bundle = await buildExport(id);
    const entries = Object.fromEntries(bundle.files.map((f) => [`${bundle.folderName}/${f.path}`, strToU8(f.content)]));
    const zip = zipSync(entries, { level: 6 });
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${bundle.folderName}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 400 });
  }
}
