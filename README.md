# AI Dashboard

Multi-session Claude Code orchestrator + live remote dashboard. Server runs on Raspberry Pi (1GB RAM works), dev machines push events via Cloudflare Tunnel.

## How it works

```
┌──────────────────────┐         HTTPS         ┌──────────────────────┐
│  Dev machine         │  ──────────────────►  │  Cloudflare Tunnel   │
│  Claude Code hooks   │     (HMAC-signed)     │  (no inbound port)   │
│    ↓                 │                       │           ↓          │
│  supervisor.mjs      │                       │  Pi server (:8787)   │
│  (RAM gate + push)   │                       │  Fastify + SQLite    │
└──────────────────────┘                       └──────────┬───────────┘
                                                          ↓ SSE
                                              ┌──────────────────────┐
                                              │  Web dashboard       │
                                              │  https://dashboard.…  │
                                              └──────────────────────┘
```

| Path | Role | Where |
|------|------|-------|
| `apps/server` | Fastify + SQLite + SSE | Pi (Docker) |
| `apps/web` | Preact SPA | bundled into server image |
| `apps/supervisor` | Hook bridge + RAM gate | dev machine |
| `packages/shared` | Types + HMAC helpers | — |

---

## Part 1 — Pi server setup

### 1.1 Prereqs on Pi

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out + back in
```

### 1.2 Login to GHCR

Image lives at `ghcr.io/<owner>/ai-dashboard-server`. Pull needs a PAT (read:packages):

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u <github-username> --password-stdin
```

### 1.3 Project files on Pi

```bash
mkdir -p ~/ai-dashboard && cd ~/ai-dashboard
# upload docker-compose.yml + .env (or scp from your machine)
```

`.env` (chmod 600):

```bash
AID_HMAC_SECRET=<32-byte hex — run: openssl rand -hex 32>
AID_PORT=8787
AID_HOST=0.0.0.0
AID_DB_PATH=/data/ai-dashboard.db
AID_PUBLIC_DIR=/app/public
AID_LOG_LEVEL=info
AID_EVENT_RETENTION_DAYS=7
AID_PRUNE_INTERVAL_MS=3600000
NODE_ENV=production
```

`docker-compose.yml` — uses external `tunnel_net` so cloudflared can reach the container by service name:

```yaml
services:
  server:
    image: ghcr.io/${GHCR_OWNER}/ai-dashboard-server:${TAG:-latest}
    container_name: ai-dashboard-server
    restart: unless-stopped
    ports:
      - "8787:8787"
    env_file:
      - .env
    volumes:
      - ai-dashboard-data:/data
    networks:
      - app_internal
      - tunnel_net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8787/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    mem_limit: 400m

volumes:
  ai-dashboard-data:

networks:
  app_internal:
    driver: bridge
  tunnel_net:
    external: true
```

Create `tunnel_net` once if it doesn't exist:

```bash
docker network create tunnel_net
```

### 1.4 Start server

```bash
export GHCR_OWNER=<github-username>
export TAG=latest
docker compose pull
docker compose up -d
docker compose ps                  # should show "healthy"
curl http://localhost:8787/api/health
# → {"ok":true,"uptime_s":...,"sse_clients":0}
```

---

## Part 2 — Cloudflare Tunnel route

Assumes you already have a `cloudflared` container running (token-managed, joined to `tunnel_net`).

1. Open https://one.dash.cloudflare.com → **Networks → Tunnels**
2. Pick your tunnel → **Public Hostname → Add a public hostname**
3. Fill in:
   - **Subdomain:** `dashboard`
   - **Domain:** `<your-domain>`
   - **Service Type:** `HTTP`
   - **URL:** `ai-dashboard-server:8787` (container name + internal port)
4. Save. Tunnel reloads config automatically.

Verify:

```bash
curl https://dashboard.<your-domain>/api/health
```

Open the URL in a browser → AI Dashboard UI loads, says "No supervisor connected".

---

## Part 3 — Supervisor on dev machine

### 3.1 Clone + install

```powershell
git clone https://github.com/<owner>/ai-dashboard.git
cd ai-dashboard
pnpm install
```

### 3.2 Configure supervisor

```powershell
cd apps\supervisor
copy .env.example .env
notepad .env
```

Set:

```
AID_CLOUD_URL=https://dashboard.<your-domain>
AID_HMAC_SECRET=<exact same value as Pi .env>
```

> ⚠️ `AID_HMAC_SECRET` must match the Pi byte-for-byte. Mismatch → `HTTP 401` push errors.

### 3.3 Start supervisor

