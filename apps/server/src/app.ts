import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import { existsSync } from "node:fs";
import { openDb, prepareStatements, type DbStatements } from "./db.js";
import { SSEHub } from "./sse.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerSessionsRoute } from "./routes/sessions.js";
import { registerCommandsRoute } from "./routes/commands.js";
import { registerStreamRoute } from "./routes/stream.js";
import type { ServerConfig } from "./config.js";
import type Database from "better-sqlite3";

export interface AppInstance {
  fastify: FastifyInstance;
  db: Database.Database;
  stmts: DbStatements;
  hub: SSEHub;
  close: () => Promise<void>;
  listen: FastifyInstance["listen"];
  log: FastifyInstance["log"];
}

export async function buildApp(config: ServerConfig): Promise<AppInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 4 * 1024 * 1024,
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        const parsed = body.length ? JSON.parse(body as string) : {};
        (req as { rawBody?: string }).rawBody = body as string;
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(cors, { origin: true });

  const db = openDb(config.dbPath);
  const stmts = prepareStatements(db);
  const hub = new SSEHub();

  app.get("/api/health", async () => ({
    ok: true,
    uptime_s: process.uptime(),
    sse_clients: hub.size(),
  }));

  await registerEventsRoute(app, { db, stmts, hub, hmacSecret: config.hmacSecret });
  await registerSessionsRoute(app, { stmts });
  await registerCommandsRoute(app, { stmts, hub });
  await registerStreamRoute(app, { hub });

  if (existsSync(config.publicDir)) {
    await app.register(fastifyStatic, { root: config.publicDir, prefix: "/" });
  }

  const pingInterval = setInterval(() => hub.ping(), 25_000);
  const pruneInterval = setInterval(() => {
    const cutoff = Date.now() - config.eventRetentionDays * 86_400_000;
    stmts.pruneEvents.run(cutoff);
  }, config.pruneIntervalMs);

  const wrappedListen: FastifyInstance["listen"] = app.listen.bind(app);

  return {
    fastify: app,
    db,
    stmts,
    hub,
    listen: wrappedListen,
    log: app.log,
    close: async () => {
      clearInterval(pingInterval);
      clearInterval(pruneInterval);
      hub.closeAll();
      await app.close();
      db.close();
    },
  };
}
