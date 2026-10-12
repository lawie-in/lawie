/**
 * Smoke test for the SES provider in dry-run mode. Confirms the adapter
 * short-circuits before touching the AWS SDK so devs don't need real creds
 * to run the test suite.
 */
import { sendEmail } from '../providers/ses';

import { allLogText, parsedLogs, resetSink } from './helpers/t220-capture';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);

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

  it('honours EMAIL_DEV_REDIRECT_TO by rerouting all recipients (and dropping cc/bcc)', async () => {
    // env.ts parses process.env once at load, so the variable must be set BEFORE the
    // module graph is (re)loaded. isolateModules gives this test a fresh env.ts + ses.ts.
    const original = process.env.EMAIL_DEV_REDIRECT_TO;
    process.env.EMAIL_DEV_REDIRECT_TO = 'sink@example.com';
    resetSink();
    try {
      await jest.isolateModulesAsync(async () => {
        const { sendEmail: send2 } = await import('../providers/ses');
        const result = await send2({
          to: ['real@example.com', 'real2@example.com'],
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
          subject: 'Test',
          html: '<p>Hello</p>',
          text: 'Hello',
        });
        expect(result.messageId).toBeNull();
      });
    } finally {
      if (original !== undefined) process.env.EMAIL_DEV_REDIRECT_TO = original;
      else delete process.env.EMAIL_DEV_REDIRECT_TO;
    }
    const line = parsedLogs().find((l) => String(l.msg).includes('Dry-run'));
    // two recipients collapsed to one, cc/bcc dropped, flagged as redirected
    expect(line).toMatchObject({ redirected: true, toCount: 1, ccCount: 0, bccCount: 0 });
    expect(allLogText()).not.toContain('example.com');
  });

  it('without EMAIL_DEV_REDIRECT_TO the recipients are kept (counts) and redirected is false', async () => {
    resetSink();
    await sendEmail({
      to: ['a@example.com', 'b@example.com'],
      subject: 'T',
      html: '<p>x</p>',
      text: 'x',
    });
    const line = parsedLogs().find((l) => String(l.msg).includes('Dry-run'));
    expect(line).toMatchObject({ redirected: false, toCount: 2 });
  });
});
