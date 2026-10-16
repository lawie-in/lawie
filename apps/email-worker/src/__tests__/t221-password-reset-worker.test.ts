/**
 * T-221 worker side: an auth.passwordReset job carries the userId only; the address and the link
 * (or login URL) come from auth's mint at send time. 404 -> nothing sent. Dry run -> no live send.
 * Nothing sensitive in any log, breadcrumb or Sentry call.
 */
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';

import { env } from '../config/env';
import {
  createProcessor,
  mintPasswordResetViaAuth,
  type EmailJobData,
  type MintedPasswordReset,
} from '../worker';

import { LEAK_ADDRESS, allLogText, dump, parsedLogs, resetSink } from './helpers/t220-capture';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
jest.mock('../templates', () => {
  const actual = jest.requireActual('../templates');
  return {
    ...actual,
    renderTemplate: jest.fn(
      async (_id: string, data: { resetUrl?: string; loginUrl?: string }) => ({
        subject: 'Reset your Lawie password',
        html: `<a href="${data.resetUrl ?? data.loginUrl}">x</a>`,
        text: `${data.resetUrl ?? data.loginUrl}`,
      }),
    ),
  };
});
let mockLive = true;
jest.mock('../placeholders', () => {
  const actual = jest.requireActual('../placeholders');
  return { ...actual, isLiveSend: () => mockLive, templateHasUnfilledFooter: () => false };
});

import { renderTemplate } from '../templates';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const TOKEN = 'cd'.repeat(32);
const RESET_URL = `https://app.lawie.in/reset-password/${TOKEN}`;
const LOGIN_URL = 'https://app.lawie.in/login';
const LINK: MintedPasswordReset = { variant: 'link', email: LEAK_ADDRESS, resetUrl: RESET_URL };
const GOOGLE: MintedPasswordReset = { variant: 'google', email: LEAK_ADDRESS, loginUrl: LOGIN_URL };

const job = (over: Partial<EmailJobData> = {}): Job<EmailJobData> =>
  ({
    id: 'j1',
    queueName: 'email-high',
    attemptsMade: 0,
    opts: { attempts: 5 },
    data: {
      template: 'auth.passwordReset',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: USER_ID },
      ...over,
    },
  }) as unknown as Job<EmailJobData>;

const okSend = () => jest.fn(async () => ({ messageId: 'm-1' }));
const NO = jest.fn();
const noticeDeps = { prepare: jest.fn(), report: jest.fn() };
const run = (send: jest.Mock, pr: jest.Mock, j = job()) =>
  createProcessor(send, NO, noticeDeps as never, NO, pr)(j, 'tok');

// Obviously fake; never the real GST_ADDRESS. Each test sets or deletes it explicitly, and the
// suite restores whatever the shell had.
const FAKE_STREET = '12 Example Marg, Fake Nagar';
const savedAddress = process.env.GST_ADDRESS;
const setAddress = (v: string | undefined) => {
  if (v === undefined) delete process.env.GST_ADDRESS;
  else process.env.GST_ADDRESS = v;
};
afterAll(() => setAddress(savedAddress));

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
  mockLive = true;
  setAddress(FAKE_STREET);
});

