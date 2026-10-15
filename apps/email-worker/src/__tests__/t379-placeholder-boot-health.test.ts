/**
 * T-379 AC2/AC3/AC4: the placeholder guard is static.
 *  - templateHasUnfilledFooter / anyTemplateUnfilled look at each template's own footer strings.
 *  - Live mode: startWorkers starts nothing (no Redis connection, no Worker) and warns once with
 *    no PII; /health is 503 unhealthy; the processor refuses auth.verifyEmail BEFORE mint().
 *  - Dry run: workers start, /health is 200.
 *  - User data containing "[PIN]" is not refused when the template's footer is filled or absent.
 * T-436 filled the real verifyEmail footer, so the refusal cases inject an unfilled one
 * (mockUnfilledFooter, helpers/t436-unfilled-footer.ts); "real footer" cases turn the flag off.
 * Env is switched like t220-ac8 / t223 (withEnv + jest.isolateModulesAsync). bullmq and ioredis
 * are mocked, so no Redis is needed.
 */
import http from 'http';
import type { AddressInfo } from 'net';

import { INTERNAL_HEADERS } from '@lawie/shared';
import type { Job } from 'bullmq';

import type { EmailJobData } from '../worker';

import {
  LEAK_ADDRESS,
  LEAK_NAME,
  SES_ENV,
  allLogText,
  parsedLogs,
  resetSink,
  withEnv,
} from './helpers/t220-capture';
import { INVOICE_SENTINEL_FIELDS, renderReal } from './helpers/t223-real-render';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
const mockWorkerCtor = jest.fn();
const mockRedisCtor = jest.fn();
jest.mock('bullmq', () => {
  const actual = jest.requireActual('bullmq');
  return {
    ...actual,
    Worker: function MockWorker(this: { on: jest.Mock; close: jest.Mock }, ...a: unknown[]) {
      mockWorkerCtor(...a);
      this.on = jest.fn();
      this.close = jest.fn();
    },
  };
});
jest.mock('ioredis', () => ({
  __esModule: true,
  default: function MockRedis(...a: unknown[]) {
    mockRedisCtor(...a);
  },
}));
let mockUnfilledFooter = true;
jest.mock('../templates/auth/verifyEmail', () =>
  jest.requireActual('./helpers/t436-unfilled-footer').verifyEmailModule(() => mockUnfilledFooter),
);
const mockRender = jest.fn();
jest.mock('../templates', () => ({ renderTemplate: (...a: unknown[]) => mockRender(...a) }));
const mockProviderSend = jest.fn();
jest.mock('../providers', () => ({ sendEmail: (...a: unknown[]) => mockProviderSend(...a) }));

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const SECRET = 'test-internal-secret-at-least-16';
const LIVE = SES_ENV;
const DRY = { EMAIL_PROVIDER: 'dry-run', EMAIL_DRY_RUN: 'true' };
const EXTRA = { AUTH_SERVICE_URL: 'http://localhost:4001' };

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
  mockUnfilledFooter = true;
  mockProviderSend.mockResolvedValue({ messageId: 'sent-1' });
  mockRender.mockResolvedValue({ subject: 's', html: '<p>h</p>', text: 'h' });
});

type Mods = {
  worker: typeof import('../worker');
  ph: typeof import('../placeholders');
  app: typeof import('../app');
};
async function inEnv<T>(env: Record<string, string | undefined>, fn: (m: Mods) => Promise<T>) {
  let out!: T;
  await jest.isolateModulesAsync(async () => {
    await withEnv({ ...EXTRA, ...env }, async () => {
      out = await fn({
        worker: await import('../worker'),
        ph: await import('../placeholders'),
        app: await import('../app'),
      });
    });
  });
  return out;
}

function job(template: string): Job<EmailJobData> {
  return {
    id: 'job-379',
    queueName: 'email-high',
    attemptsMade: 0,
    opts: { attempts: 5 },
    data: {
      template,
      to: [LEAK_ADDRESS],
      cc: [],
      bcc: [],
      data: { userId: USER_ID, name: LEAK_NAME },
    },
  } as unknown as Job<EmailJobData>;
}

describe('static footer check', () => {
  it('injected unfilled verifyEmail footer is flagged; auth.welcome and an unknown id are not', async () => {
    await inEnv(DRY, async ({ ph }) => {
      expect(ph.templateHasUnfilledFooter('auth.verifyEmail')).toBe(true);
      expect(ph.templateHasUnfilledFooter('auth.welcome')).toBe(false);
      expect(ph.templateHasUnfilledFooter('no.such.template' as never)).toBe(false);
      expect(ph.anyTemplateUnfilled()).toBe(true);
    });
  });
});

