import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import { User, CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../models/User.model';
import { grantSignupBonus } from '../services/credit-bonus.service';
import { discardOAuthUtm, getVerifiedOAuthState, takeOAuthUtm } from '../services/oauth-state';
import { applyReferralCode } from '../services/referral.service';
import { deleteAllUserSessions } from '../services/session.service';
import { buildSignupSource } from '../validators/auth.validator';

import { env } from './env';
import logger from './logger';

/**
 * T-234 — request property the OAuth callback reads to tell the web app that a referral code
 * sent with a brand-new Google sign-up was no longer valid (Ajay Addendum 1: no silent drop).
 */
export const REFERRAL_NOT_APPLIED_FLAG = 'lawieReferralNotApplied';

/**
 * T-234 review — request property set when an EXISTING account (found by googleId or linked by
 * email) comes through Google with a referral code. Referral bonuses are for new accounts only:
 * nothing is granted, and the callback tells the web app (referral=existing_account).
 */
export const REFERRAL_EXISTING_ACCOUNT_FLAG = 'lawieReferralExistingAccount';

/**
 * T-299 (Arjun ruling 5) — the strategy refuses a deactivated account with
 * done(null, false, { reason: GOOGLE_ACCOUNT_DEACTIVATED }). The callback route maps that reason
 * to /login?error=account_deactivated; no user is set, so no session and no one-time code.
 */
export const GOOGLE_ACCOUNT_DEACTIVATED = 'account_deactivated';

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
    privacyVersion: CURRENT_PRIVACY_VERSION,
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
          // T-319: the referral code comes ONLY from the HMAC-verified state that the
          // /google/callback route checked before passport ran. The raw ?state= is never read.
          const verifiedState = getVerifiedOAuthState(req);
          const verifiedReferral = verifiedState?.r;
          const referralCode =
            typeof verifiedReferral === 'string' && verifiedReferral
              ? verifiedReferral.trim().toUpperCase()
              : undefined;

          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('Google account has no email address'), false);
          }

          // T-299 ruling 5: checked straight after each lookup, before anything is written, so a
          // deactivated account is neither linked nor stamped with a Terms acceptance.
          const refuseDeactivated = (userId: string) => {
            logger.info({ userId }, 'Google sign-in refused: account deactivated');
            // T-242: an existing account; its tags are deleted unread (not awaited).
            if (verifiedState) discardOAuthUtm(verifiedState.c);
            return done(null, false, { reason: GOOGLE_ACCOUNT_DEACTIVATED });
          };

          // 1. Find by google_id (returning user)
          let user = await User.findOne({ googleId: profile.id });
          let isNewUser = false;
          if (user && !user.isActive) return refuseDeactivated(user.id as string);

          if (!user) {
            // 2. Email already registered via password — link the Google account
            user = await User.findOne({ email });
            if (user && !user.isActive) return refuseDeactivated(user.id as string);
            if (user) {
              user.googleId = profile.id;
              // T-299 ruling 6 and Arjun's answer 1 (until T-223 verifies email): linking makes the
              // account Google-only. Whoever set the password may not own the address; the owner can
              // set a new one through "forgot password". In this order: unset the password, clear
              // any reset token, revoke every existing session, then (in the callback route, after
              // this strategy returns) create the Google session. authProvider stays as stored
              // ('email' for a password account, ruling 1).
              user.set('password', undefined);
              user.set('passwordResetToken', undefined);
              user.set('passwordResetExpires', undefined);
              if (!user.name && profile.displayName) user.name = profile.displayName;
              if (!user.termsAcceptedAt) user.set(googleTermsAcceptance());
              // Revoke before saving: if the revoke throws, nothing is saved and the next Google
              // sign-in comes through this branch again and retries it. Saving first would make a
              // failed revoke permanent (the googleId match would skip this branch).
              await deleteAllUserSessions(user._id.toString());
              await user.save();
            } else {
              // 3. Brand-new user — create account.
              // T-242 — sign-up source, taken (read + deleted) from Redis under the verified
              // challenge; this branch only. Fails open: no tags on a Redis error. Never logged.
              const signupTags = verifiedState ? await takeOAuthUtm(verifiedState.c) : undefined;
              user = await User.create({
                email,
                name: profile.displayName ?? email,
                googleId: profile.id,
                // T-299 ruling 1: accounts created here are Google accounts.
                authProvider: 'google',
                role: 'Lawyer',
                plan: 'free',
                docCount: 0,
                ...googleTermsAcceptance(),
                // T-242 — sign-up source from the verified state, on this new-account branch only
                // (never on link or returning sign-in). Never logged.
                signupSource: buildSignupSource(signupTags),
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

          // T-242 (Arjun (a) 2): an existing account (returning or linked) never gets the tags;
          // delete them unread. Not awaited, so sign-in never waits on it.
          if (!isNewUser && verifiedState) discardOAuthUtm(verifiedState.c);

          // Existing account with a code: grant nothing, but don't drop it silently (T-234 review).
          if (!isNewUser && referralCode) {
            (req as unknown as Record<string, unknown>)[REFERRAL_EXISTING_ACCOUNT_FLAG] = true;
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
