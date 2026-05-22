import type Database from "better-sqlite3";
import type { HookEvent, SupervisorHeartbeat } from "@ai-dashboard/shared";
import type { DbStatements, SessionRow } from "./db.js";
import { rowToSession } from "./db.js";
import { computeStateUpdate } from "./state-machine.js";
import type { SSEHub } from "./sse.js";

export interface IngestResult {
  ingested: number;
  updated_sessions: string[];
}

export function ingestEvents(
  db: Database.Database,
  stmts: DbStatements,
  events: HookEvent[],
  hub: SSEHub,
): IngestResult {
  const updated = new Set<string>();
  const tx = db.transaction((evs: HookEvent[]) => {
    for (const ev of evs) {
      const update = computeStateUpdate(ev);
      if (update.upsert) {
        stmts.upsertSession.run({
          id: ev.session_id,
          machine: ev.machine,
          project: ev.project ?? null,
          branch: ev.branch ?? null,
          state: update.state ?? "idle",
          at: ev.at,
        });
      } else {
        stmts.upsertSession.run({
          id: ev.session_id,
          machine: ev.machine,
          project: ev.project ?? null,
          branch: ev.branch ?? null,
          state: update.state ?? "idle",
          at: ev.at,
        });
      }
      if (update.state) {
        stmts.updateSessionState.run({
          id: ev.session_id,
          state: update.state,
          at: ev.at,
          queue_position: null,
        });
      }
      if (update.current_tool !== undefined) {
        stmts.setSessionTool.run({ id: ev.session_id, tool: update.current_tool, at: ev.at });
      }
      if (update.current_prompt !== undefined) {
        stmts.setSessionPrompt.run({
          id: ev.session_id,
          prompt: update.current_prompt,
          at: ev.at,
        });
      }
      if (update.subagent_delta && update.subagent_delta > 0) {
        stmts.incSubagents.run(ev.session_id);
      } else if (update.subagent_delta && update.subagent_delta < 0) {
        stmts.decSubagents.run(ev.session_id);
      }
      if (update.gate === "set" && ev.gate_reason) {
        stmts.setGateReason.run({
          id: ev.session_id,
          gate_reason: JSON.stringify(ev.gate_reason),
          queued_at: ev.at,
        });
      } else if (update.gate === "clear") {
        stmts.clearGateReason.run(ev.session_id);
      }
      stmts.insertEvent.run({
        session_id: ev.session_id,
        type: ev.type,
        payload: JSON.stringify({
          tool_name: ev.tool_name,
          tool_input: ev.tool_input,
          prompt: ev.prompt,
          notification_kind: ev.notification_kind,
          cwd: ev.cwd,
        }),
        at: ev.at,
      });
      updated.add(ev.session_id);
    }
  });
  tx(events);
  for (const id of updated) {
    const row = stmts.getSession.get(id) as SessionRow | undefined;
    if (row) hub.broadcast({ type: "session_updated", data: rowToSession(row) });
  }
  return { ingested: events.length, updated_sessions: [...updated] };
}

export function ingestHeartbeat(
  stmts: DbStatements,
  hb: SupervisorHeartbeat,
  hub: SSEHub,
): void {
  stmts.upsertHeartbeat.run({
    machine: hb.machine,
    ram_total_mb: hb.ram_total_mb,
    ram_available_mb: hb.ram_available_mb,
    cpu_percent: hb.cpu_percent,
    active_sessions: hb.active_sessions,
    queue_depth: hb.queue_depth,
    at: hb.at,
  });
  hub.broadcast({ type: "heartbeat", data: hb });
}
