import type { SessionRecord, GateReasonKind } from "@ai-dashboard/shared";
import { formatRelative } from "../lib/merge.js";

interface Props {
  sessions: SessionRecord[];
  onApprove: (session: SessionRecord) => void;
  onCancel: (session: SessionRecord) => void;
  busy: Set<string>;
}

const REASON_LABEL: Record<GateReasonKind, string> = {
  "ram-critical": "RAM critical",
  "ram-low": "RAM low",
  permission: "Permission",
  "heavy-bash": "Heavy bash",
  manual: "Manual",
};

const REASON_TONE: Record<GateReasonKind, string> = {
  "ram-critical": "bg-red-500/15 text-red-300 ring-red-500/30",
  "ram-low": "bg-yellow-500/15 text-yellow-300 ring-yellow-500/30",
  permission: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  "heavy-bash": "bg-purple-500/15 text-purple-300 ring-purple-500/30",
  manual: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

export function QueuePanel({ sessions, onApprove, onCancel, busy }: Props) {
  const queued = sessions
    .filter((s) => s.state === "queued")
    .sort((a, b) => (a.queued_at ?? a.last_activity_at) - (b.queued_at ?? b.last_activity_at));

  return (
    <section class="rounded-xl border border-slate-800 bg-surface-1">
      <header class="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold text-slate-100">Queue</h2>
          <span class="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-purple-300 ring-1 ring-inset ring-purple-500/30">
            {queued.length}
          </span>
        </div>
        <p class="text-[11px] text-slate-500">approve or cancel to resume</p>
      </header>

      {queued.length === 0 ? (
        <div class="px-4 py-8 text-center text-xs text-slate-500">No queued sessions.</div>
      ) : (
        <ul class="divide-y divide-slate-800">
          {queued.map((s, idx) => {
            const reason = s.gate_reason;
            const kind: GateReasonKind = reason?.kind ?? "manual";
            const busyThis = busy.has(s.id);
            return (
              <li key={s.id} class="px-4 py-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-[10px] text-slate-500 tabular-nums">
                        #{idx + 1}
                      </span>
                      <span
                        class={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${REASON_TONE[kind]}`}
                      >
                        {REASON_LABEL[kind]}
                      </span>
                      <span class="font-mono text-[11px] text-slate-300">{s.id.slice(0, 8)}</span>
                    </div>
                    <p class="mt-1 truncate text-[11px] text-slate-400" title={reason?.message ?? ""}>
                      {reason?.message ?? "Awaiting input"}
                    </p>
                    <p class="mt-0.5 text-[10px] text-slate-500">
                      {s.project ?? "—"}
                      {s.branch ? ` · ${s.branch}` : ""}
                      {" · queued "}
                      {formatRelative(s.queued_at ?? s.last_activity_at)}
                    </p>
                  </div>
                  <div class="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={busyThis}
                      onClick={() => onApprove(s)}
                      class="rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 transition hover:bg-emerald-500/25 disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyThis}
                      onClick={() => onCancel(s)}
                      class="rounded-md bg-slate-700/40 px-2 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-slate-600/40 transition hover:bg-slate-700/60 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
