"use client";

import { diffLines } from "diff";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  acceptProposals,
  clearChat,
  getChat,
  rejectProposal,
  sendChatMessage,
  type ChatMessageView,
  type ChatProposalView,
} from "@/app/plan-actions";
import { Markdown } from "./markdown";

const SUGGESTIONS = [
  "Which acceptance criteria are still vague?",
  "Make phase 1 smaller so we can launch sooner.",
  "Add a feature for managing categories, and update the PRD and tasks to match.",
];

export function ReviseButton({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [, startLoad] = useTransition();

  function openChat() {
    setOpen(true);
    startLoad(async () => setMessages(await getChat(planId)));
  }

  return (
    <>
      <button type="button" onClick={openChat} className="btn btn-ghost">
        Revise with AI
      </button>
      {open && <ChatDrawer planId={planId} messages={messages} setMessages={setMessages} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatDrawer({
  planId,
  messages,
  setMessages,
  onClose,
}: {
  planId: string;
  messages: ChatMessageView[] | null;
  setMessages: (m: ChatMessageView[]) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, startSend] = useTransition();
  const [applying, startApply] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string }>();
  const [pendingText, setPendingText] = useState<string>();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, pendingText]);

  function send(value: string) {
    const msg = value.trim();
    if (!msg || sending) return;
    setText("");
    setNotice(undefined);
    setPendingText(msg);
    startSend(async () => {
      const res = await sendChatMessage(planId, msg);
      setPendingText(undefined);
      if (res.messages) setMessages(res.messages);
      if (res.error) setNotice({ ok: false, text: res.error });
    });
  }

  function accept(ids: string[]) {
    setNotice(undefined);
    startApply(async () => {
      const res = await acceptProposals(planId, ids);
      if (res.messages) setMessages(res.messages);
      setNotice(res.error ? { ok: false, text: res.error } : { ok: true, text: res.summary ?? "Applied." });
      router.refresh();
    });
  }

  function reject(id: string) {
    startApply(async () => {
      const res = await rejectProposal(planId, id);
      if (res.messages) setMessages(res.messages);
    });
  }

  const busy = sending || applying;

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        aria-label="Revise with AI"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col border-l border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div>
            <div className="font-semibold">Revise with AI</div>
            <div className="text-xs text-muted">Ask questions or request changes. Nothing changes until you accept it.</div>
          </div>
          <div className="flex gap-1">
            {messages && messages.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!confirm("Clear this conversation? Accepted changes stay applied.")) return;
                  startApply(async () => {
                    await clearChat(planId);
                    setMessages([]);
                  });
                }}
                className="btn px-2 py-1 text-xs text-muted hover:text-text"
              >
                Clear
              </button>
            )}
            <button type="button" onClick={onClose} className="btn px-2 py-1 text-muted hover:text-text" aria-label="Close">✕</button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages === null && <p className="text-sm text-muted">Loading…</p>}
          {messages?.length === 0 && !pendingText && (
            <div className="space-y-2">
              <p className="text-sm text-muted">Try:</p>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="block w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-accent">
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages?.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-accent-soft px-3 py-2 text-sm">{m.content}</div>
            ) : (
              <div key={m.id} className="space-y-2">
                <div className="text-sm [&_.doc]:text-sm">
                  <Markdown text={m.content} />
                </div>
                {m.proposals.length > 0 && (
                  <div className="space-y-2">
                    {m.proposals.filter((p) => p.status === "pending").length > 1 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => accept(m.proposals.filter((p) => p.status === "pending").map((p) => p.id))}
                        className="btn btn-primary w-full"
                      >
                        Accept all {m.proposals.filter((p) => p.status === "pending").length} changes
                      </button>
                    )}
                    {m.proposals.map((p) => (
                      <ProposalCard key={p.id} p={p} busy={busy} onAccept={() => accept([p.id])} onReject={() => reject(p.id)} />
                    ))}
                  </div>
                )}
              </div>
            ),
          )}

          {pendingText && (
            <>
              <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-accent-soft px-3 py-2 text-sm">{pendingText}</div>
              <p className="flex items-center gap-2 text-sm text-muted">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                Reading the plan… (usually 10–40 seconds)
              </p>
            </>
          )}
          {notice && <p className={`rounded-md px-3 py-2 text-sm ${notice.ok ? "bg-accent-soft" : "bg-danger-soft text-danger"}`}>{notice.text}</p>}
          <div ref={bottom} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="border-t border-border p-3"
        >
          <textarea
            aria-label="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={3}
            placeholder="e.g. Move Telegram logging to phase 2 and update everything that depends on it"
            className="input resize-none"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>Enter to send · Shift+Enter for a new line</span>
            <button disabled={busy || !text.trim()} className="btn btn-primary">Send</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  prd_section: "PRD section",
  feature_update: "Change feature",
  feature_add: "Add feature",
  feature_remove: "Remove feature",
  subfeature_add: "Add sub-feature",
  subfeature_rename: "Rename sub-feature",
  subfeature_remove: "Remove sub-feature",
  task_update: "Change task",
  task_add: "Add task",
  task_remove: "Remove task",
};

