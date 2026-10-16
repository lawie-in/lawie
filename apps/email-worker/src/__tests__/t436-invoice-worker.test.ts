/**
 * T-436 (b/c) slice 4, worker side (Arjun #1, Ajay Addendum 8): billing.taxInvoice and
 * billing.creditNote jobs carry { userId, invoiceId } only. The processor fetches the view from
 * billing (GET BILLING_SERVICE_URL/internal/invoices/:id/email-view, x-internal-secret) and sends
 * to view.customer.email. global.fetch is stubbed, as the verify-mint tests do; pino is real,
 * writing to an in-memory sink; the renderer is a stand-in that carries every value, so the
 * no-leak checks are meaningful (the real templates are covered in t436-invoice-email-templates).
 */
import * as Sentry from '@sentry/node';
import type { Job } from 'bullmq';

import { env } from '../config/env';
import { createProcessor, type EmailJobData } from '../worker';

import {
  LEAK_ADDRESS,
  LEAK_NAME,
  allLogText,
  dump,
  parsedLogs,
  resetSink,
} from './helpers/t220-capture';

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
  renderTemplate: jest.fn(async (_id: string, d: Record<string, string>) => ({
    subject: `S ${d.creditNoteNumber ?? ''} ${d.invoiceNumber ?? ''}`,
    html: `<p>${d.name} ${d.amount} ${d.date} ${d.downloadUrl}</p>`,
    text: `${d.name} ${d.amount} ${d.date} ${d.downloadUrl}`,
  })),
}));

import { renderTemplate } from '../templates';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const INVOICE_ID = '64b7f0c2a1b2c3d4e5f60999';
const OTHER_ID = '64b7f0c2a1b2c3d4e5f60aaa';
const NUMBER = 'LAW/2026-27/0001';
const CN_NUMBER = 'LCN/2026-27/0007';
const LINK = 'https://app.lawie.in/invoices';

const VIEW = {
  invoiceId: INVOICE_ID,
  userId: USER_ID,
  kind: 'invoice',
  number: NUMBER,
  // 18:30Z is 00:00 IST the next day
  issuedAt: '2026-10-14T18:30:00.000Z',
  total: 199900,
  customer: { name: LEAK_NAME, email: LEAK_ADDRESS },
  originalInvoiceNumber: null,
  downloadUrl: LINK,
};
const CN_VIEW = {
  ...VIEW,
  kind: 'credit_note',
  number: CN_NUMBER,
  total: 79950,
  originalInvoiceNumber: NUMBER,
};

const capture = Sentry.captureException as jest.Mock;
const crumb = Sentry.addBreadcrumb as jest.Mock;
const fetchMock = jest.fn();
const realFetch = global.fetch;
const realBillingUrl = env.BILLING_SERVICE_URL;

const reply = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body === undefined) throw new Error('no json');
      return body;
    },
  });

function job(
  template: 'billing.taxInvoice' | 'billing.creditNote' = 'billing.taxInvoice',
  data: Record<string, unknown> = { userId: USER_ID, invoiceId: INVOICE_ID },
  over: Partial<EmailJobData> = {},
  attemptsMade = 0,
  attempts = 5,
): Job<EmailJobData> {
  return {
    id: 'job-i1',
    queueName: 'email-high',
    attemptsMade,
    opts: { attempts },
    data: { template, to: [], cc: [], bcc: [], data, ...over },
  } as unknown as Job<EmailJobData>;
}
const okSend = () => jest.fn(async () => ({ messageId: 'dry-run-1' }));
const run = (j: Job<EmailJobData>, send = okSend()) => createProcessor(send)(j, 'tok');

