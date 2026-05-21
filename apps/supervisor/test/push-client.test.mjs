import { describe, it, expect } from "vitest";
import { PushClient } from "../src/push-client.mjs";

function makeMockFetch(impl) {
  return async (url, init) => impl(url, init);
}

describe("PushClient", () => {
  it("flush with empty buffer returns ok with no commands", async () => {
    const client = new PushClient({
      url: "http://x",
      secret: "x".repeat(64),
      machine: "m",
      fetchImpl: makeMockFetch(async () => {
        throw new Error("should not call");
      }),
    });
    const r = await client.flush();
    expect(r.ok).toBe(true);
    expect(r.commands).toEqual([]);
  });

  it("enqueue + flush sends signed POST", async () => {
    let captured;
    const client = new PushClient({
      url: "http://x.test",
      secret: "x".repeat(64),
      machine: "m",
      fetchImpl: makeMockFetch(async (url, init) => {
        captured = { url, init };
        return new Response(JSON.stringify({ ok: true, ingested: 1, commands: [] }), { status: 200 });
      }),
    });
    client.enqueue({ session_id: "s", machine: "m", type: "SessionStart", at: 1 });
    const r = await client.flush();
    expect(r.ok).toBe(true);
    expect(captured.url).toBe("http://x.test/api/events");
    expect(captured.init.method).toBe("POST");
    expect(captured.init.headers["x-ai-dashboard-sig"]).toMatch(/^[a-f0-9]{64}$/);
    expect(captured.init.headers["x-ai-dashboard-machine"]).toBe("m");
  });

  it("network error re-queues events", async () => {
    const client = new PushClient({
      url: "http://x.test",
      secret: "x".repeat(64),
      machine: "m",
      fetchImpl: makeMockFetch(async () => {
        throw new Error("network down");
      }),
    });
    client.enqueue({ session_id: "s", machine: "m", type: "Stop", at: 1 });
    const r = await client.flush();
    expect(r.ok).toBe(false);
    expect(r.error).toContain("network down");
    expect(client.buffer).toHaveLength(1);
  });

  it("non-2xx response re-queues events", async () => {
    const client = new PushClient({
      url: "http://x.test",
      secret: "x".repeat(64),
      machine: "m",
      fetchImpl: makeMockFetch(async () => new Response("err", { status: 500 })),
    });
    client.enqueue({ session_id: "s", machine: "m", type: "Stop", at: 1 });
    const r = await client.flush();
    expect(r.ok).toBe(false);
    expect(client.buffer).toHaveLength(1);
  });

  it("returns commands from server response", async () => {
    const client = new PushClient({
      url: "http://x.test",
      secret: "x".repeat(64),
      machine: "m",
      fetchImpl: makeMockFetch(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            ingested: 0,
            commands: [{ id: 1, command: "pause", created_at: 1, consumed_at: 2 }],
          }),
          { status: 200 },
        ),
      ),
    });
    client.enqueue({ session_id: "s", machine: "m", type: "Stop", at: 1 });
    const r = await client.flush();
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0].command).toBe("pause");
  });

  it("buffer caps at maxBuffer", async () => {
    const client = new PushClient({
      url: "http://x",
      secret: "x".repeat(64),
      machine: "m",
      fetchImpl: makeMockFetch(async () => new Response("{}", { status: 200 })),
    });
    client.maxBuffer = 3;
    for (let i = 0; i < 5; i++) {
      client.enqueue({ session_id: String(i), machine: "m", type: "Stop", at: i });
    }
    expect(client.buffer).toHaveLength(3);
    expect(client.buffer[0].session_id).toBe("2");
  });

  it("heartbeat included on flush + cleared", async () => {
    let captured;
    const client = new PushClient({
      url: "http://x",
      secret: "x".repeat(64),
      machine: "m",
      fetchImpl: makeMockFetch(async (_url, init) => {
        captured = JSON.parse(init.body);
        return new Response(JSON.stringify({ ok: true, ingested: 0, commands: [] }), { status: 200 });
      }),
    });
    client.setHeartbeat({
      machine: "m",
      ram_total_mb: 32000,
      ram_available_mb: 10000,
      cpu_percent: 10,
      active_sessions: 2,
      queue_depth: 0,
      at: 1,
    });
    client.enqueue({ session_id: "s", machine: "m", type: "Stop", at: 1 });
    await client.flush();
    expect(captured.heartbeat.ram_available_mb).toBe(10000);
    expect(client.lastHeartbeat).toBeNull();
  });
});
