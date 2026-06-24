import { Router, Request, Response } from 'express';
import passport from 'passport';

import { env } from '../config/env';
import { IUser } from '../models/User.model';
import { tryGrantDailyLoginBonus } from '../services/credit-bonus.service';
import { generateTokenPair } from '../services/jwt.service';
import { createSession } from '../services/session.service';

const router = Router();

const oauthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// GET /google — redirect to Google consent screen
// Accepts an optional ?referralCode= query param; encodes it into the OAuth
// state so it survives the Google round-trip and reaches the callback.
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
  (req: Request, res: Response, next) => {
    const referralCode =
      typeof req.query['referralCode'] === 'string' && req.query['referralCode']
        ? (req.query['referralCode'] as string).trim().toUpperCase()
        : undefined;
    return passport.authenticate('google', {
      scope: ['email', 'profile'],
      session: false,
      ...(referralCode ? { state: referralCode } : {}),
    })(req, res, next);
  },
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

    // SCRUM-73 — daily login bonus, non-blocking on the OAuth hot path.
    void tryGrantDailyLoginBonus(user.id as string);

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
