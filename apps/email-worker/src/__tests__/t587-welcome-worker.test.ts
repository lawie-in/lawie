/**
 * T-587 worker side (option A): an auth.welcome job carries the userId only; the address, name and
 * login URL come from auth's prepare route at send time. 404 -> the job completes as skipped. A
 * live send without the supplier street address is refused before auth is asked. The job's own
 * to/cc/bcc/replyTo are never used. No address or name in any log, breadcrumb or Sentry call.
 */
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';

import {
  createProcessor,
  prepareWelcomeViaAuth,
  type EmailJobData,
  type PreparedWelcome,
} from '../worker';

import { LEAK_ADDRESS, LEAK_NAME, allLogText, dump, resetSink } from './helpers/t220-capture';

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
    renderTemplate: jest.fn(async () => ({ subject: 'Welcome', html: '<p>x</p>', text: 'x' })),
  };
});
let mockLive = true;
jest.mock('../placeholders', () => {
  const actual = jest.requireActual('../placeholders');
  return { ...actual, isLiveSend: () => mockLive, templateHasUnfilledFooter: () => false };
});

import { renderTemplate } from '../templates';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const LOGIN = 'https://app.lawie.in/login';
const PREPARED: PreparedWelcome = { email: LEAK_ADDRESS, name: LEAK_NAME, loginUrl: LOGIN };
const FAKE_STREET = '12 Example Marg, Fake Nagar';

const job = (over: Partial<EmailJobData> = {}): Job<EmailJobData> =>
  ({
    id: 'wel-1',
    queueName: 'email-low',
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: { template: 'auth.welcome', to: [], cc: [], bcc: [], data: { userId: USER_ID }, ...over },
  }) as unknown as Job<EmailJobData>;

const okSend = () => jest.fn(async () => ({ messageId: 'm-1' }));
const NO = jest.fn();
const noticeDeps = { prepare: jest.fn(), report: jest.fn() };
const run = (send: jest.Mock, prep: jest.Mock, j = job()) =>
  createProcessor(send, NO, noticeDeps as never, NO, NO, NO, prep)(j, 'tok');

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

function everything(): string {
  return [
    allLogText(),
    dump((Sentry.captureException as jest.Mock).mock.calls),
    dump((Sentry.captureMessage as jest.Mock).mock.calls),
    dump((Sentry.addBreadcrumb as jest.Mock).mock.calls),
  ].join('\n');
}

