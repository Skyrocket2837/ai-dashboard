import type { FastifyInstance } from "fastify";
import type { SSEHub } from "../sse.js";

export interface StreamRouteDeps {
  hub: SSEHub;
}

export async function registerStreamRoute(app: FastifyInstance, deps: StreamRouteDeps) {
  app.get("/api/stream", (req, reply) => {
    deps.hub.add(reply);
  });
}
