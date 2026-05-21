# TASKS — สิ่งที่เหลือก่อน production-ready

Updated: 2026-05-22

ภาพรวมตอนนี้:
- Code ✅ pushed → `Skyrocket2837/ai-dashboard` (main)
- CI workflow ✅ green (typecheck + 113 tests)
- Build workflow ✅ green — multi-arch image อยู่ที่ `ghcr.io/skyrocket2837/ai-dashboard-server:latest`
- Deploy workflow ❌ fail (secrets ยังว่าง + network path ยังไม่ตัดสินใจ)
- Pi side ❌ ยังไม่ลง Docker, ไม่มี `.env`, Cloudflare Tunnel config ยังชี้บริการเก่า
- Windows supervisor ❌ ยังไม่ register Task Scheduler, hooks ยังไม่ลง settings.json

---

## 1. ตัดสินใจ deploy path (BLOCKER)

GitHub Actions runner = cloud. Pi อยู่บ้านหลัง NAT. Runner เข้า Pi ตรงไม่ได้. เลือก 1 ใน 4:

| Option | Pros | Cons |
|--------|------|------|
| **A. Self-hosted runner บน Pi** | ไม่มี SSH, runner pull image เอง, ปลอดภัยสุด | กิน RAM Pi +50-100MB ระหว่าง job run |
| **B. Tailscale GitHub Action** | runner เข้า Tailnet ชั่วคราว, SSH ปกติ | ผูกกับ Tailscale account, setup ยุ่งกว่า |
| **C. Cloudflare Tunnel SSH (`cloudflared access ssh`)** | ใช้ tunnel ที่มีอยู่แล้ว, zero trust | ต้อง config Access policy + service token |
| **D. Manual deploy (ssh + docker compose pull เอง)** | ง่ายสุด, ไม่ต้อง secrets | ไม่ auto, ต้อง trigger ทุกครั้ง |

→ **Action**: เลือก A หรือ B (แนะนำ B ถ้ามี Tailscale อยู่แล้ว, A ถ้าไม่อยาก dep)

หลังเลือก → แก้ `.github/workflows/deploy.yml` ให้สอดคล้อง (ปัจจุบันเป็น path ssh ตรง).

---

## 2. Pi system prep (~30 นาที)

```bash
# 1. ติด Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# logout/login ใหม่ให้ group มีผล

# 2. ติด docker compose plugin (Pi OS Lite อาจไม่มี)
sudo apt install -y docker-compose-plugin

# 3. สร้าง workdir + .env
mkdir -p ~/ai-dashboard && cd ~/ai-dashboard

# 4. Generate HMAC secret (32-byte hex) — ต้องใช้ทั้ง Pi + Windows ค่าเดียวกัน
openssl rand -hex 32 > /tmp/hmac.txt
cat /tmp/hmac.txt   # save ไว้

# 5. สร้าง .env (chmod 600)
cat > ~/ai-dashboard/.env <<'EOF'
AID_HMAC_SECRET=<paste จากข้อ 4>
GHCR_OWNER=skyrocket2837
TAG=latest
AID_PORT=8787
AID_HOST=0.0.0.0
AID_DB_PATH=/data/ai-dashboard.db
AID_PUBLIC_DIR=/app/public
AID_LOG_LEVEL=info
NODE_ENV=production
EOF
chmod 600 ~/ai-dashboard/.env

# 6. Login GHCR (ต้องมี PAT scope read:packages ก่อน — สร้างที่ github.com/settings/tokens)
echo <PAT> | docker login ghcr.io -u Skyrocket2837 --password-stdin

# 7. ทดสอบ pull image
docker pull ghcr.io/skyrocket2837/ai-dashboard-server:latest

# 8. ทดสอบรันมือ (ก่อน CI/CD)
cd ~/ai-dashboard
# copy docker-compose.yml จาก repo
docker compose up -d
docker compose logs -f
curl http://127.0.0.1:8787/api/health   # ต้องได้ {"ok":true,...}
docker stats --no-stream                # check RAM container < 200MB
```

→ **Verify**: container start, health 200, RAM ใน budget

---

## 3. Cloudflare Tunnel — config ใหม่

ปัจจุบัน `cloudflared` PID 1426 รันอยู่ — ต้องดูว่า ingress เก่าชี้อะไร.

