/**
 * T-223 review round 2 (Ajay: "No send until [registered address] and [PIN] are filled").
 * Live mode = EMAIL_PROVIDER ses or smtp with EMAIL_DRY_RUN not true. In live mode a rendered
 * email that still holds a footer placeholder is never sent, by the queue worker (processor) or
 * by POST /send. Dry run is unaffected.
 *
 * The rendered bodies come from the REAL renderer (child process, real footer). Env is switched
 * the way t220 does it: withEnv + jest.isolateModulesAsync, so env.ts is parsed fresh per case.
 * pino is real, writing to an in-memory sink; Sentry and the provider send are stubs.
 *
 * Finding recorded in the report: auth.welcome as shipped has NO footer placeholders, so the guard
 * lets it through in live mode (asserted below). The "any template" claim is proven with a
 * template whose output carries a placeholder.
 */
import http from 'http';
import type { AddressInfo } from 'net';

import { INTERNAL_HEADERS } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';

import type { EmailJobData } from '../worker';

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
import { renderReal, type RealRendered } from './helpers/t223-real-render';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
const mockRender = jest.fn();
jest.mock('../templates', () => ({
  renderTemplate: (...a: unknown[]) => mockRender(...a),
}));
const mockProviderSend = jest.fn();
jest.mock('../providers', () => ({
  sendEmail: (...a: unknown[]) => mockProviderSend(...a),
}));

const TOKEN = 'ab'.repeat(32);
const LINK = `https://app.lawie.in/verify-email?token=${TOKEN}`;
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const SECRET = 'test-internal-secret-at-least-16';
const FIXED_MESSAGE = 'email has unfilled footer placeholders; not sent';

const capture = Sentry.captureException as jest.Mock;
const crumb = Sentry.addBreadcrumb as jest.Mock;

let verifyReal: RealRendered;
let welcomeReal: RealRendered;
const CLEAN: RealRendered = {
  subject: 'No footer here',
  html: '<p>Hello</p>',
  text: 'Hello',
};

beforeAll(() => {
  verifyReal = renderReal('auth.verifyEmail', {
    name: LEAK_NAME,
    verifyUrl: LINK,
    userId: USER_ID,
  });
  welcomeReal = renderReal('auth.welcome', {
    name: LEAK_NAME,
    loginUrl: 'https://lawie.in/login',
    userId: USER_ID,
  });
});

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
  mockProviderSend.mockResolvedValue({ messageId: 'sent-1' });
  mockRender.mockImplementation(async (id: string) =>
    id === 'auth.verifyEmail' ? verifyReal : welcomeReal,
  );
});

const LIVE_ENVS: Array<[string, Record<string, string>]> = [
  ['ses', SES_ENV],
  ['smtp', SMTP_ENV],
];
const BASE_ENV_EXTRA = { AUTH_SERVICE_URL: 'http://localhost:4001' };

function job(template: string, attemptsMade = 0, attempts = 5): Job<EmailJobData> {
  return {
    id: 'job-p1',
    queueName: 'email-high',
    attemptsMade,
    opts: { attempts },
    data: {
      template,
      to: [LEAK_ADDRESS],
      cc: [],
      bcc: [],
      data: { userId: USER_ID, name: LEAK_NAME, verifyUrl: LINK },
    },
  } as unknown as Job<EmailJobData>;
}

async function inEnv<T>(
  env: Record<string, string | undefined>,
  fn: (m: {
    worker: typeof import('../worker');
    ph: typeof import('../placeholders');
    app: typeof import('../app');
  }) => Promise<T>,
): Promise<T> {
  let out!: T;
  await jest.isolateModulesAsync(async () => {
    await withEnv({ ...BASE_ENV_EXTRA, ...env }, async () => {
      const worker = await import('../worker');
      const ph = await import('../placeholders');
      const app = await import('../app');
      out = await fn({ worker, ph, app });
    });
  });
  return out;
}

async function runProcessor(
  env: Record<string, string | undefined>,
  template: string,
  attemptsMade = 0,
  attempts = 5,
) {
  const send = jest.fn(async () => ({ messageId: 'sent-1' }));
  const mint = jest.fn(async () => ({ email: LEAK_ADDRESS, name: LEAK_NAME, link: LINK }));
  return inEnv(env, async ({ worker }) => {
    let thrown: unknown;
    let result: unknown;
    try {
      result = await worker.createProcessor(send, mint)(job(template, attemptsMade, attempts), 't');
    } catch (e) {
      thrown = e;
    }
    return { send, mint, thrown, result, isFinal: worker.isFinalAttempt };
  });
}

