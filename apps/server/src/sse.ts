import type { FastifyReply } from "fastify";
import type { SSEMessage } from "@ai-dashboard/shared";

export interface SSEClient {
  id: string;
  reply: FastifyReply;
}

export class SSEHub {
  private clients = new Map<string, SSEClient>();
  private nextId = 1;

  add(reply: FastifyReply): string {
    const id = String(this.nextId++);
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders?.();
    reply.raw.write(`:ok\n\n`);
    this.clients.set(id, { id, reply });
    reply.raw.on("close", () => this.clients.delete(id));
    return id;
  }

  broadcast(msg: SSEMessage): void {
    const payload = `event: ${msg.type}\ndata: ${JSON.stringify(msg.data)}\n\n`;
    for (const c of this.clients.values()) {
      try {
        c.reply.raw.write(payload);
      } catch {
        this.clients.delete(c.id);
      }
    }
  }

  ping(): void {
    for (const c of this.clients.values()) {
      try {
        c.reply.raw.write(`:ping ${Date.now()}\n\n`);
      } catch {
        this.clients.delete(c.id);
      }
    }
  }

  size(): number {
    return this.clients.size;
  }

  closeAll(): void {
    for (const c of this.clients.values()) {
      try {
        c.reply.raw.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}
