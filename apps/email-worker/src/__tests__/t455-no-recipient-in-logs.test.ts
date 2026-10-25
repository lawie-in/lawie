/**
 * T-455: no log line in the email worker contains a recipient address, in any field or in the
 * message text, and the logs keep the useful, non-PII fields (template, provider, message id,
 * status, error code, counts).
 *
 * One test group per log call site:
 *   routes/send.ts   422 unfilled-footer refusal, "Email sent via /send", "Email send failed via /send"
 *   providers/ses.ts dry-run line, "SES send failed"
 *   providers/smtp.ts dry-run line, "SMTP send failed"
 *
 * Method: pino is the real pino writing into an in-memory sink (logger module mocked, as in t220);
 * the /send route is driven over HTTP with sentinel addresses in to/cc/bcc/replyTo/from, in
 * data.userId and in the template value; provider errors echo the address in their message and in
 * extra fields. Every captured line (all levels, message text and every field) is checked against
 * an address-shaped regex and against the sentinel local parts. Nothing sends mail.
 */
import http from 'http';
import type { AddressInfo } from 'net';

import { INTERNAL_HEADERS } from '@lawie/shared';

import {
  SES_ENV,
  SMTP_ENV,
  allLogText,
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
let mockUnfilledFooter: boolean | string = true;
jest.mock('../templates/auth/verifyEmail', () =>
  jest.requireActual('./helpers/t436-unfilled-footer').verifyEmailModule(() => mockUnfilledFooter),
);
// The real renderer uses a dynamic import Jest cannot run. This stub renders the body with every
// address in it (as a real template would) and throws for unregistered ids with the real message
// shape, which echoes the id.
let mockRenderError: Error | undefined;
jest.mock('../templates', () => ({
  renderTemplate: async (id: string, data: { name?: string }) => {
    if (mockRenderError) throw mockRenderError;
    if (id !== 'auth.welcome' && id !== 'auth.verifyEmail') {
      throw new Error(`Template "${id}" is not registered. Available: auth.welcome`);
    }
    return { subject: `Hi ${data.name}`, html: `<p>${data.name}</p>`, text: String(data.name) };
  },
}));

const SECRET = 'test-internal-secret-at-least-16';
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';

// Sentinel local parts: unique strings that must not appear anywhere in the captured output.
const LOCALS = {
  to: 'sentinel-to-91',
  to2: 'sentinel-to2-91',
  cc: 'sentinel-cc-91',
  bcc: 'sentinel-bcc-91',
  reply: 'sentinel-reply-91',
  from: 'sentinel-from-91',
  user: 'sentinel-user-91',
  tmpl: 'sentinel-tmpl-91',
  err: 'sentinel-err-91',
  redirect: 'sentinel-redirect-91',
  field: 'sentinel-field-91',
};
const addr = (k: keyof typeof LOCALS) => `${LOCALS[k]}@leak-domain.test`;
const ADDRESS_SHAPED = /[^\s@"']+@[^\s@"']+\.[^\s@"']+/;

/** AC1: nothing in any captured line (JSON, so message text and all fields) looks like an address. */
function expectNoAddress(): void {
  const text = allLogText();
  expect(text.length).toBeGreaterThan(0); // something was logged, so the check is not vacuous
  expect(text).not.toMatch(ADDRESS_SHAPED);
  for (const local of Object.values(LOCALS)) expect(text).not.toContain(local);
  expect(text).not.toContain('leak-domain.test');
  // The JSON-escaped form too (a raw '@' survives escaping, but be explicit about the field values).
  for (const line of parsedLogs()) {
    expect(JSON.stringify(line)).not.toContain('@');
  }
}

function line(msg: string): Record<string, unknown> {
  const l = parsedLogs().find((x) => String(x.msg).includes(msg));
  if (!l) throw new Error(`no log line containing "${msg}"; got: ${allLogText()}`);
  return l;
}

function sesError(): Error {
  const err = new Error(`Email address is not verified: ${addr('err')} / ${addr('to')}`);
  err.name = 'MessageRejected';
  Object.assign(err, {
    $fault: 'client',
    $metadata: { httpStatusCode: 400, requestId: 'req-455' },
    Code: 'MessageRejected',
    recipient: addr('field'),
    $response: { body: `<Error>${addr('err')}</Error>` },
  });
  return err;
}

function smtpError(): Error {
  const err = new Error(`Recipient rejected: ${addr('err')}`);
  Object.assign(err, {
    code: 'EENVELOPE',
    responseCode: 550,
    response: `550 5.1.1 <${addr('err')}>: Recipient address rejected`,
    command: 'RCPT TO',
    rejected: [addr('to')],
    recipient: addr('field'),
  });
  return err;
}

const FULL_BODY = {
  to: [addr('to'), addr('to2')],
  cc: [addr('cc')],
  bcc: [addr('bcc')],
  replyTo: addr('reply'),
  from: addr('from'),
};

type Env = Record<string, string | undefined>;

async function inEnv<T>(
  env: Env,
  pre: () => void,
  fn: (m: { app: typeof import('../app') }) => Promise<T>,
): Promise<T> {
  let out!: T;
  await jest.isolateModulesAsync(async () => {
    await withEnv({ AUTH_SERVICE_URL: 'http://localhost:4001', ...env }, async () => {
      pre();
      const app = await import('../app');
      out = await fn({ app });
    });
  });
  return out;
}

async function post(
  env: Env,
  body: Record<string, unknown>,
  pre: () => void = () => undefined,
  after: () => void = () => undefined,
) {
  try {
    return await inEnv(env, pre, async ({ app }) => {
      const server = app.createApp().listen(0, '127.0.0.1');
      await new Promise((r) => server.once('listening', r));
      try {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const res = await fetch(`${base}/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [INTERNAL_HEADERS.SECRET]: SECRET },
          body: JSON.stringify(body),
        });
        return { status: res.status, text: await res.text() };
      } finally {
        await new Promise((r) => (server as http.Server).close(r));
      }
    });
  } finally {
    after();
  }
}

function mockNodemailer(sendMail: jest.Mock): () => void {
  return () =>
    jest.doMock('nodemailer', () => ({
      __esModule: true,
      default: { createTransport: () => ({ sendMail }) },
    }));
}

/** Make the SES client reject / resolve in the registry the app is loaded from. */
async function sesSend(result: { reject?: Error; messageId?: string }) {
  // Loaded lazily inside the isolated registry by the caller of this factory.
  const { SESv2Client } = await import('@aws-sdk/client-sesv2');
  return jest.spyOn(SESv2Client.prototype, 'send').mockImplementation((async () => {
    if (result.reject) throw result.reject;
    return { MessageId: result.messageId };
  }) as never);
}

/** Run /send on SES with a stubbed client; the spy is installed after the app's modules load. */
async function postSes(
  body: Record<string, unknown>,
  result: { reject?: Error; messageId?: string },
) {
  return inEnv(
    SES_ENV,
    () => undefined,
    async ({ app }) => {
      const spy = await sesSend(result);
      const server = app.createApp().listen(0, '127.0.0.1');
      await new Promise((r) => server.once('listening', r));
      try {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const res = await fetch(`${base}/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [INTERNAL_HEADERS.SECRET]: SECRET },
          body: JSON.stringify(body),
        });
        return { status: res.status, text: await res.text(), calls: spy.mock.calls.length };
      } finally {
        spy.mockRestore();
        await new Promise((r) => (server as http.Server).close(r));
      }
    },
  );
}

