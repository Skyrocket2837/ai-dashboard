import { resolve } from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  dbPath: string;
  publicDir: string;
  hmacSecret: string;
  eventRetentionDays: number;
  pruneIntervalMs: number;
  logLevel: string;
}

export function loadConfig(): ServerConfig {
  const secret = process.env.AID_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AID_HMAC_SECRET must be set (>=32 chars) in production");
    }
    console.warn("[config] AID_HMAC_SECRET not set; using dev fallback. DO NOT use in production.");
  }
  return {
    host: process.env.AID_HOST ?? "0.0.0.0",
    port: Number.parseInt(process.env.AID_PORT ?? "8787", 10),
    dbPath: resolve(process.env.AID_DB_PATH ?? "./data/ai-dashboard.db"),
    publicDir: resolve(process.env.AID_PUBLIC_DIR ?? "./public"),
    hmacSecret: secret ?? "dev-insecure-secret-please-replace-32chars",
    eventRetentionDays: Number.parseInt(process.env.AID_EVENT_RETENTION_DAYS ?? "7", 10),
    pruneIntervalMs: Number.parseInt(process.env.AID_PRUNE_INTERVAL_MS ?? "3600000", 10),
    logLevel: process.env.AID_LOG_LEVEL ?? "info",
  };
}
