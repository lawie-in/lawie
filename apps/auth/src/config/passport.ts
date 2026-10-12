import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import { User, CURRENT_TERMS_VERSION } from '../models/User.model';
import { grantSignupBonus } from '../services/credit-bonus.service';
import { applyReferralCode } from '../services/referral.service';

import { env } from './env';
import logger from './logger';

/**
 * T-234 — request property the OAuth callback reads to tell the web app that a referral code
 * sent with a brand-new Google sign-up was no longer valid (Ajay Addendum 1: no silent drop).
 */
export const REFERRAL_NOT_APPLIED_FLAG = 'lawieReferralNotApplied';

/**
 * T-234 — Terms acceptance for Google sign-in. The login page is the only entry to
 * /api/auth/google and shows Ajay's consent line in both modes, so reaching this callback
 * means the user saw it. Set only if empty: an existing acceptance is never overwritten
 * (atomic filter on termsAcceptedAt: null, which also matches a missing field).
 */
function googleTermsAcceptance() {
  return {
    termsAcceptedAt: new Date(),
    termsVersion: CURRENT_TERMS_VERSION,
    acceptedVia: 'google' as const,
  };
}

export function initPassport(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    logger.warn('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google OAuth disabled');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        scope: ['email', 'profile'],
        passReqToCallback: true,
      },
      async (req, _accessToken, _refreshToken, profile, done) => {
        try {
          // Referral code is encoded into the OAuth state by /google route.
          // Google echoes state back unchanged to the callback URL.
          const stateVal = (req as { query?: Record<string, unknown> }).query?.['state'];
          const referralCode =
            typeof stateVal === 'string' && stateVal ? stateVal.trim().toUpperCase() : undefined;

          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('Google account has no email address'), false);
          }

          // 1. Find by google_id (returning user)
          let user = await User.findOne({ googleId: profile.id });
          let isNewUser = false;

          if (!user) {
            // 2. Email already registered via password — link the Google account
            user = await User.findOne({ email });
            if (user) {
              user.googleId = profile.id;
              if (!user.name && profile.displayName) user.name = profile.displayName;
              if (!user.termsAcceptedAt) user.set(googleTermsAcceptance());
              await user.save();
            } else {
              // 3. Brand-new user — create account
              user = await User.create({
                email,
                name: profile.displayName ?? email,
                googleId: profile.id,
                role: 'Lawyer',
                plan: 'free',
                docCount: 0,
                ...googleTermsAcceptance(),
              });
              logger.info({ userId: user.id }, 'New user created via Google OAuth');
              isNewUser = true;
              // Signup bonus — non-blocking, never fails OAuth callback
              void grantSignupBonus(user._id.toString());
            }
          } else if (!user.termsAcceptedAt) {
            // 1b. Returning Google user who signed up before the consent line existed.
            const acceptance = googleTermsAcceptance();
            const res = await User.updateOne(
              { _id: user._id, termsAcceptedAt: null },
              { $set: acceptance },
            );
            if (res.modifiedCount > 0) user.set(acceptance);
          }

          // Apply referral code only for brand-new accounts. Awaited so a code that is no
          // longer valid can be reported to the user (T-234); never fails the sign-in.
          if (isNewUser && referralCode) {
            try {
              const outcome = await applyReferralCode(user._id.toString(), referralCode);
              if (outcome === 'invalid') {
                (req as unknown as Record<string, unknown>)[REFERRAL_NOT_APPLIED_FLAG] = true;
              }
            } catch (err) {
              logger.warn(
                { userId: user.id, err: err instanceof Error ? err.message : String(err) },
                'Referral code apply failed at Google sign-up',
              );
            }
          }

          // Pass Mongoose document — Passport serialises it for the request lifecycle.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return done(null, user as any);
        } catch (err) {
          logger.error({ err }, 'Google OAuth strategy error');
          return done(err as Error, false);
        }
      },
    ),
  );

  logger.info('Google OAuth strategy initialised');
}
