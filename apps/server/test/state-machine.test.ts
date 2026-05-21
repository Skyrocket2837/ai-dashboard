import { describe, expect, it } from "vitest";
import { computeStateUpdate, isHeavyBashCommand } from "../src/state-machine.js";
import type { HookEvent } from "@ai-dashboard/shared";

function event(over: Partial<HookEvent>): HookEvent {
  return {
    session_id: "s1",
    machine: "dev1",
    type: "SessionStart",
    at: 1_700_000_000_000,
    ...over,
  } as HookEvent;
}

describe("isHeavyBashCommand", () => {
  it("flags npm test", () => {
    expect(isHeavyBashCommand("npm test")).toBe(true);
  });
  it("flags pnpm build", () => {
    expect(isHeavyBashCommand("pnpm build")).toBe(true);
  });
  it("flags tsc", () => {
    expect(isHeavyBashCommand("tsc --noEmit")).toBe(true);
  });
  it("flags vitest run", () => {
    expect(isHeavyBashCommand("vitest run")).toBe(true);
  });
  it("flags prisma generate", () => {
    expect(isHeavyBashCommand("prisma generate")).toBe(true);
  });
  it("does not flag ls", () => {
    expect(isHeavyBashCommand("ls -la")).toBe(false);
  });
  it("does not flag git status", () => {
    expect(isHeavyBashCommand("git status")).toBe(false);
  });
  it("handles undefined", () => {
    expect(isHeavyBashCommand(undefined)).toBe(false);
  });
  it("handles empty", () => {
    expect(isHeavyBashCommand("")).toBe(false);
  });
});

describe("computeStateUpdate", () => {
  it("SessionStart → upsert + idle", () => {
    const u = computeStateUpdate(event({ type: "SessionStart" }));
    expect(u.upsert).toBe(true);
    expect(u.state).toBe("idle");
  });

  it("UserPromptSubmit → working + saves prompt", () => {
    const u = computeStateUpdate(event({ type: "UserPromptSubmit", prompt: "fix bug" }));
    expect(u.state).toBe("working");
    expect(u.current_prompt).toBe("fix bug");
  });

  it("UserPromptSubmit without prompt body → null prompt", () => {
    const u = computeStateUpdate(event({ type: "UserPromptSubmit" }));
    expect(u.current_prompt).toBeNull();
  });

  it("PreToolUse Agent → working + subagent_delta=1", () => {
    const u = computeStateUpdate(event({ type: "PreToolUse", tool_name: "Agent" }));
    expect(u.state).toBe("working");
    expect(u.subagent_delta).toBe(1);
    expect(u.current_tool).toContain("Agent");
  });

  it("PreToolUse Task → also counts as subagent", () => {
    const u = computeStateUpdate(event({ type: "PreToolUse", tool_name: "Task" }));
    expect(u.subagent_delta).toBe(1);
  });

  it("PreToolUse Read → no subagent delta", () => {
    const u = computeStateUpdate(event({ type: "PreToolUse", tool_name: "Read" }));
    expect(u.subagent_delta).toBe(0);
    expect(u.current_tool).toBe("Read");
  });

  it("PreToolUse Bash with heavy command → tagged with *", () => {
    const u = computeStateUpdate(
      event({ type: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } }),
    );
    expect(u.current_tool).toBe("Bash*");
  });

  it("PreToolUse Bash with light command → no tag", () => {
    const u = computeStateUpdate(
      event({ type: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } }),
    );
    expect(u.current_tool).toBe("Bash");
  });

  it("PostToolUse → clears current_tool", () => {
    const u = computeStateUpdate(event({ type: "PostToolUse", tool_name: "Read" }));
    expect(u.current_tool).toBeNull();
  });

  it("Notification with kind=permission → waiting-permission", () => {
    const u = computeStateUpdate(
      event({ type: "Notification", notification_kind: "permission" }),
    );
    expect(u.state).toBe("waiting-permission");
  });

  it("Notification with kind=idle → waiting-input", () => {
    const u = computeStateUpdate(event({ type: "Notification", notification_kind: "idle" }));
    expect(u.state).toBe("waiting-input");
  });

  it("Notification with other kind → no state change", () => {
    const u = computeStateUpdate(event({ type: "Notification", notification_kind: "other" }));
    expect(u.state).toBeUndefined();
  });

  it("Notification infers permission from tool_input text", () => {
    const u = computeStateUpdate(
      event({ type: "Notification", tool_input: { message: "approve request" } }),
    );
    expect(u.state).toBe("waiting-permission");
  });

  it("Notification infers idle from tool_input", () => {
    const u = computeStateUpdate(
      event({ type: "Notification", tool_input: { message: "user idle waiting" } }),
    );
    expect(u.state).toBe("waiting-input");
  });

  it("SubagentStop → subagent_delta=-1", () => {
    const u = computeStateUpdate(event({ type: "SubagentStop" }));
    expect(u.subagent_delta).toBe(-1);
  });

  it("Stop → done + clears tool", () => {
    const u = computeStateUpdate(event({ type: "Stop" }));
    expect(u.state).toBe("done");
    expect(u.current_tool).toBeNull();
  });

  it("PreCompact → no change", () => {
    const u = computeStateUpdate(event({ type: "PreCompact" }));
    expect(u).toEqual({});
  });

  it("Unknown event → empty", () => {
    const u = computeStateUpdate(event({ type: "Notification" }));
    expect(u).toBeDefined();
  });
});