const WELCOME = (extra: Record<string, unknown> = {}) => ({
  template: 'auth.welcome',
  ...FULL_BODY,
  data: { userId: USER_ID, name: 'Someone', ...extra },
});

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
  mockUnfilledFooter = true;
  mockRenderError = undefined;
});

describe('T-455 routes/send.ts: 422 unfilled-footer refusal', () => {
  it('logs template + userId only; no address from to/cc/bcc/replyTo/from', async () => {
    const r = await postSes(
      { ...FULL_BODY, template: 'auth.verifyEmail', data: { userId: USER_ID } },
      { messageId: 'never' },
    );
    expect(r.status).toBe(422);
    expect(r.calls).toBe(0);
    expectNoAddress();
    expect(line('unfilled footer placeholders')).toMatchObject({
      template: 'auth.verifyEmail',
      userId: USER_ID,
    });
  });

  it('data.userId that is an address is dropped, not logged', async () => {
    const r = await postSes(
      { ...FULL_BODY, template: 'auth.verifyEmail', data: { userId: addr('user') } },
      { messageId: 'never' },
    );
    expect(r.status).toBe(422);
    expectNoAddress();
    expect(line('unfilled footer placeholders')).toMatchObject({ template: 'auth.verifyEmail' });
  });

  it('userId that is not id-shaped (no "@", has spaces) is logged as "redacted"', async () => {
    await postSes(
      { ...FULL_BODY, template: 'auth.verifyEmail', data: { userId: `${LOCALS.user} at leak` } },
      { messageId: 'never' },
    );
    expectNoAddress();
    expect(line('unfilled footer placeholders').userId).toBe('redacted');
  });
});

