/**
 * T-358 worker side (Arjun rulings 2-3, Ajay 08a0d09 §8 row 4):
 *  - the job carries the userId only; the address, name, date and link come from auth's prepare
 *  - 409 / 404 from prepare: the job completes, nothing is sent, nothing is reported
 *  - a confirmed live send reports 'sent' AFTER the send; a recipient hard bounce
 *    (SMTP EENVELOPE 550/551/553) reports 'bounced' and the job completes
 *  - any other send failure is ours: the job retries, nothing is reported
 *  - dry run, or EMAIL_DEV_REDIRECT_TO set: nothing is reported (the deletion stays on hold)
 *  - the outcome report is tried 3 times; if it still fails the job completes (no second email)
 *  - no address, name, link or token in any log, breadcrumb or Sentry call
 *
 * The auth seam (createProcessor(send, mint, notice)) replaces the HTTP calls; the real HTTP
 * implementation is covered with a stubbed fetch. "Live" is simulated by mocking isLiveSend.
 */
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';

import { env } from '../config/env';
import { EmailSendError } from '../providers';
import {
  createProcessor,
  isRecipientHardBounce,
  startWorkers,
  stopWorkers,
  unverifiedNoticeViaAuth,
  type EmailJobData,
  type PreparedNotice,
  type UnverifiedNoticeDeps,
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
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(
    async (_id: string, data: { name?: string; verifyUrl?: string; deletionDate?: string }) => ({
      subject: 'Verify your email to keep your Lawie account',
      html: `<p>Hello ${data.name}</p><p>${data.deletionDate}</p><a href="${data.verifyUrl}">x</a>`,
      text: `Hello ${data.name}\n${data.deletionDate}\n${data.verifyUrl}`,
    }),
  ),
}));
let mockLive = true;
jest.mock('../placeholders', () => {
  const actual = jest.requireActual('../placeholders');
  // The verify email's own footer still has founder placeholders (T-436); that guard has its own
  // tests (t223-placeholder-guard). Here a live send is allowed so the outcome report can be seen.
  return { ...actual, isLiveSend: () => mockLive, templateHasUnfilledFooter: () => false };
});
const mockWorkerCtor = jest.fn();
jest.mock('bullmq', () => {
  const actual = jest.requireActual('bullmq');
  return {
    ...actual,
    Worker: jest.fn().mockImplementation((...a: unknown[]) => {
      mockWorkerCtor(...a);
      return { on: jest.fn(), close: jest.fn(async () => undefined) };
    }),
  };
});

import { renderTemplate } from '../templates';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const TOKEN = 'ab'.repeat(32);
const LINK = `https://app.lawie.in/verify-email?token=${TOKEN}`;
const PREPARED: PreparedNotice = {
  notice: 'first',
  variant: 'A',
  email: LEAK_ADDRESS,
  name: LEAK_NAME,
  link: LINK,
  deletionDate: '21 October 2026',
};

const capture = Sentry.captureException as jest.Mock;
const crumb = Sentry.addBreadcrumb as jest.Mock;

function noticeJob(
  over: Partial<EmailJobData> = {},
  attemptsMade = 0,
  attempts = 5,
): Job<EmailJobData> {
  return {
    id: 'unverified-notice:' + USER_ID,
    queueName: 'email-low',
    attemptsMade,
    opts: { attempts },
    data: {
      template: 'auth.unverifiedDeletionNotice',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: USER_ID },
      ...over,
    },
  } as unknown as Job<EmailJobData>;
}

const okSend = () => jest.fn(async () => ({ messageId: 'm-1' }));
function deps(over: Partial<UnverifiedNoticeDeps> = {}) {
  const prepare = jest.fn(async (_id: string): Promise<PreparedNotice | null> => PREPARED);
  const report = jest.fn(async (_id: string, _m: string, _o: 'sent' | 'bounced') => undefined);
  return { prepare, report, ...over } as UnverifiedNoticeDeps & {
    prepare: jest.Mock;
    report: jest.Mock;
  };
}
const NO_MINT = jest.fn();
/** A real recipient rejection: RCPT TO, 550/551/553, and a bad-destination status (5.1.1). */
const hardBounce = (statusCode = 550) =>
  new EmailSendError('smtp', {
    errorName: 'Error',
    code: 'EENVELOPE',
    statusCode,
    smtpCommand: 'RCPT TO',
    enhancedStatus: '5.1.1',
  });

