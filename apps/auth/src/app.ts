import { createJsonBodyErrorHandler } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import passport from 'passport';

import { env } from './config/env';
import logger from './config/logger';
import { initPassport } from './config/passport';
import { errorHandler } from './middleware/errorHandler';
import adminAuditRoutes from './routes/admin-audit.routes';
import adminUsersRoutes from './routes/admin-users.routes';
import authRoutes from './routes/auth.routes';
import consentRoutes from './routes/consent.routes';
import internalUnverifiedNoticeRoutes from './routes/internal-unverified-notice.routes';
import internalVerifyRoutes from './routes/internal-verify.routes';
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
// T-310: before the global parser; the route parses its own body (1 KB) and handles its own errors.
app.use('/', consentRoutes);
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
app.use('/', adminUsersRoutes);
app.use('/', adminAuditRoutes);
// T-223 — email worker only (INTERNAL_SECRET); the gateway 404s every /internal/ path.
app.use('/', internalVerifyRoutes);
// T-358 — email worker only (INTERNAL_SECRET): the unverified-account deletion notice.
app.use('/', internalUnverifiedNoticeRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', service: 'auth' });
});

// T-315 — json/urlencoded parse, size and encoding errors get a plain JSON 4xx that echoes
// nothing; they never reach Sentry or errorHandler (which would log and 500 them).
app.use(createJsonBodyErrorHandler({ logger }));

Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export default app;
