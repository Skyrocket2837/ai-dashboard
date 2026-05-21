# AI Dashboard

Multi-session Claude Code orchestrator + remote dashboard. Hosted on Raspberry Pi 4 (1GB).

## What it does

- Runs a long-lived **supervisor daemon** on your dev machine that hooks into Claude Code (`PreToolUse`, `Notification`, `Stop`, ...) and **gates heavy work** (`Agent` / `Task` / `npm test` / `tsc` / etc.) when available RAM drops below your threshold.
- Pushes session state to a small **Fastify server on the Pi** (SQLite + SSE), reachable from anywhere via Cloudflare Tunnel.
- A **Preact dashboard** shows every active session, what tool it is running, whether it is waiting on input, RAM usage on the dev machine, and the queue depth — all live.

## Layout

| Path | Role | Where it runs |
|------|------|---------------|
| `apps/server` | Fastify + better-sqlite3 + SSE | Raspberry Pi (systemd) |
| `apps/web` | Preact + Vite SPA | Built into `apps/server/public` |
| `apps/supervisor` | Hook bridge + RAM monitor + cloud push | Dev machine (Task Scheduler) |
| `packages/shared` | TypeScript types + HMAC helpers | — |

## Quick start (dev loop)

```powershell
pnpm install

# terminal 1 — Pi server (running locally for dev)
$env:AID_HMAC_SECRET = (1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) }) -join ''
pnpm dev:server          # listens on :8787

# terminal 2 — web dashboard
pnpm dev:web             # vite on :5173, proxies /api → :8787

# terminal 3 — supervisor (talks to the server)
Copy-Item apps/supervisor/.env.example apps/supervisor/.env
# edit .env: AID_CLOUD_URL=http://127.0.0.1:8787 and AID_HMAC_SECRET=<same as above>
pnpm dev:supervisor      # listens on :7777
```

Then add the entries from `apps/supervisor/claude-settings-snippet.json` into your `~/.claude/settings.json` `hooks` section. Open a Claude Code session → the dashboard updates live.

## Tests

```powershell
pnpm test            # 113 tests across server / web / supervisor
pnpm typecheck       # strict TypeScript across all packages
```

## Deploy to Raspberry Pi

```powershell
pnpm bundle                          # produces deploy-out/
pnpm deploy:pi -PiHost 10.0.0.42     # rsyncs + restarts systemd
```

First-time Pi setup is documented inside the generated `deploy-out/README.md` and the systemd unit at `apps/server/deploy/ai-dashboard.service` (capped at 400MB RAM for safety on the 1GB Pi).

## RAM gate behaviour

| Available RAM | What the supervisor does |
|---------------|--------------------------|
| > `AID_RAM_THRESHOLD_MB` (default 4096 MB) | Allow all hooks |
| Between `RAM_HARD_LIMIT_MB` and `RAM_THRESHOLD_MB` | Respond `permissionDecision: "ask"` for `Agent` / `Task` / heavy `Bash` |
| < `AID_RAM_HARD_LIMIT_MB` (default 2048 MB) | Respond `permissionDecision: "deny"` and surface the queued state in the dashboard |

All other tools (`Read`, `Edit`, `Glob`, …) are never blocked.

## See also

Plan / architecture: [session plan](../../Users/ball2/.claude/plans/session-effervescent-starfish.md).
