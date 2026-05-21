# syntax=docker/dockerfile:1.7

# Stage 1: build TypeScript on BUILDPLATFORM (fast, native).
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@8.6.8 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY apps/web ./apps/web
COPY apps/supervisor/package.json ./apps/supervisor/

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm --filter @ai-dashboard/shared build \
 && ls -la packages/shared/dist \
 && pnpm --filter @ai-dashboard/web build \
 && pnpm --filter @ai-dashboard/server build

# Use pnpm deploy to flatten server + its transitive workspace deps into one dir.
RUN pnpm deploy --filter=@ai-dashboard/server --prod /deploy

# Stage 2: rebuild native modules on TARGETPLATFORM (better-sqlite3 needs arm64 .node).
FROM --platform=$TARGETPLATFORM node:22-alpine AS native-deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY --from=builder /deploy/package.json ./
COPY --from=builder /deploy/node_modules ./node_modules

# Force rebuild better-sqlite3 against TARGETPLATFORM toolchain.
RUN cd node_modules/better-sqlite3 && npm rebuild better-sqlite3

# Stage 3: runtime.
FROM --platform=$TARGETPLATFORM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV AID_HOST=0.0.0.0
ENV AID_PORT=8787
ENV AID_DB_PATH=/data/ai-dashboard.db
ENV AID_PUBLIC_DIR=/app/public

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodeapp \
 && mkdir -p /data \
 && chown -R nodeapp:nodejs /data

COPY --from=native-deps --chown=nodeapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeapp:nodejs /workspace/apps/server/dist ./dist
COPY --from=builder --chown=nodeapp:nodejs /workspace/apps/server/public ./public
COPY --from=builder --chown=nodeapp:nodejs /workspace/apps/server/package.json ./package.json

USER nodeapp
EXPOSE 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "dist/index.js"]
