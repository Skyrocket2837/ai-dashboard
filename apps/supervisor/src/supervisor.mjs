import { createServer } from "node:http";
import { loadConfig } from "./config.mjs";
import { decideHook, toHookEvent } from "./hook-handler.mjs";
import { createRamMonitor } from "./ram-monitor.mjs";
import { PushClient } from "./push-client.mjs";

const config = loadConfig();

const ramMonitor = createRamMonitor({
  pollMs: config.ramPollMs,
  mockRamMb: config.mockRamMb,
});
ramMonitor.start();

const pushClient = config.cloudUrl
  ? new PushClient({ url: config.cloudUrl, secret: config.hmacSecret, machine: config.machine })
  : null;

let activeSessions = 0;
let queueDepth = 0;
/** @type {Set<string>} */
const knownSessions = new Set();

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      machine: config.machine,
      ram: ramMonitor.getSnapshot(),
      active_sessions: activeSessions,
      queue_depth: queueDepth,
      cloud: config.cloudUrl,
    });
    return;
  }

  if (req.method === "GET" && req.url === "/state") {
    sendJson(res, 200, ramMonitor.getSnapshot());
    return;
  }

  if (req.method === "POST" && req.url === "/hook") {
    const body = await readBody(req);
    /** @type {import("./hook-handler.mjs").ClaudeHookInput} */
    let hook;
    try {
      hook = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }

    if (hook.session_id && !knownSessions.has(hook.session_id) && hook.hook_event_name !== "SessionEnd") {
      knownSessions.add(hook.session_id);
      activeSessions++;
    }
    if (hook.hook_event_name === "Stop") {
      if (hook.session_id && knownSessions.has(hook.session_id)) {
        knownSessions.delete(hook.session_id);
        activeSessions = Math.max(0, activeSessions - 1);
      }
    }

    const ram = ramMonitor.getSnapshot();
    const decision = decideHook(hook, {
      availableMb: ram.availableMb,
      threshold: config.ramThresholdMb,
      hardLimit: config.ramHardLimitMb,
      heavyBashPatterns: config.heavyBashPatterns,
    });

    if (decision.hookSpecificOutput?.permissionDecision === "deny" ||
        decision.hookSpecificOutput?.permissionDecision === "ask") {
      queueDepth++;
    }

    if (pushClient) {
      pushClient.enqueue(toHookEvent(hook, config.machine));
    }

    sendJson(res, 200, decision);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(config.port, config.host, () => {
  console.log(`[supervisor] listening on http://${config.host}:${config.port}`);
  console.log(`[supervisor] machine=${config.machine} cloud=${config.cloudUrl ?? "none"}`);
});

if (pushClient) {
  setInterval(async () => {
    const ram = ramMonitor.getSnapshot();
    pushClient.setHeartbeat({
      machine: config.machine,
      ram_total_mb: ram.totalMb,
      ram_available_mb: ram.availableMb,
      cpu_percent: ram.cpuPercent,
      active_sessions: activeSessions,
      queue_depth: queueDepth,
      at: Date.now(),
    });
    const r = await pushClient.flush();
    if (!r.ok && r.error) {
      console.warn(`[push] failed: ${r.error}`);
    }
    queueDepth = Math.max(0, queueDepth - r.commands.filter((c) => c.command === "approve").length);
  }, config.pushIntervalMs);
}

function shutdown() {
  console.log("[supervisor] shutting down");
  ramMonitor.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
