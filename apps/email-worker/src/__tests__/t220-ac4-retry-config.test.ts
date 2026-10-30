/**
 * T-220 AC4 (CI-safe, no Redis): the processor rethrows so BullMQ retries, and
 * the producer options carry the stated retry policy. Queue is stubbed.
 */
import { EmailSendError } from '../providers/safe-log';
import { createProcessor } from '../worker';

type Add = { name: string; opts: Record<string, unknown> };
const adds: Add[] = [];

jest.mock('bullmq', () => ({
  ...jest.requireActual('bullmq'),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(async (name: string, _d: unknown, opts: Record<string, unknown>) => {
      adds.push({ name, opts });
      return { id: 'j', timestamp: Date.now() };
    }),
    close: jest.fn(async () => undefined),
  })),
}));
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ quit: jest.fn(async () => undefined) })),
}));
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async () => ({ subject: 's', html: '<p>h</p>', text: 't' })),
}));

describe('T-220 AC4 retry policy (unit)', () => {
  it('processor rethrows a provider error (same EmailSendError object) so BullMQ retries the job', async () => {
    const boom = new EmailSendError('ses', { errorName: 'Throttling', statusCode: 400 });
    const send = jest.fn().mockRejectedValue(boom);
    const job = {
      id: 'j1',
      queueName: 'email-low',
      attemptsMade: 0,
      data: {
        template: 'billing.lowCreditWarning',
        to: ['a@example.com'],
        cc: [],
        bcc: [],
        data: {},
      },
    } as never;
    await expect(createProcessor(send)(job, 't')).rejects.toBe(boom);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('processor also rethrows (a sanitised, different error) when send throws a raw error', async () => {
    const raw = new Error('raw boom for a@example.com');
    const send = jest.fn().mockRejectedValue(raw);
    const job = {
      id: 'j2',
      queueName: 'email-low',
      attemptsMade: 0,
      data: {
        template: 'billing.lowCreditWarning',
        to: ['a@example.com'],
        cc: [],
        bcc: [],
        data: {},
      },
    } as never;
    await expect(createProcessor(send)(job, 't')).rejects.toThrow('Error in email send');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('low tier: 3 attempts, exponential from 5000 ms, failed jobs kept 30 days', async () => {
    const { enqueueEmail } = await import('@lawie/email-client');
    await enqueueEmail({ template: 'billing.lowCreditWarning', to: 'a@example.com', data: {} });
    expect(adds.at(-1)?.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnFail: { age: 30 * 24 * 60 * 60 },
    });
  });

  it('high tier: 5 attempts, same backoff and retention', async () => {
    const { enqueueEmail } = await import('@lawie/email-client');
    await enqueueEmail({ template: 'billing.paymentFailed', to: 'a@example.com', data: {} });
    expect(adds.at(-1)?.opts).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnFail: { age: 30 * 24 * 60 * 60 },
    });
  });
});
