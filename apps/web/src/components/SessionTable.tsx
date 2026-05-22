import type { SessionRecord } from "@ai-dashboard/shared";
import { formatRelative } from "../lib/merge.js";
import { StateBadge } from "./StateBadge.js";

interface Props {
  sessions: SessionRecord[];
  selectedId: string | null;
  onRowClick: (id: string) => void;
}

export function SessionTable({ sessions, selectedId, onRowClick }: Props) {
  if (sessions.length === 0) {
    return (
      <div class="rounded-xl border border-dashed border-slate-800 bg-surface-1 p-12 text-center">
        <p class="text-sm text-slate-300">No active sessions yet.</p>
        <p class="mt-1 text-xs text-slate-500">
          Start Claude Code on a machine running the supervisor.
        </p>
      </div>
    );
  }
  return (
    <div class="overflow-hidden rounded-xl border border-slate-800 bg-surface-1">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2/60 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-4 py-2.5 font-medium">State</th>
              <th class="px-4 py-2.5 font-medium">Session</th>
              <th class="px-4 py-2.5 font-medium">Project / Branch</th>
              <th class="px-4 py-2.5 font-medium">Tool</th>
              <th class="px-4 py-2.5 text-center font-medium">Sub</th>
              <th class="px-4 py-2.5 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/80">
            {sessions.map((s) => {
              const isSelected = selectedId === s.id;
              return (
                <tr
                  key={s.id}
                  class={`cursor-pointer transition-colors ${
                    isSelected ? "bg-surface-3/60" : "hover:bg-surface-2/60"
                  }`}
                  onClick={() => onRowClick(s.id)}
                >
                  <td class="px-4 py-3">
                    <StateBadge state={s.state} />
                  </td>
                  <td class="px-4 py-3">
                    <div class="font-mono text-xs text-slate-200">{s.id.slice(0, 8)}</div>
                    <div class="text-[10px] text-slate-500">{s.machine}</div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="text-sm text-slate-200">{s.project ?? "—"}</div>
                    <div class="font-mono text-[10px] text-slate-500">{s.branch ?? ""}</div>
                  </td>
                  <td class="px-4 py-3 font-mono text-xs text-slate-300">{s.current_tool ?? "—"}</td>
                  <td class="px-4 py-3 text-center font-mono text-xs tabular-nums text-slate-400">
                    {s.active_subagents}
                  </td>
                  <td class="px-4 py-3 text-xs tabular-nums text-slate-400">
                    {formatRelative(s.last_activity_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
