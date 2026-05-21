import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp, type AppInstance } from "../src/app.js";
import { signRequest, HMAC_HEADER, TIMESTAMP_HEADER, MACHINE_HEADER } from "@ai-dashboard/shared";

const SECRET = "x".repeat(64);

function makeConfig() {
  return {
    host: "127.0.0.1",
    port: 0,
    dbPath: ":memory:",
    publicDir: "/non-existent-path-for-test",
    hmacSecret: SECRET,
    eventRetentionDays: 7,
    pruneIntervalMs: 1_000_000_000,
    logLevel: "silent",
  };
}

function sign(method: string, path: string, body: object) {
  const ts = Date.now();
  const raw = JSON.stringify(body);
  const sig = signRequest(SECRET, method, path, raw, ts);
  return {
    headers: {
      [HMAC_HEADER]: sig,
      [TIMESTAMP_HEADER]: String(ts),
      [MACHINE_HEADER]: "test-machine",
      "content-type": "application/json",
    },
    payload: raw,
  };
}

describe("HTTP integration", () => {
  let app: AppInstance;

  beforeEach(async () => {
    app = await buildApp(makeConfig());
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/health → ok", async () => {
    const res = await app.fastify.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST /api/events without signature → 401", async () => {
    const res = await app.fastify.inject({
      method: "POST",
      url: "/api/events",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ machine: "m1", events: [] }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/events with valid HMAC → 200 + ingests", async () => {
    const body = {
      machine: "m1",
      events: [{
        session_id: "s1",
        machine: "m1",
        type: "SessionStart",
        at: Date.now(),
        project: "p1",
      }],
    };
    const signed = sign("POST", "/api/events", body);
    const res = await app.fastify.inject({
      method: "POST",
      url: "/api/events",
      headers: signed.headers,
      payload: signed.payload,
    });
    expect(res.statusCode).toBe(200);
    const json = res.json() as { ok: boolean; ingested: number };
    expect(json.ok).toBe(true);
    expect(json.ingested).toBe(1);
  });

  it("POST /api/events with tampered body → 401", async () => {
    const body = { machine: "m1", events: [] };
    const signed = sign("POST", "/api/events", body);
    const res = await app.fastify.inject({
      method: "POST",
      url: "/api/events",
      headers: signed.headers,
      payload: JSON.stringify({ machine: "m1", events: [{ junk: true }] }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/sessions empty by default", async () => {
    const res = await app.fastify.inject({ method: "GET", url: "/api/sessions" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sessions: [] });
  });

  it("GET /api/sessions returns ingested sessions", async () => {
    const body = {
      machine: "m1",
      events: [{
        session_id: "s1",
        machine: "m1",
        type: "SessionStart",
        at: Date.now(),
      }],
    };
    const signed = sign("POST", "/api/events", body);
    await app.fastify.inject({
      method: "POST",
      url: "/api/events",
      headers: signed.headers,
      payload: signed.payload,
    });
    const res = await app.fastify.inject({ method: "GET", url: "/api/sessions" });
    const json = res.json() as { sessions: Array<{ id: string }> };
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0]?.id).toBe("s1");
  });

  it("GET /api/sessions/:id → 404 for missing", async () => {
    const res = await app.fastify.inject({ method: "GET", url: "/api/sessions/nope" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/sessions/:id returns session + events", async () => {
    const body = {
      machine: "m1",
      events: [
        { session_id: "s1", machine: "m1", type: "SessionStart", at: 1 },
        { session_id: "s1", machine: "m1", type: "UserPromptSubmit", prompt: "hi", at: 2 },
      ],
    };
    const signed = sign("POST", "/api/events", body);
    await app.fastify.inject({
      method: "POST",
      url: "/api/events",
      headers: signed.headers,
      payload: signed.payload,
    });
    const res = await app.fastify.inject({ method: "GET", url: "/api/sessions/s1" });
    expect(res.statusCode).toBe(200);
    const json = res.json() as { session: { id: string }; events: Array<unknown> };
    expect(json.session.id).toBe("s1");
    expect(json.events).toHaveLength(2);
  });

  it("POST /api/commands creates command + returns id", async () => {
    const res = await app.fastify.inject({
      method: "POST",
      url: "/api/commands",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ session_id: "s1", command: "cancel" }),
    });
    expect(res.statusCode).toBe(200);
    const json = res.json() as { ok: boolean; command: { id: number; command: string } };
    expect(json.ok).toBe(true);
    expect(json.command.command).toBe("cancel");
    expect(typeof json.command.id).toBe("number");
  });

  it("supervisor receives pending commands in /api/events response", async () => {
    await app.fastify.inject({
      method: "POST",
      url: "/api/commands",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ machine: "test-machine", command: "pause" }),
    });
    const body = { machine: "test-machine", events: [] };
    const signed = sign("POST", "/api/events", body);
    const res = await app.fastify.inject({
      method: "POST",
      url: "/api/events",
      headers: signed.headers,
      payload: signed.payload,
    });
    const json = res.json() as { commands: Array<{ command: string }> };
    expect(json.commands).toHaveLength(1);
    expect(json.commands[0]?.command).toBe("pause");
  });

  it("pending commands are not re-delivered after consume", async () => {
    await app.fastify.inject({
      method: "POST",
      url: "/api/commands",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ machine: "test-machine", command: "pause" }),
    });
    const body = { machine: "test-machine", events: [] };
    const sign1 = sign("POST", "/api/events", body);
    await app.fastify.inject({
      method: "POST",
      url: "/api/events",
      headers: sign1.headers,
      payload: sign1.payload,
    });
    const sign2 = sign("POST", "/api/events", body);
    const res = await app.fastify.inject({
      method: "POST",
      url: "/api/events",
      headers: sign2.headers,
      payload: sign2.payload,
    });
    expect((res.json() as { commands: unknown[] }).commands).toHaveLength(0);
  });

  it("POST /api/commands without command → 400", async () => {
    const res = await app.fastify.inject({
      method: "POST",
      url: "/api/commands",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
  });
});
