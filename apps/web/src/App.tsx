import { useState } from "preact/hooks";
import { useSessions } from "./hooks/useSessions.js";
import { SessionTable } from "./components/SessionTable.js";
import { RamGauge } from "./components/RamGauge.js";
import { EventDrawer } from "./components/EventDrawer.js";

export function App() {
  const { sessions, heartbeat, connected, error } = useSessions();
  const [selected, setSelected] = useState<string | null>(null);

  const active = sessions.filter((s) => s.state !== "done").length;

  return (
    <div class="min-h-screen p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold">AI Dashboard</h1>
          <p class="text-sm text-slate-500">
            {active} active · {sessions.length} total ·{" "}
            <span class={connected ? "text-emerald-400" : "text-red-400"}>
              {connected ? "● live" : "● disconnected"}
            </span>
          </p>
        </div>
        <div class="w-80">
          <RamGauge heartbeat={heartbeat} />
        </div>
      </header>

      {error && (
        <div class="mb-4 rounded border border-red-800 bg-red-950 p-3 text-sm text-red-300">{error}</div>
      )}

      <SessionTable sessions={sessions} onRowClick={setSelected} />

      {selected && <EventDrawer sessionId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
