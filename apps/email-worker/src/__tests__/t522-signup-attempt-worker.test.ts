/**
 * T-522 worker side: an auth.signupAttempt job carries the userId only; the address and the two
 * page links come from auth's prepare route at send time. 404 -> the job is dropped. A live send
 * without the supplier street address is refused (AJ-522-S9), before auth is asked. Nothing
 * sensitive in any log, breadcrumb or Sentry call.
 */
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';

import {
  createProcessor,
  prepareSignupAttemptViaAuth,
  type EmailJobData,
  type PreparedSignupAttempt,
} from '../worker';

import { LEAK_ADDRESS, allLogText, dump, resetSink } from './helpers/t220-capture';

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
    renderTemplate: jest.fn(async () => ({
      subject: 'About your Lawie account',
      html: '<p>x</p>',
      text: 'x',
    })),
  };
});
let mockLive = true;
jest.mock('../placeholders', () => {
  const actual = jest.requireActual('../placeholders');
  return { ...actual, isLiveSend: () => mockLive, templateHasUnfilledFooter: () => false };
});

import { renderTemplate } from '../templates';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const SIGN_IN = 'https://app.lawie.in/login';
const RESET = 'https://app.lawie.in/forgot-password';
const PREPARED: PreparedSignupAttempt = {
  email: LEAK_ADDRESS,
  signInUrl: SIGN_IN,
  resetUrl: RESET,
};
const FAKE_STREET = '12 Example Marg, Fake Nagar';

const job = (over: Partial<EmailJobData> = {}): Job<EmailJobData> =>
  ({
    id: 'sa-1',
    queueName: 'email-high',
    attemptsMade: 0,
    opts: { attempts: 5 },
    data: {
      template: 'auth.signupAttempt',
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
const run = (send: jest.Mock, prep: jest.Mock, j = job()) =>
  createProcessor(send, NO, noticeDeps as never, NO, NO, prep)(j, 'tok');

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
  it('asks auth for the job userId, renders {signInUrl, resetUrl, userId, streetAddress}, sends to the prepared address only', async () => {
    const send = okSend();
    const prep = jest.fn(async () => PREPARED);
    const out = await run(
      send,
      prep,
      job({ to: ['attacker@evil.example'], cc: ['c@evil.example'], bcc: ['b@evil.example'] }),
    );
    expect(prep).toHaveBeenCalledWith(USER_ID);
    expect(renderTemplate).toHaveBeenCalledWith('auth.signupAttempt', {
      signInUrl: SIGN_IN,
      resetUrl: RESET,
      userId: USER_ID,
      streetAddress: FAKE_STREET,
    });
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
    expect(mail.bcc).toEqual([]);
    expect(mail.subject).toBe('About your Lawie account');
    expect(out).toEqual({ messageId: 'm-1' });
  });

  it('404 from auth (prepare returns null): the job is dropped, nothing sent, no Sentry, no retry', async () => {
    const send = okSend();
    const out = await run(
      send,
      jest.fn(async () => null),
    );
    expect(out).toEqual({ skipped: 'not_eligible' });
    expect(send).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('a job without a userId is unrecoverable and asks auth for nothing', async () => {
    const prep = jest.fn();
    await expect(run(okSend(), prep, job({ data: {} }))).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect(prep).not.toHaveBeenCalled();
  });

  it('LIVE send without the supplier street address is refused: unrecoverable, auth not asked, nothing sent', async () => {
    setAddress(undefined);
    const send = okSend();
    const prep = jest.fn(async () => PREPARED);
    await expect(run(send, prep)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(prep).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(allLogText()).not.toContain(LEAK_ADDRESS);
  });

  it('a blank street address is also refused on a live send', async () => {
    setAddress('   ');
    const prep = jest.fn(async () => PREPARED);
    await expect(run(okSend(), prep)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(prep).not.toHaveBeenCalled();
  });

  it('dry run without a street address still renders (the template shows the marker)', async () => {
    mockLive = false;
    setAddress(undefined);
    const send = okSend();
    await run(
      send,
      jest.fn(async () => PREPARED),
    );
    expect(send).toHaveBeenCalledTimes(1);
    const data = (renderTemplate as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(data.streetAddress).toBeUndefined();
  });

  it('a failed prepare rethrows a value-free error and sends nothing', async () => {
    const send = okSend();
    const prep = jest.fn(async () => {
      throw new Error(`boom for ${LEAK_ADDRESS}`);
    });
    await expect(run(send, prep)).rejects.toBeDefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('nothing sensitive reaches a log, breadcrumb or Sentry call', async () => {
    await run(
      okSend(),
      jest.fn(async () => PREPARED),
    );
    const everything = [
      allLogText(),
      dump((Sentry.captureException as jest.Mock).mock.calls),
      dump((Sentry.addBreadcrumb as jest.Mock).mock.calls),
    ].join('\n');
    for (const s of [LEAK_ADDRESS, 'leak@', SIGN_IN, RESET]) {
      expect(everything).not.toContain(s);
    }
  });
});

describe('prepareSignupAttemptViaAuth (stubbed fetch)', () => {
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
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === undefined) throw new Error('no json');
        return body;
      },
    });

  it('POSTs {userId} to /internal/signup-attempt/prepare with the internal secret', async () => {
    reply(200, { email: 'a@b.co', signInUrl: SIGN_IN, resetUrl: RESET });
    const r = await prepareSignupAttemptViaAuth(USER_ID);
    expect(r).toEqual({ email: 'a@b.co', signInUrl: SIGN_IN, resetUrl: RESET });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/internal\/signup-attempt\/prepare$/);
    expect(init.method).toBe('POST');
    expect(init.headers['x-internal-secret']).toBe(process.env.INTERNAL_SECRET);
    expect(JSON.parse(init.body)).toEqual({ userId: USER_ID });
  });

  it('404 drops the job (null)', async () => {
    reply(404, { error: 'not_found' });
    expect(await prepareSignupAttemptViaAuth(USER_ID)).toBeNull();
  });

  it.each([401, 500, 502])('HTTP %i throws a value-free error', async (status) => {
    reply(status, { error: 'x', email: LEAK_ADDRESS });
    const err = await prepareSignupAttemptViaAuth(USER_ID).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(`signup-attempt prepare failed: HTTP_${status}`);
    expect((err as Error).message).not.toContain(LEAK_ADDRESS);
  });

  it.each([
    [{ email: 'a@b.co', signInUrl: SIGN_IN }],
    [{ signInUrl: SIGN_IN, resetUrl: RESET }],
    [{}],
  ])('a malformed 200 body (%j) throws BAD_RESPONSE', async (body) => {
    reply(200, body);
    await expect(prepareSignupAttemptViaAuth(USER_ID)).rejects.toThrow('BAD_RESPONSE');
  });

  it('a network error leaves no URL in the thrown message', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED http://localhost:4001/internal/x'));
    const err = await prepareSignupAttemptViaAuth(USER_ID).catch((e: Error) => e);
    expect((err as Error).message).not.toContain('localhost');
    expect((err as Error).message).not.toContain('http');
  });
});
