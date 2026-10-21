// T-521 break-ui pass: My documents with a long-title, many-row payload, and the templates
// library with long names / empty list. Class checks stand in for layout (jsdom has none).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import MyDocumentsPage from '@/app/dashboard/documents/page';
import TemplatesPage from '@/app/dashboard/templates/page';
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
const LONG = 'श्रीमती आलेक्सान्द्रा विश्नेव्स्का-कोवाल्चिक v. ' + 'Bartholomew'.repeat(20);
let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

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

describe('break-ui: My documents', () => {
  it('1,000 rows with 255-char titles and an unknown status render; titles truncate; New document stays', async () => {
    const docs = Array.from({ length: 1000 }, (_, i) => ({
      _id: `d${i}`,
      title: `${i} ${LONG}`.slice(0, 255),
      docType: 'bail_application',
      courtName: LONG,
      status: i % 3 === 0 ? 'finalised' : i % 3 === 1 ? 'draft' : 'archived-unknown',
      createdAt: '2026-10-01T00:00:00Z',
    }));
    apiFetchMock.mockResolvedValue(ok({ documents: docs }));
    await act(async () => root.render(<MyDocumentsPage />));
    await flush();
    const links = Array.from(container.querySelectorAll('tbody a'));
    expect(links).toHaveLength(1000);
    expect(links[0].className).toContain('truncate');
    expect(links[0].className).toContain('max-w-[220px]');
    // the table scrolls sideways instead of pushing the page wider
    expect(container.querySelector('table')!.parentElement!.className).toContain('overflow-x-auto');
    expect(
      Array.from(container.querySelectorAll('a')).some((a) => a.textContent === 'New document'),
    ).toBe(true);
  });

  it('a missing court name shows a dash, not "undefined"', async () => {
    apiFetchMock.mockResolvedValue(
      ok({
        documents: [
          {
            _id: 'a',
            title: 'T',
            docType: 'x',
            status: 'draft',
            createdAt: '2026-10-01T00:00:00Z',
          },
        ],
      }),
    );
    await act(async () => root.render(<MyDocumentsPage />));
    await flush();
    expect(container.textContent).not.toContain('undefined');
    expect(container.textContent).toContain('—');
  });

  it('a response with no documents key is treated as empty, not a crash', async () => {
    apiFetchMock.mockResolvedValue(ok({}));
    await act(async () => root.render(<MyDocumentsPage />));
    await flush();
    expect(container.textContent).toContain('No documents yet');
  });
});

describe('break-ui: templates library', () => {
  const tpl = (i: number) => ({
    template_id: `t${i}`,
    display_name: `${i} ${LONG}`,
    description: LONG,
    category: 'raw',
    plan_access: 'free',
    catalogueCategory: 'c1',
    catalogueCategoryName: LONG,
    catalogueCategoryOrder: 1,
    icon: 'file_text',
  });

  it('100 long-named templates render with their ?kind= links', async () => {
    apiFetchMock.mockResolvedValue(
      ok({ templates: Array.from({ length: 100 }, (_, i) => tpl(i)) }),
    );
    await act(async () => root.render(<TemplatesPage />));
    await flush();
    const cards = Array.from(container.querySelectorAll('a[href^="/dashboard/new?kind="]'));
    expect(cards).toHaveLength(100);
  });

  it('an empty list renders the page without an error or a skeleton', async () => {
    apiFetchMock.mockResolvedValue(ok({ templates: [] }));
    await act(async () => root.render(<TemplatesPage />));
    await flush();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(container.querySelector('h1')!.textContent).toBe('Templates');
  });
});
