# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY apps/email-worker/package.json ./apps/email-worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/email-client/package.json ./packages/email-client/
RUN yarn install --frozen-lockfile
COPY apps/email-worker/ ./apps/email-worker/
COPY packages/shared/ ./packages/shared/
COPY packages/email-client/ ./packages/email-client/
RUN yarn workspace @lawie/shared build \
 && yarn workspace @lawie/email-client build \
 && yarn workspace @lawie/email-worker build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
COPY apps/email-worker/package.json ./apps/email-worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/email-client/package.json ./packages/email-client/
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=builder /app/apps/email-worker/dist ./apps/email-worker/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/email-client/dist ./packages/email-client/dist
WORKDIR /app/apps/email-worker
RUN addgroup -S lawie && adduser -S lawie -G lawie
USER lawie
EXPOSE 9100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:9100/health || exit 1
CMD ["node", "dist/index.js"]