describe('processor', () => {
  it('asks auth for the job userId, renders {name, loginUrl, userId, streetAddress}, sends to the prepared address only', async () => {
    const send = okSend();
    const prep = jest.fn(async () => PREPARED);
    const out = await run(
      send,
      prep,
      job({
        to: ['attacker@evil.example'],
        cc: ['c@evil.example'],
        bcc: ['b@evil.example'],
        replyTo: 'r@evil.example',
      }),
    );
    expect(prep).toHaveBeenCalledWith(USER_ID);
    expect(renderTemplate).toHaveBeenCalledWith('auth.welcome', {
      name: LEAK_NAME,
      loginUrl: LOGIN,
      userId: USER_ID,
      streetAddress: FAKE_STREET,
    });
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
    expect(mail.bcc).toEqual([]);
    expect(mail.replyTo).toBeUndefined();
    expect(JSON.stringify(mail)).not.toContain('evil.example');
    expect(out).toEqual({ messageId: 'm-1' });
  });

  it('renders the no-name form data when auth returns an empty name', async () => {
    const send = okSend();
    await run(
      send,
      jest.fn(async () => ({ ...PREPARED, name: '' })),
    );
    const data = (renderTemplate as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(data.name).toBe('');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('404 (prepare returns null): completes as skipped not_eligible, nothing sent, no Sentry, no render', async () => {
    const send = okSend();
    const out = await run(
      send,
      jest.fn(async () => null),
    );
    expect(out).toEqual({ skipped: 'not_eligible' });
    expect(send).not.toHaveBeenCalled();
    expect(renderTemplate).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('a job without a userId is unrecoverable and asks auth for nothing', async () => {
    const prep = jest.fn();
    await expect(run(okSend(), prep, job({ data: {} }))).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect(prep).not.toHaveBeenCalled();
  });

  it('LIVE send without GST_ADDRESS is refused before the auth call: unrecoverable, nothing sent', async () => {
    setAddress(undefined);
    const send = okSend();
    const prep = jest.fn(async () => PREPARED);
    await expect(run(send, prep)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(prep).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(everything()).not.toContain(LEAK_ADDRESS);
  });

  it('a blank GST_ADDRESS is also refused on a live send', async () => {
    setAddress('   ');
    const prep = jest.fn(async () => PREPARED);
    await expect(run(okSend(), prep)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(prep).not.toHaveBeenCalled();
  });

  it('dry run without GST_ADDRESS still sends (the template shows the marker)', async () => {
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

  it('a failed prepare rethrows (BullMQ retries) and sends nothing', async () => {
    const send = okSend();
    const prep = jest.fn(async () => {
      throw new Error(`boom for ${LEAK_ADDRESS}`);
    });
    await expect(run(send, prep)).rejects.toBeDefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('no address, name or login URL reaches a log, breadcrumb or Sentry call (success)', async () => {
    await run(
      okSend(),
      jest.fn(async () => PREPARED),
    );
    const all = everything();
    for (const s of [LEAK_ADDRESS, 'leak@', LEAK_NAME, 'Zainab', LOGIN]) {
      expect(all).not.toContain(s);
    }
    expect(all).toContain(USER_ID);
  });

  it('no address or name in logs or Sentry when the send fails or the job is skipped', async () => {
    await expect(
      run(
        jest.fn(async () => {
          throw new Error(`rejected ${LEAK_ADDRESS} ${LEAK_NAME}`);
        }),
        jest.fn(async () => PREPARED),
      ),
    ).rejects.toBeDefined();
    await run(
      okSend(),
      jest.fn(async () => null),
    );
    const all = everything();
    for (const s of [LEAK_ADDRESS, 'leak@', LEAK_NAME, 'Zainab']) {
      expect(all).not.toContain(s);
    }
  });
});

describe('prepareWelcomeViaAuth (stubbed fetch)', () => {
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

  it('POSTs {userId} to /internal/welcome/prepare with the internal secret', async () => {
    reply(200, { email: 'a@b.co', name: 'Anita', loginUrl: LOGIN });
    const r = await prepareWelcomeViaAuth(USER_ID);
    expect(r).toEqual({ email: 'a@b.co', name: 'Anita', loginUrl: LOGIN });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/internal\/welcome\/prepare$/);
    expect(init.method).toBe('POST');
    expect(init.headers['x-internal-secret']).toBe(process.env.INTERNAL_SECRET);
    expect(JSON.parse(init.body)).toEqual({ userId: USER_ID });
  });

  it('a missing or non-string name becomes the empty string', async () => {
    reply(200, { email: 'a@b.co', loginUrl: LOGIN });
    expect((await prepareWelcomeViaAuth(USER_ID))?.name).toBe('');
  });

  it('404 drops the job (null)', async () => {
    reply(404, { error: 'not_found' });
    expect(await prepareWelcomeViaAuth(USER_ID)).toBeNull();
  });

  it.each([400, 401, 500, 502])('HTTP %i throws a value-free HTTP_n error (retried)', async (s) => {
    reply(s, { error: 'x', email: LEAK_ADDRESS });
    const err = await prepareWelcomeViaAuth(USER_ID).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(`welcome prepare failed: HTTP_${s}`);
    expect((err as Error).message).not.toContain(LEAK_ADDRESS);
  });

  it.each([[{ email: 'a@b.co' }], [{ loginUrl: LOGIN }], [{ email: '', loginUrl: LOGIN }], [{}]])(
    'a malformed 200 body (%j) throws BAD_RESPONSE',
    async (body) => {
      reply(200, body);
      await expect(prepareWelcomeViaAuth(USER_ID)).rejects.toThrow('BAD_RESPONSE');
    },
  );

  it('a non-JSON 200 throws BAD_RESPONSE', async () => {
    reply(200);
    await expect(prepareWelcomeViaAuth(USER_ID)).rejects.toThrow('BAD_RESPONSE');
  });

  it('a timeout throws TIMEOUT, a network error NETWORK, neither leaks the URL', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('The operation timed out http://localhost:4001/x'), {
        name: 'TimeoutError',
      }),
    );
    const t = await prepareWelcomeViaAuth(USER_ID).catch((e: Error) => e);
    expect((t as Error).message).toBe('welcome prepare failed: TIMEOUT');
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED http://localhost:4001/x'));
    const n = await prepareWelcomeViaAuth(USER_ID).catch((e: Error) => e);
    expect((n as Error).message).toBe('welcome prepare failed: NETWORK');
    expect((n as Error).message).not.toContain('localhost');
  });
});