describe('static footer check, real shipped footer (T-436)', () => {
  it('nothing is unfilled', async () => {
    mockUnfilledFooter = false;
    await inEnv(DRY, async ({ ph }) => {
      expect(ph.templateHasUnfilledFooter('auth.verifyEmail')).toBe(false);
      expect(ph.templateHasUnfilledFooter('auth.welcome')).toBe(false);
      expect(ph.anyTemplateUnfilled()).toBe(false);
    });
  });
});

describe('tripwire: every registered template vs TEMPLATE_FOOTERS', () => {
  // Fixed sentinel data with no placeholder text. A template with a [registered address] / [PIN]
  // footer that is missing from TEMPLATE_FOOTERS would render a placeholder while
  // templateHasUnfilledFooter(id) is false, and fail here.
  const SENTINEL = {
    name: 'Sentinel Name',
    userId: USER_ID,
    verifyUrl: 'https://app.lawie.in/verify-email?token=sentinel',
    loginUrl: 'https://app.lawie.in/login',
    link: 'https://app.lawie.in/x',
    deletionDate: '21 October 2026',
    variant: 'A',
    url: 'https://app.lawie.in/x',
    // billing.taxInvoice / billing.creditNote (T-436 b/c) refuse to render without these.
    ...INVOICE_SENTINEL_FIELDS,
  };
  const ids: string[] = jest.requireActual('../templates').listTemplates();

  it('registers at least the two known templates', () => {
    expect(ids).toEqual(expect.arrayContaining(['auth.verifyEmail', 'auth.welcome']));
  });

  it.each(ids)(
    '%s renders a placeholder exactly when templateHasUnfilledFooter says so',
    async (id) => {
      mockUnfilledFooter = false; // real strings on both sides of the comparison
      const rendered = renderReal(id, SENTINEL);
      const hasPlaceholder = [rendered.html, rendered.text].some(
        (part) => part.includes('[registered address]') || part.includes('[PIN]'),
      );
      const flagged = await inEnv(DRY, async ({ ph }) => ph.templateHasUnfilledFooter(id as never));
      expect(hasPlaceholder).toBe(flagged);
    },
  );
});

describe('startWorkers', () => {
  it('live mode: returns [], opens no Redis and no Worker, one warn with no PII', async () => {
    await inEnv(LIVE, async ({ worker }) => {
      expect(worker.startWorkers()).toEqual([]);
      expect(worker.workers).toHaveLength(0);
    });
    expect(mockRedisCtor).not.toHaveBeenCalled();
    expect(mockWorkerCtor).not.toHaveBeenCalled();
    const warns = parsedLogs().filter((l) => l.level === 40);
    expect(warns).toHaveLength(1);
    expect(String(warns[0].msg)).toContain('Workers not started');
    const extra = Object.keys(warns[0]).filter(
      (k) => !['level', 'time', 'pid', 'hostname', 'msg'].includes(k),
    );
    expect(extra).toEqual([]);
    const text = allLogText();
    for (const s of [LEAK_ADDRESS, LEAK_NAME, USER_ID, 'redis://']) expect(text).not.toContain(s);
  });

  it('T-436 live mode, real filled footer: workers start (one per queue)', async () => {
    mockUnfilledFooter = false;
    await inEnv(LIVE, async ({ worker }) => {
      expect(worker.startWorkers({ connection: { host: 'x', port: 1 } })).toHaveLength(2);
    });
    expect(mockWorkerCtor).toHaveBeenCalledTimes(2);
    expect(parsedLogs().filter((l) => String(l.msg).includes('Workers not started'))).toHaveLength(
      0,
    );
  });

  it('live mode with an explicit connection still starts nothing', async () => {
    await inEnv(LIVE, async ({ worker }) => {
      expect(worker.startWorkers({ connection: { host: 'x', port: 1 } })).toEqual([]);
    });
    expect(mockWorkerCtor).not.toHaveBeenCalled();
  });

  it('dry run: starts one worker per queue', async () => {
    await inEnv(DRY, async ({ worker }) => {
      const started = worker.startWorkers({ connection: { host: 'x', port: 1 } });
      expect(started).toHaveLength(2);
    });
    expect(mockWorkerCtor).toHaveBeenCalledTimes(2);
  });
});

