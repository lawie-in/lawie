import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import logger from './config/logger';
import billingRoutes from './routes/billing.routes';

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

app.use((req, res) => {
  logger.debug({ method: req.method, url: req.url }, 'Route not found');
  res.status(404).json({ error: 'Route not found', service: 'billing' });
});

export default app;
