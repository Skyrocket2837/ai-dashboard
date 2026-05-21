import { describe, it, expect } from "vitest";
import { signRequest, verifyRequest } from "@ai-dashboard/shared";

const SECRET = "x".repeat(64);

describe("HMAC sign/verify", () => {
  it("round-trip valid", () => {
    const ts = Date.now();
    const body = JSON.stringify({ a: 1 });
    const sig = signRequest(SECRET, "POST", "/api/events", body, ts);
    const r = verifyRequest(SECRET, "POST", "/api/events", body, ts, sig);
    expect(r.ok).toBe(true);
  });

  it("rejects wrong secret", () => {
    const ts = Date.now();
    const body = "";
    const sig = signRequest(SECRET, "GET", "/", body, ts);
    const r = verifyRequest("y".repeat(64), "GET", "/", body, ts, sig);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-sig");
  });

  it("rejects tampered body", () => {
    const ts = Date.now();
    const body = "original";
    const sig = signRequest(SECRET, "POST", "/x", body, ts);
    const r = verifyRequest(SECRET, "POST", "/x", "tampered", ts, sig);
    expect(r.ok).toBe(false);
  });

  it("rejects tampered path", () => {
    const ts = Date.now();
    const sig = signRequest(SECRET, "POST", "/a", "", ts);
    const r = verifyRequest(SECRET, "POST", "/b", "", ts, sig);
    expect(r.ok).toBe(false);
  });

  it("rejects stale timestamp (>5min)", () => {
    const ts = Date.now() - 6 * 60 * 1000;
    const sig = signRequest(SECRET, "POST", "/x", "", ts);
    const r = verifyRequest(SECRET, "POST", "/x", "", ts, sig);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("stale");
  });

  it("rejects future timestamp (>5min ahead)", () => {
    const ts = Date.now() + 6 * 60 * 1000;
    const sig = signRequest(SECRET, "POST", "/x", "", ts);
    const r = verifyRequest(SECRET, "POST", "/x", "", ts, sig);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("stale");
  });

  it("accepts within 5min skew", () => {
    const ts = Date.now() - 4 * 60 * 1000;
    const sig = signRequest(SECRET, "POST", "/x", "{}", ts);
    const r = verifyRequest(SECRET, "POST", "/x", "{}", ts, sig);
    expect(r.ok).toBe(true);
  });

  it("rejects missing signature", () => {
    const r = verifyRequest(SECRET, "POST", "/x", "", Date.now(), null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing-headers");
  });

  it("rejects missing timestamp", () => {
    const r = verifyRequest(SECRET, "POST", "/x", "", null, "abc");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing-headers");
  });

  it("rejects sig of wrong length", () => {
    const ts = Date.now();
    const r = verifyRequest(SECRET, "POST", "/x", "", ts, "ab");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad-sig");
  });

  it("case-insensitive method", () => {
    const ts = Date.now();
    const sig = signRequest(SECRET, "post", "/x", "", ts);
    const r = verifyRequest(SECRET, "POST", "/x", "", ts, sig);
    expect(r.ok).toBe(true);
  });
});
