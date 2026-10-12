/**
 * T-353 AC3: Sentry.captureException fires only on a job's final attempt;
 * the breadcrumb and the log line fire on every attempt.
 */
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';

import { createProcessor, isFinalAttempt, type EmailJobData } from '../worker';

import { LEAK_ADDRESS, allLogText, parsedLogs, resetSink } from './helpers/t220-capture';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn() }));
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async () => ({ subject: 's', html: '<p>h</p>', text: 't' })),
}));

const capture = Sentry.captureException as jest.Mock;
const crumb = Sentry.addBreadcrumb as jest.Mock;

function fakeJob(attemptsMade: number, attempts?: number): Job<EmailJobData> {
  return {
    id: 'job-1',
    queueName: 'email-low',
    attemptsMade,
    opts: attempts === undefined ? {} : { attempts },
    data: {
      template: 'auth.welcome',
      to: [LEAK_ADDRESS],
      cc: [],
      bcc: [],
      data: { userId: 'user-42' },
    },
  } as unknown as Job<EmailJobData>;
}

const failingSend = jest.fn(async () => {
  throw new Error(`rejected ${LEAK_ADDRESS}`);
});

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
});

describe('T-353 AC3 isFinalAttempt', () => {
  it.each([
    [0, 3, false],
    [1, 3, false],
    [2, 3, true],
    [3, 3, true],
    [0, 1, true],
  ])('attemptsMade %i of %i attempts -> %s', (made, attempts, expected) => {
    expect(isFinalAttempt(fakeJob(made, attempts))).toBe(expected);
  });

  it('missing opts.attempts counts as a single attempt', () => {
    expect(isFinalAttempt(fakeJob(0))).toBe(true);
    expect(isFinalAttempt({ attemptsMade: 0 } as unknown as Job)).toBe(true);
  });

  it('an UnrecoverableError is final even with attempts left', () => {
    const err = new Error('x');
    err.name = 'UnrecoverableError';
    expect(isFinalAttempt(fakeJob(0, 3), err)).toBe(true);
    expect(isFinalAttempt(fakeJob(0, 3), new Error('x'))).toBe(false);
  });
});

describe('T-353 AC3 processor', () => {
  it.each([0, 1])(
    'attemptsMade %i of 3: breadcrumb and log, NO Sentry capture, still rethrows',
    async (made) => {
      const p = createProcessor(failingSend);
      await expect(p(fakeJob(made, 3), 'tok')).rejects.toThrow(/in email send/);
      expect(capture).not.toHaveBeenCalled();
      expect(crumb.mock.calls.map((c) => c[0].category)).toEqual([
        'email.send.start',
        'email.send.failure',
      ]);
      const line = parsedLogs().find((l) => l.msg === 'Email send failed');
      expect(line).toMatchObject({ attempt: made + 1, finalAttempt: false, jobId: 'job-1' });
      expect(allLogText()).not.toContain('leak@');
    },
  );

  it('attemptsMade 2 of 3: exactly one capture, with attempt and maxAttempts, safe error', async () => {
    const p = createProcessor(failingSend);
    await expect(p(fakeJob(2, 3), 'tok')).rejects.toThrow();
    expect(capture).toHaveBeenCalledTimes(1);
    const [err, ctx] = capture.mock.calls[0];
    expect((err as Error).message).not.toContain('leak@');
    expect(ctx.extra).toMatchObject({ jobId: 'job-1', attempt: 3, maxAttempts: 3 });
    expect(crumb.mock.calls.map((c) => c[0].category)).toContain('email.send.failure');
    expect(parsedLogs().find((l) => l.msg === 'Email send failed')).toMatchObject({
      finalAttempt: true,
    });
  });

  it('across a whole 3-attempt run only the last attempt captures', async () => {
    const p = createProcessor(failingSend);
    for (const made of [0, 1, 2]) await p(fakeJob(made, 3), 'tok').catch(() => undefined);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(parsedLogs().filter((l) => l.msg === 'Email send failed')).toHaveLength(3);
    expect(crumb.mock.calls.filter((c) => c[0].category === 'email.send.failure')).toHaveLength(3);
  });
});
