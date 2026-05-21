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

## Deploy to Raspberry Pi (Docker, recommended)

GitHub Actions builds a multi-arch image (`linux/amd64,linux/arm64`) and pushes it to GHCR. A second workflow SSH-deploys onto the Pi.

### One-time Pi setup

```bash
# Install Docker (on Pi OS 64-bit / Ubuntu Server)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker pi

mkdir -p ~/ai-dashboard && cd ~/ai-dashboard
# Copy .env.example → .env, set AID_HMAC_SECRET + GHCR_OWNER
docker login ghcr.io   # use a PAT with read:packages
```

### GitHub secrets (Settings → Secrets and variables → Actions)

| Secret | Used for |
|--------|----------|
| `PI_HOST` | Pi hostname or IP (Tailscale recommended) |
| `PI_USER` | SSH user (e.g. `pi`) |
| `PI_SSH_KEY` | Private key whose pub key is in `~pi/.ssh/authorized_keys` |
| `GHCR_USERNAME` | Your GitHub username |
| `GHCR_PULL_TOKEN` | PAT with `read:packages` (Pi-side login) |

### Workflows

- `.github/workflows/ci.yml` — typecheck + tests on every PR / push to main
- `.github/workflows/build-and-push.yml` — multi-arch image build, push to `ghcr.io/<owner>/ai-dashboard-server`
- `.github/workflows/deploy.yml` — chained after a successful build (or `workflow_dispatch`); SCP compose + `docker compose pull && up -d` on Pi

### Local build (no daemon required to ship — CI builds for you)

```powershell
docker compose -f docker-compose.dev.yml up --build       # build + run amd64 locally
docker compose -f docker-compose.yml up -d                # pull prebuilt image (set GHCR_OWNER + TAG)
```

### Pi memory budget under Docker

| Component | RAM |
|-----------|-----|
| Docker daemon | ~80MB |
| Server container (capped at 400MB) | ~120-150MB typical |
| OS + system services | ~250-300MB |
| **Headroom on 1GB Pi** | **~400-500MB** |

### Native (no-Docker) fallback

If Docker overhead is unacceptable, the `apps/server/deploy/ai-dashboard.service` systemd unit + `pnpm bundle && pnpm deploy:pi -PiHost <host>` still works.

## RAM gate behaviour

| Available RAM | What the supervisor does |
|---------------|--------------------------|
| > `AID_RAM_THRESHOLD_MB` (default 4096 MB) | Allow all hooks |
| Between `RAM_HARD_LIMIT_MB` and `RAM_THRESHOLD_MB` | Respond `permissionDecision: "ask"` for `Agent` / `Task` / heavy `Bash` |
| < `AID_RAM_HARD_LIMIT_MB` (default 2048 MB) | Respond `permissionDecision: "deny"` and surface the queued state in the dashboard |

All other tools (`Read`, `Edit`, `Glob`, …) are never blocked.

## See also

Plan / architecture: [session plan](../../Users/ball2/.claude/plans/session-effervescent-starfish.md).
