import * as Sentry from '@sentry/node';
import Razorpay from 'razorpay';

import { env, razorpayKeyModeNotice } from './env';
import logger from './logger';

// T-527 (AC5, round 4): a key mode that boots but is not clean, once when the
// client is built at boot. index.ts imports ./config/sentry before ./app, so
// Sentry is initialised by the time this runs. The rule only, never the key.
// - warn (RAZORPAY_ALLOW_TEST_KEYS=true): one warn, no Sentry.
// - error (the default for a non-live key in production): one error log and
//   one Sentry event, then boot continues.
if (razorpayKeyModeNotice?.level === 'warn') {
  logger.warn({ marker: 'razorpay_test_keys_in_production' }, razorpayKeyModeNotice.message);
} else if (razorpayKeyModeNotice?.level === 'error') {
  logger.error({ marker: 'razorpay_test_keys_in_production' }, razorpayKeyModeNotice.message);
  Sentry.withScope((scope) => {
    scope.setTag('marker', 'razorpay_test_keys_in_production');
    Sentry.captureMessage('billing.razorpay.test_keys_in_production', 'error');
  });
}

export const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});