/** Every PII / amount / number value a view carries. */
const SENSITIVE = [
  LEAK_ADDRESS,
  'leak@',
  LEAK_NAME,
  'Zainab',
  'Quasimodo',
  NUMBER,
  CN_NUMBER,
  'LAW/2026',
  'LCN/2026',
  '1,999',
  '799.50',
  '₹',
  '199900',
  '79950',
  LINK,
];
function expectNoSensitive(extra: unknown[] = []) {
  const everything = [
    allLogText(),
    dump(capture.mock.calls),
    dump(crumb.mock.calls),
    dump((Sentry.captureMessage as jest.Mock).mock.calls),
    dump(extra),
  ].join('\n');
  for (const s of SENSITIVE) expect(everything).not.toContain(s);
}

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  (env as { BILLING_SERVICE_URL?: string }).BILLING_SERVICE_URL = 'http://localhost:4003/';
});
afterAll(() => {
  global.fetch = realFetch;
  (env as { BILLING_SERVICE_URL?: string }).BILLING_SERVICE_URL = realBillingUrl;
});

describe('success', () => {
  it('GETs the email-view with the internal secret and a 10 s timeout, in dry-run too', async () => {
    reply(200, VIEW);
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    await run(job());
    expect(env.EMAIL_DRY_RUN).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://localhost:4003/internal/invoices/${INVOICE_ID}/email-view`);
    expect(init.method).toBe('GET');
    expect(init.headers['x-internal-secret']).toBe(process.env.INTERNAL_SECRET);
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    timeoutSpy.mockRestore();
  });

  it('invoice: sends to view.customer.email only; the job to/cc/bcc/replyTo are ignored', async () => {
    reply(200, VIEW);
    const send = okSend();
    const result = await run(
      job(
        'billing.taxInvoice',
        { userId: USER_ID, invoiceId: INVOICE_ID },
        {
          to: ['attacker@evil.example'],
          cc: ['cc@evil.example'],
          bcc: ['bcc@evil.example'],
          replyTo: 'reply@evil.example',
        },
      ),
      send,
    );
    expect(send).toHaveBeenCalledTimes(1);
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
    expect(mail.bcc).toEqual([]);
    expect(mail.replyTo).toBeUndefined();
    expect(mail.meta).toEqual({ template: 'billing.taxInvoice', userId: USER_ID, jobId: 'job-i1' });
    expect(result).toEqual({ messageId: 'dry-run-1' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('credit note: sends to view.customer.email only', async () => {
    reply(200, CN_VIEW);
    const send = okSend();
    await run(
      job(
        'billing.creditNote',
        { userId: USER_ID, invoiceId: INVOICE_ID },
        { to: ['x@evil.example'] },
      ),
      send,
    );
    const mail = (send.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(mail.to).toEqual([LEAK_ADDRESS]);
    expect(mail.cc).toEqual([]);
  });

  it('invoice render data: number -> invoiceNumber, formatted amount and IST date, billing name and link', async () => {
    reply(200, VIEW);
    await run(job());
    expect(renderTemplate).toHaveBeenCalledWith('billing.taxInvoice', {
      name: LEAK_NAME,
      amount: '₹1,999',
      date: '15 Oct 2026',
      downloadUrl: LINK,
      userId: USER_ID,
      invoiceNumber: NUMBER,
    });
  });

  it('credit-note render data: original -> invoiceNumber and number -> creditNoteNumber', async () => {
    reply(200, CN_VIEW);
    await run(job('billing.creditNote'));
    expect(renderTemplate).toHaveBeenCalledWith('billing.creditNote', {
      name: LEAK_NAME,
      amount: '₹799.50',
      date: '15 Oct 2026',
      downloadUrl: LINK,
      userId: USER_ID,
      creditNoteNumber: CN_NUMBER,
      invoiceNumber: NUMBER,
    });
  });

  it('values smuggled into the job data (name, amount, number, link) are not used', async () => {
    reply(200, VIEW);
    await run(
      job('billing.taxInvoice', {
        userId: USER_ID,
        invoiceId: INVOICE_ID,
        name: 'From Job',
        amount: '₹1',
        invoiceNumber: 'EVIL/1',
        downloadUrl: 'https://evil.example/x',
      }),
    );
    const data = (renderTemplate as jest.Mock).mock.calls[0][1];
    expect(data.name).toBe(LEAK_NAME);
    expect(data.amount).toBe('₹1,999');
    expect(data.invoiceNumber).toBe(NUMBER);
    expect(data.downloadUrl).toBe(LINK);
  });

  it('a missing customer name becomes an empty string for the template', async () => {
    reply(200, { ...VIEW, customer: { email: LEAK_ADDRESS } });
    await run(job());
    expect((renderTemplate as jest.Mock).mock.calls[0][1].name).toBe('');
  });

  it('whole rupees and paise are formatted (₹799, ₹0.05)', async () => {
    reply(200, { ...VIEW, total: 79900 });
    await run(job());
    expect((renderTemplate as jest.Mock).mock.calls[0][1].amount).toBe('₹799');
    reply(200, { ...VIEW, total: 5 });
    await run(job());
    expect((renderTemplate as jest.Mock).mock.calls[1][1].amount).toBe('₹0.05');
  });

  it('logs and Sentry carry ids and status only: no name, email, number, amount or link', async () => {
    reply(200, VIEW);
    const result = await run(job());
    expectNoSensitive([result]);
    reply(200, CN_VIEW);
    const r2 = await run(job('billing.creditNote'));
    expectNoSensitive([r2]);
    const sent = parsedLogs().find((l) => l.msg === 'Email sent');
    expect(sent).toMatchObject({
      jobId: 'job-i1',
      template: 'billing.taxInvoice',
      userId: USER_ID,
    });
  });
});

describe('410: user erased or being erased (Addendum 8)', () => {
  it('completes as skipped: no send, no render, no retry, no Sentry, no error log', async () => {
    reply(410, { error: 'erased' });
    const send = okSend();
    const result = await run(job(), send);
    expect(result).toEqual({ skipped: 'erased' });
    expect(send).not.toHaveBeenCalled();
    expect(renderTemplate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();
    expect(crumb.mock.calls.map((c) => c[0].category)).toEqual(['email.send.start']);
    expect(parsedLogs().some((l) => (l.level as number) >= 50)).toBe(false);
    const line = parsedLogs().find((l) => String(l.msg).startsWith('Invoice email not sent'));
    expect(line).toMatchObject({
      level: 30,
      jobId: 'job-i1',
      template: 'billing.taxInvoice',
      userId: USER_ID,
      invoiceId: INVOICE_ID,
      status: 410,
    });
    expectNoSensitive([result]);
  });

  it('the same for a credit note', async () => {
    reply(410, { error: 'erased', email: LEAK_ADDRESS });
    const send = okSend();
    expect(await run(job('billing.creditNote'), send)).toEqual({ skipped: 'erased' });
    expect(send).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expectNoSensitive();
  });
});

describe('rows billing will not send for: UnrecoverableError, no retry', () => {
  it.each([404, 409, 400])('HTTP %i fails once, with no send', async (status) => {
    reply(status, { error: 'x', email: LEAK_ADDRESS });
    const send = okSend();
    const err = await run(job(), send).catch((e: Error) => e);
    expect((err as Error).name).toBe('UnrecoverableError');
    expect(send).not.toHaveBeenCalled();
    expect(renderTemplate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // UnrecoverableError counts as the final attempt: one value-free Sentry event.
    expect(capture).toHaveBeenCalledTimes(1);
    expectNoSensitive([(err as Error).message, (err as Error).stack]);
  });

  it.each([
    ['userId', { userId: OTHER_ID }],
    ['invoiceId', { invoiceId: OTHER_ID }],
    ['kind (credit_note for taxInvoice)', { kind: 'credit_note', originalInvoiceNumber: NUMBER }],
  ])('a 200 whose %s does not match the job', async (_l, over) => {
    reply(200, { ...VIEW, ...over });
    const send = okSend();
    const err = await run(job(), send).catch((e: Error) => e);
    expect((err as Error).name).toBe('UnrecoverableError');
    expect(send).not.toHaveBeenCalled();
    expect(renderTemplate).not.toHaveBeenCalled();
    expectNoSensitive([(err as Error).message, (err as Error).stack]);
  });

  it('a credit-note job given an invoice-kind row is refused (kind check is both ways)', async () => {
    reply(200, VIEW);
    const send = okSend();
    const err = await run(job('billing.creditNote'), send).catch((e: Error) => e);
    expect((err as Error).name).toBe('UnrecoverableError');
    expect(send).not.toHaveBeenCalled();
  });

  it("a credit-note job given another user's credit note is refused", async () => {
    reply(200, { ...CN_VIEW, userId: OTHER_ID });
    const send = okSend();
    await expect(run(job('billing.creditNote'), send)).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('bad ids are refused before any fetch', () => {
  it.each([
    ['no invoiceId', { userId: USER_ID }],
    ['empty invoiceId', { userId: USER_ID, invoiceId: '' }],
    ['non-hex invoiceId', { userId: USER_ID, invoiceId: 'g'.repeat(24) }],
    ['23 hex', { userId: USER_ID, invoiceId: 'a'.repeat(23) }],
    ['25 hex', { userId: USER_ID, invoiceId: 'a'.repeat(25) }],
    ['path traversal', { userId: USER_ID, invoiceId: `${'a'.repeat(21)}/..` }],
    ['query string', { userId: USER_ID, invoiceId: `${'a'.repeat(22)}?x` }],
    [
      'number',
      { userId: USER_ID, invoiceId: Number(INVOICE_ID.replace(/\D/g, '').padEnd(24, '1')) },
    ],
    ['array', { userId: USER_ID, invoiceId: [INVOICE_ID] }],
    ['no userId', { invoiceId: INVOICE_ID }],
    ['empty userId', { userId: '', invoiceId: INVOICE_ID }],
    ['address as userId', { userId: LEAK_ADDRESS, invoiceId: INVOICE_ID }],
    ['no data at all', {}],
  ])('%s: UnrecoverableError, fetch and send never called', async (_l, data) => {
    const send = okSend();
    const err = await run(job('billing.taxInvoice', data), send).catch((e: Error) => e);
    expect((err as Error).name).toBe('UnrecoverableError');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expectNoSensitive([(err as Error).message]);
  });

  it('the same for a credit-note job', async () => {
    await expect(run(job('billing.creditNote', { userId: USER_ID }))).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('upper-case hex is a valid id', async () => {
    reply(200, { ...VIEW, invoiceId: INVOICE_ID.toUpperCase() });
    const send = okSend();
    await run(
      job('billing.taxInvoice', { userId: USER_ID, invoiceId: INVOICE_ID.toUpperCase() }),
      send,
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('transient failures retry (BillingViewError, not Unrecoverable)', () => {
  async function expectRetry(code: string, send = okSend()) {
    const err = await run(job(), send).catch((e: Error) => e);
    expect((err as Error).name).toBe('BillingViewError');
    expect((err as Error).message).toBe(`BillingViewError (${code}) in email send`);
    expect(send).not.toHaveBeenCalled();
    expect(renderTemplate).not.toHaveBeenCalled();
    // intermediate attempt (1 of 5): logged, but no Sentry event
    expect(capture).not.toHaveBeenCalled();
    expect(parsedLogs().find((l) => l.msg === 'Email send failed')).toMatchObject({
      template: 'billing.taxInvoice',
      userId: USER_ID,
      finalAttempt: false,
    });
    expectNoSensitive([(err as Error).message, (err as Error).stack]);
  }

  it.each([401, 500, 502, 503])('HTTP %i', async (status) => {
    reply(status, { error: 'x', email: LEAK_ADDRESS });
    await expectRetry(`HTTP_${status}`);
  });

  it('network error whose text names the URL: code NETWORK, no URL kept', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('fetch failed http://localhost:4003/internal/invoices/x'), {
        cause: { code: 'ECONNREFUSED' },
      }),
    );
    await expectRetry('NETWORK');
    const text = [allLogText(), dump(capture.mock.calls), dump(crumb.mock.calls)].join('\n');
    expect(text).not.toContain('localhost:4003');
    expect(text).not.toContain('email-view');
  });

  it('timeout: code TIMEOUT', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));
    await expectRetry('TIMEOUT');
  });

  it.each([
    ['unparseable body', undefined],
    ['null body', null],
    ['string body', 'ok'],
    ['no email', { ...VIEW, customer: { name: 'N' } }],
    ['empty email', { ...VIEW, customer: { name: 'N', email: '' } }],
    ['no customer', { ...VIEW, customer: undefined }],
    ['non-string name', { ...VIEW, customer: { name: 5, email: LEAK_ADDRESS } }],
    ['no number', { ...VIEW, number: undefined }],
    ['no userId', { ...VIEW, userId: undefined }],
    ['no invoiceId', { ...VIEW, invoiceId: undefined }],
    ['unknown kind', { ...VIEW, kind: 'receipt' }],
    ['no link', { ...VIEW, downloadUrl: '' }],
    ['no issuedAt', { ...VIEW, issuedAt: undefined }],
    ['invalid issuedAt', { ...VIEW, issuedAt: 'not a date' }],
    ['string total', { ...VIEW, total: '199900' }],
    ['fractional total', { ...VIEW, total: 1999.5 }],
    ['negative total', { ...VIEW, total: -1 }],
    ['credit note without original number', { ...CN_VIEW, originalInvoiceNumber: null }],
    ['invoice naming an original invoice', { ...VIEW, originalInvoiceNumber: 'LAW/2026-27/0000' }],
  ])('200 with %s: BAD_RESPONSE', async (_l, body) => {
    reply(200, body);
    await expectRetry('BAD_RESPONSE');
  });

  it('BILLING_SERVICE_URL unset: NO_BILLING_URL, no fetch, retryable, in dry-run too', async () => {
    (env as { BILLING_SERVICE_URL?: string }).BILLING_SERVICE_URL = undefined;
    await expectRetry('NO_BILLING_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('final attempt: exactly one Sentry event, value-free', async () => {
    reply(503, { email: LEAK_ADDRESS });
    await run(job('billing.taxInvoice', undefined, {}, 4, 5)).catch(() => undefined);
    expect(capture).toHaveBeenCalledTimes(1);
    expect((capture.mock.calls[0][0] as Error).message).toBe(
      'BillingViewError (HTTP_503) in email send',
    );
    expectNoSensitive();
  });

  it('a send failure after a good view leaks nothing', async () => {
    reply(200, VIEW);
    const send = jest.fn(async () => {
      throw new Error(`rejected ${LEAK_ADDRESS} ${LEAK_NAME} ${NUMBER} ${LINK}`);
    });
    const err = await run(job('billing.taxInvoice', undefined, {}, 4, 5), send).catch(
      (e: Error) => e,
    );
    expectNoSensitive([(err as Error).message, (err as Error).stack]);
  });
});

describe('other templates are untouched', () => {
  it('auth.welcome: no billing call, the job recipients are used', async () => {
    const send = okSend();
    await createProcessor(send)(
      {
        id: 'j',
        queueName: 'email-high',
        attemptsMade: 0,
        opts: { attempts: 5 },
        data: {
          template: 'auth.welcome',
          to: ['a@example.com'],
          cc: [],
          bcc: [],
          data: { name: 'N', userId: USER_ID },
        },
      } as unknown as Job<EmailJobData>,
      'tok',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(((send.mock.calls[0] as unknown[])[0] as { to: string[] }).to).toEqual([
      'a@example.com',
    ]);
  });
});
