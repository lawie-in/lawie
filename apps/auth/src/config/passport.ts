import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import { User } from '../models/User.model';
import { grantSignupBonus } from '../services/credit-bonus.service';

import { env } from './env';
import logger from './logger';

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
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('Google account has no email address'), false);
          }

          // 1. Find by google_id (returning user)
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            // 2. Email already registered via password — link the Google account
            user = await User.findOne({ email });
            if (user) {
              user.googleId = profile.id;
              if (!user.name && profile.displayName) user.name = profile.displayName;
              await user.save();
            } else {
              // 3. Brand-new user — create account
              // Lawie targets advocates — default role is Lawyer
              user = await User.create({
                email,
                name: profile.displayName ?? email,
                googleId: profile.id,
                role: 'Lawyer',
                plan: 'free',
                docCount: 0,
              });
              logger.info({ userId: user.id, email }, 'New user created via Google OAuth');
              // Signup bonus — non-blocking, never fails OAuth callback
              // Mirrors auth.service.ts:30; only granted on truly new account,
              // not when linking Google to an existing email-registered user.
              void grantSignupBonus(user._id.toString());
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
