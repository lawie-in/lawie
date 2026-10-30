/**
 * T-646 (Arjun 4-5), worker side: both concern jobs carry { userId, concernId } only. The processor
 * asks billing for the view (the 8th createProcessor argument is the seam), sends the
 * acknowledgement to the customer and the support notice to notifyTo, and never uses the job's
 * to/cc/bcc. Erased -> skipped; unknown concern or mismatched ids -> unrecoverable.
 */
import type { Job } from 'bullmq';

import { createProcessor, type EmailJobData, type FetchConcernViewFn } from '../worker';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
jest.mock('../templates', () => ({
  isTemplateRegistered: jest.fn(() => true),
  renderTemplate: jest.fn(async (id: string, d: Record<string, unknown>) => ({
    subject: `S ${id}`,
    html: `<p>${JSON.stringify(d)}</p>`,
    text: JSON.stringify(d),
  })),
}));

import { renderTemplate } from '../templates';

import { allLogText, resetSink } from './helpers/t220-capture';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const CONCERN_ID = '64b7f0c2a1b2c3d4e5f60999';
const VIEW = {
  concernId: CONCERN_ID,
  userId: USER_ID,
  paymentId: '64b7f0c2a1b2c3d4e5f60111',
  razorpayPaymentId: 'pay_Abc12345',
  reference: 'PC-7K3M9QX2',
  reason: 'charged_no_ink',
  email: 'asha.verma@example.com',
  name: 'Asha Verma',
  maskedEmail: 'a***@example.com',
  paymentUrl:
    'https://app.lawie.in/dashboard/settings?tab=billing#payment-64b7f0c2a1b2c3d4e5f60111',
  adminUrl: 'https://dashboard.razorpay.com/app/payments/pay_Abc12345',
  notifyTo: 'contact@lawie.in',
};

function job(
  template: 'billing.concernReceived' | 'admin.paymentConcern',
  data: Record<string, unknown> = { userId: USER_ID, concernId: CONCERN_ID },
  over: Partial<EmailJobData> = {},
): Job<EmailJobData> {
  return {
    id: 'job-c1',
    queueName: 'email-high',
    attemptsMade: 0,
    opts: { attempts: 5 },
    data: { template, to: [], cc: [], bcc: [], data, ...over },
  } as unknown as Job<EmailJobData>;
}
const okSend = () => jest.fn(async () => ({ messageId: 'dry-run-1' }));
const run = (j: Job<EmailJobData>, view: FetchConcernViewFn, send = okSend()) =>
  createProcessor(
    send,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    view,
  )(j, 'tok');
const okView = (over: Record<string, unknown> = {}) =>
  jest.fn<ReturnType<FetchConcernViewFn>, [string]>(async () => ({
    status: 'ok' as const,
    view: { ...VIEW, ...over },
  }));

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
});

describe('billing.concernReceived job', () => {
  it('sends to the view email, rendering name, reference and link only', async () => {
    const send = okSend();
    const view = okView();
    await run(job('billing.concernReceived'), view, send);
    expect(view).toHaveBeenCalledWith(CONCERN_ID);
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown[])[0]).toMatchObject({
      to: ['asha.verma@example.com'],
      cc: [],
      bcc: [],
    });
    const [id, data] = (renderTemplate as jest.Mock).mock.calls[0];
    expect(id).toBe('billing.concernReceived');
    expect(data).toMatchObject({
      name: 'Asha Verma',
      reference: 'PC-7K3M9QX2',
      paymentUrl: VIEW.paymentUrl,
    });
    expect(JSON.stringify(data)).not.toContain('note');
  });

  it('ignores a job-supplied to/cc/bcc/replyTo', async () => {
    const send = okSend();
    await run(
      job('billing.concernReceived', undefined, {
        to: ['attacker@evil.test'],
        cc: ['c@evil.test'],
        bcc: ['b@evil.test'],
        replyTo: 'r@evil.test',
      }),
      okView(),
      send,
    );
    const arg = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg.to).toEqual(['asha.verma@example.com']);
    expect(arg.cc).toEqual([]);
    expect(arg.bcc).toEqual([]);
    expect(arg.replyTo).toBeUndefined();
  });

  it('does not log the address, name or reference', async () => {
    await run(job('billing.concernReceived'), okView());
    const logs = allLogText();
    for (const s of ['asha.verma', 'Asha', 'PC-7K3M9QX2']) expect(logs).not.toContain(s);
  });
});

describe('admin.paymentConcern job', () => {
  it('sends to notifyTo with ids, reason code, masked address and link - never the customer address or name', async () => {
    const send = okSend();
    await run(job('admin.paymentConcern'), okView({ notifyTo: 'ops@lawie.in' }), send);
    expect((send.mock.calls[0] as unknown[])[0]).toMatchObject({ to: ['ops@lawie.in'] });
    const [id, data] = (renderTemplate as jest.Mock).mock.calls[0];
    expect(id).toBe('admin.paymentConcern');
    expect(data).toMatchObject({
      reference: 'PC-7K3M9QX2',
      concernId: CONCERN_ID,
      paymentId: VIEW.paymentId,
      razorpayPaymentId: 'pay_Abc12345',
      reason: 'charged_no_ink',
      maskedEmail: 'a***@example.com',
      adminUrl: VIEW.adminUrl,
    });
    const dumped = JSON.stringify(data);
    expect(dumped).not.toContain('asha.verma');
    expect(dumped).not.toContain('Asha');
  });
});

describe('failure handling', () => {
  it.each(['billing.concernReceived', 'admin.paymentConcern'] as const)(
    '%s: an erased user is skipped, nothing sent',
    async (template) => {
      const send = okSend();
      const res = await run(
        job(template),
        jest.fn(async () => ({ status: 'erased' as const })),
        send,
      );
      expect(res).toEqual({ skipped: 'erased' });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('an unknown concern (billing 404) is unrecoverable, nothing sent', async () => {
    const send = okSend();
    await expect(
      run(
        job('billing.concernReceived'),
        jest.fn(async () => ({ status: 'rejected' as const, httpStatus: 404 })),
        send,
      ),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });
    expect(send).not.toHaveBeenCalled();
  });

  it('a view for another user or concern is unrecoverable, nothing sent', async () => {
    const send = okSend();
    await expect(
      run(job('billing.concernReceived'), okView({ userId: '64b7f0c2a1b2c3d4e5f60aaa' }), send),
    ).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    await expect(
      run(job('admin.paymentConcern'), okView({ concernId: '64b7f0c2a1b2c3d4e5f60bbb' }), send),
    ).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['no concernId', { userId: USER_ID }],
    ['bad concernId', { userId: USER_ID, concernId: 'nope' }],
    ['no userId', { concernId: CONCERN_ID }],
  ])('%s -> unrecoverable, billing never asked', async (_n, data) => {
    const view = okView();
    await expect(run(job('billing.concernReceived', data), view)).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect(view).not.toHaveBeenCalled();
  });

  it('a billing outage (thrown) is retried, nothing sent', async () => {
    const send = okSend();
    const err = await run(
      job('billing.concernReceived'),
      jest.fn(async () => {
        throw new Error('NETWORK');
      }),
      send,
    ).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).not.toBe('UnrecoverableError');
    expect(send).not.toHaveBeenCalled();
  });
});
