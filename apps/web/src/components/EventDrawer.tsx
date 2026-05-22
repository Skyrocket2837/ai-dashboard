import { useEffect, useState } from "preact/hooks";
import { fetchSession, postCommand, type SessionDetailResponse } from "../lib/api.js";
import { formatRelative } from "../lib/merge.js";
import { StateBadge } from "./StateBadge.js";

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function EventDrawer({ sessionId, onClose }: Props) {
  const [data, setData] = useState<SessionDetailResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSession(sessionId).then((d) => {
      if (alive) setData(d);
    });
    const t = setInterval(() => {
      fetchSession(sessionId).then((d) => {
        if (alive) setData(d);
      });
    }, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sessionId]);

  const send = async (cmd: "approve" | "cancel" | "pause" | "resume") => {
    setBusy(true);
    try {
      await postCommand({ session_id: sessionId, command: cmd });
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <Shell onClose={onClose}>
        <div class="p-6 text-sm text-slate-500">Loading…</div>
      </Shell>
    );
  }
  const s = data.session;
  return (
    <Shell onClose={onClose}>
      <div class="sticky top-0 z-10 border-b border-slate-800 bg-surface-0/95 backdrop-blur px-5 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-mono text-sm text-slate-100">{s.id}</div>
            <div class="mt-0.5 text-xs text-slate-500">
              {s.machine} · {s.project ?? "—"}
              {s.branch ? ` · ${s.branch}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            class="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <StateBadge state={s.state} />
          <span class="text-xs tabular-nums text-slate-500">{formatRelative(s.last_activity_at)}</span>
        </div>
        {s.gate_reason && (
          <div class="mt-3 rounded-lg border border-purple-500/20 bg-purple-500/10 p-3 text-xs text-purple-200">
            <div class="font-medium uppercase tracking-wide text-purple-300">
              Gated · {s.gate_reason.kind}
            </div>
            <div class="mt-1 text-purple-100/90">{s.gate_reason.message}</div>
          </div>
        )}
        {s.current_prompt && (
          <div class="mt-3 rounded-lg border border-slate-800 bg-surface-2/60 p-3 text-sm text-slate-200">
            <div class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Current prompt</div>
            {s.current_prompt}
          </div>
        )}
        <div class="mt-4 flex gap-2">
          <ActionButton tone="emerald" onClick={() => send("approve")} disabled={busy}>
            Approve
          </ActionButton>
          <ActionButton tone="yellow" onClick={() => send("pause")} disabled={busy}>
            Pause
          </ActionButton>
          <ActionButton tone="red" onClick={() => send("cancel")} disabled={busy}>
            Cancel
          </ActionButton>
        </div>
      </div>

      <div class="px-5 py-4">
        <div class="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Recent events</div>
        <ul class="space-y-1.5">
          {data.events.map((e) => (
            <li key={e.id} class="rounded-lg border border-slate-800 bg-surface-1 p-2.5">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs text-slate-200">{e.type}</span>
                <span class="text-[11px] tabular-nums text-slate-500">{formatRelative(e.at)}</span>
              </div>
              {e.payload && (
                <pre class="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-400">
                  {e.payload}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: preact.ComponentChildren; onClose: () => void }) {
  return (
    <>
      <div class="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        class="fixed inset-y-0 right-0 z-40 w-full max-w-xl overflow-y-auto border-l border-slate-800 bg-surface-0"
      >
        {children}
      </aside>
    </>
  );
}

function ActionButton({
  tone,
  onClick,
  disabled,
  children,
}: {
  tone: "emerald" | "yellow" | "red";
  onClick: () => void;
  disabled?: boolean;
  children: preact.ComponentChildren;
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/25"
      : tone === "yellow"
        ? "bg-yellow-500/15 text-yellow-300 ring-yellow-500/30 hover:bg-yellow-500/25"
        : "bg-red-500/15 text-red-300 ring-red-500/30 hover:bg-red-500/25";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      class={`rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}