describe('createProcessor', () => {
  it('live mode: refuses auth.verifyEmail with an UnrecoverableError and never calls mint or send', async () => {
    const send = jest.fn();
    const mint = jest.fn();
    await inEnv(LIVE, async ({ worker }) => {
      const err = await worker
        .createProcessor(send, mint)(job('auth.verifyEmail'), 't')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe('UnrecoverableError');
      expect(worker.isFinalAttempt(job('auth.verifyEmail'), err)).toBe(true);
    });
    expect(mint).toHaveBeenCalledTimes(0);
    expect(send).not.toHaveBeenCalled();
    expect(mockRender).not.toHaveBeenCalled();
    expect(allLogText()).not.toContain(LEAK_ADDRESS);
  });

  it('T-436 live mode, real filled footer: auth.verifyEmail is processed, mint and send once', async () => {
    mockUnfilledFooter = false;
    const send = jest.fn(async () => ({ messageId: 'm' }));
    const mint = jest.fn(async () => ({ email: LEAK_ADDRESS, name: 'N', link: 'https://x/y' }));
    await inEnv(LIVE, async ({ worker }) => {
      await expect(
        worker.createProcessor(send, mint)(job('auth.verifyEmail'), 't'),
      ).resolves.toEqual({
        messageId: 'm',
      });
    });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('dry run: auth.verifyEmail still mints and sends', async () => {
    const send = jest.fn(async () => ({ messageId: 'm' }));
    const mint = jest.fn(async () => ({ email: LEAK_ADDRESS, name: 'N', link: 'https://x/y' }));
    await inEnv(DRY, async ({ worker }) => {
      await worker.createProcessor(send, mint)(job('auth.verifyEmail'), 't');
    });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('live mode: auth.welcome with "[PIN]" in user data is sent (not refused)', async () => {
    const send = jest.fn(async () => ({ messageId: 'm' }));
    const j = job('auth.welcome');
    j.data.data = { userId: USER_ID, name: '[PIN]' };
    mockRender.mockResolvedValue({ subject: 's', html: '<p>[PIN]</p>', text: '[PIN]' });
    await inEnv(LIVE, async ({ worker }) => {
      await expect(worker.createProcessor(send)(j, 't')).resolves.toEqual({ messageId: 'm' });
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('/health', () => {
  async function health(env: Record<string, string | undefined>) {
    return inEnv(env, async ({ app }) => {
      const server = app.createApp().listen(0, '127.0.0.1');
      await new Promise((r) => server.once('listening', r));
      try {
        const res = await fetch(
          `http://127.0.0.1:${(server.address() as AddressInfo).port}/health`,
        );
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      } finally {
        await new Promise((r) => (server as http.Server).close(r));
      }
    });
  }

  it('live mode: 503 unhealthy with the reason', async () => {
    const r = await health(LIVE);
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({
      status: 'unhealthy',
      reason: 'unfilled_footer_placeholders',
      service: 'email-worker',
      provider: 'ses',
      dryRun: false,
    });
    expect(typeof r.body.timestamp).toBe('string');
  });

  it('T-436 live mode, real filled footer: 200 ok', async () => {
    mockUnfilledFooter = false;
    const r = await health(LIVE);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: 'ok',
      service: 'email-worker',
      provider: 'ses',
      dryRun: false,
    });
    expect(r.body.reason).toBeUndefined();
  });

  it('dry run: 200 ok', async () => {
    const r = await health(DRY);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'email-worker', dryRun: true });
  });
});

describe('POST /send (live)', () => {
  async function post(env: Record<string, string | undefined>, body: Record<string, unknown>) {
    return inEnv(env, async ({ app }) => {
      const server = app.createApp().listen(0, '127.0.0.1');
      await new Promise((r) => server.once('listening', r));
      try {
        const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [INTERNAL_HEADERS.SECRET]: SECRET },
          body: JSON.stringify(body),
        });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      } finally {
        await new Promise((r) => (server as http.Server).close(r));
      }
    });
  }

  it('auth.welcome with user data containing "[PIN]" is NOT refused', async () => {
    const r = await post(LIVE, {
      template: 'auth.welcome',
      to: LEAK_ADDRESS,
      data: { userId: USER_ID, name: '[PIN] [registered address]' },
    });
    expect(r.status).toBe(202);
    expect(mockProviderSend).toHaveBeenCalledTimes(1);
  });

  it('T-436 real filled footer: auth.verifyEmail -> 202, rendered and sent once', async () => {
    mockUnfilledFooter = false;
    const r = await post(LIVE, { template: 'auth.verifyEmail', to: LEAK_ADDRESS, data: {} });
    expect(r.status).toBe(202);
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockProviderSend).toHaveBeenCalledTimes(1);
  });

  it('injected unfilled footer: auth.verifyEmail is refused with 422 before rendering', async () => {
    const r = await post(LIVE, { template: 'auth.verifyEmail', to: LEAK_ADDRESS, data: {} });
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ error: 'unfilled_placeholders' });
    expect(mockRender).not.toHaveBeenCalled();
    expect(mockProviderSend).not.toHaveBeenCalled();
  });
});
