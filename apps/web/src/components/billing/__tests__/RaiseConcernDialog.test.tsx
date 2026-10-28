// T-646: Raise a concern dialog. Ajay's AJ-646-M1/M3/M4 strings byte for byte, the required reason,
// the note rules (500 max, required only for "Something else"), one message per refusal status
// (server text never shown), success.
import { act } from 'react';

import { grievanceLine } from '@/components/marketing/nl-copy';
import { cleanupMounted, mount, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

import { RaiseConcernDialog, concernErrorFor } from '../RaiseConcernDialog';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const PAYMENT = {
  id: 'pay_1',
  purpose: 'Top-up',
  amount: '₹65.00 incl. GST',
  date: '12 Oct 2026, 14:32',
};

const onOpenChange = jest.fn();
const onSubmitted = jest.fn();
const onStale = jest.fn();

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

function open() {
  mount(
    <RaiseConcernDialog
      open
      onOpenChange={onOpenChange}
      payment={PAYMENT}
      onSubmitted={onSubmitted}
      onStale={onStale}
    />,
  );
}

const select = () => document.querySelector('select') as HTMLSelectElement;
const textarea = () => document.querySelector('textarea') as HTMLTextAreaElement;
const btn = (name: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === name,
  ) as HTMLButtonElement;
const text = () => document.body.textContent ?? '';

function choose(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(select(), value);
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(textarea(), value);
    textarea().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => btn('Submit').click());
  await flush();
}
const res = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanupMounted();
  jest.restoreAllMocks();
});

describe('signed strings (Ajay AJ-646-M1, M3, M4), exact', () => {
  it('the five reasons in Ajay order, no default selected', () => {
    open();
    const opts = Array.from(select().options);
    expect(opts[0].value).toBe('');
    expect(opts[0].selected).toBe(true);
    expect(opts.slice(1).map((o) => o.textContent)).toEqual([
      'Charged, but Ink not added',
      'Charged twice',
      'Wrong amount charged',
      'I want a refund',
      'Something else',
    ]);
    expect(opts.slice(1).map((o) => o.value)).toEqual([
      'charged_no_ink',
      'charged_twice',
      'wrong_amount',
      'refund_request',
      'other',
    ]);
  });

  it('note label, hint, response times and the grievance line', () => {
    open();
    expect(text()).toContain('Tell us what happened');
    expect(text()).toContain('Please do not include case details or card numbers.');
    expect(text()).toContain(
      'We acknowledge every concern within 24 hours and resolve it within 15 days.',
    );
    const g = grievanceLine();
    expect(g.email).toBe('contact@lawie.in');
    expect(text()).toContain(`${g.before}${g.email}${g.after}`);
    const mail = document.querySelector(`a[href="mailto:${g.email}"]`);
    expect(mail).not.toBeNull();
  });

  it('names the payment so the user files against the right row', () => {
    open();
    expect(text()).toContain('Raise a concern');
    expect(text()).toContain('Top-up · ₹65.00 incl. GST · 12 Oct 2026, 14:32');
  });

  it('uses a native required select and a textarea limited to 500 with a live counter', () => {
    open();
    expect(select().required).toBe(true);
    expect(textarea().maxLength).toBe(500);
    expect(text()).toContain('0/500');
    type('hello');
    expect(text()).toContain('5/500');
  });
});

