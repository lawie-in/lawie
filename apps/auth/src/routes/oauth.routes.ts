import crypto from 'crypto';

import { Router, Request, Response } from 'express';
import passport from 'passport';

import { env } from '../config/env';
import logger from '../config/logger';
import {
  GOOGLE_ACCOUNT_DEACTIVATED,
  REFERRAL_EXISTING_ACCOUNT_FLAG,
  REFERRAL_NOT_APPLIED_FLAG,
} from '../config/passport';
import redis from '../config/redis';
import { IUser } from '../models/User.model';
import { tryGrantDailyLoginBonus } from '../services/credit-bonus.service';
import { generateTokenPair } from '../services/jwt.service';
import {
  OAUTH_VERIFIED_STATE_KEY,
  createOAuthState,
  getVerifiedOAuthState,
  isBase64Url43,
  storeOAuthUtm,
  verifierMatchesChallenge,
  verifyOAuthState,
} from '../services/oauth-state';
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
// T-319: mirrors registerSchema.referralCode .max(16) in validators/auth.validator.ts.
const REFERRAL_CODE_MAX_LENGTH = 16;

interface OAuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

// T-319: the challenge from the verified state is stored with the pair, so only the browser that
// holds the matching verifier can take the tokens.
interface OAuthCodeRecord extends OAuthTokenPair {
  challenge: string;
}

function oauthCodeKey(code: string): string {
  return OAUTH_CODE_PREFIX + crypto.createHash('sha256').update(code).digest('hex');
}

async function storeOAuthCode(record: OAuthCodeRecord): Promise<string> {
  const code = crypto.randomBytes(OAUTH_CODE_BYTES).toString('base64url');
  await redis.set(oauthCodeKey(code), JSON.stringify(record), 'EX', OAUTH_CODE_TTL_SECONDS);
  return code;
}

// Atomic get-and-delete via MULTI/EXEC (not GETDEL: the production Redis version is not
// recorded in the repo). Returns null for an unknown, expired or already used code, and for a
// record without a challenge (T-319).
async function takeOAuthCode(code: string): Promise<OAuthCodeRecord | null> {
  const results = await redis.multi().get(oauthCodeKey(code)).del(oauthCodeKey(code)).exec();
  if (!results) return null;
  const [getErr, raw] = results[0] ?? [];
  if (getErr || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthCodeRecord>;
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.challenge !== 'string' ||
      !parsed.challenge
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      challenge: parsed.challenge,
    };
  } catch {
    return null;
  }
}

const oauthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// GET /google — redirect to Google consent screen
// T-319: requires ?challenge= (base64url(sha256(verifier)), 43 chars) from the web app. Accepts an
// optional ?referralCode=. Both go into an HMAC-signed OAuth state that survives the Google
// round-trip and is verified at the callback.
// T-242: also accepts optional ?utmSource=, ?utmMedium=, ?utmCampaign= (sign-up source). They are
// sanitized and stored server-side under the challenge's hash (storeOAuthUtm), never put in the
// state or the URL to Google (Arjun's ruling (a), Ajay condition 3), and never logged.
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
  async (req: Request, res: Response, next) => {
    const challenge: unknown = req.query['challenge'];
    if (!isBase64Url43(challenge)) {
      return res.status(400).json({ error: 'invalid_challenge' });
    }
    // Same cap as registerSchema.referralCode (max 16). An empty or longer code is dropped, not
    // refused, so it can never push the signed state past OAUTH_STATE_MAX_LENGTH.
    const rawReferral = req.query['referralCode'];
    const trimmedReferral =
      typeof rawReferral === 'string' ? rawReferral.trim().toUpperCase() : undefined;
    const referralCode =
      trimmedReferral && trimmedReferral.length <= REFERRAL_CODE_MAX_LENGTH
        ? trimmedReferral
        : undefined;
    // Never throws: a Redis error drops the tags, not the sign-in.
    await storeOAuthUtm(challenge, {
      utmSource: req.query['utmSource'],
      utmMedium: req.query['utmMedium'],
      utmCampaign: req.query['utmCampaign'],
    });
    return passport.authenticate('google', {
      scope: ['email', 'profile'],
      session: false,
      state: createOAuthState(challenge, referralCode),
    })(req, res, next);
  },
);

// GET /google/callback — Google redirects here after user consent
router.get(
  '/google/callback',
  // T-319: verify the signed state before passport runs, so a tampered, expired or missing state
  // never reaches the Google code exchange, the user lookup or creation, a session or a one-time
  // code. The verified state is the only source of the challenge and the referral code.
  (req: Request, res: Response, next) => {
    const verified = verifyOAuthState(req.query['state']);
    if (!verified) {
      return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }
    (req as unknown as Record<string, unknown>)[OAUTH_VERIFIED_STATE_KEY] = verified;
    return next();
  },
  // T-299 ruling 5: a custom callback instead of failureRedirect, so the strategy's refusal reason
  // picks the redirect. A deactivated account goes to ?error=account_deactivated; any other
  // failure (consent denied, no email) to ?error=oauth_failed. Strategy errors still go to next().
  (req: Request, res: Response, next) =>
    passport.authenticate(
      'google',
      { session: false },
      (err: unknown, user: Express.User | false | null, info?: unknown) => {
        if (err) return next(err);
        if (!user) {
          const reason = (info as { reason?: unknown } | undefined)?.reason;
          const error =
            reason === GOOGLE_ACCOUNT_DEACTIVATED ? 'account_deactivated' : 'oauth_failed';
          return res.redirect(`${env.FRONTEND_URL}/login?error=${error}`);
        }
        req.user = user;
        return next();
      },
    )(req, res, next),
  async (req: Request, res: Response) => {
    // Passport sets req.user to the Mongoose document via the strategy done() callback.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = req.user as unknown as IUser;
    // T-299 ruling 5, second line of defence: never a session or a code for a missing or
    // deactivated user, whatever reached this handler.
    if (!user) {
      return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }
    if (user.isActive === false) {
      return res.redirect(`${env.FRONTEND_URL}/login?error=account_deactivated`);
    }
    const verifiedState = getVerifiedOAuthState(req);
    if (!verifiedState) {
      // Unreachable: the state check above runs first. Fail closed all the same.
      return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }
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
      code = await storeOAuthCode({ accessToken, refreshToken, challenge: verifiedState.c });
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
// T-319: body { code, verifier }; base64url(sha256(verifier)) must equal the stored challenge.
// Unknown, expired, already used, missing or wrong verifier: all the same 400 body. A well-formed
// code is consumed before the verifier is checked, so a code tried with the wrong verifier is gone.
// Never log the code, verifier, challenge or tokens.
router.post('/oauth/exchange', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body as Record<string, unknown> | undefined;
  const code: unknown = body?.['code'];
  const verifier: unknown = body?.['verifier'];
  if (
    typeof code !== 'string' ||
    code.length < OAUTH_CODE_MIN_LENGTH ||
    code.length > OAUTH_CODE_MAX_LENGTH
  ) {
    return res.status(400).json({ error: 'invalid_code' });
  }

  let record: OAuthCodeRecord | null;
  try {
    record = await takeOAuthCode(code);
  } catch (err) {
    logger.error({ err }, 'OAuth exchange: failed to read one-time code');
    return res.status(400).json({ error: 'invalid_code' });
  }

  if (
    !record ||
    !isBase64Url43(verifier) ||
    !verifierMatchesChallenge(verifier, record.challenge)
  ) {
    return res.status(400).json({ error: 'invalid_code' });
  }
  return res
    .status(200)
    .json({ accessToken: record.accessToken, refreshToken: record.refreshToken });
});

export default router;
