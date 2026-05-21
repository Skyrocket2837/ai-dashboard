import { signRequest, HMAC_HEADER, TIMESTAMP_HEADER, MACHINE_HEADER } from "@ai-dashboard/shared";

/**
 * @typedef {import("@ai-dashboard/shared").HookEvent} HookEvent
 * @typedef {import("@ai-dashboard/shared").SupervisorHeartbeat} SupervisorHeartbeat
 * @typedef {import("@ai-dashboard/shared").CommandRecord} CommandRecord
 *
 * @typedef {{
 *   url: string,
 *   secret: string,
 *   machine: string,
 *   fetchImpl?: typeof fetch,
 * }} PushOptions
 */

export class PushClient {
  /** @param {PushOptions} opts */
  constructor(opts) {
    this.url = opts.url.replace(/\/$/, "");
    this.secret = opts.secret;
    this.machine = opts.machine;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    /** @type {HookEvent[]} */
    this.buffer = [];
    /** @type {SupervisorHeartbeat | null} */
    this.lastHeartbeat = null;
    this.maxBuffer = 1000;
  }

  /** @param {HookEvent} event */
  enqueue(event) {
    if (this.buffer.length >= this.maxBuffer) this.buffer.shift();
    this.buffer.push(event);
  }

  /** @param {SupervisorHeartbeat} hb */
  setHeartbeat(hb) {
    this.lastHeartbeat = hb;
  }

  /** @returns {Promise<{ ok: boolean, commands: CommandRecord[], error?: string }>} */
  async flush() {
    if (this.buffer.length === 0 && !this.lastHeartbeat) return { ok: true, commands: [] };
    const events = this.buffer.splice(0, this.buffer.length);
    const body = {
      machine: this.machine,
      events,
      ...(this.lastHeartbeat ? { heartbeat: this.lastHeartbeat } : {}),
    };
    this.lastHeartbeat = null;
    const raw = JSON.stringify(body);
    const ts = Date.now();
    const path = "/api/events";
    const sig = signRequest(this.secret, "POST", path, raw, ts);
    try {
      const res = await this.fetchImpl(`${this.url}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [HMAC_HEADER]: sig,
          [TIMESTAMP_HEADER]: String(ts),
          [MACHINE_HEADER]: this.machine,
        },
        body: raw,
      });
      if (!res.ok) {
        for (const e of events) this.enqueue(e);
        return { ok: false, commands: [], error: `HTTP ${res.status}` };
      }
      const json = /** @type {{ commands?: CommandRecord[] }} */ (await res.json());
      return { ok: true, commands: json.commands ?? [] };
    } catch (e) {
      for (const ev of events) this.enqueue(ev);
      return { ok: false, commands: [], error: String(e) };
    }
  }
}