function ProposalCard({ p, busy, onAccept, onReject }: { p: ChatProposalView; busy: boolean; onAccept: () => void; onReject: () => void }) {
  const op = p.op as Record<string, never>;
  const target =
    p.kind === "prd_section"
      ? `§${op.section}`
      : p.kind.startsWith("task_") && p.kind !== "task_add"
        ? op.code
        : p.kind === "task_add"
          ? op.featureCode
          : p.kind === "feature_add"
            ? `Phase ${op.phase}`
            : op.code;

  return (
    <div className={`rounded-md border ${p.status === "pending" ? "border-accent/50" : "border-border"} bg-surface`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <span>
          <span className="font-medium">{KIND_LABEL[p.kind] ?? p.kind}</span> <span className="font-mono text-muted">{target}</span>
        </span>
        <StatusBadge p={p} />
      </div>
      <div className="space-y-2 px-3 py-2 text-sm">
        {op.reason && <p className="text-muted">{op.reason}</p>}
        <ProposalBody kind={p.kind} op={op} />
        {p.error && <p className="text-xs text-danger">{p.error}</p>}
      </div>
      {p.status === "pending" && (
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <button type="button" disabled={busy} onClick={onReject} className="btn btn-ghost px-2.5 py-1 text-xs">Reject</button>
          <button type="button" disabled={busy} onClick={onAccept} className="btn btn-primary px-2.5 py-1 text-xs">Accept</button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ p }: { p: ChatProposalView }) {
  const style = {
    pending: "text-accent",
    accepted: "text-accent",
    rejected: "text-muted",
    failed: "text-danger",
  }[p.status];
  const label = p.status === "accepted" && p.appliedVersion ? `accepted · PRD v${p.appliedVersion}` : p.status;
  return <span className={style}>{label}</span>;
}

function Field({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  const show = (v: unknown) => (Array.isArray(v) ? v.join("\n") : v == null || v === "" ? "—" : String(v));
  return (
    <div className="text-xs">
      <div className="text-muted">{label}</div>
      <div className="whitespace-pre-wrap rounded bg-danger-soft px-2 py-1 line-through decoration-danger/60">{show(before)}</div>
      <div className="mt-0.5 whitespace-pre-wrap rounded bg-accent-soft px-2 py-1">{show(after)}</div>
    </div>
  );
}

function ProposalBody({ kind, op }: { kind: string; op: Record<string, never> }) {
  switch (kind) {
    case "prd_section":
      return <SectionDiff before={op.base} after={op.markdown} />;
    case "feature_update":
    case "task_update":
      return (
        <div className="space-y-2">
          {Object.keys(op.after as object).map((k) => (
            <Field key={k} label={k} before={(op.before as Record<string, unknown>)[k]} after={(op.after as Record<string, unknown>)[k]} />
          ))}
        </div>
      );
    case "feature_add":
      return (
        <div className="rounded bg-accent-soft px-2 py-1.5 text-xs">
          <div className="font-medium">{op.name} · {op.priority} priority</div>
          <div>{op.summary}</div>
          {(op.subFeatures as { name: string }[]).length > 0 && <div className="mt-1 text-muted">Sub-features: {(op.subFeatures as { name: string }[]).map((s) => s.name).join(" · ")}</div>}
        </div>
      );
    case "feature_remove":
      return (
        <div className="rounded bg-danger-soft px-2 py-1.5 text-xs">
          Removes <b>{op.code} {op.name}</b> with its {op.subCount} sub-features and {op.taskCount} tasks.
        </div>
      );
    case "subfeature_add":
      return <div className="rounded bg-accent-soft px-2 py-1.5 text-xs">{op.featureName} › <b>{op.name}</b>{op.summary ? `: ${op.summary}` : ""}</div>;
    case "subfeature_rename":
      return <Field label="name" before={op.from} after={op.to} />;
    case "subfeature_remove":
      return <div className="rounded bg-danger-soft px-2 py-1.5 text-xs">Removes sub-feature <b>{op.name}</b> from {op.code}. Its tasks stay, unlinked.</div>;
    case "task_add":
      return (
        <div className="rounded bg-accent-soft px-2 py-1.5 text-xs">
          <div className="font-medium">[{op.layer}] {op.title}</div>
          <div>{op.description}</div>
          {(op.acceptance as string[]).length > 0 && <ul className="mt-1 list-disc pl-4">{(op.acceptance as string[]).map((a, i) => <li key={i}>{a}</li>)}</ul>}
          {(op.dependsOn as { code: string }[]).length > 0 && <div className="mt-1 text-muted">After {(op.dependsOn as { code: string }[]).map((d) => d.code).join(", ")}</div>}
        </div>
      );
    case "task_remove":
      return (
        <div className="rounded bg-danger-soft px-2 py-1.5 text-xs">
          Removes <b>{op.code}</b> {op.title}.
          {(op.dependents as string[]).length > 0 && ` ${(op.dependents as string[]).join(", ")} will no longer wait for it.`}
        </div>
      );
    default:
      return <pre className="overflow-x-auto text-xs">{JSON.stringify(op, null, 2)}</pre>;
  }
}

function SectionDiff({ before, after }: { before: string; after: string }) {
  const parts = diffLines(before ?? "", after ?? "");
  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);
  return (
    <div className="overflow-hidden rounded border border-border">
      <div className="border-b border-border px-2 py-1 text-xs text-muted">
        <span className="text-accent">+{added}</span> <span className="text-danger">−{removed}</span> lines{!before && " (new section)"}
      </div>
      <pre className="max-h-72 overflow-auto font-mono text-[11.5px] leading-relaxed">
        {parts.flatMap((p, i) => {
          const lines = p.value.replace(/\n$/, "").split("\n");
          if (!p.added && !p.removed) {
            if (lines.length <= 4) return lines.map((l, j) => <div key={`${i}-${j}`} className="whitespace-pre-wrap px-2 text-muted">{"  "}{l || " "}</div>);
            return [
              ...(i === 0 ? [] : lines.slice(0, 2)).map((l, j) => <div key={`${i}-a${j}`} className="whitespace-pre-wrap px-2 text-muted">{"  "}{l || " "}</div>),
              <div key={`${i}-f`} className="bg-surface-2 px-2 text-[10px] text-muted">… {lines.length - (i === 0 ? 0 : 2) - (i === parts.length - 1 ? 0 : 2)} unchanged</div>,
              ...(i === parts.length - 1 ? [] : lines.slice(-2)).map((l, j) => <div key={`${i}-b${j}`} className="whitespace-pre-wrap px-2 text-muted">{"  "}{l || " "}</div>),
            ];
          }
          return lines.map((l, j) => (
            <div key={`${i}-${j}`} className={`whitespace-pre-wrap px-2 ${p.added ? "bg-accent-soft" : "bg-danger-soft"}`}>
              {p.added ? "+ " : "- "}
              {l || " "}
            </div>
          ));
        })}
      </pre>
    </div>
  );
}
