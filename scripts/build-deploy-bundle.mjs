import { execSync } from "node:child_process";
import { rmSync, mkdirSync, cpSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "..");
const out = resolve(root, "deploy-out");

function run(cmd, cwd = root) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
}

console.log("=== building deploy bundle ===");
run("pnpm --filter @ai-dashboard/web build");
run("pnpm --filter @ai-dashboard/server build");

console.log("=== staging files ===");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(resolve(root, "apps/server/dist"), resolve(out, "dist"), { recursive: true });
cpSync(resolve(root, "apps/server/public"), resolve(out, "public"), { recursive: true });
cpSync(resolve(root, "apps/server/deploy"), resolve(out, "deploy"), { recursive: true });
cpSync(resolve(root, "apps/server/package.json"), resolve(out, "package.json"));
cpSync(resolve(root, "packages/shared/src"), resolve(out, "shared-src"), { recursive: true });

const pkg = JSON.parse(execSync("cat apps/server/package.json", { cwd: root }).toString());
const piPkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: "module",
  main: "dist/index.js",
  scripts: { start: "node dist/index.js" },
  dependencies: pkg.dependencies,
};
writeFileSync(resolve(out, "package.json"), JSON.stringify(piPkg, null, 2));

const readme = `# AI Dashboard — Pi deploy bundle

## First-time install on Pi

\`\`\`bash
sudo apt update && sudo apt install -y nodejs npm cloudflared
mkdir -p ~/ai-dashboard && cd ~/ai-dashboard
# rsync this directory into ~/ai-dashboard
npm install --omit=dev
cp deploy/.env.example .env && chmod 600 .env
# edit .env to set AID_HMAC_SECRET
sudo cp deploy/ai-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ai-dashboard
sudo systemctl status ai-dashboard

# Cloudflare Tunnel
cloudflared tunnel login
cloudflared tunnel create ai-dashboard
sudo mkdir -p /etc/cloudflared && sudo cp deploy/cloudflared.config.yml /etc/cloudflared/config.yml
sudo cloudflared service install
\`\`\`

## Update

\`\`\`bash
# from dev machine: pnpm run deploy:pi
\`\`\`
`;
writeFileSync(resolve(out, "README.md"), readme);

if (!existsSync(resolve(out, "public/index.html"))) {
  console.warn("WARN: public/index.html missing — did web build run?");
}

console.log(`=== bundle ready at ${out} ===`);
console.log("Next: rsync deploy-out/ pi@<host>:~/ai-dashboard/");
