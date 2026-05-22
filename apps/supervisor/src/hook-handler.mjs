import { execFileSync } from "node:child_process";

/**
 * @typedef {{
 *   session_id?: string,
 *   hook_event_name?: string,
 *   tool_name?: string,
 *   tool_input?: unknown,
 *   prompt?: string,
 *   message?: string,
 *   transcript_path?: string,
 *   cwd?: string,
 * }} ClaudeHookInput
 *
 * @typedef {{
 *   permissionDecision?: "allow" | "deny" | "ask",
 *   permissionDecisionReason?: string,
 *   suppressOutput?: boolean,
 * }} HookSpecificOutput
 *
 * @typedef {{
 *   continue?: boolean,
 *   stopReason?: string,
 *   hookSpecificOutput?: { hookEventName: string } & HookSpecificOutput,
 * }} HookResponse
 */

/**
 * Decide hook response based on event type and RAM state.
 * @param {ClaudeHookInput} hook
 * @param {{ availableMb: number, threshold: number, hardLimit: number, heavyBashPatterns: RegExp[] }} ctx
 * @returns {HookResponse & { gate?: import("@ai-dashboard/shared").GateReason }}
 */
export function decideHook(hook, ctx) {
  const event = hook.hook_event_name;
  if (event !== "PreToolUse") return {};

  const tool = hook.tool_name;
  const isAgent = tool === "Agent" || tool === "Task";
  const bashCmd =
    tool === "Bash" && isRecord(hook.tool_input)
      ? String(hook.tool_input.command ?? "")
      : null;
  const heavyBash = bashCmd != null && isHeavy(bashCmd, ctx.heavyBashPatterns);
  const heavy = isAgent || heavyBash;
  if (!heavy) return {};

  if (ctx.availableMb < ctx.hardLimit) {
    const msg = `RAM critical (${ctx.availableMb} MB available, need >${ctx.hardLimit} MB). Cancel or wait.`;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: msg,
      },
      gate: {
        kind: "ram-critical",
        message: msg,
        available_mb: ctx.availableMb,
        threshold_mb: ctx.hardLimit,
      },
    };
  }
  if (ctx.availableMb < ctx.threshold) {
    const msg = `RAM low (${ctx.availableMb} MB available, soft threshold ${ctx.threshold} MB). Confirm to proceed.`;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: msg,
      },
      gate: {
        kind: "ram-low",
        message: msg,
        available_mb: ctx.availableMb,
        threshold_mb: ctx.threshold,
      },
    };
  }
  return {};
}

/**
 * @param {string} cmd
 * @param {RegExp[]} patterns
 */
function isHeavy(cmd, patterns) {
  return patterns.some((p) => p.test(cmd));
}

/**
 * @param {unknown} x
 * @returns {x is Record<string, unknown>}
 */
function isRecord(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Map Claude hook payload → normalized HookEvent for cloud push.
 * @param {ClaudeHookInput} hook
 * @param {string} machine
 * @param {import("@ai-dashboard/shared").GateReason | undefined} [gate]
 * @returns {import("@ai-dashboard/shared").HookEvent}
 */
export function toHookEvent(hook, machine, gate) {
  /** @type {"permission" | "idle" | "other" | undefined} */
  let notificationKind;
  if (hook.hook_event_name === "Notification") {
    const text = (hook.message ?? JSON.stringify(hook.tool_input ?? "")).toLowerCase();
    if (text.includes("permission") || text.includes("approve")) notificationKind = "permission";
    else if (text.includes("idle") || text.includes("waiting")) notificationKind = "idle";
    else notificationKind = "other";
  }
  let effectiveGate = gate;
  if (!effectiveGate && notificationKind === "permission") {
    effectiveGate = {
      kind: "permission",
      message: hook.message ?? "Permission requested",
    };
  }
  const cwdInfo = hook.cwd
    ? { cwd: hook.cwd, project: deriveProject(hook.cwd), branch: deriveBranch(hook.cwd) ?? undefined }
    : {};
  return /** @type {import("@ai-dashboard/shared").HookEvent} */ ({
    session_id: hook.session_id ?? "unknown",
    machine,
    type: hook.hook_event_name ?? "Stop",
    ...(hook.tool_name ? { tool_name: hook.tool_name } : {}),
    ...(hook.tool_input ? { tool_input: hook.tool_input } : {}),
    ...(hook.prompt ? { prompt: hook.prompt } : {}),
    ...(notificationKind ? { notification_kind: notificationKind } : {}),
    ...(effectiveGate ? { gate_reason: effectiveGate } : {}),
    ...cwdInfo,
    at: Date.now(),
  });
}

/** @param {string} cwd */
function deriveProject(cwd) {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

/** @type {Map<string, { branch: string | null, at: number }>} */
const branchCache = new Map();
const BRANCH_TTL_MS = 30_000;

/** @param {string} cwd */
function deriveBranch(cwd) {
  const now = Date.now();
  const cached = branchCache.get(cwd);
  if (cached && now - cached.at < BRANCH_TTL_MS) return cached.branch;
  let branch = /** @type {string | null} */ (null);
  try {
    const out = execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500,
    });
    const trimmed = out.trim();
    if (trimmed && trimmed !== "HEAD") branch = trimmed;
  } catch {
    branch = null;
  }
  branchCache.set(cwd, { branch, at: now });
  return branch;
}
