/**
 * T-223 worker side:
 *  AC7  dry run logs "verify email sent" with the userId only; tests pass without SES
 *  AC8  logs and Sentry never carry the address, the token, the link or the name
 *  Arjun 2  200 -> sends to the minted address; 409/404 -> job completes, no send, no Sentry;
 *           failed mint -> error code only; no userId -> UnrecoverableError
 *
 * The mint seam (createProcessor(send, mint)) replaces the call to auth; mintVerifyLinkViaAuth
 * itself is covered with a stubbed fetch. pino is real, writing to an in-memory sink.
 */
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';

import {
  createProcessor,
  mintVerifyLinkViaAuth,
  type EmailJobData,
  type MintedVerifyLink,
} from '../worker';

import {
  LEAK_ADDRESS,
  LEAK_NAME,
  allLogText,
  dump,
  parsedLogs,
  resetSink,
} from './helpers/t220-capture';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
// @react-email/render cannot run in Jest; the stand-in carries name and link as the real one does.
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async (_id: string, data: { name?: string; verifyUrl?: string }) => ({
    subject: 'Verify your Lawie email',
    html: `<p>Hello ${data.name}</p><a href="${data.verifyUrl}">Verify email</a>`,
    text: `Hello ${data.name}\nVerify email: ${data.verifyUrl}`,
  })),
}));

import { renderTemplate } from '../templates';

const TOKEN = 'cd'.repeat(32);
const LINK = `https://app.lawie.in/verify-email?token=${TOKEN}`;
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const MINTED: MintedVerifyLink = { email: LEAK_ADDRESS, name: LEAK_NAME, link: LINK };

const capture = Sentry.captureException as jest.Mock;
const crumb = Sentry.addBreadcrumb as jest.Mock;

function verifyJob(
  over: Partial<EmailJobData> = {},
  attemptsMade = 0,
  attempts = 5,
): Job<EmailJobData> {
  return {
    id: 'job-v1',
    queueName: 'email-high',
    attemptsMade,
    opts: { attempts },
    data: {
      template: 'auth.verifyEmail',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: USER_ID },
      ...over,
    },
  } as unknown as Job<EmailJobData>;
}

const okSend = () => jest.fn(async () => ({ messageId: 'dry-run-1' }));

function expectNoSensitive(extra: unknown[] = []) {
  const everything = [
    allLogText(),
    dump(capture.mock.calls),
    dump(crumb.mock.calls),
    dump((Sentry.captureMessage as jest.Mock).mock.calls),
    dump(extra),
  ].join('\n');
  for (const s of [LEAK_ADDRESS, 'leak@', LEAK_NAME, 'Zainab', TOKEN, 'verify-email?token', LINK]) {
    expect(everything).not.toContain(s);
  }
}

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
});

