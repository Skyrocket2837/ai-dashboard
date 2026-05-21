import { describe, it, expect, beforeEach } from "vitest";
import { openDb, prepareStatements } from "../src/db.js";
import { ingestEvents, ingestHeartbeat } from "../src/ingest.js";
import { SSEHub } from "../src/sse.js";
import type { HookEvent, SupervisorHeartbeat } from "@ai-dashboard/shared";

function ev(over: Partial<HookEvent>): HookEvent {
  return {
    session_id: "s1",
    machine: "m1",
    type: "SessionStart",
    at: 1_700_000_000_000,
    ...over,
  } as HookEvent;
}

describe("ingestEvents", () => {
  let db: ReturnType<typeof openDb>;
  let stmts: ReturnType<typeof prepareStatements>;
  const hub = new SSEHub();

  beforeEach(() => {
    db = openDb(":memory:");
    stmts = prepareStatements(db);
  });

  it("creates session on SessionStart", () => {
    const r = ingestEvents(db, stmts, [ev({ type: "SessionStart", project: "p1", branch: "main" })], hub);
    expect(r.ingested).toBe(1);
    const row = stmts.getSession.get("s1") as Record<string, unknown>;
    expect(row.state).toBe("idle");
    expect(row.project).toBe("p1");
    expect(row.branch).toBe("main");
  });

  it("UserPromptSubmit moves to working + saves prompt", () => {
    ingestEvents(db, stmts, [ev({ type: "SessionStart" })], hub);
    ingestEvents(db, stmts, [ev({ type: "UserPromptSubmit", prompt: "do thing", at: 2 })], hub);
    const row = stmts.getSession.get("s1") as Record<string, unknown>;
    expect(row.state).toBe("working");
    expect(row.current_prompt).toBe("do thing");
  });

  it("PreToolUse Agent increments active_subagents", () => {
    ingestEvents(db, stmts, [ev({ type: "SessionStart" })], hub);
    ingestEvents(db, stmts, [ev({ type: "PreToolUse", tool_name: "Agent", at: 2 })], hub);
    ingestEvents(db, stmts, [ev({ type: "PreToolUse", tool_name: "Agent", at: 3 })], hub);
    const row = stmts.getSession.get("s1") as Record<string, unknown>;
    expect(row.active_subagents).toBe(2);
  });

  it("SubagentStop decrements", () => {
    ingestEvents(db, stmts, [ev({ type: "SessionStart" })], hub);
    ingestEvents(db, stmts, [ev({ type: "PreToolUse", tool_name: "Agent", at: 2 })], hub);
    ingestEvents(db, stmts, [ev({ type: "SubagentStop", at: 3 })], hub);
    const row = stmts.getSession.get("s1") as Record<string, unknown>;
    expect(row.active_subagents).toBe(0);
  });

  it("SubagentStop floors at 0", () => {
    ingestEvents(db, stmts, [ev({ type: "SessionStart" })], hub);
    ingestEvents(db, stmts, [ev({ type: "SubagentStop", at: 2 })], hub);
    const row = stmts.getSession.get("s1") as Record<string, unknown>;
    expect(row.active_subagents).toBe(0);
  });

  it("Stop sets done", () => {
    ingestEvents(db, stmts, [ev({ type: "SessionStart" })], hub);
    ingestEvents(db, stmts, [ev({ type: "Stop", at: 2 })], hub);
    const row = stmts.getSession.get("s1") as Record<string, unknown>;
    expect(row.state).toBe("done");
    expect(row.current_tool).toBeNull();
  });

  it("Notification permission → waiting-permission", () => {
    ingestEvents(db, stmts, [ev({ type: "SessionStart" })], hub);
    ingestEvents(db, stmts, [
      ev({ type: "Notification", notification_kind: "permission", at: 2 }),
    ], hub);
    const row = stmts.getSession.get("s1") as Record<string, unknown>;
    expect(row.state).toBe("waiting-permission");
  });

  it("stores events row for each ingested event", () => {
    ingestEvents(db, stmts, [
      ev({ type: "SessionStart" }),
      ev({ type: "UserPromptSubmit", prompt: "x", at: 2 }),
    ], hub);
    const rows = stmts.recentEventsForSession.all("s1", 10) as Array<{ type: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.type).sort()).toEqual(["SessionStart", "UserPromptSubmit"]);
  });

  it("multiple events in one batch ingest atomically", () => {
    const r = ingestEvents(db, stmts, [
      ev({ session_id: "a", type: "SessionStart", at: 1 }),
      ev({ session_id: "b", type: "SessionStart", at: 1 }),
      ev({ session_id: "a", type: "UserPromptSubmit", at: 2 }),
    ], hub);
    expect(r.ingested).toBe(3);
    expect(r.updated_sessions.sort()).toEqual(["a", "b"]);
  });

  it("PreToolUse Bash heavy command tags current_tool with *", () => {
    ingestEvents(db, stmts, [ev({ type: "SessionStart" })], hub);
    ingestEvents(db, stmts, [
      ev({ type: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" }, at: 2 }),
    ], hub);
    const row = stmts.getSession.get("s1") as Record<string, unknown>;
    expect(row.current_tool).toBe("Bash*");
  });

  it("listSessions returns rows ordered by last_activity_at desc", () => {
    ingestEvents(db, stmts, [ev({ session_id: "old", type: "SessionStart", at: 1 })], hub);
    ingestEvents(db, stmts, [ev({ session_id: "new", type: "SessionStart", at: 5 })], hub);
    const rows = stmts.listSessions.all() as Array<{ id: string }>;
    expect(rows[0]?.id).toBe("new");
    expect(rows[1]?.id).toBe("old");
  });
});

describe("ingestHeartbeat", () => {
  it("upserts machine heartbeat", () => {
    const db = openDb(":memory:");
    const stmts = prepareStatements(db);
    const hub = new SSEHub();
    const hb: SupervisorHeartbeat = {
      machine: "win1",
      ram_total_mb: 32000,
      ram_available_mb: 12000,
      cpu_percent: 45,
      active_sessions: 3,
      queue_depth: 1,
      at: Date.now(),
    };
    ingestHeartbeat(stmts, hb, hub);
    const row = stmts.getHeartbeat.get("win1") as Record<string, unknown>;
    expect(row.ram_total_mb).toBe(32000);
    expect(row.ram_available_mb).toBe(12000);
    expect(row.active_sessions).toBe(3);
  });

  it("overwrites on second call", () => {
    const db = openDb(":memory:");
    const stmts = prepareStatements(db);
    const hub = new SSEHub();
    const base: SupervisorHeartbeat = {
      machine: "win1",
      ram_total_mb: 32000,
      ram_available_mb: 10000,
      cpu_percent: 30,
      active_sessions: 1,
      queue_depth: 0,
      at: 1,
    };
    ingestHeartbeat(stmts, base, hub);
    ingestHeartbeat(stmts, { ...base, ram_available_mb: 8000, at: 2 }, hub);
    const row = stmts.getHeartbeat.get("win1") as Record<string, unknown>;
    expect(row.ram_available_mb).toBe(8000);
  });
});
