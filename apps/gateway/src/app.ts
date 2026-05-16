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
// pathRewrite: proxy strips '/api/sections' mount → '/map'; prepend '/sections' for drafting
app.use(
  '/api/sections',
  publicRateLimiter,
  createProxyMiddleware({
    target: env.DRAFTING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/sections/' },
    on: { error: onProxyError },
  }),
);

// ── PUBLIC courts routes (no JWT required) ──────────────────────────────────
// Courts reference data powers cascading dropdowns in document forms (SCRUM-50)
app.use(
  '/api/courts',
  publicRateLimiter,
  createProxyMiddleware({
    target: env.DRAFTING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/courts/' },
    on: { error: onProxyError },
  }),
);

// ── PUBLIC billing catalog (no JWT required) — SCRUM-73 ─────────────────────
// /api/billing/plans powers the public /pricing page (3 plans + 3 top-up SKUs).
// Must be declared BEFORE the authenticated /api/billing proxy below so Express
// picks the more specific path first. Other /api/billing/* routes (subscribe,
// topup/order, plan/:id) stay behind authChain.
app.use(
  '/api/billing/plans',
  publicRateLimiter,
  createProxyMiddleware({
    target: env.BILLING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/plans' },
    on: { error: onProxyError },
  }),
);

// ── Dev bypass middleware (development only) ────────────────────────────────
// Postman: set header X-Dev-Bypass: true to skip JWT + session check.
// Optionally set X-Dev-User-Plan: pro|free, X-Dev-User-Email, X-Dev-User-Name.
function devBypass(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (env.NODE_ENV !== 'development' || req.headers['x-dev-bypass'] !== 'true') {
    next();
    return;
  }
  // Inject mock JWT payload so downstream middleware/proxy sees a valid user
  req.jwtPayload = {
    sub: (req.headers['x-dev-user-id'] as string) ?? '000000000000000000000000',
    email: (req.headers['x-dev-user-email'] as string) ?? 'dev@lawie.in',
    name: (req.headers['x-dev-user-name'] as string) ?? 'Dev User',
    role: 'Client',
    plan: (req.headers['x-dev-user-plan'] as string) ?? 'pro',
    type: 'access',
  };
  req.tokenHash = 'dev-bypass-no-token-hash';
  next();
}

// ── AUTHENTICATED routes ────────────────────────────────────────────────────
// Everything else goes through: JWT validation → session check → rate limit → proxy
// In development, X-Dev-Bypass: true skips JWT + session check.

const authChain =
  env.NODE_ENV === 'development'
    ? [devBypass, authenticate, sessionCheck]
    : [authenticate, sessionCheck];

app.use(
  '/api/documents',
  ...authChain,
  planRateLimiter,
  createAuthenticatedProxy(env.DRAFTING_SERVICE_URL),
);

app.use(
  '/api/templates',
  ...authChain,
  planRateLimiter,
  createAuthenticatedProxy(env.DRAFTING_SERVICE_URL),
);

app.use(
  '/api/billing',
  ...authChain,
  planRateLimiter,
  createAuthenticatedProxy(env.BILLING_SERVICE_URL),
);

// Per-user resources owned by drafting service (Section Finder bookmarks +
// recent searches — SCRUM-83). pathRewrite prepends `/users/` so drafting's
// `app.use('/users', usersRoutes)` mount matches — Express otherwise strips
// the /api/users prefix and would send drafting `/me/bookmarks/sections`
// which is not under /users.
app.use(
  '/api/users',
  ...authChain,
  planRateLimiter,
  createProxyMiddleware({
    target: env.DRAFTING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/users/' },
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
  }),
);

// ── Sentry error handler ────────────────────────────────────────────────────
Sentry.setupExpressErrorHandler(app);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', service: 'gateway' });
});

export default app;
