# syntax=docker/dockerfile:1
# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
ENV HUSKY=0

COPY package.json yarn.lock ./
COPY .husky/install.mjs ./.husky/
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

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# T-543: NEXT_PUBLIC_* values are inlined by `next build`, so each one must be a build ARG.
# Empty or unset keeps the footer fallback ("For complaints, write to contact@lawie.in.").
ARG NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME
ENV NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME=$NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME

WORKDIR /app/apps/web
RUN yarn build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S lawie && adduser -S lawie -G lawie

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=lawie:lawie /app/apps/web/.next/standalone ./
COPY --from=builder --chown=lawie:lawie /app/apps/web/.next/static ./apps/web/.next/static

USER lawie

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "apps/web/server.js"]
