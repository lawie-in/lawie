import { Router, Request, Response } from 'express';
import passport from 'passport';

import { env } from '../config/env';
import { IUser } from '../models/User.model';
import { generateTokenPair } from '../services/jwt.service';
import { createSession } from '../services/session.service';

const router = Router();

const oauthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// GET /google — redirect to Google consent screen
router.get(
  '/google',
  (req: Request, res: Response, next) => {
    if (!oauthEnabled) {
      return res.status(503).json({
        error: 'Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      });
    }
    return next();
  },
  passport.authenticate('google', { scope: ['email', 'profile'], session: false }),
);

// GET /google/callback — Google redirects here after user consent
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${env.FRONTEND_URL}/login?error=oauth_failed`,
  }),
  async (req: Request, res: Response) => {
    // Passport sets req.user to the Mongoose document via the strategy done() callback.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = req.user as unknown as IUser;
    const { accessToken, refreshToken } = generateTokenPair({
      sub: user.id as string,
      email: user.email,
      name: user.name,
      role: user.role,
      plan: user.plan,
    });

    // Store session in Redis + MongoDB
    await createSession(
      user.id as string,
      accessToken,
      refreshToken,
      { plan: user.plan, email: user.email, role: user.role, name: user.name },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );

    // Redirect browser to frontend callback page with tokens in query params.
    // The frontend callback page immediately strips them from the URL and stores
    // in memory / localStorage before redirecting to the dashboard.
    const redirectUrl = new URL(`${env.FRONTEND_URL}/auth/callback`);
    redirectUrl.searchParams.set('accessToken', accessToken);
    redirectUrl.searchParams.set('refreshToken', refreshToken);

    res.redirect(redirectUrl.toString());
  },
);

export default router;