// isolateModules loads its own copy of bullmq, so instanceof against this file's class cannot hold;
// the name is what BullMQ itself checks (see isFinalAttempt) and what the worker sets.
function expectUnrecoverable(e: unknown) {
  expect(e).toBeInstanceOf(Error);
  expect((e as Error).name).toBe('UnrecoverableError');
}

function expectNoSensitive() {
  const everything = [allLogText(), dump(capture.mock.calls), dump(crumb.mock.calls)].join('\n');
  for (const s of [
    LEAK_ADDRESS,
    'leak@',
    LEAK_NAME,
    'Zainab',
    TOKEN,
    'verify-email?token',
    '[registered address]',
    '[PIN]',
    'Patna',
    'Sole Proprietorship',
  ]) {
    expect(everything).not.toContain(s);
  }
}

describe('fixtures are the real rendered output', () => {
  it('auth.verifyEmail really carries both placeholders in html and text', () => {
    for (const part of [verifyReal.html, verifyReal.text]) {
      expect(part).toContain('[registered address]');
      expect(part).toContain('[PIN]');
    }
  });
  it('auth.welcome, as shipped, carries neither (finding: the guard does not block it)', () => {
    for (const part of [welcomeReal.html, welcomeReal.text]) {
      expect(part).not.toContain('[registered address]');
      expect(part).not.toContain('[PIN]');
    }
  });
});

describe('hasUnfilledPlaceholder (exact, case-sensitive substring match)', () => {
  let has: typeof import('../placeholders').hasUnfilledPlaceholder;
  beforeAll(async () => {
    has = (await import('../placeholders')).hasUnfilledPlaceholder;
  });
  const mk = (html: string, text: string) => ({ html, text });

  it('true when html alone has either placeholder', () => {
    expect(has(mk('<p>[registered address]</p>', 'clean'))).toBe(true);
    expect(has(mk('<p>[PIN]</p>', 'clean'))).toBe(true);
  });
  it('true when text alone has either placeholder', () => {
    expect(has(mk('<p>clean</p>', 'x [registered address] y'))).toBe(true);
    expect(has(mk('<p>clean</p>', 'Patna 800001 [PIN]'))).toBe(true);
  });
  it('false for a filled footer and for empty parts', () => {
    expect(has(mk('<p>12 MG Road, Patna 800001</p>', '12 MG Road, Patna 800001'))).toBe(false);
    expect(has(mk('', ''))).toBe(false);
  });
  it('no false positive on [PINK], [PINCODE], "PIN" without brackets', () => {
    expect(has(mk('[PINK] [PINCODE] PIN 800001', '[PINK] PIN'))).toBe(false);
  });
  it('is case- and spacing-sensitive: [pin], [Registered Address], [ PIN ] are NOT caught', () => {
    // Documents current behaviour: only the exact tokens from the template are matched.
    expect(has(mk('[pin]', '[pin]'))).toBe(false);
    expect(has(mk('[Registered Address]', '[REGISTERED ADDRESS]'))).toBe(false);
    expect(has(mk('[ PIN ]', '[registered  address]'))).toBe(false);
  });
});

