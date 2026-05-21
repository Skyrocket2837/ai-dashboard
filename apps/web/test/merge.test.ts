import { describe, it, expect } from "vitest";
import { mergeSession, sortByActivity, staleFilter, formatRelative, stateColor } from "../src/lib/merge.js";
import type { SessionRecord } from "@ai-dashboard/shared";

function s(id: string, at: number, state: SessionRecord["state"] = "idle"): SessionRecord {
  return {
    id,
    machine: "m",
    project: null,
    branch: null,
    state,
    current_tool: null,
    current_prompt: null,
    active_subagents: 0,
    ram_mb: null,
    queue_position: null,
    last_activity_at: at,
    created_at: at,
  };
}

describe("mergeSession", () => {
  it("adds new session", () => {
    const out = mergeSession([s("a", 1)], s("b", 2));
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("replaces existing session", () => {
    const out = mergeSession([s("a", 1)], s("a", 5, "working"));
    expect(out).toHaveLength(1);
    expect(out[0]?.state).toBe("working");
  });
  it("re-sorts after merge", () => {
    const out = mergeSession([s("a", 10), s("b", 5)], s("b", 20));
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("sortByActivity", () => {
  it("sorts descending by last_activity_at", () => {
    const out = sortByActivity([s("a", 1), s("b", 3), s("c", 2)]);
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});

describe("staleFilter", () => {
  it("keeps non-done sessions regardless of age", () => {
    const now = 1000;
    const list = [s("a", 0, "working"), s("b", 0, "idle")];
    expect(staleFilter(list, 100, now)).toHaveLength(2);
  });
  it("drops old done sessions", () => {
    const now = 1000;
    const list = [s("a", 0, "done"), s("b", 950, "done")];
    const out = staleFilter(list, 100, now);
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("formatRelative", () => {
  it("shows 'just now' under 5s", () => {
    expect(formatRelative(995, 1000)).toBe("just now");
  });
  it("seconds", () => {
    expect(formatRelative(0, 30_000)).toBe("30s ago");
  });
  it("minutes", () => {
    expect(formatRelative(0, 5 * 60_000)).toBe("5m ago");
  });
  it("hours", () => {
    expect(formatRelative(0, 3 * 60 * 60_000)).toBe("3h ago");
  });
  it("days", () => {
    expect(formatRelative(0, 2 * 24 * 60 * 60_000)).toBe("2d ago");
  });
  it("handles future timestamps as just now", () => {
    expect(formatRelative(2000, 1000)).toBe("just now");
  });
});

describe("stateColor", () => {
  it("returns class for working", () => {
    expect(stateColor("working")).toContain("state-working");
  });
  it("returns class for waiting-permission", () => {
    expect(stateColor("waiting-permission")).toContain("state-waiting");
  });
  it("returns class for waiting-input", () => {
    expect(stateColor("waiting-input")).toContain("state-waiting");
  });
  it("returns class for idle", () => {
    expect(stateColor("idle")).toContain("state-idle");
  });
  it("returns class for queued", () => {
    expect(stateColor("queued")).toContain("state-queued");
  });
  it("returns class for done", () => {
    expect(stateColor("done")).toContain("state-done");
  });
  it("returns class for error", () => {
    expect(stateColor("error")).toContain("state-error");
  });
  it("returns fallback for unknown state", () => {
    expect(stateColor("nope")).toContain("slate-700");
  });
});