describe('validation', () => {
  it('no reason: "Choose a reason." and nothing is sent', async () => {
    open();
    await submit();
    expect(text()).toContain('Choose a reason.');
    expect(select().getAttribute('aria-invalid')).toBe('true');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('"Something else" needs a note; blank spaces do not count', async () => {
    open();
    choose('other');
    expect(textarea().required).toBe(true);
    type('    ');
    await submit();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(document.querySelector('[id$="-note"]')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('other reasons: the note is optional', async () => {
    mockApiFetch.mockResolvedValue(
      res(201, { concern: { id: 'c1', status: 'open', reference: 'CN-1' } }),
    );
    open();
    choose('charged_twice');
    expect(textarea().required).toBe(false);
    await submit();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('the note is cut at 500 characters', () => {
    open();
    type('x'.repeat(650));
    expect(textarea().value.length).toBe(500);
    expect(text()).toContain('500/500');
  });
});

describe('submit', () => {
  it('POSTs { reason, note } (trimmed) to /api/billing/payments/:id/concerns', async () => {
    mockApiFetch.mockResolvedValue(
      res(201, { concern: { id: 'c1', status: 'open', reference: 'CN-0001' } }),
    );
    open();
    choose('charged_no_ink');
    type('  Paid at 2pm, no Ink  ');
    await submit();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/billing/payments/pay_1/concerns');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      reason: 'charged_no_ink',
      note: 'Paid at 2pm, no Ink',
    });
  });

  it('201 hands the concern up and closes the dialog', async () => {
    mockApiFetch.mockResolvedValue(
      res(201, { concern: { id: 'c1', status: 'open', reference: 'CN-0001' } }),
    );
    open();
    choose('wrong_amount');
    type('Charged 99');
    await submit();
    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'c1',
        status: 'open',
        reference: 'CN-0001',
        reason: 'wrong_amount',
        note: 'Charged 99',
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onStale).not.toHaveBeenCalled();
  });

  it('a 201 with an unreadable body still counts as sent', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => {
        throw new Error('x');
      },
    });
    open();
    choose('charged_twice');
    await submit();
    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open', reason: 'charged_twice' }),
    );
  });

  it('does not send twice on a double click', async () => {
    let resolve!: (v: unknown) => void;
    mockApiFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    open();
    choose('charged_twice');
    await act(async () => btn('Submit').click());
    // a real second click comes after React has re-rendered the sending state
    await act(async () => btn('Submit').click());
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve(res(201, { concern: { id: 'c', status: 'open', reference: 'r' } })),
    );
  });
});

describe('refusals: one line per status, server text never shown', () => {
  const SERVER_TEXT = 'SERVER-LEAK internal detail with note echo';
  it.each([
    [400, 'Check the reason and the note, then try again.', false],
    [404, 'We could not find this payment. Reload the page and try again.', true],
    [409, 'There is already an open concern on this payment.', true],
    [429, 'Too many attempts. Wait a few minutes, then try again.', false],
    [503, 'Something did not work. Try again.', false],
    [500, 'Something did not work. Try again.', false],
    [418, 'Something did not work. Try again.', false],
  ])('%i -> "%s" (reload list: %s)', async (status, line, stale) => {
    mockApiFetch.mockResolvedValue(res(status, { error: SERVER_TEXT, message: SERVER_TEXT }));
    open();
    choose('charged_twice');
    type('my note');
    await submit();
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(line);
    expect(text()).not.toContain('SERVER-LEAK');
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onStale).toHaveBeenCalledTimes(stale ? 1 : 0);
    // the form keeps what was typed
    expect(select().value).toBe('charged_twice');
    expect(textarea().value).toBe('my note');
    // and can be tried again
    expect(btn('Submit').disabled).toBe(false);
  });

  it('a network failure shows the generic line', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));
    open();
    choose('charged_twice');
    await submit();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Something did not work. Try again.',
    );
    expect(onStale).not.toHaveBeenCalled();
  });

  it('never logs the note', async () => {
    const spy = console.error as jest.Mock;
    mockApiFetch.mockResolvedValue(res(400, { error: 'x' }));
    open();
    choose('charged_twice');
    type('PRIVATE-NOTE-TEXT');
    await submit();
    expect(JSON.stringify(spy.mock.calls)).not.toContain('PRIVATE-NOTE-TEXT');
  });

  it('concernErrorFor maps statuses', () => {
    expect(concernErrorFor(400)).toBe('Check the reason and the note, then try again.');
    expect(concernErrorFor(404)).toBe(
      'We could not find this payment. Reload the page and try again.',
    );
    expect(concernErrorFor(409)).toBe('There is already an open concern on this payment.');
    expect(concernErrorFor(429)).toBe('Too many attempts. Wait a few minutes, then try again.');
    expect(concernErrorFor(502)).toBe('Something did not work. Try again.');
  });
});
