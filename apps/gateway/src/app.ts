import http from 'http';
import type { Socket } from 'net';

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { env } from './config/env';
import logger from './config/logger';

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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use('/api', limiter as any);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
});

// ── Proxy configuration ─────────────────────────────────────────────────────
// http-proxy-middleware v3: on.error res can be Socket (WebSocket) or ServerResponse (HTTP).
// We only handle HTTP here — check instanceof before calling response methods.
const proxyOptions = {
  changeOrigin: true,
  on: {
    error: (err: Error, _req: express.Request, res: http.ServerResponse | Socket) => {
      logger.error({ err }, 'Proxy error');
      if (res instanceof http.ServerResponse && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service unavailable' }));
      }
    },
  },
};

// Express strips the mount path before http-proxy-middleware sees it.
// e.g. POST /api/auth/register → proxy receives /register → auth:4001/register
// No pathRewrite needed — service routes live at root within each service.
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: env.AUTH_SERVICE_URL,
    ...proxyOptions,
  }),
);

app.use(
  '/api/documents',
  createProxyMiddleware({
    target: env.DRAFTING_SERVICE_URL,
    ...proxyOptions,
  }),
);

app.use(
  '/api/billing',
  createProxyMiddleware({
    target: env.BILLING_SERVICE_URL,
    ...proxyOptions,
  }),
);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', service: 'gateway' });
});

export default app;