function expectNoSensitive(extra: unknown[] = []) {
  const everything = [
    allLogText(),
    dump(capture.mock.calls),
    dump(crumb.mock.calls),
    dump(extra),
  ].join('\n');
  for (const s of [LEAK_ADDRESS, 'leak@', LEAK_NAME, 'Zainab', TOKEN, 'verify-email?token', LINK]) {
    expect(everything).not.toContain(s);
  }
}

const savedRedirect = env.EMAIL_DEV_REDIRECT_TO;
beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
  mockLive = true;
  (env as { EMAIL_DEV_REDIRECT_TO?: string }).EMAIL_DEV_REDIRECT_TO = undefined;
});
afterEach(() => {
  (env as { EMAIL_DEV_REDIRECT_TO?: string }).EMAIL_DEV_REDIRECT_TO = savedRedirect;
  jest.useRealTimers();
});

describe('prepare, render and send', () => {
  it('asks auth for the job userId, renders {variant, name, verifyUrl, deletionDate, userId}, sends to the prepared address only', async () => {
    const send = okSend();
    const d = deps();
    const result = await createProcessor(send, NO_MINT, d)(noticeJob(), 'tok');
    expect(d.prepare).toHaveBeenCalledTimes(1);
    expect(d.prepare).toHaveBeenCalledWith(USER_ID);
    expect(NO_MINT).not.toHaveBeenCalled();
    expect(renderTemplate).toHaveBeenCalledWith('auth.unverifiedDeletionNotice', {
      variant: 'A',
      name: LEAK_NAME,
      verifyUrl: LINK,
      deletionDate: '21 October 2026',
      userId: USER_ID,
    });
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
    expect(mail.bcc).toEqual([]);
    expect(mail.replyTo).toBeUndefined();
    expect(mail.subject).toBe('Verify your email to keep your Lawie account');
    expect(mail.meta).toEqual({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      jobId: 'unverified-notice:' + USER_ID,
    });
    expect(result).toEqual({ messageId: 'm-1' });
  });

  it('ignores an address, cc, bcc, name, link or date smuggled into the job', async () => {
    const send = okSend();
    const d = deps();
    await createProcessor(
      send,
      NO_MINT,
      d,
    )(
      noticeJob({
        to: ['attacker@evil.example'],
        cc: ['cc@evil.example'],
        bcc: ['bcc@evil.example'],
        replyTo: 'reply@evil.example',
        data: {
          userId: USER_ID,
          name: 'From Job',
          verifyUrl: 'https://evil.example/x',
          deletionDate: '1 January 2099',
        },
      }),
      'tok',
    );
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
    expect(mail.bcc).toEqual([]);
    expect(mail.replyTo).toBeUndefined();
    expect(renderTemplate).toHaveBeenCalledWith('auth.unverifiedDeletionNotice', {
      variant: 'A',
      name: LEAK_NAME,
      verifyUrl: LINK,
      deletionDate: '21 October 2026',
      userId: USER_ID,
    });
  });

  it('no userId: UnrecoverableError, auth is never called, nothing sent or reported', async () => {
    const send = okSend();
    const d = deps();
    await expect(
      createProcessor(send, NO_MINT, d)(noticeJob({ data: {} }), 'tok'),
    ).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect(d.prepare).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('an address in place of a userId is refused too', async () => {
    const d = deps();
    await expect(
      createProcessor(okSend(), NO_MINT, d)(noticeJob({ data: { userId: LEAK_ADDRESS } }), 'tok'),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });
    expect(d.prepare).not.toHaveBeenCalled();
    expectNoSensitive();
  });
});

describe('409 / 404 from auth (prepare returns null)', () => {
  it('completes as skipped: no render, no send, no report, no Sentry, no error log', async () => {
    const send = okSend();
    const d = deps({ prepare: jest.fn(async () => null) });
    const result = await createProcessor(send, NO_MINT, d)(noticeJob(), 'tok');
    expect(result).toEqual({ skipped: 'not_eligible' });
    expect(send).not.toHaveBeenCalled();
    expect(renderTemplate).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(parsedLogs().some((l) => l.level === 50)).toBe(false);
    expect(
      parsedLogs().find((l) => String(l.msg).startsWith('Unverified notice not sent')),
    ).toMatchObject({
      userId: USER_ID,
      template: 'auth.unverifiedDeletionNotice',
    });
    expectNoSensitive();
  });
});

describe('a failed prepare', () => {
  it('rethrows a value-free error, sends nothing, reports nothing (BullMQ retries)', async () => {
    const failing = Object.assign(new Error(`boom for ${LEAK_ADDRESS} ${LINK}`), {
      name: 'NoticeAuthError',
      code: 'HTTP_500',
    });
    const send = okSend();
    const d = deps({
      prepare: jest.fn(async () => {
        throw failing;
      }),
    });
    const err = await createProcessor(send, NO_MINT, d)(noticeJob(), 'tok').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('NoticeAuthError (HTTP_500) in email send');
    expect(send).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled(); // not the final attempt
    expectNoSensitive([(err as Error).message, (err as Error).stack]);
  });
});

describe('a confirmed live send reports sent', () => {
  it('reports "sent" for the userId exactly once, and only after the send', async () => {
    const order: string[] = [];
    const send = jest.fn(async () => {
      order.push('send');
      return { messageId: 'm-9' };
    });
    const d = deps({
      report: jest.fn(async () => {
        order.push('report');
      }),
    });
    const result = await createProcessor(send, NO_MINT, d)(noticeJob(), 'tok');
    expect(order).toEqual(['send', 'report']);
    expect(d.report).toHaveBeenCalledTimes(1);
    expect(d.report).toHaveBeenCalledWith(USER_ID, 'notice_first', 'sent');
    expect(result).toEqual({ messageId: 'm-9' });
    expectNoSensitive();
  });
});

describe('recipient hard bounce vs our own failure', () => {
  it.each([550, 551, 553])(
    'SMTP EENVELOPE %i: reports "bounced", the job completes, no retry, no Sentry',
    async (status) => {
      const send = jest.fn(async () => {
        throw hardBounce(status);
      });
      const d = deps();
      const result = await createProcessor(send, NO_MINT, d)(noticeJob(), 'tok');
      expect(result).toEqual({ skipped: 'hard_bounce' });
      expect(d.report).toHaveBeenCalledTimes(1);
      expect(d.report).toHaveBeenCalledWith(USER_ID, 'notice_first', 'bounced');
      expect(capture).not.toHaveBeenCalled();
      expectNoSensitive();
    },
  );

  it.each([
    [
      'EENVELOPE 450 (temporary)',
      new EmailSendError('smtp', { code: 'EENVELOPE', statusCode: 450 }),
    ],
    ['EENVELOPE 554', new EmailSendError('smtp', { code: 'EENVELOPE', statusCode: 554 })],
    ['EENVELOPE without a status', new EmailSendError('smtp', { code: 'EENVELOPE' })],
    ['SMTP ECONNECTION', new EmailSendError('smtp', { code: 'ECONNECTION' })],
    ['SMTP ETIMEDOUT', new EmailSendError('smtp', { code: 'ETIMEDOUT' })],
    ['SMTP EAUTH 535', new EmailSendError('smtp', { code: 'EAUTH', statusCode: 535 })],
    ['SES 550-like status', new EmailSendError('ses', { code: 'EENVELOPE', statusCode: 550 })],
    ['SES throttling', new EmailSendError('ses', { errorName: 'Throttling', statusCode: 400 })],
    [
      'SES MessageRejected',
      new EmailSendError('ses', { errorName: 'MessageRejected', statusCode: 400 }),
    ],
    ['a plain Error', new Error('boom')],
  ])('%s: our failure, the job retries, nothing is reported', async (_l, err) => {
    const send = jest.fn(async () => {
      throw err;
    });
    const d = deps();
    await expect(createProcessor(send, NO_MINT, d)(noticeJob(), 'tok')).rejects.toBeInstanceOf(
      Error,
    );
    expect(d.report).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled(); // attempt 1 of 5
  });

  it('isRecipientHardBounce is true only for smtp EENVELOPE 550/551/553', () => {
    expect(isRecipientHardBounce(hardBounce(550))).toBe(true);
    expect(isRecipientHardBounce(hardBounce(551))).toBe(true);
    expect(isRecipientHardBounce(hardBounce(553))).toBe(true);
    expect(isRecipientHardBounce(hardBounce(552))).toBe(false);
    expect(isRecipientHardBounce(new Error('550'))).toBe(false);
    expect(isRecipientHardBounce(undefined)).toBe(false);
    expect(isRecipientHardBounce({ code: 'EENVELOPE', statusCode: 550, provider: 'smtp' })).toBe(
      false,
    );
  });

  it('a final-attempt failure of ours raises one value-free Sentry event and reports nothing', async () => {
    const send = jest.fn(async () => {
      throw new EmailSendError('ses', { errorName: 'Throttling', statusCode: 400 });
    });
    const d = deps();
    await expect(
      createProcessor(send, NO_MINT, d)(noticeJob({}, 4, 5), 'tok'),
    ).rejects.toBeInstanceOf(Error);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(d.report).not.toHaveBeenCalled();
    expectNoSensitive(capture.mock.calls);
  });

  it('a hard bounce in dry run or with a dev redirect is not reported (no recipient was tried)', async () => {
    const send = jest.fn(async () => {
      throw hardBounce();
    });
    const d1 = deps();
    mockLive = false;
    await expect(createProcessor(send, NO_MINT, d1)(noticeJob(), 'tok')).rejects.toBeInstanceOf(
      Error,
    );
    expect(d1.report).not.toHaveBeenCalled();

    mockLive = true;
    (env as { EMAIL_DEV_REDIRECT_TO?: string }).EMAIL_DEV_REDIRECT_TO =
      'success@simulator.amazonses.com';
    const d2 = deps();
    await expect(createProcessor(send, NO_MINT, d2)(noticeJob(), 'tok')).rejects.toBeInstanceOf(
      Error,
    );
    expect(d2.report).not.toHaveBeenCalled();
  });
});

describe('dry run and dev redirect report no outcome', () => {
  it('dry run: the email "sends" but nothing is reported; one info line, ids only', async () => {
    mockLive = false;
    const d = deps();
    const result = await createProcessor(okSend(), NO_MINT, d)(noticeJob(), 'tok');
    expect(result).toEqual({ messageId: 'm-1' });
    expect(d.report).not.toHaveBeenCalled();
    expect(
      parsedLogs().find((l) => String(l.msg).startsWith('Verify mail outcome not recorded')),
    ).toMatchObject({
      userId: USER_ID,
    });
    expectNoSensitive();
  });

  it('EMAIL_DEV_REDIRECT_TO set: the user got nothing, so nothing is reported', async () => {
    (env as { EMAIL_DEV_REDIRECT_TO?: string }).EMAIL_DEV_REDIRECT_TO =
      'success@simulator.amazonses.com';
    const d = deps();
    const result = await createProcessor(okSend(), NO_MINT, d)(noticeJob(), 'tok');
    expect(result).toEqual({ messageId: 'm-1' });
    expect(d.report).not.toHaveBeenCalled();
  });
});

describe('outcome report failure after a real send', () => {
  it('is tried 3 times, logged with ids only, and the job still completes (no second email)', async () => {
    jest.useFakeTimers();
    const send = okSend();
    const d = deps({
      report: jest.fn(async () => {
        throw Object.assign(new Error(`down ${LEAK_ADDRESS}`), {
          name: 'NoticeAuthError',
          code: 'HTTP_503',
        });
      }),
    });
    const p = createProcessor(send, NO_MINT, d)(noticeJob(), 'tok');
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toEqual({ messageId: 'm-1' });
    expect(d.report).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledTimes(1);
    const line = parsedLogs().find((l) =>
      String(l.msg).startsWith('Verify mail outcome not recorded'),
    );
    expect(line).toMatchObject({
      userId: USER_ID,
      mail: 'notice_first',
      outcome: 'sent',
      level: 50,
    });
    expect(capture).not.toHaveBeenCalled();
    expectNoSensitive();
  });

  it('succeeds on the third try: stops there', async () => {
    jest.useFakeTimers();
    let n = 0;
    const d = deps({
      report: jest.fn(async () => {
        n += 1;
        if (n < 3) throw new Error('flaky');
      }),
    });
    const p = createProcessor(okSend(), NO_MINT, d)(noticeJob(), 'tok');
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toEqual({ messageId: 'm-1' });
    expect(d.report).toHaveBeenCalledTimes(3);
    expect(
      parsedLogs().some((l) => String(l.msg).startsWith('Verify mail outcome not recorded')),
    ).toBe(false);
  });

  it('a bounce report that keeps failing still completes the job', async () => {
    jest.useFakeTimers();
    const send = jest.fn(async () => {
      throw hardBounce();
    });
    const d = deps({ report: jest.fn(async () => Promise.reject(new Error('x'))) });
    const p = createProcessor(send, NO_MINT, d)(noticeJob(), 'tok');
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toEqual({ skipped: 'hard_bounce' });
    expect(d.report).toHaveBeenCalledTimes(3);
  });
});

describe('other templates are untouched', () => {
  it('auth.welcome: no prepare, no report; the job recipients are used', async () => {
    const send = okSend();
    const d = deps();
    await createProcessor(
      send,
      NO_MINT,
      d,
    )(
      noticeJob({
        template: 'auth.welcome',
        to: ['advocate@example.com'],
        cc: ['c@example.com'],
        data: { name: 'N', userId: USER_ID },
      }),
      'tok',
    );
    expect(d.prepare).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual(['advocate@example.com']);
    expect(mail.cc).toEqual(['c@example.com']);
  });
});

describe('startWorkers passes the notice deps to the processor', () => {
  afterEach(async () => {
    await stopWorkers();
  });
  it('a processor built by startWorkers({notice}) uses that prepare/report', async () => {
    const d = deps();
    mockLive = false; // live mode refuses to start while any other template's footer has placeholders
    startWorkers({
      connection: { host: 'x', port: 1 } as never,
      send: okSend(),
      mint: NO_MINT,
      notice: d,
    });
    mockLive = true;
    expect(mockWorkerCtor).toHaveBeenCalledTimes(2);
    const processor = mockWorkerCtor.mock.calls[0][1] as (j: Job<EmailJobData>) => Promise<unknown>;
    await processor(noticeJob());
    expect(d.prepare).toHaveBeenCalledWith(USER_ID);
    expect(d.report).toHaveBeenCalledWith(USER_ID, 'notice_first', 'sent');
  });
});

describe('unverifiedNoticeViaAuth: the real HTTP calls (stubbed fetch)', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
  });
  function stub(status: number, body?: unknown) {
    const f = jest.fn(async () => ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (body === 'BAD_JSON') throw new Error('bad json');
        return body;
      },
    }));
    global.fetch = f as unknown as typeof fetch;
    return f;
  }

  it('prepare POSTs { userId } with the internal secret to AUTH_SERVICE_URL', async () => {
    const f = stub(200, { ...PREPARED });
    const out = await unverifiedNoticeViaAuth.prepare(USER_ID);
    expect(out).toEqual(PREPARED);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${env.AUTH_SERVICE_URL}/internal/unverified-notice/prepare`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-internal-secret']).toBe(env.INTERNAL_SECRET);
    expect(JSON.parse(String(init.body))).toEqual({ userId: USER_ID });
  });

  it.each([409, 404])('prepare %i -> null', async (s) => {
    stub(s, { error: 'x' });
    expect(await unverifiedNoticeViaAuth.prepare(USER_ID)).toBeNull();
  });

  it.each([401, 400, 500, 503])('prepare %i -> a value-free NoticeAuthError', async (s) => {
    stub(s, {});
    await expect(unverifiedNoticeViaAuth.prepare(USER_ID)).rejects.toMatchObject({
      name: 'NoticeAuthError',
      code: `HTTP_${s}`,
    });
  });

  it.each([
    ['no notice', { variant: 'A', email: 'a@b.c', name: 'n', link: LINK, deletionDate: 'd' }],
    [
      'unknown notice',
      { notice: 'x', variant: 'A', email: 'a@b.c', link: LINK, deletionDate: 'd' },
    ],
    ['no variant', { notice: 'first', email: 'a@b.c', link: LINK, deletionDate: 'd' }],
    [
      'unknown variant',
      { notice: 'first', variant: 'C', email: 'a@b.c', link: LINK, deletionDate: 'd' },
    ],
    ['no email', { notice: 'first', variant: 'A', name: 'n', link: LINK, deletionDate: 'd' }],
    [
      'A without a link',
      { notice: 'first', variant: 'A', email: 'a@b.c', name: 'n', deletionDate: 'd' },
    ],
    [
      'A with an empty link',
      { notice: 'first', variant: 'A', email: 'a@b.c', link: '', deletionDate: 'd' },
    ],
    [
      'B WITH a link',
      { notice: 'warning', variant: 'B', email: 'a@b.c', link: LINK, deletionDate: 'd' },
    ],
    ['no date', { notice: 'first', variant: 'A', email: 'a@b.c', name: 'n', link: LINK }],
    ['unparseable', 'BAD_JSON'],
    ['null', null],
  ])('prepare 200 with %s -> BAD_RESPONSE', async (_l, body) => {
    stub(200, body);
    await expect(unverifiedNoticeViaAuth.prepare(USER_ID)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    });
  });

  it('prepare 200 variant B without a link is accepted and carries no link', async () => {
    stub(200, {
      notice: 'warning',
      variant: 'B',
      email: 'a@b.c',
      name: 'n',
      deletionDate: '21 October 2026',
    });
    const out = await unverifiedNoticeViaAuth.prepare(USER_ID);
    expect(out).toEqual({
      notice: 'warning',
      variant: 'B',
      email: 'a@b.c',
      name: 'n',
      deletionDate: '21 October 2026',
    });
    expect(out).not.toHaveProperty('link');
  });

  it('prepare tolerates a missing name (greeting falls back to "Hello,")', async () => {
    stub(200, {
      notice: 'first',
      variant: 'A',
      email: 'a@b.c',
      link: LINK,
      deletionDate: '21 October 2026',
    });
    expect((await unverifiedNoticeViaAuth.prepare(USER_ID))!.name).toBe('');
  });

  it.each([
    ['verify', 'sent'],
    ['notice_first', 'sent'],
    ['notice_warning', 'bounced'],
  ] as const)('report POSTs { userId, mail: %s, outcome: %s }', async (m, o) => {
    const f = stub(200, { firstStamped: true, warningStamped: false });
    await unverifiedNoticeViaAuth.report(USER_ID, m, o);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${env.AUTH_SERVICE_URL}/internal/unverified-notice/outcome`);
    expect(JSON.parse(String(init.body))).toEqual({ userId: USER_ID, mail: m, outcome: o });
    expect((init.headers as Record<string, string>)['x-internal-secret']).toBe(env.INTERNAL_SECRET);
  });

  it('nothing stamped (both false: already stamped or no longer unverified) is not a failure', async () => {
    stub(200, { firstStamped: false, warningStamped: false });
    await expect(
      unverifiedNoticeViaAuth.report(USER_ID, 'verify', 'sent'),
    ).resolves.toBeUndefined();
  });

  it('a 404 (no such user) is treated as done', async () => {
    stub(404, { error: 'not_found' });
    await expect(
      unverifiedNoticeViaAuth.report(USER_ID, 'verify', 'sent'),
    ).resolves.toBeUndefined();
  });

  it.each([401, 400, 500, 503])('report %i throws a value-free error', async (s) => {
    stub(s, {});
    await expect(unverifiedNoticeViaAuth.report(USER_ID, 'verify', 'sent')).rejects.toMatchObject({
      name: 'NoticeAuthError',
      code: `HTTP_${s}`,
    });
  });
});