describe('isLiveSend', () => {
  it.each([
    ['ses, EMAIL_DRY_RUN=false', SES_ENV, true],
    ['smtp, EMAIL_DRY_RUN=false', SMTP_ENV, true],
    ['ses, EMAIL_DRY_RUN=true', { ...SES_ENV, EMAIL_DRY_RUN: 'true' }, false],
    ['smtp, EMAIL_DRY_RUN=true', { ...SMTP_ENV, EMAIL_DRY_RUN: 'true' }, false],
    ['dry-run provider', { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'false' }, false],
    ['dry-run provider + flag', { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true' }, false],
  ])('%s -> %s', async (_l, env, expected) => {
    expect(await inEnv(env, async ({ ph }) => ph.isLiveSend())).toBe(expected);
  });
});

describe.each(LIVE_ENVS)('queue worker, live mode (%s)', (_name, LIVE) => {
  it('auth.verifyEmail with the real footer: UnrecoverableError, fixed message, send never called', async () => {
    const r = await runProcessor(LIVE, 'auth.verifyEmail');
    expect(r.mint).toHaveBeenCalledTimes(1); // rendering needs the minted data
    expect(r.send).not.toHaveBeenCalled();
    expect(mockProviderSend).not.toHaveBeenCalled();
    expectUnrecoverable(r.thrown);
    expect((r.thrown as Error).message).toBe(FIXED_MESSAGE);
    expect((r.thrown as Error).name).toBe('UnrecoverableError');
    expect(r.result).toBeUndefined();
    expectNoSensitive();
    expectNoSensitive(); // idempotent read
    expect(dump(r.thrown)).not.toContain(LEAK_ADDRESS);
  });

  it('logs one error line with only userId and jobId as fields', async () => {
    await runProcessor(LIVE, 'auth.verifyEmail');
    const lines = parsedLogs().filter((l) =>
      String(l.msg).includes('unfilled footer placeholders'),
    );
    expect(lines).toHaveLength(1);
    const extra = Object.keys(lines[0]).filter(
      (k) => !['level', 'time', 'pid', 'hostname', 'msg'].includes(k),
    );
    expect(extra.sort()).toEqual(['jobId', 'userId']);
    expect(lines[0]).toMatchObject({ userId: USER_ID, jobId: 'job-p1' });
  });

  it.each([
    ['first attempt', 0],
    ['middle attempt', 2],
    ['final attempt', 4],
  ])('no Sentry exception and no failure breadcrumb on the %s', async (_l, made) => {
    const r = await runProcessor(LIVE, 'auth.verifyEmail', made, 5);
    expectUnrecoverable(r.thrown);
    expect(capture).not.toHaveBeenCalled();
    expect(Sentry.captureMessage as jest.Mock).not.toHaveBeenCalled();
    const cats = crumb.mock.calls.map((c) => (c[0] as { category: string }).category);
    expect(cats).not.toContain('email.send.failure');
    expect(cats).not.toContain('email.send.success');
  });

  it('BullMQ treats the thrown error as final (no retry), even on attempt 1 of 5', async () => {
    const r = await runProcessor(LIVE, 'auth.verifyEmail', 0, 5);
    expect(r.isFinal(job('auth.verifyEmail', 0, 5), r.thrown)).toBe(true);
  });

  it('a placeholder in only the text part, or only the html part, still blocks', async () => {
    for (const variant of [
      { ...CLEAN, text: 'Lawie, [registered address], Patna' },
      { ...CLEAN, html: '<p>Patna [PIN]</p>' },
    ]) {
      mockRender.mockResolvedValue(variant);
      const r = await runProcessor(LIVE, 'auth.welcome');
      expect(r.send).not.toHaveBeenCalled();
      expect((r.thrown as Error).message).toBe(FIXED_MESSAGE);
    }
  });

  it('guard is not specific to verifyEmail: any template whose output has a placeholder is blocked', async () => {
    mockRender.mockResolvedValue({ ...welcomeReal, html: `${welcomeReal.html}<p>[PIN]</p>` });
    const r = await runProcessor(LIVE, 'auth.welcome');
    expect(r.send).not.toHaveBeenCalled();
    expectUnrecoverable(r.thrown);
    expect((r.thrown as Error).message).toBe(FIXED_MESSAGE);
    expect(capture).not.toHaveBeenCalled();
    expectNoSensitive();
  });

  it('auth.welcome as shipped (no placeholders) is sent in live mode', async () => {
    const r = await runProcessor(LIVE, 'auth.welcome');
    expect(r.thrown).toBeUndefined();
    expect(r.send).toHaveBeenCalledTimes(1);
    expect(r.result).toEqual({ messageId: 'sent-1' });
  });

  it('a template with no placeholders sends', async () => {
    mockRender.mockResolvedValue(CLEAN);
    const r = await runProcessor(LIVE, 'auth.verifyEmail');
    expect(r.thrown).toBeUndefined();
    expect(r.send).toHaveBeenCalledTimes(1);
    expect(r.result).toEqual({ messageId: 'sent-1' });
  });

  it('a real provider failure is NOT swallowed by the guard (normal retry/Sentry path kept)', async () => {
    mockRender.mockResolvedValue(CLEAN);
    const send = jest.fn(async () => {
      throw new Error('boom');
    });
    await inEnv(LIVE, async ({ worker }) => {
      await expect(worker.createProcessor(send)(job('auth.welcome', 4, 5), 't')).rejects.toThrow();
    });
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe('queue worker, dry run', () => {
  it.each([
    ['EMAIL_DRY_RUN=true on ses', { ...SES_ENV, EMAIL_DRY_RUN: 'true' }],
    ['EMAIL_DRY_RUN=true on smtp', { ...SMTP_ENV, EMAIL_DRY_RUN: 'true' }],
    ['provider dry-run', { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'false' }],
    ['setupEnv default', { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true' }],
  ])('auth.verifyEmail with the real footer sends normally (%s)', async (_l, env) => {
    const r = await runProcessor(env, 'auth.verifyEmail');
    expect(r.thrown).toBeUndefined();
    expect(r.send).toHaveBeenCalledTimes(1);
    expect(r.result).toEqual({ messageId: 'sent-1' });
    expect(
      parsedLogs().filter((l) => String(l.msg).includes('unfilled footer placeholders')),
    ).toHaveLength(0);
  });
});

describe('POST /send', () => {
  async function post(
    env: Record<string, string | undefined>,
    body: Record<string, unknown>,
    headers: Record<string, string> = { [INTERNAL_HEADERS.SECRET]: SECRET },
  ) {
    return inEnv(env, async ({ app }) => {
      const server = app.createApp().listen(0, '127.0.0.1');
      await new Promise((r) => server.once('listening', r));
      try {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const res = await fetch(`${base}/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(body),
        });
        return { status: res.status, text: await res.text() };
      } finally {
        await new Promise((r) => (server as http.Server).close(r));
      }
    });
  }
  const BODY = {
    template: 'auth.verifyEmail',
    to: LEAK_ADDRESS,
    data: { userId: USER_ID, name: LEAK_NAME, verifyUrl: LINK },
  };

  describe.each(LIVE_ENVS)('live (%s)', (_n, LIVE) => {
    it('placeholder template -> 422 {error: unfilled_placeholders}, provider never called, ids-only log', async () => {
      const r = await post(LIVE, BODY);
      expect(r.status).toBe(422);
      expect(JSON.parse(r.text)).toEqual({ error: 'unfilled_placeholders' });
      expect(mockProviderSend).not.toHaveBeenCalled();
      const line = parsedLogs().find((l) => String(l.msg).includes('unfilled footer placeholders'));
      expect(line).toMatchObject({ template: 'auth.verifyEmail', userId: USER_ID });
      const extra = Object.keys(line!).filter(
        (k) => !['level', 'time', 'pid', 'hostname', 'msg'].includes(k),
      );
      expect(extra.sort()).toEqual(['template', 'userId']);
      expect(r.text).not.toContain(LEAK_ADDRESS);
      expectNoSensitive();
    });

    it('template without placeholders -> 202 and the provider is called once', async () => {
      mockRender.mockResolvedValue(CLEAN);
      const r = await post(LIVE, BODY);
      expect(r.status).toBe(202);
      expect(JSON.parse(r.text)).toEqual({ messageId: 'sent-1' });
      expect(mockProviderSend).toHaveBeenCalledTimes(1);
    });

    it('wrong secret is still 401 before any rendering', async () => {
      const r = await post(LIVE, BODY, { [INTERNAL_HEADERS.SECRET]: 'nope-nope-nope-nope' });
      expect(r.status).toBe(401);
      expect(mockRender).not.toHaveBeenCalled();
    });
  });

  it('dry run: the same placeholder template is sent normally (202)', async () => {
    const r = await post({ EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true' }, BODY);
    expect(r.status).toBe(202);
    expect(mockProviderSend).toHaveBeenCalledTimes(1);
  });

  it('ses with EMAIL_DRY_RUN=true: sent normally (202)', async () => {
    const r = await post({ ...SES_ENV, EMAIL_DRY_RUN: 'true' }, BODY);
    expect(r.status).toBe(202);
    expect(mockProviderSend).toHaveBeenCalledTimes(1);
  });
});
