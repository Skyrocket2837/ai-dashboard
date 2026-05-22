import type { FastifyInstance } from "fastify";
import type { DbStatements, SessionRow } from "../db.js";
import { rowToSession } from "../db.js";

export interface SessionsRouteDeps {
  stmts: DbStatements;
}

export async function registerSessionsRoute(app: FastifyInstance, deps: SessionsRouteDeps) {
  app.get("/api/sessions", async () => {
    const rows = deps.stmts.listSessions.all() as SessionRow[];
    return { sessions: rows.map(rowToSession) };
  });

  app.get("/api/queue", async () => {
    const rows = deps.stmts.listQueued.all() as SessionRow[];
    return { sessions: rows.map(rowToSession) };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/sessions/:id",
    async (req, reply) => {
      const row = deps.stmts.getSession.get(req.params.id) as SessionRow | undefined;
      if (!row) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      const limit = Math.min(Number.parseInt(req.query.limit ?? "50", 10), 500);
      const events = deps.stmts.recentEventsForSession.all(req.params.id, limit);
      return { session: rowToSession(row), events };
    },
  );
}
