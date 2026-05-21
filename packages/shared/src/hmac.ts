import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function signRequest(
  secret: string,
  method: string,
  path: string,
  bodyRaw: string,
  timestamp: number,
): string {
  const payload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyRaw}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export interface VerifyResult {
  ok: boolean;
  reason?: "missing-headers" | "stale" | "bad-sig";
}

export function verifyRequest(
  secret: string,
  method: string,
  path: string,
  bodyRaw: string,
  timestamp: number | null,
  providedSig: string | null,
  now: number = Date.now(),
): VerifyResult {
  if (timestamp == null || !providedSig) {
    return { ok: false, reason: "missing-headers" };
  }
  if (Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "stale" };
  }
  const expected = signRequest(secret, method, path, bodyRaw, timestamp);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(providedSig, "hex");
  if (a.length !== b.length) {
    return { ok: false, reason: "bad-sig" };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-sig" };
  }
  return { ok: true };
}