describe('T-455 routes/send.ts: "Email sent via /send"', () => {
  it('SES success: template, provider, messageId, recipient count; no address', async () => {
    const r = await postSes(WELCOME(), { messageId: 'ses-msg-455' });
    expect(r.status).toBe(202);
    expect(JSON.parse(r.text)).toEqual({ messageId: 'ses-msg-455' });
    expectNoAddress();
    expect(line('Email sent via /send')).toMatchObject({
      template: 'auth.welcome',
      userId: USER_ID,
      provider: 'ses',
      recipientsCount: 2,
      messageId: 'ses-msg-455',
    });
  });

  it('SMTP success: provider "smtp", messageId kept; no address', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-msg-455' });
    const r = await post(SMTP_ENV, WELCOME(), mockNodemailer(sendMail), () =>
      jest.dontMock('nodemailer'),
    );
    expect(r.status).toBe(202);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expectNoAddress();
    expect(line('Email sent via /send')).toMatchObject({
      template: 'auth.welcome',
      provider: 'smtp',
      recipientsCount: 2,
      messageId: 'smtp-msg-455',
    });
  });

  it('dry-run with a dev redirect address: provider "dry-run", no address', async () => {
    const r = await post(
      { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true', EMAIL_DEV_REDIRECT_TO: addr('redirect') },
      WELCOME({ userId: addr('user') }),
    );
    expect(r.status).toBe(202);
    expectNoAddress();
    const sent = line('Email sent via /send');
    expect(sent).toMatchObject({
      template: 'auth.welcome',
      provider: 'dry-run',
      recipientsCount: 2,
    });
    expect(sent.userId).toBeUndefined();
    expect(line('Dry-run send')).toMatchObject({
      provider: 'dry-run',
      redirected: true,
      toCount: 1,
    });
  });
});

