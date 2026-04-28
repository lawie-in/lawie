import http from 'http';
import type { Socket } from 'net';

import { INTERNAL_HEADERS } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { env } from './config/env';
import logger from './config/logger';
import { authenticate } from './middleware/authenticate';
import { createPlanRateLimiter, publicRateLimiter } from './middleware/rateLimiter';
import { sessionCheck } from './middleware/sessionCheck';

const planRateLimiter = createPlanRateLimiter();

const app = express();

// ── Security & performance ───────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  }),
);
// @types/compression doesn't perfectly align with @types/express overloads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use(compression() as any);

// ── Strip spoofed internal headers from client requests ─────────────────────
app.use((req, _res, next) => {
  for (const key of Object.values(INTERNAL_HEADERS)) {
    delete req.headers[key];
  }
  next();
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
});

// ── Proxy error handler (shared) ────────────────────────────────────────────
const onProxyError = (err: Error, _req: express.Request, res: http.ServerResponse | Socket) => {
  logger.error({ err }, 'Proxy error');
  if (res instanceof http.ServerResponse && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service unavailable' }));
  }
};

// ── Proxy with internal headers (for authenticated routes) ──────────────────
function createAuthenticatedProxy(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req) => {
        const expressReq = req as express.Request;
        proxyReq.setHeader(INTERNAL_HEADERS.SECRET, env.INTERNAL_SECRET);
        if (expressReq.jwtPayload) {
          proxyReq.setHeader(INTERNAL_HEADERS.USER_ID, expressReq.jwtPayload.sub);
          proxyReq.setHeader(INTERNAL_HEADERS.USER_EMAIL, expressReq.jwtPayload.email);
          proxyReq.setHeader(INTERNAL_HEADERS.USER_ROLE, expressReq.jwtPayload.role);
          proxyReq.setHeader(INTERNAL_HEADERS.USER_PLAN, expressReq.jwtPayload.plan);
          proxyReq.setHeader(INTERNAL_HEADERS.USER_NAME, expressReq.jwtPayload.name);
        }
      },
      error: onProxyError,
    },
  });
}

function createPublicProxy(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: { error: onProxyError },
  });
}

// ── PUBLIC auth routes (no JWT required) ────────────────────────────────────
// These auth endpoints must be accessible without a valid session:
// login, register, forgot-password, reset-password, Google OAuth, refresh
app.use('/api/auth', publicRateLimiter, createPublicProxy(env.AUTH_SERVICE_URL));

// ── PUBLIC sections routes (no JWT required) ────────────────────────────────
// Section mapping API is public — powers free tools (SCRUM-46/47/48)
app.use('/api/sections', publicRateLimiter, createPublicProxy(env.DRAFTING_SERVICE_URL));

// ── AUTHENTICATED routes ────────────────────────────────────────────────────
// Everything else goes through: JWT validation → session check → rate limit → proxy

app.use(
  '/api/documents',
  authenticate,
  sessionCheck,
  planRateLimiter,
  createAuthenticatedProxy(env.DRAFTING_SERVICE_URL),
);

app.use(
  '/api/templates',
  authenticate,
  sessionCheck,
  planRateLimiter,
  createAuthenticatedProxy(env.DRAFTING_SERVICE_URL),
);

app.use(
  '/api/billing',
  authenticate,
  sessionCheck,
  planRateLimiter,
  createAuthenticatedProxy(env.BILLING_SERVICE_URL),
);

// ── Sentry error handler ────────────────────────────────────────────────────
Sentry.setupExpressErrorHandler(app);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', service: 'gateway' });
});

export default app;
