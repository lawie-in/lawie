// T-544 item 4: the documents list title link gets a title attribute (mouse tooltip with the
// full title). The accessible name is the visible text; no aria-label.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import MyDocumentsPage from '@/app/dashboard/documents/page';
import { apiFetch } from '@/lib/apiFetch';

jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiFetchMock = apiFetch as jest.Mock;
const LONG =
  'State of Maharashtra v. Aleksandra Wisniewska-Kowalczyk and Others, Criminal Bail Application No. 1284 of 2026';
let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

beforeEach(() => {
  apiFetchMock.mockReset();
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const doc = (id: string, title: string) => ({
  _id: id,
  title,
  docType: 'bail_application',
  courtName: 'Bombay High Court',
  status: 'draft',
  createdAt: '2026-10-01T00:00:00Z',
});

describe('documents list title link (T-544 item 4)', () => {
  it('title attribute equals the full title; the name is the full title; no aria-label', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ documents: [doc('a', LONG), doc('b', 'Short'), doc('c', 'क')] }),
    });
    await act(async () => root.render(<MyDocumentsPage />));
    await flush();
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('tbody a')).filter((a) =>
      a.getAttribute('href')?.startsWith('/dashboard/documents/'),
    );
    expect(links.map((l) => l.textContent)).toEqual([LONG, 'Short', 'क']);
    for (const l of links) {
      expect(l.getAttribute('title')).toBe(l.textContent);
      expect(l.hasAttribute('aria-label')).toBe(false);
    }
    // the visual cut is CSS only, so the DOM text (the accessible name) is not shortened
    expect(links[0].className).toContain('truncate');
    expect(links[0].textContent).toHaveLength(LONG.length);
  });
});
