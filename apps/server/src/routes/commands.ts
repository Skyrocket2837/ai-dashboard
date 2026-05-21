import type { FastifyInstance } from "fastify";
import type { DbStatements } from "../db.js";
import type { SSEHub } from "../sse.js";

export interface CommandsRouteDeps {
  stmts: DbStatements;
  hub: SSEHub;
}

interface CreateCommandBody {
  session_id?: string;
  machine?: string;
  command: "approve" | "cancel" | "pause" | "resume";
  payload?: unknown;
}

export async function registerCommandsRoute(app: FastifyInstance, deps: CommandsRouteDeps) {
  app.post<{ Body: CreateCommandBody }>("/api/commands", async (req, reply) => {
    const b = req.body;
    if (!b || !b.command) {
      reply.code(400).send({ error: "invalid_body" });
      return;
    }
    const now = Date.now();
    const info = deps.stmts.insertCommand.run({
      session_id: b.session_id ?? null,
      machine: b.machine ?? null,
      command: b.command,
      payload: b.payload ? JSON.stringify(b.payload) : null,
      created_at: now,
    });
    const cmd = {
      id: Number(info.lastInsertRowid),
      session_id: b.session_id ?? null,
      machine: b.machine ?? null,
      command: b.command,
      created_at: now,
    };
    deps.hub.broadcast({ type: "queue_changed", data: cmd });
    return { ok: true, command: cmd };
  });
}
