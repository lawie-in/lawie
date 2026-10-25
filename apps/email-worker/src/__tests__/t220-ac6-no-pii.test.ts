/**
 * T-220 AC6: logs and Sentry hold the template id and a user id, never an
 * address, a name or a body. The SES / SMTP error paths must not log or throw
 * the provider's text, which echoes the address.
 *
 * Method: pino is the real pino, writing into an in-memory sink (logger module
 * mocked); Sentry is mocked; provider clients are stubbed. Nothing sends mail.
 */
import http from 'http';
import type { AddressInfo } from 'net';

import * as Sentry from '@sentry/node';

import {
  LEAK_ADDRESS,
  LEAK_NAME,
  SES_ENV,
  SMTP_ENV,
  allLogText,
  dump,
  parsedLogs,
  resetSink,
  withEnv,
} from './helpers/t220-capture';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// @react-email/render uses a dynamic import that Jest cannot run (no --experimental-vm-modules),
// so the renderer is stubbed; its output carries the name, as the real one does.
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async (_id: string, data: { name?: string }) => ({
    subject: `Welcome ${data.name}`,
    html: `<p>Hello ${data.name}</p>`,
    text: `Hello ${data.name}`,
  })),
}));

const SMTP_RESPONSE = `550 5.1.1 <${LEAK_ADDRESS}>: Recipient address rejected for ${LEAK_NAME}`;
const baseMail = {
  to: [LEAK_ADDRESS],
  cc: [`cc-${LEAK_ADDRESS}`],
  bcc: [`bcc-${LEAK_ADDRESS}`],
  subject: `Welcome ${LEAK_NAME}`,
  html: `<p>Hello ${LEAK_NAME}</p>`,
  text: `Hello ${LEAK_NAME}`,
  meta: { template: 'auth.welcome', userId: 'user-42' },
};

function expectClean(text: string) {
  for (const s of [
    LEAK_ADDRESS,
    'leak@',
    'example.com',
    LEAK_NAME,
    'Zainab',
    'Quasimodo',
    'Hello',
  ]) {
    expect(text).not.toContain(s);
  }
}

function sesError() {
  const err = new Error(
    `Email address is not verified. The following identities failed: ${LEAK_ADDRESS}`,
  );
  err.name = 'MessageRejected';
  Object.assign(err, {
    $fault: 'client',
    $metadata: { httpStatusCode: 400, requestId: 'req-1' },
    Code: 'MessageRejected',
    $response: { body: `<Error>${LEAK_ADDRESS} ${LEAK_NAME}</Error>` },
  });
  return err;
}

function smtpError() {
  const err = new Error(`Recipient rejected: ${LEAK_ADDRESS}`);
  Object.assign(err, {
    code: 'EENVELOPE',
    responseCode: 550,
    response: SMTP_RESPONSE,
    command: 'RCPT TO',
    rejected: [LEAK_ADDRESS],
  });
  return err;
}

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
});

describe('T-220 AC6 dry-run logs', () => {
  it('SES dry-run: logs template + userId, never the address, name or body', async () => {
    const { sendEmail } = await import('../providers/ses');
    await sendEmail(baseMail);
    const text = allLogText();
    expectClean(text);
    const line = parsedLogs().find((l) => String(l.msg).includes('Dry-run'));
    expect(line).toMatchObject({ template: 'auth.welcome', userId: 'user-42', toCount: 1 });
  });

  it('SMTP dry-run: same', async () => {
    const { sendEmail } = await import('../providers/smtp');
    // setupEnv sets EMAIL_DRY_RUN=true, which the SMTP adapter honours
    await sendEmail(baseMail);
    expectClean(allLogText());
    const line = parsedLogs().find((l) => String(l.msg).includes('Dry-run'));
    expect(line).toMatchObject({ template: 'auth.welcome', userId: 'user-42' });
  });

  it('an id containing "@" is logged as "redacted", not as itself', async () => {
    const { sendEmail } = await import('../providers/ses');
    await sendEmail({
      ...baseMail,
      meta: { template: 'auth.welcome', userId: LEAK_ADDRESS, jobId: 'x'.repeat(200) },
    });
    const text = allLogText();
    expect(text).not.toContain(LEAK_ADDRESS);
    const line = parsedLogs().find((l) => String(l.msg).includes('Dry-run'));
    expect(line?.userId).toBe('redacted');
    expect(line?.jobId).toBe('redacted');
  });
});