describe('processor', () => {
  it('link: asks auth for the job userId, renders {variant, resetUrl, userId}, sends to the minted address only', async () => {
    const send = okSend();
    const pr = jest.fn(async () => LINK);
    const out = await run(
      send,
      pr,
      job({ to: ['attacker@evil.example'], cc: ['c@evil.example'], bcc: ['b@evil.example'] }),
    );
    expect(pr).toHaveBeenCalledWith(USER_ID);
    expect(renderTemplate).toHaveBeenCalledWith('auth.passwordReset', {
      variant: 'link',
      resetUrl: RESET_URL,
      userId: USER_ID,
      streetAddress: FAKE_STREET,
    });
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
    expect(mail.bcc).toEqual([]);
    expect(out).toEqual({ messageId: 'm-1' });
  });

  it('google: renders {variant google, loginUrl}, no reset URL', async () => {
    const send = okSend();
    await run(
      send,
      jest.fn(async () => GOOGLE),
    );
    expect(renderTemplate).toHaveBeenCalledWith('auth.passwordReset', {
      variant: 'google',
      loginUrl: LOGIN_URL,
      userId: USER_ID,
      streetAddress: FAKE_STREET,
    });
    expect(dump(send.mock.calls)).not.toContain('reset-password');
  });

  it('mint returns null (404): nothing rendered, nothing sent, job completes', async () => {
    const send = okSend();
    const out = await run(
      send,
      jest.fn(async () => null),
    );
    expect(out).toEqual({ skipped: 'not_eligible' });
    expect(send).not.toHaveBeenCalled();
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it('job without a userId: nothing minted, nothing sent, unrecoverable', async () => {
    const send = okSend();
    const pr = jest.fn();
    await expect(run(send, pr, job({ data: {} }))).rejects.toThrow(/UnrecoverableError/);
    expect(pr).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('a mint failure retries the job (throws) and sends nothing', async () => {
    const send = okSend();
    await expect(
      run(
        send,
        jest.fn(async () => {
          throw new Error(`down ${TOKEN}`);
        }),
      ),
    ).rejects.toBeDefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('live + GST_ADDRESS set: sends, with the address handed to the renderer for footer line 1', async () => {
    setAddress('  12 Example Marg,\n  Fake Nagar  ');
    const send = okSend();
    await run(
      send,
      jest.fn(async () => LINK),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (renderTemplate as jest.Mock).mock.calls.some(
        (c) => (c[1] as { streetAddress?: string }).streetAddress === FAKE_STREET,
      ),
    ).toBe(true);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['blank', '   \t\n '],
  ])(
    'live + GST_ADDRESS %s: refused before the mint, nothing minted, rendered or sent',
    async (_n, v) => {
      setAddress(v);
      const send = okSend();
      const pr = jest.fn(async () => LINK);
      await expect(run(send, pr)).rejects.toThrow(/UnrecoverableError|street address/);
      expect(pr).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(renderTemplate).not.toHaveBeenCalled();
      expect((Sentry.captureException as jest.Mock).mock.calls).toHaveLength(0);
      expect((Sentry.captureMessage as jest.Mock).mock.calls).toHaveLength(0);
      const refused = parsedLogs().filter((l) => l.reason === 'supplier_street_address_unset');
      expect(refused).toHaveLength(1);
      expect(refused[0]!.userId).toBe(USER_ID);
      const everything = [
        allLogText(),
        dump((Sentry.captureException as jest.Mock).mock.calls),
        dump((Sentry.addBreadcrumb as jest.Mock).mock.calls),
      ].join('\n');
      for (const x of [LEAK_ADDRESS, 'leak@', TOKEN, 'reset-password']) {
        expect(everything).not.toContain(x);
      }
    },
  );

  it('the refusal is the same for the google variant (mint not called)', async () => {
    setAddress(undefined);
    const send = okSend();
    const pr = jest.fn(async () => GOOGLE);
    await expect(run(send, pr)).rejects.toBeDefined();
    expect(pr).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('auth.verifyEmail is not held by a missing GST_ADDRESS', async () => {
    setAddress(undefined);
    const send = okSend();
    const mint = jest.fn(async () => ({
      email: LEAK_ADDRESS,
      name: 'N',
      link: 'https://app.lawie.in/verify-email?t=x',
    }));
    await createProcessor(
      send,
      mint as never,
      noticeDeps as never,
      NO,
      jest.fn(),
    )(job({ template: 'auth.verifyEmail' }), 'tok');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('dry run + no GST_ADDRESS: still mints and goes through the provider seam (renders the marker)', async () => {
    mockLive = false;
    setAddress(undefined);
    const send = okSend();
    const pr = jest.fn(async () => LINK);
    await run(send, pr);
    expect(pr).toHaveBeenCalledWith(USER_ID);
    expect(send).toHaveBeenCalledTimes(1);
    const data = (renderTemplate as jest.Mock).mock.calls[0]![1] as Record<string, unknown>;
    expect(data).not.toHaveProperty('streetAddress');
  });

  it('dry run: goes through the provider seam, logs the userId only, no live send flag', async () => {
    mockLive = false;
    const send = okSend();
    await run(
      send,
      jest.fn(async () => LINK),
    );
    expect(
      parsedLogs().some((l) => l.msg === 'password reset email sent' && l.userId === USER_ID),
    ).toBe(true);
  });

  it('no address, token or link in any log, breadcrumb or Sentry call', async () => {
    await run(
      okSend(),
      jest.fn(async () => LINK),
    );
    await run(
      okSend(),
      jest.fn(async () => null),
    );
    await run(
      okSend(),
      jest.fn(async () => {
        throw new Error(`x ${RESET_URL} ${LEAK_ADDRESS}`);
      }),
    ).catch(() => undefined);
    const everything = [
      allLogText(),
      dump((Sentry.captureException as jest.Mock).mock.calls),
      dump((Sentry.captureMessage as jest.Mock).mock.calls),
      dump((Sentry.addBreadcrumb as jest.Mock).mock.calls),
    ].join('\n');
    for (const s of [LEAK_ADDRESS, 'leak@', TOKEN, 'reset-password']) {
      expect(everything).not.toContain(s);
    }
  });
});

describe('mintPasswordResetViaAuth (real HTTP code, stubbed fetch)', () => {
  const saved = global.fetch;
  afterEach(() => {
    global.fetch = saved;
  });
  const stub = (status: number, body?: unknown) => {
    const f = jest.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }));
    global.fetch = f as unknown as typeof fetch;
    return f;
  };

  it('POSTs userId to /internal/password-reset/mint with the internal secret', async () => {
    const f = stub(200, { variant: 'link', email: LEAK_ADDRESS, resetUrl: RESET_URL });
    expect(await mintPasswordResetViaAuth(USER_ID)).toEqual(LINK);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${env.AUTH_SERVICE_URL}/internal/password-reset/mint`);
    expect(JSON.parse(init.body as string)).toEqual({ userId: USER_ID });
    expect(Object.values(init.headers as object)).toContain(env.INTERNAL_SECRET);
  });
  it('google variant', async () => {
    stub(200, { variant: 'google', email: LEAK_ADDRESS, loginUrl: LOGIN_URL });
    expect(await mintPasswordResetViaAuth(USER_ID)).toEqual(GOOGLE);
  });
  it('404 -> null', async () => {
    stub(404, { error: 'not_found' });
    expect(await mintPasswordResetViaAuth(USER_ID)).toBeNull();
  });
  it.each([500, 401])('HTTP %s throws a value-free error', async (s) => {
    stub(s, {});
    await expect(mintPasswordResetViaAuth(USER_ID)).rejects.toThrow(`HTTP_${s}`);
  });
  it('a 200 with a link variant but no URL throws', async () => {
    stub(200, { variant: 'link', email: LEAK_ADDRESS });
    await expect(mintPasswordResetViaAuth(USER_ID)).rejects.toThrow('BAD_RESPONSE');
  });
  it('network error throws without the original message', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED http://secret-host');
    }) as unknown as typeof fetch;
    await expect(mintPasswordResetViaAuth(USER_ID)).rejects.toThrow('NETWORK');
  });
});
