import type { HookEvent, SessionState } from "@ai-dashboard/shared";

const HEAVY_BASH_PATTERNS = [
  /\bnpm\s+(test|run\s+build|run\s+dev|install|ci)\b/i,
  /\bpnpm\s+(test|build|install|dev)\b/i,
  /\byarn\s+(test|build|install|dev)\b/i,
  /\btsc(\s|$)/i,
  /\bvitest\b/i,
  /\bjest\b/i,
  /\bplaywright\b/i,
  /\bprisma\s+(generate|migrate|db\s+push)\b/i,
  /\bnext\s+(build|dev)\b/i,
  /\bvite\s+(build|dev)\b/i,
  /\bturbo\s+(build|run)\b/i,
];

export function isHeavyBashCommand(cmd: string | undefined): boolean {
  if (!cmd) return false;
  return HEAVY_BASH_PATTERNS.some((p) => p.test(cmd));
}

export interface StateUpdate {
  state?: SessionState;
  current_tool?: string | null;
  current_prompt?: string | null;
  subagent_delta?: number;
  upsert?: boolean;
}

export function computeStateUpdate(event: HookEvent): StateUpdate {
  switch (event.type) {
    case "SessionStart":
      return { upsert: true, state: "idle" };

    case "UserPromptSubmit":
      return {
        state: "working",
        current_prompt: event.prompt ?? null,
      };

    case "PreToolUse": {
      const isAgent = event.tool_name === "Agent" || event.tool_name === "Task";
      const bashCmd =
        event.tool_name === "Bash" && isRecord(event.tool_input)
          ? String(event.tool_input.command ?? "")
          : undefined;
      const heavy = isAgent || isHeavyBashCommand(bashCmd);
      return {
        state: "working",
        current_tool: event.tool_name ?? null,
        subagent_delta: isAgent ? 1 : 0,
        // heavy flag consumed by gate logic elsewhere
        ...(heavy ? { current_tool: `${event.tool_name}*` } : {}),
      };
    }

    case "PostToolUse":
      return { current_tool: null };

    case "Notification": {
      const kind = event.notification_kind ?? inferNotificationKind(event);
      if (kind === "permission") return { state: "waiting-permission" };
      if (kind === "idle") return { state: "waiting-input" };
      return {};
    }

    case "SubagentStop":
      return { subagent_delta: -1 };

    case "Stop":
      return { state: "done", current_tool: null };

    case "PreCompact":
      return {};

    default:
      return {};
  }
}

function inferNotificationKind(event: HookEvent): "permission" | "idle" | "other" {
  if (!event.tool_input) return "other";
  const s = JSON.stringify(event.tool_input).toLowerCase();
  if (s.includes("permission") || s.includes("approve")) return "permission";
  if (s.includes("idle") || s.includes("waiting")) return "idle";
  return "other";
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
