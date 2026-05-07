# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY apps/auth/package.json ./apps/auth/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile
COPY apps/auth/ ./apps/auth/
COPY packages/shared/ ./packages/shared/
RUN yarn workspace @lawie/shared build && yarn workspace @lawie/auth build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
COPY apps/auth/package.json ./apps/auth/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=builder /app/apps/auth/dist ./apps/auth/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
WORKDIR /app/apps/auth
RUN addgroup -S lawie && adduser -S lawie -G lawie
USER lawie
EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4001/health || exit 1
CMD ["node", "dist/index.js"]
