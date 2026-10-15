// T-436 (b) AC: Terms 5b (section 1) and 5c (section 14), from GET /api/billing/public/supplier.
// Ajay, handoff/legal/gst-tax-invoice-signed.md, Addendum 1 and Addendum 7 (3): never a
// placeholder; hidden if the supplier endpoint is unavailable; no GSTIN drops " (GSTIN ...)".
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { resetSupplierCache } from '@/components/marketing/SupplierDetails';

import TermsPage from '../terms/page';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FULL = {
  legalName: 'Asha Verma',
  tradeName: 'Lawie',
  gstin: '20ABCDE1234F1Z5',
  stateName: 'Jharkhand',
};
const S5B_FULL =
  'Lawie is a trade name of Asha Verma, a sole proprietorship registered for GST in Jharkhand (GSTIN 20ABCDE1234F1Z5). In these Terms, "Lawie", "we" and "us" mean that proprietorship.';
const S5B_NO_GSTIN =
  'Lawie is a trade name of Asha Verma, a sole proprietorship registered for GST in Jharkhand. In these Terms, "Lawie", "we" and "us" mean that proprietorship.';

let container: HTMLDivElement;
let root: Root;
const mockFetch = jest.fn();
const realFetch = global.fetch;

const res = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function mount() {
  await act(async () => {
    root.render(<TermsPage />);
  });
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}
const sec = (id: string) => container.querySelector(`#${id}`)!;
const text = (el: Element) => el.textContent ?? '';

beforeEach(() => {
  resetSupplierCache();
  mockFetch.mockReset();
  mockApiFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  global.fetch = realFetch;
});

describe('T-436 Terms 5b / 5c', () => {
  it('5b renders byte-exact in section 1, between the first sentence and "If you do not agree"', async () => {
    mockFetch.mockResolvedValue(res(FULL));
    await mount();
    expect(text(sec('acceptance'))).toContain(
      `By accessing or using Lawie ("the Service"), you agree to be bound by these Terms of Service. ${S5B_FULL} If you do not agree, you must not use the Service.`.replace(
        /\s+/g,
        ' ',
      ),
    );
    expect(text(sec('acceptance'))).toContain(S5B_FULL);
  });

  it('5c: legal name only, above the contact email, in section 14; no GSTIN/State/address there', async () => {
    mockFetch.mockResolvedValue(res(FULL));
    await mount();
    const contact = sec('contact');
    const ps = Array.from(contact.querySelectorAll('p'));
    expect(ps[0].textContent).toBe('Asha Verma');
    expect(ps[1].textContent).toContain('legal@lawie.in');
    expect(text(contact)).not.toContain('GSTIN');
    expect(text(contact)).not.toContain('Jharkhand');
  });

  it('calls the public supplier endpoint with plain fetch (one request for both lines), not apiFetch', async () => {
    mockFetch.mockResolvedValue(res(FULL));
    await mount();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/api\/billing\/public\/supplier$/);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('no GSTIN (empty or absent): the " (GSTIN ...)" clause is dropped', async () => {
    mockFetch.mockResolvedValue(
      res({ legalName: 'Asha Verma', tradeName: 'Lawie', stateName: 'Jharkhand' }),
    );
    await mount();
    expect(text(sec('acceptance'))).toContain(S5B_NO_GSTIN);
    expect(text(sec('acceptance'))).not.toContain('GSTIN');
    expect(text(sec('contact'))).toContain('Asha Verma');
  });

  it('empty-string GSTIN also drops the clause', async () => {
    mockFetch.mockResolvedValue(res({ ...FULL, gstin: '  ' }));
    await mount();
    expect(text(sec('acceptance'))).toContain(S5B_NO_GSTIN);
  });

  const GONE = 'trade name of';
  it.each([
    ['503', () => mockFetch.mockResolvedValue(res({ error: 'x' }, 503))],
    ['404', () => mockFetch.mockResolvedValue(res({}, 404))],
    ['network error', () => mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))],
    [
      'invalid JSON',
      () =>
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('x');
          },
        }),
    ],
    ['null body', () => mockFetch.mockResolvedValue(res(null))],
    [
      'missing legalName',
      () => mockFetch.mockResolvedValue(res({ gstin: FULL.gstin, stateName: 'Jharkhand' })),
    ],
    ['blank legalName', () => mockFetch.mockResolvedValue(res({ ...FULL, legalName: '  ' }))],
  ])('%s: both 5b and 5c are hidden, no placeholder', async (_n, setup) => {
    setup();
    await mount();
    const all = text(container);
    expect(all).not.toContain(GONE);
    expect(all).not.toContain('sole proprietorship');
    expect(all).not.toContain('Asha Verma');
    expect(all).not.toMatch(/undefined|null|\{|\[\s*\]|\[supplier/i);
    // The rest of section 1 and 14 still reads as before.
    expect(text(sec('acceptance'))).toContain('If you do not agree, you must not use the Service.');
    expect(sec('contact').querySelectorAll('p')).toHaveLength(1);
  });

  it('5b starts with the trade name from the endpoint, not a hard-coded one', async () => {
    mockFetch.mockResolvedValue(res({ ...FULL, tradeName: 'Lawie Legal' }));
    await mount();
    const acceptance = text(sec('acceptance'));
    expect(acceptance).toContain(
      'Lawie Legal is a trade name of Asha Verma, a sole proprietorship registered for GST in Jharkhand (GSTIN 20ABCDE1234F1Z5).',
    );
    expect(acceptance).not.toContain('Lawie is a trade name');
  });

  it.each([
    ['absent', { legalName: 'Asha Verma', gstin: FULL.gstin, stateName: 'Jharkhand' }],
    ['empty', { ...FULL, tradeName: '' }],
    ['blank', { ...FULL, tradeName: '   ' }],
    ['not a string', { ...FULL, tradeName: 7 }],
  ])('tradeName %s: 5b hidden, no placeholder, 5c (legal name) kept', async (_n, body) => {
    mockFetch.mockResolvedValue(res(body));
    await mount();
    const all = text(container);
    expect(all).not.toContain('trade name of');
    expect(all).not.toContain('sole proprietorship');
    expect(all).not.toContain('registered for GST in');
    expect(all).not.toMatch(/undefined|null|\{|\[supplier/i);
    expect(text(sec('acceptance'))).toContain('If you do not agree, you must not use the Service.');
    const ps = Array.from(sec('contact').querySelectorAll('p'));
    expect(ps[0].textContent).toBe('Asha Verma');
    expect(ps).toHaveLength(2);
  });

  it('missing stateName: 5b hidden (no placeholder); 5c, the legal name, still shows', async () => {
    mockFetch.mockResolvedValue(
      res({ legalName: 'Asha Verma', tradeName: 'Lawie', gstin: FULL.gstin }),
    );
    await mount();
    expect(text(container)).not.toContain('sole proprietorship');
    expect(text(container)).not.toContain('registered for GST in');
    expect(sec('contact').querySelectorAll('p')[0].textContent).toBe('Asha Verma');
  });

  it('"Last updated" is unchanged in this slice', async () => {
    mockFetch.mockResolvedValue(res(FULL));
    await mount();
    expect(text(container)).toContain('Last updated: 14 October 2026');
  });
});