```powershell
pnpm start
```

Expected log:

```
[supervisor] listening on http://127.0.0.1:7777
[supervisor] machine=<hostname> cloud=https://dashboard.<your-domain>
```

The dashboard tile will show your machine + RAM stats within a few seconds.

> Requires Node 20.12+ for the `--env-file-if-exists` flag wired into `pnpm start`.

### 3.4 Wire Claude Code hooks

Open `~/.claude/settings.json` and merge the entries from `apps/supervisor/claude-settings-snippet.json` into the top-level `"hooks"` object. **Don't overwrite** existing hooks — merge arrays.

Minimal additions:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "pwsh -NoProfile -ExecutionPolicy Bypass -File G:\\project\\ai-dashboard\\apps\\supervisor\\scripts\\hook-bridge.ps1" }] }
    ],
    "UserPromptSubmit": [ /* same command */ ],
    "PreToolUse":      [{ "matcher": "Agent|Task|Bash", "hooks": [/* same */] }],
    "PostToolUse":     [{ "matcher": "Agent|Task|Bash", "hooks": [/* same */] }],
    "Notification":    [{ "matcher": "*",               "hooks": [/* same */] }],
    "Stop":            [{ "matcher": "*",               "hooks": [/* same */] }],
    "SubagentStop":    [{ "matcher": "*",               "hooks": [/* same */] }]
  }
}
```

Open a **new** Claude Code session — hooks load on startup. Dashboard should now show `1 active`.

---

## Part 4 — Verify end-to-end

| Check | Command | Expected |
|-------|---------|----------|
| Pi container healthy | `docker compose ps` | `Up X (healthy)` |
| Server reachable locally | `curl http://localhost:8787/api/health` | `{"ok":true,...}` |
| Tunnel route live | `curl https://dashboard.<domain>/api/health` | same |
| Supervisor running | check terminal | `cloud=https://...` (not `cloud=none`) |
| HMAC matches | check terminal | no `HTTP 401` lines |
| Hooks firing | open new Claude Code session | dashboard shows session |

---

## RAM gating

| Available RAM | Behaviour |
|---------------|-----------|
| `> AID_RAM_THRESHOLD_MB` (default 4096) | Allow all |
| `RAM_HARD_LIMIT_MB` … `RAM_THRESHOLD_MB` | `Agent` / `Task` / heavy `Bash` → `permissionDecision: "ask"` |
| `< AID_RAM_HARD_LIMIT_MB` (default 2048) | Same tools → `permissionDecision: "deny"`, queued in dashboard |

`Read`, `Edit`, `Glob`, etc. are never gated.

---

## CI / CD

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | PR / push | typecheck + tests (113 tests) |
| `build-and-push.yml` | push to `main` | multi-arch (`amd64`,`arm64`) build → GHCR |
| `deploy.yml` | after build / manual | SCP compose + `docker compose pull && up -d` on Pi |

Required GitHub secrets:

| Secret | Purpose |
|--------|---------|
| `PI_HOST` / `PI_USER` / `PI_SSH_KEY` | SSH to Pi |
| `GHCR_USERNAME` / `GHCR_PULL_TOKEN` | Pi-side image pull |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[push] failed: HTTP 401` | HMAC mismatch | sync `AID_HMAC_SECRET` on Pi + dev machine |
| `[push] failed: HTTP 502` | Pi server restarting | wait, or `docker compose logs server` |
| `cloud=none` | `.env` not loaded | use `pnpm start` (loads via `--env-file-if-exists`), or upgrade Node ≥ 20.12 |
| Tunnel 404 | hostname route missing | add Public Hostname in Cloudflare Zero Trust |
| `No such container: cloudflared` | wrong container name | `docker ps` to find real name |
| Dashboard "No supervisor connected" | supervisor not running, or `AID_CLOUD_URL` empty | check supervisor terminal log |
| `0 active` after starting Claude Code | hooks not merged | reopen `~/.claude/settings.json`, merge snippet, restart session |

---

## Dev loop (run everything locally without Pi)

```powershell
pnpm install

# terminal 1 — server
$env:AID_HMAC_SECRET = (1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) }) -join ''
pnpm dev:server          # :8787

# terminal 2 — web
pnpm dev:web             # :5173 (proxies /api → :8787)

# terminal 3 — supervisor (point at local server)
# .env: AID_CLOUD_URL=http://127.0.0.1:8787, same AID_HMAC_SECRET
pnpm dev:supervisor      # :7777
```

## Tests

```powershell
pnpm test         # 113 tests
pnpm typecheck    # strict TS across all packages
```