// ── Round 2: the warning notice, variant B, and verify-email outcome reporting ──

function verifyJob(attemptsMade = 0, attempts = 5): Job<EmailJobData> {
  return noticeJob(
    { template: 'auth.verifyEmail', data: { userId: USER_ID } },
    attemptsMade,
    attempts,
  );
}
const MINTED = { email: LEAK_ADDRESS, name: LEAK_NAME, link: LINK };

describe('notice kind and variant map to the mail name', () => {
  it.each([
    ['first', 'A', 'notice_first'],
    ['warning', 'A', 'notice_warning'],
    ['first', 'B', 'notice_first'],
    ['warning', 'B', 'notice_warning'],
  ] as const)('%s / variant %s reports mail %s', async (notice, variant, mail) => {
    const prepared: PreparedNotice =
      variant === 'A'
        ? { ...PREPARED, notice, variant }
        : {
            notice,
            variant,
            email: LEAK_ADDRESS,
            name: LEAK_NAME,
            deletionDate: '21 October 2026',
          };
    const d = deps({ prepare: jest.fn(async () => prepared) });
    await createProcessor(okSend(), NO_MINT, d)(noticeJob(), 'tok');
    expect(d.report).toHaveBeenCalledWith(USER_ID, mail, 'sent');
    expectNoSensitive();
  });

  it('a bounce reports the warning kind as notice_warning', async () => {
    const d = deps({ prepare: jest.fn(async () => ({ ...PREPARED, notice: 'warning' as const })) });
    const send = jest.fn(async () => {
      throw hardBounce();
    });
    await createProcessor(send, NO_MINT, d)(noticeJob(), 'tok');
    expect(d.report).toHaveBeenCalledWith(USER_ID, 'notice_warning', 'bounced');
  });
});

