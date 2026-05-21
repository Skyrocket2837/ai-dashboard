import { describe, it, expect } from "vitest";
import { decideHook, toHookEvent } from "../src/hook-handler.mjs";

const PATTERNS = [/\bnpm\s+test\b/i, /\btsc\b/i];
const baseCtx = {
  availableMb: 10_000,
  threshold: 4096,
  hardLimit: 2048,
  heavyBashPatterns: PATTERNS,
};

describe("decideHook", () => {
  it("non-PreToolUse → no-op", () => {
    expect(decideHook({ hook_event_name: "SessionStart" }, baseCtx)).toEqual({});
  });

  it("PreToolUse Read → allow (no override)", () => {
    expect(decideHook({ hook_event_name: "PreToolUse", tool_name: "Read" }, baseCtx)).toEqual({});
  });

  it("PreToolUse Agent + ample RAM → allow", () => {
    const r = decideHook({ hook_event_name: "PreToolUse", tool_name: "Agent" }, baseCtx);
    expect(r.hookSpecificOutput).toBeUndefined();
  });

  it("PreToolUse Agent + RAM below soft threshold → ask", () => {
    const r = decideHook({ hook_event_name: "PreToolUse", tool_name: "Agent" }, { ...baseCtx, availableMb: 3000 });
    expect(r.hookSpecificOutput?.permissionDecision).toBe("ask");
    expect(r.hookSpecificOutput?.permissionDecisionReason).toContain("RAM");
  });

  it("PreToolUse Task counted as agent → ask when low RAM", () => {
    const r = decideHook({ hook_event_name: "PreToolUse", tool_name: "Task" }, { ...baseCtx, availableMb: 3000 });
    expect(r.hookSpecificOutput?.permissionDecision).toBe("ask");
  });

  it("PreToolUse Agent + RAM below hard limit → deny", () => {
    const r = decideHook({ hook_event_name: "PreToolUse", tool_name: "Agent" }, { ...baseCtx, availableMb: 1000 });
    expect(r.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("PreToolUse Bash heavy + low RAM → ask", () => {
    const r = decideHook(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } },
      { ...baseCtx, availableMb: 3000 },
    );
    expect(r.hookSpecificOutput?.permissionDecision).toBe("ask");
  });

  it("PreToolUse Bash heavy + critical RAM → deny", () => {
    const r = decideHook(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "tsc" } },
      { ...baseCtx, availableMb: 500 },
    );
    expect(r.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("PreToolUse Bash light + low RAM → allow", () => {
    const r = decideHook(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } },
      { ...baseCtx, availableMb: 1000 },
    );
    expect(r.hookSpecificOutput).toBeUndefined();
  });

  it("PreToolUse Bash with missing command → not heavy", () => {
    const r = decideHook(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} },
      { ...baseCtx, availableMb: 500 },
    );
    expect(r.hookSpecificOutput).toBeUndefined();
  });

  it("at exactly threshold → allow (boundary)", () => {
    const r = decideHook(
      { hook_event_name: "PreToolUse", tool_name: "Agent" },
      { ...baseCtx, availableMb: 4096 },
    );
    expect(r.hookSpecificOutput).toBeUndefined();
  });

  it("at exactly hard limit → ask (between hard and soft)", () => {
    const r = decideHook(
      { hook_event_name: "PreToolUse", tool_name: "Agent" },
      { ...baseCtx, availableMb: 2048 },
    );
    expect(r.hookSpecificOutput?.permissionDecision).toBe("ask");
  });
});

describe("toHookEvent", () => {
  it("normalizes basic fields", () => {
    const e = toHookEvent(
      { session_id: "s1", hook_event_name: "SessionStart", cwd: "C:/Users/me/proj" },
      "win1",
    );
    expect(e.session_id).toBe("s1");
    expect(e.machine).toBe("win1");
    expect(e.type).toBe("SessionStart");
    expect(e.project).toBe("proj");
  });

  it("defaults session_id when missing", () => {
    const e = toHookEvent({ hook_event_name: "Stop" }, "m");
    expect(e.session_id).toBe("unknown");
  });

  it("derives Notification.permission from message", () => {
    const e = toHookEvent({ hook_event_name: "Notification", message: "Awaiting permission to run X" }, "m");
    expect(e.notification_kind).toBe("permission");
  });

  it("derives Notification.idle from message", () => {
    const e = toHookEvent({ hook_event_name: "Notification", message: "user is idle waiting" }, "m");
    expect(e.notification_kind).toBe("idle");
  });

  it("Notification.other when neither matches", () => {
    const e = toHookEvent({ hook_event_name: "Notification", message: "hi" }, "m");
    expect(e.notification_kind).toBe("other");
  });

  it("passes through tool_input", () => {
    const e = toHookEvent(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } },
      "m",
    );
    expect(e.tool_name).toBe("Bash");
    expect(e.tool_input).toEqual({ command: "ls" });
  });
});
