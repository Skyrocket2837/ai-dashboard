export type SessionState =
  | "idle"
  | "working"
  | "waiting-permission"
  | "waiting-input"
  | "queued"
  | "done"
  | "error";

export type HookEventType =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "Stop"
  | "SubagentStop"
  | "PreCompact";

export type GateReasonKind =
  | "ram-critical"
  | "ram-low"
  | "permission"
  | "heavy-bash"
  | "manual";

export interface GateReason {
  kind: GateReasonKind;
  message: string;
  available_mb?: number;
  threshold_mb?: number;
}

export interface HookEvent {
  session_id: string;
  machine: string;
  type: HookEventType;
  tool_name?: string;
  tool_input?: unknown;
  prompt?: string;
  notification_kind?: "permission" | "idle" | "other";
  project?: string;
  branch?: string;
  cwd?: string;
  gate_reason?: GateReason;
  at: number;
}

export interface SessionRecord {
  id: string;
  machine: string;
  project: string | null;
  branch: string | null;
  state: SessionState;
  current_tool: string | null;
  current_prompt: string | null;
  active_subagents: number;
  ram_mb: number | null;
  queue_position: number | null;
  gate_reason: GateReason | null;
  queued_at: number | null;
  last_activity_at: number;
  created_at: number;
}

export interface SupervisorHeartbeat {
  machine: string;
  ram_total_mb: number;
  ram_available_mb: number;
  cpu_percent: number;
  active_sessions: number;
  queue_depth: number;
  at: number;
}

export interface CommandRecord {
  id: number;
  session_id: string | null;
  machine?: string;
  command: "approve" | "cancel" | "pause" | "resume";
  payload?: unknown;
  created_at: number;
  consumed_at: number | null;
}

export interface EventsBatch {
  machine: string;
  events: HookEvent[];
  heartbeat?: SupervisorHeartbeat;
}

export interface PostEventsResponse {
  ok: true;
  ingested: number;
  commands: CommandRecord[];
}

export interface SSEMessage {
  type: "session_updated" | "event_added" | "heartbeat" | "queue_changed";
  data: unknown;
}

export const HMAC_HEADER = "x-ai-dashboard-sig";
export const TIMESTAMP_HEADER = "x-ai-dashboard-ts";
export const MACHINE_HEADER = "x-ai-dashboard-machine";
