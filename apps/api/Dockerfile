# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for workspace
COPY package.json yarn.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including dev)
RUN yarn install --frozen-lockfile

# Copy source
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/

# Build shared package and API
WORKDIR /app/packages/shared
RUN yarn build || true

WORKDIR /app/apps/api
RUN yarn build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy only production package files
COPY package.json yarn.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install production dependencies only
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copy built output
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

WORKDIR /app/apps/api

# Security: run as non-root
RUN addgroup -S lawie && adduser -S lawie -G lawie
USER lawie

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "dist/index.js"]