describe('T-220 AC6 provider error paths', () => {
  it('SES error: no address in logs, thrown error or its properties', async () => {
    await jest.isolateModulesAsync(async () => {
      await withEnv(SES_ENV, async () => {
        const { SESv2Client } = await import('@aws-sdk/client-sesv2');
        const spy = jest
          .spyOn(SESv2Client.prototype, 'send')
          .mockRejectedValue(sesError() as never);
        const { sendEmail } = await import('../providers/ses');
        let thrown: unknown;
        try {
          await sendEmail(baseMail);
        } catch (e) {
          thrown = e;
        }
        expect(spy).toHaveBeenCalledTimes(1);
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).name).toBe('EmailSendError');
        expect((thrown as Error & { cause?: unknown }).cause).toBeUndefined();
        expectClean(dump(thrown));
        expectClean(allLogText());
        const line = parsedLogs().find((l) => l.msg === 'SES send failed');
        expect(line).toMatchObject({
          template: 'auth.welcome',
          userId: 'user-42',
          errorName: 'MessageRejected',
          statusCode: 400,
        });
        spy.mockRestore();
      });
    });
  });

  it('SMTP error: no address in logs, thrown error or its properties', async () => {
    await jest.isolateModulesAsync(async () => {
      await withEnv(SMTP_ENV, async () => {
        const sendMail = jest.fn().mockRejectedValue(smtpError());
        jest.doMock('nodemailer', () => ({
          __esModule: true,
          default: { createTransport: () => ({ sendMail }) },
        }));
        const { sendEmail } = await import('../providers/smtp');
        let thrown: unknown;
        try {
          await sendEmail(baseMail);
        } catch (e) {
          thrown = e;
        }
        expect(sendMail).toHaveBeenCalledTimes(1);
        expect((thrown as Error).name).toBe('EmailSendError');
        expect((thrown as Error & { cause?: unknown }).cause).toBeUndefined();
        expectClean(dump(thrown));
        expectClean(allLogText());
        const line = parsedLogs().find((l) => l.msg === 'SMTP send failed');
        expect(line).toMatchObject({
          template: 'auth.welcome',
          userId: 'user-42',
          code: 'EENVELOPE',
          statusCode: 550,
        });
        jest.dontMock('nodemailer');
      });
    });
  });
});

