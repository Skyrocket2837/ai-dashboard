import type { SupervisorHeartbeat } from "@ai-dashboard/shared";

interface Props {
  heartbeat: SupervisorHeartbeat | null;
}

export function RamGauge({ heartbeat }: Props) {
  if (!heartbeat) {
    return (
      <div class="rounded border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-500">
        No supervisor connected
      </div>
    );
  }
  const used = heartbeat.ram_total_mb - heartbeat.ram_available_mb;
  const pct = heartbeat.ram_total_mb > 0 ? (used / heartbeat.ram_total_mb) * 100 : 0;
  const barColor = pct > 90 ? "bg-red-500" : pct > 75 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div class="rounded border border-slate-800 bg-slate-900 px-4 py-3">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span class="font-medium text-slate-200">{heartbeat.machine}</span>
        <span>
          {(heartbeat.ram_available_mb / 1024).toFixed(1)} GB free / {(heartbeat.ram_total_mb / 1024).toFixed(1)} GB
        </span>
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded bg-slate-800">
        <div class={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div class="mt-2 flex justify-between text-xs text-slate-500">
        <span>Active: {heartbeat.active_sessions}</span>
        <span>Queue: {heartbeat.queue_depth}</span>
        <span>CPU: {heartbeat.cpu_percent.toFixed(0)}%</span>
      </div>
    </div>
  );
}
