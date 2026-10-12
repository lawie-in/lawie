import * as Sentry from '@sentry/node';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import logger from './config/logger';
import adminDocumentsRoutes from './routes/admin-documents.routes';
import adminOverviewRoutes from './routes/admin-overview.routes';
import adminUsersRoutes from './routes/admin-users.routes';
import appSettingsRoutes from './routes/app-settings.routes';
import courtsRoutes from './routes/courts.routes';
import creditsRoutes from './routes/credits.routes';
import documentsRoutes from './routes/documents.routes';
import intakeRoutes from './routes/intake.routes';
import internalRoutes from './routes/internal.routes';
import reviewRoutes from './routes/review.routes';
import sampleAssetsRoutes from './routes/sample-assets.routes';
import sectionsReadRoutes from './routes/sections-read.routes';
import sectionsRoutes from './routes/sections.routes';
import templatesRoutes from './routes/templates.routes';
import usersRoutes from './routes/users.routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'drafting', timestamp: new Date().toISOString() });
});

app.use('/templates', templatesRoutes);
app.use('/sections', sectionsReadRoutes); // T-290 — POST /sections/read
app.use('/sections', sectionsRoutes);
app.use('/courts', courtsRoutes);
app.use('/users', usersRoutes);
app.use('/', internalRoutes);
app.use('/', appSettingsRoutes);
app.use('/', creditsRoutes);
app.use('/', adminOverviewRoutes);
app.use('/', adminUsersRoutes);
app.use('/', adminDocumentsRoutes);
app.use('/', reviewRoutes);
app.use('/', intakeRoutes); // ADR-019 — /documents/intake through the gateway
app.use('/', documentsRoutes);
app.use('/sample-assets', sampleAssetsRoutes);

/**
 * T-307 — a body the JSON parser rejects gets a plain JSON reply that repeats
 * nothing the client sent. body-parser puts a slice of the body in err.message
 * (and the whole body in err.body), so neither is sent back or logged. This sits
 * before Sentry's handler and does not call next(), so these client errors never
 * reach Sentry or Express's default handler (which prints err.message to stderr).
 */
const BODY_PARSER_ERRORS: Record<string, { status: number; error: string }> = {
  'entity.parse.failed': { status: 400, error: 'Bad Request' },
  'entity.too.large': { status: 413, error: 'Payload Too Large' },
  'encoding.unsupported': { status: 415, error: 'Unsupported Media Type' },
  'charset.unsupported': { status: 415, error: 'Unsupported Media Type' },
};

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  const type = (err as { type?: unknown } | null)?.type;
  const known = typeof type === 'string' ? BODY_PARSER_ERRORS[type] : undefined;
  if (!known) return next(err);
  logger.debug({ method: req.method, path: req.path, type }, 'Request body rejected');
  res.status(known.status).json({ error: known.error });
});

Sentry.setupExpressErrorHandler(app);

app.use((req, res) => {
  logger.debug({ method: req.method, url: req.url }, 'Route not found');
  res.status(404).json({ error: 'Route not found', service: 'drafting' });
});

export default app;
