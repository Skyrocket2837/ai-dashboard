import type { FastifyInstance } from "fastify";
import type { DbStatements } from "../db.js";

export interface SessionsRouteDeps {
  stmts: DbStatements;
}

export async function registerSessionsRoute(app: FastifyInstance, deps: SessionsRouteDeps) {
  app.get("/api/sessions", async () => {
    const rows = deps.stmts.listSessions.all();
    return { sessions: rows };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/sessions/:id",
    async (req, reply) => {
      const row = deps.stmts.getSession.get(req.params.id);
      if (!row) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      const limit = Math.min(Number.parseInt(req.query.limit ?? "50", 10), 500);
      const events = deps.stmts.recentEventsForSession.all(req.params.id, limit);
      return { session: row, events };
    },
  );
}
