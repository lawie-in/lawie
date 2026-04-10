# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN yarn install --frozen-lockfile

# ── Stage 2: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

WORKDIR /app/apps/web
RUN yarn build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S lawie && adduser -S lawie -G lawie

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=lawie:lawie /app/apps/web/.next/standalone ./
COPY --from=builder --chown=lawie:lawie /app/apps/web/.next/static ./apps/web/.next/static

USER lawie

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "apps/web/server.js"]
