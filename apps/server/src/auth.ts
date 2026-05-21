import type { FastifyReply, FastifyRequest } from "fastify";
import {
  HMAC_HEADER,
  MACHINE_HEADER,
  TIMESTAMP_HEADER,
  verifyRequest,
} from "@ai-dashboard/shared";

export interface HmacContext {
  secret: string;
}

export function makeHmacVerifier(ctx: HmacContext) {
  return async function verify(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const sig = headerString(req, HMAC_HEADER);
    const tsRaw = headerString(req, TIMESTAMP_HEADER);
    const ts = tsRaw ? Number.parseInt(tsRaw, 10) : null;
    const machine = headerString(req, MACHINE_HEADER);
    const bodyRaw = (req as { rawBody?: string }).rawBody ?? "";
    const result = verifyRequest(ctx.secret, req.method, req.url, bodyRaw, ts, sig);
    if (!result.ok) {
      req.log.warn({ reason: result.reason, machine }, "hmac verify failed");
      reply.code(401).send({ error: "unauthorized", reason: result.reason });
      return;
    }
    (req as { machine?: string }).machine = machine ?? "unknown";
  };
}

function headerString(req: FastifyRequest, name: string): string | null {
  const v = req.headers[name.toLowerCase()];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}