describe('T-220 AC6 worker processor', () => {
  const job = (attemptsMade = 0) =>
    ({
      id: 'job-1',
      queueName: 'email-low',
      attemptsMade,
      data: {
        template: 'auth.welcome',
        to: [LEAK_ADDRESS],
        cc: [],
        bcc: [],
        data: { name: LEAK_NAME, userId: '507f1f77bcf86cd799439011' },
      },
    }) as never;

  it('failure with a raw error echoing the address: logs, breadcrumbs and Sentry are clean', async () => {
    const { createProcessor } = await import('../worker');
    const raw = new Error(`boom for ${LEAK_ADDRESS} (${LEAK_NAME})`);
    const processor = createProcessor(async () => {
      throw raw;
    });
    let thrown: Error | undefined;
    try {
      await processor(job(), 'tok');
    } catch (e) {
      thrown = e as Error;
    }
    // what BullMQ stores as failedReason: not the raw error, and nothing from its message
    expect(thrown).toBeDefined();
    expect(thrown).not.toBe(raw);
    expectClean(`${thrown?.message}\n${String(thrown?.stack)}`);
    expect(thrown?.message).toBe('Error in email send');

    expectClean(allLogText());
    const failed = parsedLogs().find((l) => l.msg === 'Email send failed');
    expect(failed).toMatchObject({
      jobId: 'job-1',
      template: 'auth.welcome',
      userId: '507f1f77bcf86cd799439011',
      attempt: 1,
    });

    const sentry = dump([
      (Sentry.addBreadcrumb as jest.Mock).mock.calls,
      (Sentry.captureException as jest.Mock).mock.calls,
    ]);
    expectClean(sentry);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry).toContain('auth.welcome');
    expect(sentry).toContain('507f1f77bcf86cd799439011');
  });

  it('success path: logs and breadcrumbs clean, template + userId present', async () => {
    const { createProcessor } = await import('../worker');
    const send = jest.fn().mockResolvedValue({ messageId: 'm-1' });
    await createProcessor(send)(job(), 'tok');
    expect(send).toHaveBeenCalledTimes(1);
    expectClean(allLogText());
    const sentry = dump((Sentry.addBreadcrumb as jest.Mock).mock.calls);
    expectClean(sentry);
    expect(sentry).toContain('507f1f77bcf86cd799439011');
    expect(parsedLogs().find((l) => l.msg === 'Email sent')).toMatchObject({
      template: 'auth.welcome',
      userId: '507f1f77bcf86cd799439011',
    });
  });

  it('SES failure through the processor: failedReason source (thrown message) is clean too', async () => {
    await jest.isolateModulesAsync(async () => {
      await withEnv(SES_ENV, async () => {
        const { SESv2Client } = await import('@aws-sdk/client-sesv2');
        const spy = jest
          .spyOn(SESv2Client.prototype, 'send')
          .mockRejectedValue(sesError() as never);
        const { createProcessor } = await import('../worker');
        const processor = createProcessor();
        let thrown: unknown;
        try {
          await processor(job(), 'tok');
        } catch (e) {
          thrown = e;
        }
        expect((thrown as Error).name).toBe('EmailSendError');
        expectClean((thrown as Error).message + ((thrown as Error).stack ?? ''));
        expectClean(allLogText());
        expectClean(dump((Sentry.captureException as jest.Mock).mock.calls));
        spy.mockRestore();
      });
    });
  });
});

describe('T-220 AC6 POST /send', () => {
  async function post(app: import('express').Express, body: unknown) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SECRET as string,
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, text: await res.text() };
    } finally {
      await new Promise((r) => (server as http.Server).close(r));
    }
  }
  const body = {
    template: 'auth.welcome',
    to: LEAK_ADDRESS,
    cc: [`cc-${LEAK_ADDRESS}`],
    data: { name: LEAK_NAME, userId: 'user-42' },
  };

  it('success (dry-run): logs clean, template + userId present', async () => {
    const { createApp } = await import('../app');
    const res = await post(createApp(), body);
    expect(res.status).toBe(202);
    expectClean(allLogText());
    expect(parsedLogs().find((l) => l.msg === 'Email sent via /send')).toMatchObject({
      template: 'auth.welcome',
      userId: 'user-42',
    });
  });

  it('SES failure: 500 body and logs clean', async () => {
    await jest.isolateModulesAsync(async () => {
      await withEnv(SES_ENV, async () => {
        const { SESv2Client } = await import('@aws-sdk/client-sesv2');
        const spy = jest
          .spyOn(SESv2Client.prototype, 'send')
          .mockRejectedValue(sesError() as never);
        const { createApp } = await import('../app');
        const res = await post(createApp(), body);
        expect(res.status).toBe(500);
        expectClean(res.text);
        expectClean(allLogText());
        expect(parsedLogs().find((l) => l.msg === 'Email send failed via /send')).toMatchObject({
          template: 'auth.welcome',
          userId: 'user-42',
        });
        spy.mockRestore();
      });
    });
  });
});
