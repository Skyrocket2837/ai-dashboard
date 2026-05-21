import type { SessionRecord } from "@ai-dashboard/shared";
import { formatRelative, stateColor } from "../lib/merge.js";

interface Props {
  sessions: SessionRecord[];
  onRowClick: (id: string) => void;
}

export function SessionTable({ sessions, onRowClick }: Props) {
  if (sessions.length === 0) {
    return (
      <div class="rounded border border-slate-800 bg-slate-900 p-12 text-center text-slate-500">
        No active sessions. Start Claude Code on a machine running the supervisor.
      </div>
    );
  }
  return (
    <div class="overflow-x-auto rounded border border-slate-800">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-900 text-slate-400">
          <tr>
            <th class="px-3 py-2">State</th>
            <th class="px-3 py-2">Session</th>
            <th class="px-3 py-2">Project / Branch</th>
            <th class="px-3 py-2">Tool</th>
            <th class="px-3 py-2">Subagents</th>
            <th class="px-3 py-2">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              class="cursor-pointer border-t border-slate-800 hover:bg-slate-900"
              onClick={() => onRowClick(s.id)}
            >
              <td class="px-3 py-2">
                <span class={`inline-block rounded px-2 py-0.5 text-xs font-medium ${stateColor(s.state)}`}>
                  {s.state}
                </span>
              </td>
              <td class="px-3 py-2 font-mono text-xs text-slate-300">
                {s.id.slice(0, 8)}
                <div class="text-[10px] text-slate-500">{s.machine}</div>
              </td>
              <td class="px-3 py-2">
                <div>{s.project ?? "—"}</div>
                <div class="text-xs text-slate-500">{s.branch ?? ""}</div>
              </td>
              <td class="px-3 py-2 font-mono text-xs">{s.current_tool ?? "—"}</td>
              <td class="px-3 py-2 text-center">{s.active_subagents}</td>
              <td class="px-3 py-2 text-slate-400">{formatRelative(s.last_activity_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
