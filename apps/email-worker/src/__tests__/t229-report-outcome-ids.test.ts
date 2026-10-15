/**
 * T-229: the final-failure log of reportMailOutcome never holds a non-24-hex userId.
 * A verify-link mail is sent live, the outcome report fails all 3 tries, the error log is read.
 */
import type { Job } from 'bullmq';

import type { EmailJobData } from '../worker';
import { allLogText, parsedLogs, resetSink } from './helpers/t220-capture';

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
jest.mock('../placeholders', () => ({
  ...jest.requireActual('../placeholders'),
  isLiveSend: () => true,
  templateHasUnfilledFooter: () => false,
}));

// userIdFromData already drops ids with '@', so the hostile id is another non-24-hex string.
const HOSTILE = 'Zainab-Quasimodo-9876543210';

beforeEach(() => resetSink());

it('final report failure logs userId as "invalid" for a hostile id, never the string', async () => {
  const { createProcessor } = await import('../worker');
  const job = {
    id: 'job-r1',
    queueName: 'email-low',
    attemptsMade: 0,
    opts: { attempts: 5 },
    data: {
      template: 'auth.unverifiedDeletionNotice',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: HOSTILE },
    },
  } as unknown as Job<EmailJobData>;
  const report = jest.fn(async () => {
    throw new Error(`auth down for victim@example.com`);
  });
  const prepare = jest.fn(async () => ({
    notice: 'first' as const,
    variant: 'A' as const,
    email: 'real@example.org',
    name: 'N',
    link: 'https://app.lawie.in/verify-email?token=abc',
    deletionDate: '21 October 2026',
  }));
  const send = jest.fn(async () => ({ messageId: 'm' }));
  await createProcessor(send, jest.fn(), { prepare, report } as never)(job, 'tok');

  expect(report).toHaveBeenCalledTimes(3);
  const line = parsedLogs().find((l) =>
    String(l.msg).startsWith('Verify mail outcome not recorded;'),
  );
  expect(line).toBeDefined();
  expect(line?.userId).toBe('invalid');
  expect(allLogText()).not.toContain('Quasimodo');
}, 15_000);
