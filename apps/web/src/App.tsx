import { useCallback, useMemo, useState } from "preact/hooks";
import type { SessionRecord } from "@ai-dashboard/shared";
import { useSessions } from "./hooks/useSessions.js";
import { SessionTable } from "./components/SessionTable.js";
import { MachineCard } from "./components/MachineCard.js";
import { QueuePanel } from "./components/QueuePanel.js";
import { EventDrawer } from "./components/EventDrawer.js";
import { postCommand } from "./lib/api.js";

export function App() {
  const { sessions, heartbeat, connected, error } = useSessions();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const active = sessions.filter((s) => s.state !== "done").length;
  const queued = sessions.filter((s) => s.state === "queued").length;

  const markBusy = useCallback((id: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleCommand = useCallback(
    async (s: SessionRecord, command: "approve" | "cancel") => {
      markBusy(s.id, true);
      try {
        await postCommand({ session_id: s.id, machine: s.machine, command });
      } catch (e) {
        console.error("command failed", e);
      } finally {
        markBusy(s.id, false);
      }
    },
    [markBusy],
  );

  const machines = useMemo(() => (heartbeat ? [heartbeat] : []), [heartbeat]);

  return (
    <div class="min-h-screen bg-slate-950">
      <div class="mx-auto max-w-[1480px] px-6 py-6">
        <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-slate-100">AI Dashboard</h1>
            <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>
                <span class="font-mono tabular-nums text-slate-200">{active}</span> active
              </span>
              <span class="text-slate-700">·</span>
              <span>
                <span class="font-mono tabular-nums text-slate-200">{queued}</span> queued
              </span>
              <span class="text-slate-700">·</span>
              <span>
                <span class="font-mono tabular-nums text-slate-200">{sessions.length}</span> total
              </span>
              <span class="text-slate-700">·</span>
              <span class="inline-flex items-center gap-1.5">
                <span
                  class={`h-1.5 w-1.5 rounded-full ${
                    connected ? "bg-emerald-400 animate-pulse" : "bg-red-500"
                  }`}
                />
                <span class={connected ? "text-emerald-300" : "text-red-300"}>
                  {connected ? "live" : "disconnected"}
                </span>
              </span>
            </p>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            class="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        <div class="grid gap-6 lg:grid-cols-3">
          <div class="lg:col-span-2">
            <SessionTable sessions={sessions} selectedId={selected} onRowClick={setSelected} />
          </div>
          <div class="space-y-4">
            <div class="space-y-3">
              {machines.length === 0 ? (
                <MachineCard heartbeat={null} />
              ) : (
                machines.map((m) => <MachineCard key={m.machine} heartbeat={m} />)
              )}
            </div>
            <QueuePanel
              sessions={sessions}
              busy={busy}
              onApprove={(s) => handleCommand(s, "approve")}
              onCancel={(s) => handleCommand(s, "cancel")}
            />
          </div>
        </div>
      </div>

      {selected && <EventDrawer sessionId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
