import { createJsonBodyErrorHandler } from '@lawie/shared';
import express from 'express';

import { env } from './config/env';
import { logger } from './config/logger';
import { anyTemplateUnfilled, isLiveSend } from './placeholders';
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
    // T-379: in live mode the workers do not start while a footer placeholder is unfilled
    // (worker.ts startWorkers), so report that as unhealthy. Dry run stays 200.
    if (isLiveSend() && anyTemplateUnfilled()) {
      res.status(503).json({
        status: 'unhealthy',
        reason: 'unfilled_footer_placeholders',
        service: 'email-worker',
        provider: env.EMAIL_PROVIDER,
        dryRun: env.EMAIL_DRY_RUN,
        timestamp: new Date().toISOString(),
      });
      return;
    }
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
