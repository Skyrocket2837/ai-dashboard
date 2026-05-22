import type { SupervisorHeartbeat } from "@ai-dashboard/shared";

interface Props {
  heartbeat: SupervisorHeartbeat | null;
}

export function MachineCard({ heartbeat }: Props) {
  if (!heartbeat) {
    return (
      <div class="rounded-xl border border-slate-800 bg-surface-1 px-4 py-5 text-sm text-slate-500">
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-slate-600" />
          No supervisor connected
        </div>
      </div>
    );
  }
  const usedMb = heartbeat.ram_total_mb - heartbeat.ram_available_mb;
  const pct = heartbeat.ram_total_mb > 0 ? (usedMb / heartbeat.ram_total_mb) * 100 : 0;
  const tone =
    pct > 90 ? "ram-critical" : pct > 75 ? "ram-warn" : "ram-ok";
  const barClass =
    tone === "ram-critical"
      ? "bg-red-500"
      : tone === "ram-warn"
        ? "bg-yellow-500"
        : "bg-emerald-500";
  const ringClass =
    tone === "ram-critical"
      ? "ring-red-500/30"
      : tone === "ram-warn"
        ? "ring-yellow-500/30"
        : "ring-emerald-500/20";

  return (
    <div
      class={`rounded-xl border border-slate-800 bg-surface-1 px-4 py-4 ring-1 ring-inset ${ringClass}`}
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class={`h-2 w-2 rounded-full ${barClass} animate-pulse`} />
          <span class="text-sm font-semibold text-slate-100">{heartbeat.machine}</span>
        </div>
        <span class="font-mono text-[11px] tabular-nums text-slate-500">
          {(heartbeat.ram_available_mb / 1024).toFixed(1)} / {(heartbeat.ram_total_mb / 1024).toFixed(1)} GB
        </span>
      </div>

      <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800/70">
        <div
          class={`h-full ${barClass} transition-[width] duration-500`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      <div class="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Active" value={heartbeat.active_sessions} accent="text-emerald-300" />
        <Stat label="Queue" value={heartbeat.queue_depth} accent="text-purple-300" />
        <Stat label="CPU" value={`${heartbeat.cpu_percent.toFixed(0)}%`} accent="text-slate-200" />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div class="rounded-lg bg-surface-2/60 px-2 py-2">
      <div class={`font-mono text-base font-semibold tabular-nums ${accent}`}>{value}</div>
      <div class="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
