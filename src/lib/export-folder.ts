import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { ExportFile } from "./export";

export const MANIFEST = ".specwright-export.json";

type Manifest = { planId: string; exportedAt: string; files: string[] };

async function readManifest(dir: string): Promise<Manifest | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, MANIFEST), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

/**
 * Writes an export into `root/subfolder`. Safety rules for a folder on the user's disk:
 * - root must be an existing absolute directory, and subfolder must stay inside it;
 * - a non-empty target is only reused when its manifest says this plan wrote it;
 * - on re-export, only files listed in the previous manifest (and no longer produced) are removed.
 */
export async function writeExportToFolder(planId: string, root: string, subfolder: string, files: ExportFile[]) {
  const base = root.trim();
  if (!path.isAbsolute(base)) throw new Error("Use a full path, e.g. D:\\Projects\\budget-app");
  const stat = await fs.stat(base).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Folder not found: ${base}`);

  const parts = subfolder.trim().split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => p === "." || p === ".." || !/^[\w.-]+$/.test(p))) {
    throw new Error("The subfolder may only use letters, numbers, '.', '-', '_' and '/' (no '..').");
  }
  const target = path.resolve(base, ...parts);
  if (!target.startsWith(path.resolve(base) + path.sep)) throw new Error("The subfolder must be inside the chosen folder.");

  const existing = await fs.readdir(target).catch(() => null);
  const previous = existing ? await readManifest(target) : null;
  if (existing && existing.length > 0) {
    if (!previous) throw new Error(`${target} is not empty and was not created by Specwright. Pick a new or empty subfolder.`);
    if (previous.planId !== planId) throw new Error(`${target} holds the export of a different plan. Pick another subfolder.`);
  }

  for (const f of files) {
    const dest = path.resolve(target, f.path);
    if (!dest.startsWith(target + path.sep)) throw new Error(`Refusing to write outside the export folder: ${f.path}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, f.content, "utf8");
  }

  const now = new Set(files.map((f) => f.path));
  let removed = 0;
  for (const old of previous?.files ?? []) {
    if (now.has(old)) continue;
    const dest = path.resolve(target, old);
    if (!dest.startsWith(target + path.sep)) continue;
    await fs.rm(dest, { force: true });
    removed++;
  }

  const manifest: Manifest = { planId, exportedAt: new Date().toISOString(), files: [...now] };
  await fs.writeFile(path.join(target, MANIFEST), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { target, written: files.length, removed };
}
