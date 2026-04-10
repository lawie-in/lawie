import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { swaggerOptions } from './config/swagger';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import v1Router from './routes/v1';

const app: Application = express();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// ── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ── Body parsing & compression ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ── Swagger docs ─────────────────────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

// ── Health check ─────────────────────────────────────────────────────────────
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'lawie-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1', v1Router);

// ── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
