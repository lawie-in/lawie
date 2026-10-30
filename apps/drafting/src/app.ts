import { createJsonBodyErrorHandler } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import logger from './config/logger';
import adminDocumentsRoutes from './routes/admin-documents.routes';
import adminOverviewRoutes from './routes/admin-overview.routes';
import adminUsersRoutes from './routes/admin-users.routes';
import appSettingsRoutes from './routes/app-settings.routes';
import courtsRoutes from './routes/courts.routes';
import creditsRoutes from './routes/credits.routes';
import dashboardRoutes from './routes/dashboard.routes';
import documentsRoutes from './routes/documents.routes';
import inkHistoryRoutes from './routes/ink-history.routes';
import intakeRoutes from './routes/intake.routes';
import internalRoutes from './routes/internal.routes';
import reviewRoutes from './routes/review.routes';
import sampleAssetsRoutes from './routes/sample-assets.routes';
import sectionsReadRoutes from './routes/sections-read.routes';
import sectionsRoutes from './routes/sections.routes';
import templatesRoutes from './routes/templates.routes';
import usersRoutes from './routes/users.routes';
import { getConfigWarnings } from './services/app-settings.service';
import {
  toolFeatures,
  toolGuard,
  TOOL_BAIL_CHECKER_SETTING,
  TOOL_TIMELINE_SETTING,
} from './services/feature-switches';
import { signedTableHashes } from './services/signed-tables';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'drafting',
    timestamp: new Date().toISOString(),
    // T-371 (ADR-025 D2): SHA-256 of the raw bytes of each signed table served.
    signedTables: signedTableHashes(),
    // T-585: required AI setting keys missing at the last read. In memory, no DB call.
    config_warnings: getConfigWarnings(),
  });
});

app.use('/templates', templatesRoutes);
// T-375 (Arjun, 13 Oct 2026): the two tools' flags for the web pages, UX only.
// Only these two booleans, never the AppSetting list. Mounted before the
// guards and the sections routers so neither can shadow or block it. Last
// known values only: no Mongo or Redis on this path (T-371 AC2).
app.get('/sections/features', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(toolFeatures());
});
// T-375: the tool APIs 404 on the server while their switch is off (last known value).
app.use('/sections/bail-check', toolGuard(TOOL_BAIL_CHECKER_SETTING));
app.use('/sections/timeline', toolGuard(TOOL_TIMELINE_SETTING));
app.use('/sections', sectionsReadRoutes); // T-290 — POST /sections/read
app.use('/sections', sectionsRoutes);
app.use('/courts', courtsRoutes);
app.use('/users', usersRoutes);
app.use('/', internalRoutes);
app.use('/', appSettingsRoutes);
app.use('/', creditsRoutes);
app.use('/', inkHistoryRoutes); // T-646 — GET /credits/history
app.use('/', dashboardRoutes); // T-506 — GET /dashboard/summary
app.use('/', adminOverviewRoutes);
app.use('/', adminUsersRoutes);
app.use('/', adminDocumentsRoutes);
app.use('/', reviewRoutes);
app.use('/', intakeRoutes); // ADR-019 — /documents/intake through the gateway
app.use('/', documentsRoutes);
app.use('/sample-assets', sampleAssetsRoutes);

// T-307 / T-315 — rejected bodies get a plain JSON 4xx that echoes nothing (shared handler).
app.use(createJsonBodyErrorHandler({ logger }));

Sentry.setupExpressErrorHandler(app);

app.use((req, res) => {
  logger.debug({ method: req.method, url: req.url }, 'Route not found');
  res.status(404).json({ error: 'Route not found', service: 'drafting' });
});

export default app;
