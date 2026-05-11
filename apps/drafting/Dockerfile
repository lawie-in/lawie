# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY apps/drafting/package.json ./apps/drafting/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile
COPY apps/drafting/ ./apps/drafting/
COPY packages/shared/ ./packages/shared/
COPY docs/templates ./docs/templates
RUN yarn workspace @lawie/shared build && yarn workspace @lawie/drafting build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# Chromium for Puppeteer server-side PDF rendering
RUN apk add --no-cache chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY package.json yarn.lock ./
COPY apps/drafting/package.json ./apps/drafting/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=builder /app/apps/drafting/dist ./apps/drafting/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY docs/templates ./docs/templates
WORKDIR /app/apps/drafting
RUN addgroup -S lawie && adduser -S lawie -G lawie
USER lawie
EXPOSE 4002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4002/health || exit 1
CMD ["node", "dist/index.js"]
