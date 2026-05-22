import type { SessionState } from "@ai-dashboard/shared";

interface Props {
  state: SessionState;
  size?: "sm" | "md";
}

const LABEL: Record<SessionState, string> = {
  idle: "idle",
  working: "working",
  "waiting-permission": "permission",
  "waiting-input": "input",
  queued: "queued",
  done: "done",
  error: "error",
};

const DOT: Record<SessionState, string> = {
  idle: "bg-state-idle",
  working: "bg-state-working",
  "waiting-permission": "bg-state-waiting",
  "waiting-input": "bg-state-waiting",
  queued: "bg-state-queued",
  done: "bg-state-done",
  error: "bg-state-error",
};

const RING: Record<SessionState, string> = {
  idle: "ring-blue-500/30 bg-blue-500/10 text-blue-300",
  working: "ring-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "waiting-permission": "ring-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  "waiting-input": "ring-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  queued: "ring-purple-500/30 bg-purple-500/10 text-purple-300",
  done: "ring-slate-500/30 bg-slate-500/10 text-slate-300",
  error: "ring-red-500/40 bg-red-500/10 text-red-300",
};

export function StateBadge({ state, size = "md" }: Props) {
  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  const dot = state === "working" ? `${DOT[state]} animate-pulse` : DOT[state];
  return (
    <span
      class={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${RING[state]} ${padding}`}
    >
      <span class={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {LABEL[state]}
    </span>
  );
}