describe('T-455 routes/send.ts: "Email send failed via /send"', () => {
  it('SES rejection echoing the address: error name/code/status kept, no address', async () => {
    const r = await postSes(WELCOME(), { reject: sesError() });
    expect(r.status).toBe(500);
    expect(JSON.parse(r.text)).toEqual({ error: 'Failed to send email' });
    expectNoAddress();
    expect(line('Email send failed via /send')).toMatchObject({
      template: 'auth.welcome',
      userId: USER_ID,
      provider: 'ses',
      recipientsCount: 2,
      err: {
        name: 'EmailSendError',
        provider: 'ses',
        errorName: 'MessageRejected',
        statusCode: 400,
      },
    });
    expect(line('SES send failed')).toMatchObject({
      errorName: 'MessageRejected',
      statusCode: 400,
    });
  });

  it('SMTP rejection echoing the address: code/status kept, no address', async () => {
    const sendMail = jest.fn().mockRejectedValue(smtpError());
    const r = await post(SMTP_ENV, WELCOME(), mockNodemailer(sendMail), () =>
      jest.dontMock('nodemailer'),
    );
    expect(r.status).toBe(500);
    expectNoAddress();
    expect(line('Email send failed via /send')).toMatchObject({
      provider: 'smtp',
      err: { name: 'EmailSendError', provider: 'smtp', code: 'EENVELOPE', statusCode: 550 },
    });
    expect(line('SMTP send failed')).toMatchObject({ code: 'EENVELOPE', statusCode: 550 });
  });

  it('address-shaped template value: render throws (id echoed in the error), logged as "redacted"', async () => {
    const r = await post(
      { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true' },
      { ...WELCOME(), template: addr('tmpl') },
    );
    expect(r.status).toBe(500);
    expect(r.text).not.toContain(LOCALS.tmpl);
    expectNoAddress();
    const failed = line('Email send failed via /send');
    expect(failed.template).toBe('redacted');
    expect(failed).toMatchObject({ provider: 'dry-run', recipientsCount: 2 });
  });

  it('address-shaped template on a live SES send is "redacted" too', async () => {
    const r = await postSes({ ...WELCOME(), template: addr('tmpl') }, { messageId: 'x' });
    expect(r.status).toBe(500);
    expectNoAddress();
    expect(line('Email send failed via /send').template).toBe('redacted');
  });

  it('an unregistered but id-shaped template is still logged as itself', async () => {
    await post(
      { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true' },
      { ...WELCOME(), template: 'no.such' },
    );
    expectNoAddress();
    expect(line('Email send failed via /send').template).toBe('no.such');
  });

  it('non-provider error whose name and code carry an address: fields are redacted', async () => {
    const e = new Error(`boom ${addr('err')}`);
    e.name = addr('err');
    Object.assign(e, { code: addr('field') });
    // Provider errors are wrapped by the adapters; to reach send.ts with a raw error, fail the
    // render step instead.
    mockRenderError = e;
    const r = (await post({ EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true' }, WELCOME())).status;
    expect(r).toBe(500);
    expectNoAddress();
    expect(line('Email send failed via /send').err).toMatchObject({
      name: 'redacted',
      code: 'redacted',
    });
  });
});

describe('T-455 providers/ses.ts', () => {
  const mail = {
    to: [addr('to')],
    cc: [addr('cc')],
    bcc: [addr('bcc')],
    replyTo: addr('reply'),
    from: addr('from'),
    subject: `Hi ${addr('to')}`,
    html: `<p>${addr('to')}</p>`,
    text: addr('to'),
    meta: { template: 'auth.welcome', userId: addr('user'), jobId: addr('field') },
  };

  it('dry-run line (with dev redirect): counts and flags, ids redacted, no address', async () => {
    await withEnv(
      { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true', EMAIL_DEV_REDIRECT_TO: addr('redirect') },
      async () => {
        await jest.isolateModulesAsync(async () => {
          const { sendEmail } = await import('../providers/ses');
          await expect(sendEmail(mail)).resolves.toEqual({ messageId: null });
        });
      },
    );
    expectNoAddress();
    expect(line('Dry-run send')).toMatchObject({
      provider: 'dry-run',
      template: 'auth.welcome',
      userId: 'redacted',
      jobId: 'redacted',
      toCount: 1,
      redirected: true,
    });
  });

  it('"SES send failed": name/code/status/fault kept, no address, thrown error is sanitised', async () => {
    await withEnv(SES_ENV, async () => {
      await jest.isolateModulesAsync(async () => {
        const { SESv2Client } = await import('@aws-sdk/client-sesv2');
        const spy = jest
          .spyOn(SESv2Client.prototype, 'send')
          .mockRejectedValue(sesError() as never);
        const { sendEmail } = await import('../providers/ses');
        const thrown = await sendEmail(mail).catch((e: Error) => e);
        spy.mockRestore();
        expect((thrown as Error).name).toBe('EmailSendError');
        expect((thrown as Error).message).not.toMatch(ADDRESS_SHAPED);
      });
    });
    expectNoAddress();
    expect(line('SES send failed')).toMatchObject({
      provider: 'ses',
      template: 'auth.welcome',
      userId: 'redacted',
      errorName: 'MessageRejected',
      code: 'MessageRejected',
      statusCode: 400,
      fault: 'client',
    });
  });
});

describe('T-455 providers/smtp.ts', () => {
  const mail = {
    to: [addr('to')],
    cc: [addr('cc')],
    bcc: [addr('bcc')],
    replyTo: addr('reply'),
    subject: `Hi ${addr('to')}`,
    html: `<p>${addr('to')}</p>`,
    text: addr('to'),
    meta: { template: 'auth.welcome', userId: USER_ID },
  };

  it('dry-run line: counts and flags, no address', async () => {
    await withEnv(
      { EMAIL_PROVIDER: 'smtp', EMAIL_DRY_RUN: 'true', EMAIL_DEV_REDIRECT_TO: addr('redirect') },
      async () => {
        await jest.isolateModulesAsync(async () => {
          const { sendEmail } = await import('../providers/smtp');
          await expect(sendEmail(mail)).resolves.toEqual({ messageId: null });
        });
      },
    );
    expectNoAddress();
    expect(line('Dry-run send')).toMatchObject({
      provider: 'dry-run',
      template: 'auth.welcome',
      userId: USER_ID,
      toCount: 1,
      ccCount: 0,
      redirected: true,
    });
  });

  it('"SMTP send failed": code/status kept, no address, thrown error is sanitised', async () => {
    const sendMail = jest.fn().mockRejectedValue(smtpError());
    let thrown: unknown;
    await withEnv(SMTP_ENV, async () => {
      await jest.isolateModulesAsync(async () => {
        mockNodemailer(sendMail)();
        const { sendEmail } = await import('../providers/smtp');
        thrown = await sendEmail(mail).catch((e: Error) => e);
        jest.dontMock('nodemailer');
      });
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect((thrown as Error).name).toBe('EmailSendError');
    expect((thrown as Error).message).not.toMatch(ADDRESS_SHAPED);
    expectNoAddress();
    expect(line('SMTP send failed')).toMatchObject({
      provider: 'smtp',
      template: 'auth.welcome',
      userId: USER_ID,
      code: 'EENVELOPE',
      statusCode: 550,
    });
  });
});
