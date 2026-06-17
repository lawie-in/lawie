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
import documentsRoutes from './routes/documents.routes';
import internalRoutes from './routes/internal.routes';
import reviewRoutes from './routes/review.routes';
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
app.use('/', documentsRoutes);

Sentry.setupExpressErrorHandler(app);

app.use((req, res) => {
  logger.debug({ method: req.method, url: req.url }, 'Route not found');
  res.status(404).json({ error: 'Route not found', service: 'drafting' });
});

export default app;
