FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile
COPY apps/gateway/ ./apps/gateway/
COPY packages/shared/ ./packages/shared/
WORKDIR /app/packages/shared
RUN yarn build
WORKDIR /app/apps/gateway
RUN yarn build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
WORKDIR /app/apps/gateway
RUN addgroup -S lawie && adduser -S lawie -G lawie
USER lawie
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/index.js"]
