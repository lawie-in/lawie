/**
 * T-229: safeLogIds keeps only a registered template and a 24-hex userId for logs and Sentry; the
 * processor never puts a hostile template or userId string into a logger call, breadcrumb or
 * captureException.
 */
import * as Sentry from '@sentry/node';

import { allLogText, dump, resetSink } from './helpers/t220-capture';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async () => ({ subject: 's', html: 'h', text: 't' })),
}));

const HEX24 = '507f1f77bcf86cd799439011';
const VICTIM = 'victim@example.com';

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
});

describe('safeLogIds', () => {
  it('keeps a known template and a 24-hex userId', async () => {
    const { safeLogIds } = await import('../worker');
    expect(safeLogIds('auth.welcome', HEX24)).toEqual({ template: 'auth.welcome', userId: HEX24 });
  });

  it('replaces an unknown or hostile template with "unregistered"', async () => {
    const { safeLogIds } = await import('../worker');
    expect(safeLogIds('x@y.com', undefined).template).toBe('unregistered');
    expect(safeLogIds('nope.template', undefined).template).toBe('unregistered');
    expect(safeLogIds('toString', undefined).template).toBe('unregistered');
    expect(safeLogIds('__proto__', undefined).template).toBe('unregistered');
  });

  it('replaces a non-string template with "unregistered"', async () => {
    const { safeLogIds } = await import('../worker');
    for (const t of [42, null, undefined, {}, ['auth.welcome']]) {
      expect(safeLogIds(t, undefined).template).toBe('unregistered');
    }
  });

  it('userId: non-hex or wrong length becomes "invalid", absent stays undefined', async () => {
    const { safeLogIds } = await import('../worker');
    for (const u of ['user-42', 'x@y.com', HEX24.slice(1), `${HEX24}0`, 'g'.repeat(24), '']) {
      expect(safeLogIds('auth.welcome', u).userId).toBe('invalid');
    }
    expect(safeLogIds('auth.welcome', undefined).userId).toBeUndefined();
  });
});

describe('processor with a hostile template and userId', () => {
  const job = () =>
    ({
      id: 'job-1',
      queueName: 'email-low',
      attemptsMade: 0,
      data: {
        template: VICTIM,
        to: [VICTIM],
        cc: [],
        bcc: [],
        data: { name: 'N', userId: VICTIM },
      },
    }) as never;

  async function sentryText() {
    return dump([
      (Sentry.addBreadcrumb as jest.Mock).mock.calls,
      (Sentry.captureException as jest.Mock).mock.calls,
      (Sentry.captureMessage as jest.Mock).mock.calls,
    ]);
  }

  it('failing send: no logger call, breadcrumb or exception holds either string', async () => {
    const { createProcessor } = await import('../worker');
    const send = jest.fn().mockRejectedValue(new Error('boom'));
    await createProcessor(send)(job(), 'tok').catch(() => undefined);
    expect(allLogText().length).toBeGreaterThan(0);
    expect(allLogText()).not.toContain(VICTIM);
    expect(allLogText()).not.toContain('victim');
    const s = await sentryText();
    expect(s).not.toContain('victim');
    expect((Sentry.addBreadcrumb as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect(s).toContain('unregistered');
  });

  it('successful send: same', async () => {
    const { createProcessor } = await import('../worker');
    const send = jest.fn().mockResolvedValue({ messageId: 'm' });
    await createProcessor(send)(job(), 'tok').catch(() => undefined);
    expect(send).toHaveBeenCalledTimes(1);
    expect(allLogText().length).toBeGreaterThan(0);
    expect(allLogText()).not.toContain('victim');
    expect(await sentryText()).not.toContain('victim');
    for (const c of send.mock.calls)
      expect(JSON.stringify(c[0].meta ?? {})).not.toContain('victim');
  });
});
