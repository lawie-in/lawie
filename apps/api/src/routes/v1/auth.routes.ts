import { Router } from 'express';

const router = Router();

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, role]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role:     { type: string, enum: [Admin, Lawyer, Client] }
 *               name:     { type: string }
 *     responses:
 *       201:
 *         description: User registered successfully
 *       409:
 *         description: Email already in use
 */
router.post('/register', (_req, res) => {
  // Placeholder — implementation in SCRUM-9
  res.status(501).json({ message: 'Not implemented yet — tracked in SCRUM-9' });
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login and get JWT tokens
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful, returns access + refresh tokens
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', (_req, res) => {
  res.status(501).json({ message: 'Not implemented yet — tracked in SCRUM-9' });
});

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', (_req, res) => {
  res.status(501).json({ message: 'Not implemented yet — tracked in SCRUM-9' });
});

export default router;
