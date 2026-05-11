import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import passport from 'passport';

import { env } from './config/env';
import { initPassport } from './config/passport';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import oauthRoutes from './routes/oauth.routes';
import referralRoutes from './routes/referral.routes';

// Initialise Passport strategies before routes
initPassport();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// passport.initialize() returns a Handler; cast resolves @types/passport / express overload mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use(passport.initialize() as any);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() });
});

app.use('/', authRoutes);
app.use('/', oauthRoutes);
app.use('/', referralRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', service: 'auth' });
});

Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export default app;
