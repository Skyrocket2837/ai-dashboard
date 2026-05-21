import type { SessionRecord } from "@ai-dashboard/shared";

export interface SessionsResponse {
  sessions: SessionRecord[];
}

export interface SessionDetailResponse {
  session: SessionRecord;
  events: Array<{ id: number; session_id: string; type: string; payload: string; at: number }>;
}

export async function fetchSessions(): Promise<SessionsResponse> {
  const r = await fetch("/api/sessions");
  if (!r.ok) throw new Error(`sessions ${r.status}`);
  return r.json();
}

export async function fetchSession(id: string): Promise<SessionDetailResponse> {
  const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`session ${r.status}`);
  return r.json();
}

export async function postCommand(input: {
  session_id?: string;
  machine?: string;
  command: "approve" | "cancel" | "pause" | "resume";
}): Promise<void> {
  const r = await fetch("/api/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`command ${r.status}`);
}
