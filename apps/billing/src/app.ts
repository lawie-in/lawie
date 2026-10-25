import { createJsonBodyErrorHandler } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import logger from './config/logger';
import adminBillingRoutes from './routes/admin-billing.routes';
import billingRoutes from './routes/billing.routes';
import couponRoutes from './routes/coupon.routes';
import internalRoutes from './routes/internal.routes';

const app = express();

app.use(helmet());
app.use(cors());

// Webhook route needs the raw body for HMAC signature verification.
// Mount it BEFORE express.json() so it receives the raw Buffer.
app.use('/webhook/razorpay', express.raw({ type: 'application/json' }));

// All other routes use JSON
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'billing', timestamp: new Date().toISOString() });
});

app.use('/', billingRoutes);
app.use('/', adminBillingRoutes);
app.use('/', couponRoutes);
app.use('/', internalRoutes); // T-115c erase-user, subscription-status (auth); T-436 invoice email-view (email-worker)

// T-315 — rejected bodies (json and the webhook's raw parser) get a plain JSON 4xx that echoes nothing.
app.use(createJsonBodyErrorHandler({ logger }));

Sentry.setupExpressErrorHandler(app);

app.use((req, res) => {
  logger.debug({ method: req.method, url: req.url }, 'Route not found');
  res.status(404).json({ error: 'Route not found', service: 'billing' });
});

export default app;