describe('variant B in the worker', () => {
  const B: PreparedNotice = {
    notice: 'first',
    variant: 'B',
    email: LEAK_ADDRESS,
    name: LEAK_NAME,
    deletionDate: '21 October 2026',
  };

  it('renders variant B with no verifyUrl key at all, and sends to the prepared address', async () => {
    const send = okSend();
    const d = deps({ prepare: jest.fn(async () => B) });
    await createProcessor(send, NO_MINT, d)(noticeJob(), 'tok');
    expect(renderTemplate).toHaveBeenCalledWith('auth.unverifiedDeletionNotice', {
      variant: 'B',
      name: LEAK_NAME,
      deletionDate: '21 October 2026',
      userId: USER_ID,
    });
    const rendered = (renderTemplate as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect('verifyUrl' in rendered).toBe(false);
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
  });

  it('a link in the job data is never passed on for variant B', async () => {
    const d = deps({ prepare: jest.fn(async () => B) });
    await createProcessor(
      okSend(),
      NO_MINT,
      d,
    )(noticeJob({ data: { userId: USER_ID, verifyUrl: 'https://evil.example/x' } }), 'tok');
    const rendered = (renderTemplate as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect('verifyUrl' in rendered).toBe(false);
  });
});

describe('verify-email outcome reporting (auth.verifyEmail jobs stamp the T-358 clock)', () => {
  it('a confirmed live send reports (userId, "verify", "sent") once, after the send', async () => {
    const order: string[] = [];
    const send = jest.fn(async () => {
      order.push('send');
      return { messageId: 'v-1' };
    });
    const d = deps({
      report: jest.fn(async () => {
        order.push('report');
      }),
    });
    const result = await createProcessor(send, async () => MINTED, d)(verifyJob(), 'tok');
    expect(order).toEqual(['send', 'report']);
    expect(d.report).toHaveBeenCalledTimes(1);
    expect(d.report).toHaveBeenCalledWith(USER_ID, 'verify', 'sent');
    expect(d.prepare).not.toHaveBeenCalled();
    expect(result).toEqual({ messageId: 'v-1' });
    expectNoSensitive();
  });

  it('a resend job reports again (auth stamps F once; the worker does not decide)', async () => {
    const d = deps();
    const p = createProcessor(okSend(), async () => MINTED, d);
    await p(verifyJob(), 'tok');
    await p(verifyJob(), 'tok');
    expect(d.report).toHaveBeenCalledTimes(2);
  });

  it('a recipient hard bounce reports "bounced" and the job completes without retry', async () => {
    const send = jest.fn(async () => {
      throw hardBounce(553);
    });
    const d = deps();
    const result = await createProcessor(send, async () => MINTED, d)(verifyJob(), 'tok');
    expect(result).toEqual({ skipped: 'hard_bounce' });
    expect(d.report).toHaveBeenCalledWith(USER_ID, 'verify', 'bounced');
    expect(capture).not.toHaveBeenCalled();
    expectNoSensitive();
  });

  it.each([
    ['SMTP 450', new EmailSendError('smtp', { code: 'EENVELOPE', statusCode: 450 })],
    ['SMTP connection', new EmailSendError('smtp', { code: 'ECONNECTION' })],
    ['SES throttle', new EmailSendError('ses', { errorName: 'Throttling', statusCode: 400 })],
    ['plain Error', new Error('boom')],
  ])('our own failure (%s): the job retries and nothing is reported', async (_l, err) => {
    const send = jest.fn(async () => {
      throw err;
    });
    const d = deps();
    await expect(
      createProcessor(send, async () => MINTED, d)(verifyJob(), 'tok'),
    ).rejects.toBeInstanceOf(Error);
    expect(d.report).not.toHaveBeenCalled();
  });

  it('dry run: nothing is reported (the user got nothing)', async () => {
    mockLive = false;
    const d = deps();
    await createProcessor(okSend(), async () => MINTED, d)(verifyJob(), 'tok');
    expect(d.report).not.toHaveBeenCalled();
  });

  it('EMAIL_DEV_REDIRECT_TO set: nothing is reported', async () => {
    (env as { EMAIL_DEV_REDIRECT_TO?: string }).EMAIL_DEV_REDIRECT_TO =
      'success@simulator.amazonses.com';
    const d = deps();
    await createProcessor(okSend(), async () => MINTED, d)(verifyJob(), 'tok');
    expect(d.report).not.toHaveBeenCalled();
  });

  it('a bounce in dry run or redirect is not reported either', async () => {
    const send = jest.fn(async () => {
      throw hardBounce();
    });
    mockLive = false;
    const d = deps();
    await expect(
      createProcessor(send, async () => MINTED, d)(verifyJob(), 'tok'),
    ).rejects.toBeInstanceOf(Error);
    expect(d.report).not.toHaveBeenCalled();
  });

  it('mint 409/404 (null): no send, no report', async () => {
    const send = okSend();
    const d = deps();
    const result = await createProcessor(send, async () => null, d)(verifyJob(), 'tok');
    expect(result).toEqual({ skipped: 'not_eligible' });
    expect(send).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
  });

  it('a report failure is retried 3 times, logged with ids only, and the job still completes (no second email)', async () => {
    jest.useFakeTimers();
    const send = okSend();
    const d = deps({
      report: jest.fn(async () => Promise.reject(new Error(`down ${LEAK_ADDRESS}`))),
    });
    const p = createProcessor(send, async () => MINTED, d)(verifyJob(), 'tok');
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toEqual({ messageId: 'm-1' });
    expect(d.report).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      parsedLogs().find((l) => String(l.msg).startsWith('Verify mail outcome not recorded')),
    ).toMatchObject({
      userId: USER_ID,
      mail: 'verify',
      level: 50,
    });
    expectNoSensitive();
  });

  it('a 404 from the route (via the real HTTP seam) is treated as done: one call, no retry', async () => {
    const f = jest.fn(async () => ({
      status: 404,
      ok: false,
      json: async () => ({ error: 'not_found' }),
    }));
    const orig = global.fetch;
    global.fetch = f as unknown as typeof fetch;
    try {
      const result = await createProcessor(
        okSend(),
        async () => MINTED,
        unverifiedNoticeViaAuth,
      )(verifyJob(), 'tok');
      expect(result).toEqual({ messageId: 'm-1' });
      expect(f).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = orig;
    }
  });

  it('other templates (auth.welcome) never report', async () => {
    const d = deps();
    await createProcessor(
      okSend(),
      NO_MINT,
      d,
    )(
      noticeJob({
        template: 'auth.welcome',
        to: ['advocate@example.com'],
        data: { name: 'N', userId: USER_ID },
      }),
      'tok',
    );
    expect(d.report).not.toHaveBeenCalled();
  });
});
