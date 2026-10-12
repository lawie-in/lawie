import { createJsonBodyErrorHandler } from '@lawie/shared';
import express from 'express';

import { env } from './config/env';
import { logger } from './config/logger';
import { sendHandler } from './routes/send';

/**
 * Minimal HTTP surface — /health for docker-compose + future liveness probes,
 * POST /send for internal callers. Built here (not in index.ts) so it can be
 * tested without starting the BullMQ workers or listening on a port.
 */
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'email-worker',
      provider: env.EMAIL_PROVIDER,
      dryRun: env.EMAIL_DRY_RUN,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/send', (req, res) => void sendHandler(req, res));

  // T-315 — rejected bodies get a plain JSON 4xx that echoes nothing.
  app.use(createJsonBodyErrorHandler({ logger }));

  return app;
}
