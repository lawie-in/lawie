FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY apps/billing/package.json ./apps/billing/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile
COPY apps/billing/ ./apps/billing/
COPY packages/shared/ ./packages/shared/
WORKDIR /app/packages/shared
RUN yarn build
WORKDIR /app/apps/billing
RUN yarn build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
COPY apps/billing/package.json ./apps/billing/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=builder /app/apps/billing/dist ./apps/billing/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
WORKDIR /app/apps/billing
RUN addgroup -S lawie && adduser -S lawie -G lawie
USER lawie
EXPOSE 4003
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4003/health || exit 1
CMD ["node", "dist/index.js"]
