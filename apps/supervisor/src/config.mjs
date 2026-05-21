import { hostname } from "node:os";

/** @returns {{
 *   port: number,
 *   host: string,
 *   machine: string,
 *   cloudUrl: string | null,
 *   hmacSecret: string,
 *   ramThresholdMb: number,
 *   ramHardLimitMb: number,
 *   ramPollMs: number,
 *   pushIntervalMs: number,
 *   heavyBashPatterns: RegExp[],
 *   mockRamMb: number | null,
 * }} */
export function loadConfig() {
  const secret = process.env.AID_HMAC_SECRET ?? "dev-insecure-secret-please-replace-32chars";
  const port = Number.parseInt(process.env.AID_SUPERVISOR_PORT ?? "7777", 10);
  return {
    port,
    host: process.env.AID_SUPERVISOR_HOST ?? "127.0.0.1",
    machine: process.env.AID_MACHINE ?? hostname(),
    cloudUrl: process.env.AID_CLOUD_URL ?? null,
    hmacSecret: secret,
    ramThresholdMb: Number.parseInt(process.env.AID_RAM_THRESHOLD_MB ?? "4096", 10),
    ramHardLimitMb: Number.parseInt(process.env.AID_RAM_HARD_LIMIT_MB ?? "2048", 10),
    ramPollMs: Number.parseInt(process.env.AID_RAM_POLL_MS ?? "5000", 10),
    pushIntervalMs: Number.parseInt(process.env.AID_PUSH_INTERVAL_MS ?? "1000", 10),
    heavyBashPatterns: [
      /\bnpm\s+(test|run\s+build|run\s+dev|install|ci)\b/i,
      /\bpnpm\s+(test|build|install|dev)\b/i,
      /\byarn\s+(test|build|install|dev)\b/i,
      /\btsc(\s|$)/i,
      /\bvitest\b/i,
      /\bjest\b/i,
      /\bplaywright\b/i,
      /\bprisma\s+(generate|migrate|db\s+push)\b/i,
      /\bnext\s+(build|dev)\b/i,
      /\bvite\s+(build|dev)\b/i,
      /\bturbo\s+(build|run)\b/i,
    ],
    mockRamMb: process.env.AID_MOCK_RAM_MB ? Number.parseInt(process.env.AID_MOCK_RAM_MB, 10) : null,
  };
}
