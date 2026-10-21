"use client";

import { useState, useTransition } from "react";
import { exportToFolder, previewExport, type ExportPreview } from "@/app/plan-actions";

export function ExportButton({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ExportPreview>();
  const [loadError, setLoadError] = useState<string>();
  const [loading, startLoad] = useTransition();

  function openDialog() {
    // Rebuild the preview on every open so it reflects the latest PRD and tasks.
    setOpen(true);
    setPreview(undefined);
    setLoadError(undefined);
    startLoad(async () => {
      const res = await previewExport(planId);
      if (res.error) setLoadError(res.error);
      else setPreview(res.preview);
    });
  }

  return (
    <>
      <button type="button" onClick={openDialog} className="btn btn-primary">
        Export for agents
      </button>
      {open && (
        <ExportDialog
          key={preview ? "ready" : "loading"}
          planId={planId}
          preview={preview}
          loading={loading}
          loadError={loadError}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ExportDialog({
  planId,
  preview,
  loading,
  loadError,
  onClose,
}: {
  planId: string;
  preview?: ExportPreview;
  loading: boolean;
  loadError?: string;
  onClose: () => void;
}) {
  // Remounted (via key) once the preview arrives, so these start from the remembered folder.
  const [root, setRoot] = useState(preview?.lastRoot ?? "");
  const [subfolder, setSubfolder] = useState(preview?.lastSubfolder ?? "");
  const [result, setResult] = useState<{ ok: boolean; text: string; folder?: string }>();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const agentFolder = result?.ok && result.folder ? subfolder.replace(/\\/g, "/") : preview?.folderName ?? "";
  const kickoff = `Read ${agentFolder}/AGENTS.md and ${agentFolder}/PRD.md. Then work through the run order in AGENTS.md: take the first unchecked task whose dependencies are all checked, build it as its task file describes, make every acceptance criterion pass, tick it in AGENTS.md, commit with the task code in the message, and continue with the next ready task.`;

  const bytes = preview?.files.reduce((n, f) => n + f.bytes, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export for coding agents"
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="font-semibold">Export for coding agents</h2>
            <p className="text-sm text-muted">PRD, one file per feature and per task, and AGENTS.md with the run order.</p>
          </div>
          <button type="button" onClick={onClose} className="btn px-2 py-1 text-muted hover:text-text" aria-label="Close">✕</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {loading && <p className="text-sm text-muted">Preparing files…</p>}
          {loadError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{loadError}</p>}

          {preview && (
            <>
              <details className="rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm">
                  <span className="font-mono">{preview.folderName}/</span>
                  <span className="text-muted">
                    {" "}· {preview.files.length} files · {(bytes / 1024).toFixed(0)} KB · PRD v{preview.prdVersion} · {preview.taskCount} tasks
                  </span>
                </summary>
                <ul className="max-h-48 overflow-y-auto border-t border-border px-3 py-2 font-mono text-xs leading-relaxed">
                  {preview.files.map((f) => (
                    <li key={f.path} className="flex justify-between gap-4">
                      <span className="truncate">{f.path}</span>
                      <span className="shrink-0 text-muted">{(f.bytes / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              </details>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Download</h3>
                <a href={`/api/plans/${planId}/export`} download className="btn btn-ghost">
                  Download {preview.folderName}.zip
                </a>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Or write it straight into your project</h3>
                <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
                  <div>
                    <label className="label text-xs" htmlFor="ex-root">Project folder (full path)</label>
                    <input id="ex-root" value={root} onChange={(e) => setRoot(e.target.value)} placeholder="D:\Projects\budget-app" className="input font-mono text-xs" />
                  </div>
                  <div>
                    <label className="label text-xs" htmlFor="ex-sub">Subfolder</label>
                    <input id="ex-sub" value={subfolder} onChange={(e) => setSubfolder(e.target.value)} className="input font-mono text-xs" />
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Exporting again updates the same subfolder and removes only files Specwright wrote there before. It never
                  writes into a non-empty folder it didn&apos;t create.
                </p>
                <button
                  type="button"
                  disabled={pending || !root.trim() || !subfolder.trim()}
                  onClick={() =>
                    start(async () => {
                      const res = await exportToFolder(planId, root, subfolder);
                      setResult(
                        res.error
                          ? { ok: false, text: res.error }
                          : {
                              ok: true,
                              folder: res.target,
                              text: `Wrote ${res.written} files to ${res.target}${res.removed ? ` and removed ${res.removed} outdated file${res.removed === 1 ? "" : "s"}` : ""}.`,
                            },
                      );
                    })
                  }
                  className="btn btn-primary"
                >
                  {pending ? "Writing…" : "Write files"}
                </button>
                {result && (
                  <p className={`rounded-md px-3 py-2 text-sm ${result.ok ? "bg-accent-soft" : "bg-danger-soft text-danger"}`}>{result.text}</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Prompt to start your coding agent</h3>
                <textarea readOnly rows={4} value={kickoff} className="input resize-none text-xs" aria-label="Agent kick-off prompt" />
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(kickoff);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="btn btn-ghost"
                >
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