```bash
# 1. ดู config ปัจจุบัน
sudo cat /etc/cloudflared/config.yml

# 2. เพิ่ม ingress สำหรับ ai-dashboard
# Edit /etc/cloudflared/config.yml — เพิ่ม entry ก่อน catch-all:
#   ingress:
#     - hostname: ai-dashboard.<your-domain>
#       service: http://127.0.0.1:8787
#     - hostname: <existing>
#       service: ...
#     - service: http_status:404

# 3. ที่ Cloudflare Dashboard → Zero Trust → Networks → Tunnels
#    เพิ่ม Public Hostname: ai-dashboard.<your-domain>

# 4. restart
sudo systemctl restart cloudflared

# 5. ทดสอบจากเครื่องอื่น
curl https://ai-dashboard.<your-domain>/api/health
```

→ **Action**: บอกฉันว่า Cloudflare domain คืออะไร, ไม่งั้นใช้ Tailscale Funnel แทน

---

## 4. GitHub repo secrets

ตั้งที่ https://github.com/Skyrocket2837/ai-dashboard/settings/secrets/actions หรือผ่าน `gh secret set`:

```bash
gh secret set PI_HOST --repo Skyrocket2837/ai-dashboard --body "homepi.tailXXXX.ts.net"   # ถ้าใช้ Tailscale
gh secret set PI_USER --repo Skyrocket2837/ai-dashboard --body "alphabetb"
gh secret set PI_SSH_KEY --repo Skyrocket2837/ai-dashboard < ~/.ssh/id_ed25519_pi
gh secret set GHCR_USERNAME --repo Skyrocket2837/ai-dashboard --body "Skyrocket2837"
gh secret set GHCR_PULL_TOKEN --repo Skyrocket2837/ai-dashboard --body "ghp_xxxxx"   # PAT read:packages
```

ถ้าเลือก Self-hosted runner (Option A) แทน → ไม่ต้องตั้ง `PI_HOST/PI_USER/PI_SSH_KEY` แต่ต้อง register runner บน Pi:

```bash
# บน Pi (จาก repo Settings → Actions → Runners → New self-hosted runner)
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-arm64.tar.gz -L https://github.com/actions/runner/releases/download/v2.X.X/...
tar xzf ./actions-runner-linux-arm64.tar.gz
./config.sh --url https://github.com/Skyrocket2837/ai-dashboard --token <one-time-token>
sudo ./svc.sh install
sudo ./svc.sh start
```

แล้วแก้ `.github/workflows/deploy.yml` → `runs-on: self-hosted`, ตัด SSH steps ออก, แทนด้วย:

```yaml
- name: Pull and restart
  run: |
    cd ~/ai-dashboard
    docker compose pull
    docker compose up -d
    docker image prune -f
```

---

## 5. Trigger deploy + verify

หลังตั้ง secrets / runner:

```bash
# Trigger manual
gh workflow run deploy.yml --repo Skyrocket2837/ai-dashboard

# Watch
gh run watch --repo Skyrocket2837/ai-dashboard
```

Verify บน Pi:
```bash
ssh pi "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
ssh pi "curl -s localhost:8787/api/health"
# RAM check
ssh pi "docker stats --no-stream ai-dashboard-server"
ssh pi "free -m"
```

Verify จาก browser:
- เปิด `https://ai-dashboard.<your-domain>/` → ต้องเห็น SPA (อาจว่างเพราะยังไม่มี session)
- F12 → Network → `/api/sessions` → 200 `{sessions: []}`
- `/api/stream` → SSE connection อยู่

---

## 6. Windows supervisor setup

