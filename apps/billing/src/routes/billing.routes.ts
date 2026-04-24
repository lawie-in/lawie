import { Router, Request, Response } from 'express';

import logger from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import {
  createSubscription,
  getSubscriptionStatus,
  handleWebhookEvent,
  verifyWebhookSignature,
} from '../services/subscription.service';

const router = Router();

// POST /subscribe — create a Razorpay subscription and return the payment link
router.post('/subscribe', authenticate, async (req: Request, res: Response) => {
  try {
    const { sub: userId, email } = req.jwtPayload!;
    const result = await createSubscription(userId, email);
    res.json({ status: 'success', data: result });
  } catch (err) {
    logger.error({ err }, 'Failed to create subscription');
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// GET /status — return the user's current plan and subscription state
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { sub: userId } = req.jwtPayload!;
    const result = await getSubscriptionStatus(userId);
    res.json({ status: 'success', data: result });
  } catch (err) {
    logger.error({ err }, 'Failed to get subscription status');
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// POST /webhook/razorpay — receive Razorpay webhook events
// Raw body required for HMAC signature verification — mounted before express.json()
router.post('/webhook/razorpay', (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string;

  if (!signature) {
    res.status(400).json({ error: 'Missing signature header' });
    return;
  }

  if (!verifyWebhookSignature(req.body as Buffer, signature)) {
    logger.warn('Webhook signature verification failed');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  const payload = JSON.parse((req.body as Buffer).toString()) as {
    event: string;
    payload: Record<string, unknown>;
  };

  // Acknowledge immediately — process async so Razorpay doesn't retry
  res.json({ status: 'ok' });

  handleWebhookEvent(payload.event, payload.payload).catch((err) => {
    logger.error({ err, event: payload.event }, 'Webhook handler error');
  });
});

export default router;