describe('T-223 worker: 200 from the mint seam', () => {
  it('mints for the job userId, renders {name, verifyUrl}, and sends to the minted address only', async () => {
    const send = okSend();
    const mint = jest.fn(async () => MINTED);
    const result = await createProcessor(send, mint)(verifyJob(), 'tok');

    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint).toHaveBeenCalledWith(USER_ID);
    expect(renderTemplate).toHaveBeenCalledWith('auth.verifyEmail', {
      name: LEAK_NAME,
      verifyUrl: LINK,
      signupInkGranted: false,
      userId: USER_ID,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
    expect(mail.bcc).toEqual([]);
    expect(mail.replyTo).toBeUndefined();
    expect(mail.subject).toBe('Verify your Lawie email');
    expect(mail.meta).toEqual({ template: 'auth.verifyEmail', userId: USER_ID, jobId: 'job-v1' });
    expect(result).toEqual({ messageId: 'dry-run-1' });
  });

  it('ignores any address, cc or bcc smuggled into the job: the minted address is the only recipient', async () => {
    const send = okSend();
    const job = verifyJob({
      to: ['attacker@evil.example'],
      cc: ['cc@evil.example'],
      bcc: ['bcc@evil.example'],
      replyTo: 'reply@evil.example',
    });
    await createProcessor(send, async () => MINTED)(job, 'tok');
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
    expect(mail.bcc).toEqual([]);
    expect(mail.replyTo).toBeUndefined();
  });

  it('a name from the job data is not used: greeting comes from the mint response', async () => {
    const send = okSend();
    await createProcessor(send, async () => ({ ...MINTED, name: 'From Auth' }))(
      verifyJob({
        data: { userId: USER_ID, name: 'From Job', verifyUrl: 'https://evil.example/x' },
      }),
      'tok',
    );
    expect(renderTemplate).toHaveBeenCalledWith('auth.verifyEmail', {
      name: 'From Auth',
      verifyUrl: LINK,
      signupInkGranted: false,
      userId: USER_ID,
    });
  });

  it('AC7 dry run: logs "verify email sent" with the userId only; no address, token, link or name anywhere', async () => {
    const send = okSend();
    await createProcessor(send, async () => MINTED)(verifyJob(), 'tok');

    const line = parsedLogs().find((l) => l.msg === 'verify email sent');
    expect(line).toBeDefined();
    expect(line!.userId).toBe(USER_ID);
    const extraKeys = Object.keys(line!).filter(
      (k) => !['level', 'time', 'pid', 'hostname', 'msg', 'userId'].includes(k),
    );
    expect(extraKeys).toEqual([]);
    expectNoSensitive();
  });

  it('records breadcrumbs with the template and userId, never an address (recipientsCount is the job to-count)', async () => {
    await createProcessor(okSend(), async () => MINTED)(verifyJob(), 'tok');
    const cats = crumb.mock.calls.map((c) => c[0].category);
    expect(cats).toEqual(['email.send.start', 'email.send.success']);
    expect(crumb.mock.calls[0][0].data).toMatchObject({
      template: 'auth.verifyEmail',
      userId: USER_ID,
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it('other templates are untouched: no mint, job recipients used', async () => {
    const send = okSend();
    const mint = jest.fn();
    const job = verifyJob({
      template: 'auth.welcome',
      to: ['advocate@example.com'],
      cc: ['c@example.com'],
      data: { name: 'N', userId: USER_ID },
    });
    await createProcessor(send, mint)(job, 'tok');
    expect(mint).not.toHaveBeenCalled();
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual(['advocate@example.com']);
    expect(mail.cc).toEqual(['c@example.com']);
    expect(parsedLogs().find((l) => l.msg === 'verify email sent')).toBeUndefined();
  });
});

describe('T-223 worker: 409 / 404 from auth (mint seam returns null)', () => {
  it('no send, the job completes as skipped, no Sentry, one info line with jobId/template/userId', async () => {
    const send = okSend();
    const result = await createProcessor(send, async () => null)(verifyJob(), 'tok');
    expect(result).toEqual({ skipped: 'not_eligible' });
    expect(send).not.toHaveBeenCalled();
    expect(renderTemplate).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(crumb.mock.calls.map((c) => c[0].category)).toEqual(['email.send.start']);

    const line = parsedLogs().find((l) => String(l.msg).startsWith('Verify email not sent'));
    expect(line).toMatchObject({ jobId: 'job-v1', template: 'auth.verifyEmail', userId: USER_ID });
    expect(parsedLogs().some((l) => l.level === 50)).toBe(false); // no error-level line
    expect(parsedLogs().find((l) => l.msg === 'verify email sent')).toBeUndefined();
    expectNoSensitive();
  });
});

describe('T-223 worker: failures', () => {
  it('no userId: UnrecoverableError, auth is never called, nothing is sent', async () => {
    const mint = jest.fn();
    const send = okSend();
    await expect(createProcessor(send, mint)(verifyJob({ data: {} }), 'tok')).rejects.toMatchObject(
      { name: 'UnrecoverableError' },
    );
    expect(mint).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('an address in place of a userId is not a userId: UnrecoverableError', async () => {
    const mint = jest.fn();
    await expect(
      createProcessor(okSend(), mint)(verifyJob({ data: { userId: LEAK_ADDRESS } }), 'tok'),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });
    expect(mint).not.toHaveBeenCalled();
    expectNoSensitive();
  });

  it('a failed mint rethrows a value-free error (name and code only) and does not send', async () => {
    const failing = Object.assign(new Error(`boom for ${LEAK_ADDRESS} ${LINK}`), {
      name: 'VerifyMintError',
      code: 'HTTP_500',
    });
    const send = okSend();
    const err = await createProcessor(send, async () => {
      throw failing;
    })(verifyJob(), 'tok').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('VerifyMintError (HTTP_500) in email send');
    expect(send).not.toHaveBeenCalled();
    // intermediate attempt: no Sentry event, but the failure is logged and a breadcrumb added
    expect(capture).not.toHaveBeenCalled();
    expect(parsedLogs().find((l) => l.msg === 'Email send failed')).toMatchObject({
      template: 'auth.verifyEmail',
      userId: USER_ID,
      finalAttempt: false,
    });
    expectNoSensitive([(err as Error).message, (err as Error).stack]);
  });

  it('final attempt of a failed mint: exactly one Sentry event, still value-free', async () => {
    const failing = Object.assign(new Error(`boom ${LEAK_ADDRESS}`), {
      name: 'VerifyMintError',
      code: 'HTTP_503',
    });
    await createProcessor(okSend(), async () => {
      throw failing;
    })(verifyJob({}, 4, 5), 'tok').catch(() => undefined);
    expect(capture).toHaveBeenCalledTimes(1);
    expect((capture.mock.calls[0][0] as Error).message).toBe(
      'VerifyMintError (HTTP_503) in email send',
    );
    expectNoSensitive();
  });

  it('a send failure after a good mint leaks nothing either', async () => {
    const send = jest.fn(async () => {
      throw new Error(`rejected ${LEAK_ADDRESS} ${LINK} ${LEAK_NAME}`);
    });
    const err = await createProcessor(send, async () => MINTED)(verifyJob({}, 4, 5), 'tok').catch(
      (e: Error) => e,
    );
    expectNoSensitive([(err as Error).message, (err as Error).stack]);
  });
});

describe('T-223 worker: mintVerifyLinkViaAuth (stubbed fetch)', () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });
  const reply = (status: number, body?: unknown) =>
    fetchMock.mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (body === undefined) throw new Error('no json');
        return body;
      },
    });

  it('POSTs {userId} to AUTH_SERVICE_URL/internal/verify-email/mint with the internal secret and a timeout', async () => {
    reply(200, { email: 'a@b.co', name: 'N', link: LINK });
    const r = await mintVerifyLinkViaAuth(USER_ID);
    expect(r).toEqual({ email: 'a@b.co', name: 'N', link: LINK, signupInkGranted: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4001/internal/verify-email/mint');
    expect(init.method).toBe('POST');
    expect(init.headers['x-internal-secret']).toBe(process.env.INTERNAL_SECRET);
    expect(init.headers['content-type']).toBe('application/json');
    // T-522: the verify mail asks for a 'signin' link (the route's default is 'verify').
    expect(JSON.parse(init.body)).toEqual({ userId: USER_ID, kind: 'signin' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([409, 404])('%i means "not eligible": returns null', async (status) => {
    reply(status, { error: 'x' });
    expect(await mintVerifyLinkViaAuth(USER_ID)).toBeNull();
  });

  it.each([401, 400, 500, 502])(
    'HTTP %i throws VerifyMintError with the code only',
    async (status) => {
      reply(status, { error: 'x', email: LEAK_ADDRESS });
      const err = await mintVerifyLinkViaAuth(USER_ID).catch((e: Error & { code?: string }) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe('VerifyMintError');
      expect((err as { code: string }).code).toBe(`HTTP_${status}`);
      expect((err as Error).message).toBe(`verify-email mint failed: HTTP_${status}`);
      expect(dump(err)).not.toContain(LEAK_ADDRESS);
    },
  );

  it.each([
    ['unparseable body', undefined],
    ['null body', null],
    ['no email', { name: 'N', link: LINK }],
    ['empty email', { email: '', name: 'N', link: LINK }],
    ['no link', { email: 'a@b.co', name: 'N' }],
    ['empty link', { email: 'a@b.co', name: 'N', link: '' }],
    ['non-string email', { email: 5, link: LINK }],
  ])('200 with %s: BAD_RESPONSE', async (_l, body) => {
    reply(200, body);
    await expect(mintVerifyLinkViaAuth(USER_ID)).rejects.toMatchObject({
      name: 'VerifyMintError',
      code: 'BAD_RESPONSE',
    });
  });

  it('a missing name becomes an empty string', async () => {
    reply(200, { email: 'a@b.co', link: LINK });
    expect(await mintVerifyLinkViaAuth(USER_ID)).toEqual({
      email: 'a@b.co',
      name: '',
      link: LINK,
      signupInkGranted: false,
    });
  });

  it('through the processor: a network error whose text names the URL leaves no URL in logs, Sentry or the thrown error', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(
        new Error('connect ECONNREFUSED http://localhost:4001/internal/verify-email/mint'),
        {
          code: 'ECONNREFUSED',
        },
      ),
    );
    const err = await createProcessor(okSend(), mintVerifyLinkViaAuth)(
      verifyJob({}, 4, 5),
      'tok',
    ).catch((e: Error) => e);
    expect((err as Error).message).toBe('Error (ECONNREFUSED) in email send');
    expect(capture).toHaveBeenCalledTimes(1);
    const text = [allLogText(), dump(capture.mock.calls), dump(crumb.mock.calls)].join('\n');
    expect(text).not.toContain('localhost:4001');
    expect(text).not.toContain('verify-email/mint');
  });

  it('through the processor: a 409 completes the job without a send', async () => {
    reply(409, { error: 'not_eligible' });
    const send = okSend();
    const result = await createProcessor(send, mintVerifyLinkViaAuth)(verifyJob(), 'tok');
    expect(result).toEqual({ skipped: 'not_eligible' });
    expect(send).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
