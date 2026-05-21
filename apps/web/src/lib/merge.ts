import type { SessionRecord } from "@ai-dashboard/shared";

export function mergeSession(list: SessionRecord[], incoming: SessionRecord): SessionRecord[] {
  const idx = list.findIndex((s) => s.id === incoming.id);
  if (idx === -1) return sortByActivity([...list, incoming]);
  const merged = [...list];
  merged[idx] = incoming;
  return sortByActivity(merged);
}

export function sortByActivity(list: SessionRecord[]): SessionRecord[] {
  return [...list].sort((a, b) => b.last_activity_at - a.last_activity_at);
}

export function staleFilter(list: SessionRecord[], olderThanMs: number, now: number): SessionRecord[] {
  return list.filter((s) => s.state !== "done" || now - s.last_activity_at < olderThanMs);
}

export function formatRelative(at: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - at);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function stateColor(state: string): string {
  switch (state) {
    case "working":
      return "bg-state-working text-slate-900";
    case "waiting-permission":
    case "waiting-input":
      return "bg-state-waiting text-slate-900";
    case "idle":
      return "bg-state-idle text-white";
    case "queued":
      return "bg-state-queued text-white";
    case "done":
      return "bg-state-done text-white";
    case "error":
      return "bg-state-error text-white";
    default:
      return "bg-slate-700 text-white";
  }
}
