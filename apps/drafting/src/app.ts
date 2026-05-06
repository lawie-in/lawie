import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import logger from './config/logger';
import courtsRoutes from './routes/courts.routes';
import documentsRoutes from './routes/documents.routes';
import sectionsRoutes from './routes/sections.routes';
import templatesRoutes from './routes/templates.routes';

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
app.use('/', documentsRoutes);

Sentry.setupExpressErrorHandler(app);

app.use((req, res) => {
  logger.debug({ method: req.method, url: req.url }, 'Route not found');
  res.status(404).json({ error: 'Route not found', service: 'drafting' });
});

export default app;