```powershell
# 1. ติด .env
cd G:\project\ai-dashboard\apps\supervisor
Copy-Item .env.example .env
# Edit .env:
#   AID_CLOUD_URL=https://ai-dashboard.<your-domain>
#   AID_HMAC_SECRET=<ค่าเดียวกับ Pi>

# 2. ทดสอบรัน manual ก่อน
cd G:\project\ai-dashboard
pnpm --filter @ai-dashboard/supervisor dev
# คนละ terminal:
curl http://127.0.0.1:7777/health   # ต้องได้ RAM info
# ต้องเห็น push log ทุก 1 วินาที ไป cloud

# 3. ดู dashboard
# เปิด https://ai-dashboard.<your-domain>/ — เห็น machine heartbeat update

# 4. Register Task Scheduler (start at logon)
pwsh -ExecutionPolicy Bypass -File .\scripts\register-task.ps1
Start-ScheduledTask -TaskName AIDashboardSupervisor

# 5. ติด Claude hooks
# Edit ~/.claude/settings.json — merge entries from
#   G:\project\ai-dashboard\apps\supervisor\claude-settings-snippet.json
# เข้ากับ "hooks" ที่มีอยู่ (caveman hooks ฯลฯ) — ห้าม overwrite

# 6. Test e2e
# เปิด Claude Code session ใหม่ → ดู dashboard:
#   - row ใหม่ขึ้น state=idle
#   - พิมพ์ prompt → state=working
#   - เรียก subagent → current_tool=Agent
```

---

## 7. Verify resource gate (มี/ไม่มีก็ได้)

```powershell
# ทดสอบ low-RAM mock
$env:AID_MOCK_RAM_MB="3000"; pnpm --filter @ai-dashboard/supervisor dev

# ใน Claude Code session ลองสั่ง subagent task
# ต้องเห็น dialog "RAM low — Confirm to proceed" (permissionDecision=ask)
# Dashboard row → state=queued

# ลด RAM ต่ำกว่า hard limit
$env:AID_MOCK_RAM_MB="1500"
# subagent task → block ทันที (permissionDecision=deny)
```

---

## 8. Optional polish (ทำทีหลังก็ได้)

- [ ] **Watchtower** บน Pi (ถ้าเปลี่ยนใจจาก SSH deploy → poll registry) — ต้องดู RAM cost
- [ ] **Slack/Discord webhook** ใน server เมื่อ session → `waiting-permission` (notify mobile)
- [ ] **Dashboard authentication** (currently HMAC สำหรับ supervisor, dashboard public via Cloudflare Tunnel) — เพิ่ม Cloudflare Access policy ถ้าจะแชร์
- [ ] **Mobile-friendly responsive** — ตอนนี้ desktop-first
- [ ] **Backup SQLite** — cron `sqlite3 /data/ai-dashboard.db ".backup /data/backup-$(date +%F).db"`
- [ ] **Multi-machine**: รัน supervisor หลายเครื่องชี้ cloud เดียว (โครง support อยู่แล้ว, แค่ใช้ AID_MACHINE override)
- [ ] **Better RAM smoothing**: ดู RAM moving average แทน instantaneous เพื่อกัน flicker
- [ ] **Auto-cancel done sessions** จาก dashboard view หลัง 1 ชม.
- [ ] **Native systemd fallback path** ใน README — ทดสอบและ document

---

## 9. Known issues / debt

- `.github/workflows/build-and-push.yml` รัน multi-arch (amd64+arm64) ทุกครั้ง — ใช้เวลา ~5-7 นาที. ถ้าอยากเร็วลด เป็น arm64-only (`platforms: linux/arm64`)
- pnpm-lock.yaml ถูก refresh 2 ครั้งใน history เพราะเปลี่ยน shared package.json — clean up ได้ผ่าน squash commit
- Dockerfile `pnpm deploy --filter=@ai-dashboard/server --prod /deploy` — ตรวจอีกที ว่า prod resolution ตัด devDependencies ถูก
- `docker-compose.yml` ใช้ `${GHCR_OWNER:-OWNER}` default = literal "OWNER" — ถ้าลืม set env จะ pull image ผิด → ควรตั้ง required check

---

## Quick reference

| คำสั่ง | ใช้ทำอะไร |
|--------|-----------|
| `pnpm test` | รัน 113 tests ทั้ง repo |
| `pnpm -r typecheck` | strict typecheck ทุก package |
| `pnpm dev:server` | Fastify dev :8787 |
| `pnpm dev:web` | Vite dev :5173 (proxy /api → :8787) |
| `pnpm dev:supervisor` | Node daemon :7777 |
| `pnpm bundle` | สร้าง deploy-out/ (native deploy path) |
| `gh run watch --repo Skyrocket2837/ai-dashboard` | poll CI/CD |
| `docker compose logs -f` (บน Pi) | server logs realtime |
