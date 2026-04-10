import { Router } from 'express';
import authRoutes from './auth.routes';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication and session management
 *   - name: System
 *     description: System health and meta endpoints
 */

router.use('/auth', authRoutes);

// Future routes
// router.use('/users',     userRoutes);
// router.use('/cases',     caseRoutes);
// router.use('/documents', documentRoutes);

export default router;
