import type { FastifyInstance } from "fastify";
import type { EventsBatch, PostEventsResponse } from "@ai-dashboard/shared";
import type { DbStatements } from "../db.js";
import type Database from "better-sqlite3";
import type { SSEHub } from "../sse.js";
import { ingestEvents, ingestHeartbeat } from "../ingest.js";
import { makeHmacVerifier } from "../auth.js";

export interface EventsRouteDeps {
  db: Database.Database;
  stmts: DbStatements;
  hub: SSEHub;
  hmacSecret: string;
}

export async function registerEventsRoute(app: FastifyInstance, deps: EventsRouteDeps) {
  const verify = makeHmacVerifier({ secret: deps.hmacSecret });

  app.post<{ Body: EventsBatch; Reply: PostEventsResponse | { error: string } }>(
    "/api/events",
    { preHandler: verify },
    async (req, reply) => {
      const body = req.body;
      if (!body || !Array.isArray(body.events) || typeof body.machine !== "string") {
        reply.code(400).send({ error: "invalid_body" });
        return;
      }
      const result = ingestEvents(deps.db, deps.stmts, body.events, deps.hub);
      if (body.heartbeat) ingestHeartbeat(deps.stmts, body.heartbeat, deps.hub);

      const machine = (req as { machine?: string }).machine ?? body.machine;
      const pending = deps.stmts.pendingCommandsForMachine.all(machine) as Array<{
        id: number;
        session_id: string | null;
        machine: string | null;
        command: string;
        payload: string | null;
        created_at: number;
        consumed_at: number | null;
      }>;
      const now = Date.now();
      const cmds = pending.map((p) => {
        deps.stmts.consumeCommand.run(now, p.id);
        return {
          id: p.id,
          session_id: p.session_id,
          machine: p.machine ?? undefined,
          command: p.command as "approve" | "cancel" | "pause" | "resume",
          payload: p.payload ? JSON.parse(p.payload) : undefined,
          created_at: p.created_at,
          consumed_at: now,
        };
      });

      reply.send({ ok: true as const, ingested: result.ingested, commands: cmds });
    },
  );
}
