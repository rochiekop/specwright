"use client";

import { useEffect, useId, useState } from "react";

let initialized: "light" | "dark" | null = null;

export function MermaidBlock({ code }: { code: string }) {
  const id = "mmd-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      const scheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      if (initialized !== scheme) {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: scheme === "dark" ? "dark" : "neutral" });
        initialized = scheme;
      }
      try {
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(svg);
          setError(undefined);
        }
      } catch (e) {
        // mermaid leaves an error element behind on failure
        document.getElementById("d" + id)?.remove();
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return (
      <div className="my-4 rounded-md border border-warn/50 p-3">
        <div className="mb-2 text-xs text-warn">Diagram could not be drawn ({error.split("\n")[0]}). Source:</div>
        <pre className="overflow-x-auto text-xs">{code}</pre>
      </div>
    );
  }
  if (!svg) return <div className="my-4 h-24 animate-pulse rounded-md bg-surface-2" aria-label="Drawing diagram" />;
  return (
    <figure className="my-4 rounded-md border border-border bg-surface p-2">
      <div className="mb-1 flex justify-end gap-1 text-xs text-muted">
        <button type="button" className="rounded px-2 hover:bg-surface-2" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>−</button>
        <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button type="button" className="rounded px-2 hover:bg-surface-2" onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}>+</button>
      </div>
      <div className="overflow-auto">
        {/* SVG produced by mermaid with securityLevel "strict" */}
        <div style={{ zoom }} className="flex justify-center [&_svg]:max-w-none" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </figure>
  );
}
