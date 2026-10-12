import crypto from 'crypto';

import { Router, Request, Response } from 'express';
import passport from 'passport';

import { env } from '../config/env';
import logger from '../config/logger';
import { REFERRAL_EXISTING_ACCOUNT_FLAG, REFERRAL_NOT_APPLIED_FLAG } from '../config/passport';
import redis from '../config/redis';
import { IUser } from '../models/User.model';
import { tryGrantDailyLoginBonus } from '../services/credit-bonus.service';
import { generateTokenPair } from '../services/jwt.service';
import { createSession } from '../services/session.service';

const router = Router();

// T-306: tokens never travel in a URL. The callback stores the pair under a one-time code
// (60 s TTL, single use) and the web app swaps the code for the pair by POST /oauth/exchange.
const OAUTH_CODE_PREFIX = 'oauth:code:';
const OAUTH_CODE_TTL_SECONDS = 60;
const OAUTH_CODE_BYTES = 32;
// 32 random bytes in base64url are 43 characters; anything far off that is not one of ours.
const OAUTH_CODE_MIN_LENGTH = 16;
const OAUTH_CODE_MAX_LENGTH = 128;

interface OAuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

function oauthCodeKey(code: string): string {
  return OAUTH_CODE_PREFIX + crypto.createHash('sha256').update(code).digest('hex');
}

async function storeOAuthCode(pair: OAuthTokenPair): Promise<string> {
  const code = crypto.randomBytes(OAUTH_CODE_BYTES).toString('base64url');
  await redis.set(oauthCodeKey(code), JSON.stringify(pair), 'EX', OAUTH_CODE_TTL_SECONDS);
  return code;
}

// Atomic get-and-delete via MULTI/EXEC (not GETDEL: the production Redis version is not
// recorded in the repo). Returns null for an unknown, expired or already used code.
async function takeOAuthCode(code: string): Promise<OAuthTokenPair | null> {
  const results = await redis.multi().get(oauthCodeKey(code)).del(oauthCodeKey(code)).exec();
  if (!results) return null;
  const [getErr, raw] = results[0] ?? [];
  if (getErr || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthTokenPair>;
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
      return null;
    }
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

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

    // T-306: redirect with a one-time code, never the tokens. The web callback page drops the
    // query string at once and exchanges the code by POST /oauth/exchange.
    let code: string;
    try {
      code = await storeOAuthCode({ accessToken, refreshToken });
    } catch (err) {
      // Never fall back to tokens in the URL. Log the failure only, not the code or tokens.
      logger.error({ err }, 'OAuth callback: failed to store one-time code');
      return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }

    const redirectUrl = new URL(`${env.FRONTEND_URL}/auth/callback`);
    redirectUrl.searchParams.set('code', code);
    // T-234: tell the web app why a referral code sent with Google added no Ink, so it can show
    // a one-time notice. not_applied = new account, code no longer valid (Ajay Addendum 1);
    // existing_account = the account already existed, bonuses are for new accounts only.
    const flags = req as unknown as Record<string, unknown>;
    if (flags[REFERRAL_NOT_APPLIED_FLAG] === true) {
      redirectUrl.searchParams.set('referral', 'not_applied');
    } else if (flags[REFERRAL_EXISTING_ACCOUNT_FLAG] === true) {
      redirectUrl.searchParams.set('referral', 'existing_account');
    }

    return res.redirect(redirectUrl.toString());
  },
);

// POST /oauth/exchange — T-306: swap a one-time code from the Google callback for the token pair.
// Unknown, expired and already used codes all get the same 400 body. Never log the code or tokens.
router.post('/oauth/exchange', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const code: unknown = (req.body as Record<string, unknown> | undefined)?.['code'];
  if (
    typeof code !== 'string' ||
    code.length < OAUTH_CODE_MIN_LENGTH ||
    code.length > OAUTH_CODE_MAX_LENGTH
  ) {
    return res.status(400).json({ error: 'invalid_code' });
  }

  let pair: OAuthTokenPair | null;
  try {
    pair = await takeOAuthCode(code);
  } catch (err) {
    logger.error({ err }, 'OAuth exchange: failed to read one-time code');
    return res.status(400).json({ error: 'invalid_code' });
  }

  if (!pair) {
    return res.status(400).json({ error: 'invalid_code' });
  }
  return res.status(200).json(pair);
});

export default router;
