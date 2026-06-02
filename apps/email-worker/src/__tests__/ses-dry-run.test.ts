/**
 * Smoke test for the SES provider in dry-run mode. Confirms the adapter
 * short-circuits before touching the AWS SDK so devs don't need real creds
 * to run the test suite.
 */
import { sendEmail } from '../providers/ses';

describe('ses provider — dry-run mode', () => {
  it('returns { messageId: null } without throwing', async () => {
    const result = await sendEmail({
      to: ['advocate@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
    expect(result.messageId).toBeNull();
  });

  it('honours EMAIL_DEV_REDIRECT_TO by rerouting all recipients', async () => {
    const original = process.env.EMAIL_DEV_REDIRECT_TO;
    process.env.EMAIL_DEV_REDIRECT_TO = 'sink@example.com';
    // Re-import is enough — env is read in the function, not at module-load.
    const { sendEmail: send2 } = await import('../providers/ses');
    const result = await send2({
      to: ['real@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
    expect(result.messageId).toBeNull();
    if (original !== undefined) {
      process.env.EMAIL_DEV_REDIRECT_TO = original;
    } else {
      delete process.env.EMAIL_DEV_REDIRECT_TO;
    }
  });
});
