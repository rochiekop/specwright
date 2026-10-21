"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useSyncExternalStore } from "react";

const DARK = "(prefers-color-scheme: dark)";

// Hydration-safe colour scheme: "light" on the server and during hydration, the real value right after.
function useColorScheme(): "light" | "dark" {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DARK);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => (window.matchMedia(DARK).matches ? "dark" : "light"),
    () => "light",
  );
}
import { FeatureIcon } from "./feature-icon";

export type MapFeature = {
  id: string;
  code: string;
  name: string;
  summary: string;
  icon: string;
  phase: number;
  priority: "high" | "medium" | "low" | null;
  source: "ai" | "user";
  subFeatures: { id: string; name: string; summary: string; source: "ai" | "user" }[];
};

const FEATURE_W = 250;
const FEATURE_H = 68;
const SUB_W = 270;
const SUB_VISIBLE = 3;
const COL_X = { root: 0, feature: 300, sub: 640 };

function subCardHeight(n: number) {
  return 34 + Math.min(n, SUB_VISIBLE) * 28 + (n > SUB_VISIBLE ? 24 : 0) + 8;
}

type RootData = { title: string; count: number };
type FeatureData = { f: MapFeature; selected: boolean; onSelect: (id: string) => void };
type SubData = { f: MapFeature; selected: boolean; onSelect: (id: string) => void };

const handle = "!h-2 !w-2 !min-h-0 !min-w-0 !border-0 !bg-border";

function RootNode({ data }: NodeProps<Node<RootData>>) {
  return (
    <div className="w-56 rounded-lg border border-accent/60 bg-surface px-4 py-3 shadow-sm">
      <div className="truncate font-semibold">{data.title}</div>
      <div className="text-xs text-muted">{data.count} features</div>
      <Handle type="source" position={Position.Right} className={handle} />
    </div>
  );
}

const PRIORITY_DOT = { high: "bg-danger", medium: "bg-warn", low: "bg-muted" } as const;

function FeatureNodeView({ data }: NodeProps<Node<FeatureData>>) {
  const { f } = data;
  return (
    <button
      type="button"
      onClick={() => data.onSelect(f.id)}
      style={{ width: FEATURE_W, height: FEATURE_H }}
      className={`relative flex flex-col justify-center rounded-lg border bg-surface px-3 text-left shadow-sm transition-colors hover:border-accent ${
        data.selected ? "border-accent ring-2 ring-accent/30" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className={handle} />
      <span className="absolute -top-2 right-3 rounded-full bg-accent-soft px-2 py-px text-[10px] font-medium text-accent">
        Phase {f.phase}
      </span>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2 text-accent">
          <FeatureIcon name={f.icon} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            <span className="mr-1 font-mono text-xs text-muted">{f.code}</span>
            {f.name}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[f.priority ?? "medium"]}`} aria-hidden />
            {f.priority ?? "medium"} priority{f.source === "user" ? " · edited" : ""}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={handle} />
    </button>
  );
}

function SubCardNode({ data }: NodeProps<Node<SubData>>) {
  const { f } = data;
  const shown = f.subFeatures.slice(0, SUB_VISIBLE);
  return (
    <button
      type="button"
      onClick={() => data.onSelect(f.id)}
      style={{ width: SUB_W, height: subCardHeight(f.subFeatures.length) }}
      className={`flex flex-col rounded-lg border bg-surface-2 p-2 text-left transition-colors hover:border-accent ${
        data.selected ? "border-accent" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className={handle} />
      <div className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">Sub-features</div>
      {shown.length === 0 ? (
        <div className="px-1 text-xs italic text-muted">None yet</div>
      ) : (
        shown.map((s) => (
          <div key={s.id} className="mb-1 truncate rounded-md bg-surface px-2 py-1 text-xs">
            {s.name}
          </div>
        ))
      )}
      {f.subFeatures.length > SUB_VISIBLE && (
        <div className="mt-auto px-1 text-right text-[11px] text-accent">+{f.subFeatures.length - SUB_VISIBLE} more · open</div>
      )}
    </button>
  );
}

const nodeTypes = { root: RootNode, feature: FeatureNodeView, sub: SubCardNode };

export function FeatureMap({
  title,
  features,
  selectedId,
  onSelect,
}: {
  title: string;
  features: MapFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const colorMode = useColorScheme();
  const { nodes, edges } = useMemo(() => {
    // Simple deterministic tree layout: one row per feature, tall enough for its sub-feature card.
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 0;
    for (const f of features) {
      const rowH = Math.max(FEATURE_H, subCardHeight(f.subFeatures.length)) + 28;
      const selected = f.id === selectedId;
      nodes.push({ id: f.id, type: "feature", position: { x: COL_X.feature, y: y + (rowH - 28 - FEATURE_H) / 2 }, data: { f, selected, onSelect } });
      nodes.push({ id: `${f.id}-subs`, type: "sub", position: { x: COL_X.sub, y }, data: { f, selected, onSelect } });
      edges.push({ id: `root-${f.id}`, source: "root", target: f.id, type: "default", style: { stroke: "var(--border)", strokeWidth: 1.5 } });
      edges.push({
        id: `${f.id}-subs`,
        source: f.id,
        target: `${f.id}-subs`,
        type: "default",
        style: { stroke: "var(--border)", strokeWidth: 1.5, strokeDasharray: "4 4" },
      });
      y += rowH;
    }
    nodes.unshift({ id: "root", type: "root", position: { x: COL_X.root, y: Math.max(0, y / 2 - 50) }, data: { title, count: features.length } });
    return { nodes, edges };
  }, [features, selectedId, onSelect, title]);

  return (
    <div className="h-[72vh] min-h-[420px] overflow-hidden rounded-lg border border-border bg-bg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.6}
        colorMode={colorMode}
      >
        <Background gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
