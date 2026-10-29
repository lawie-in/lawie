// T-674 AC3 / Ajay R4: no internal court id on screen. The documents list, the document page
// (header and sidebar) and the review page show `courtLabel`, never `courtName` when that is an id.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DocumentEditorPage from '@/app/dashboard/documents/[id]/page';
import MyDocumentsPage from '@/app/dashboard/documents/page';
import ReviewPage from '@/app/review/[token]/page';
import { apiFetch } from '@/lib/apiFetch';

jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/auth', () => ({ getAccessToken: jest.fn(() => 'tok') }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { plan: 'pro' } }) }));
jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'doc1' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/dashboard/documents/doc1'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock('@/components/editor/DocumentEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="editor" />,
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = 'up_district_lucknow';
const LABEL = 'District Court, Lucknow';
// Any court-id-shaped token (prefix from the fixture family) must never be on screen.
const COURT_ID_ON_SCREEN = /\b(?:up|mp|kl|bihar|rj|ap)_[a-z0-9]+(?:_[a-z0-9]+)*\b/;

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

beforeEach(() => {
  (apiFetch as jest.Mock).mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function expectNoId(el: Element) {
  expect(el.textContent).not.toContain(ID);
  expect(el.textContent).not.toMatch(COURT_ID_ON_SCREEN);
  expect(el.innerHTML).not.toContain(ID);
}

describe('documents list', () => {
  async function renderList(documents: Array<Record<string, unknown>>) {
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ documents }),
    });
    await act(async () => root.render(<MyDocumentsPage />));
    await flush();
  }
  const base = {
    docType: 'bail_application',
    status: 'draft',
    createdAt: '2026-10-01T00:00:00Z',
  };

  it('shows the label and never the raw id when courtName is an id', async () => {
    await renderList([{ ...base, _id: 'a', title: 'Alpha', courtName: ID, courtLabel: LABEL }]);
    const table = container.querySelector('table')!;
    expect(table.textContent).toContain(LABEL);
    expectNoId(container);
  });

  it('shows the dash when courtLabel is absent, even if courtName is an id (no fallback)', async () => {
    await renderList([{ ...base, _id: 'a', title: 'Alpha', courtName: ID }]);
    const table = container.querySelector('table')!;
    expect(table.textContent).toContain('—');
    expectNoId(container);
  });

  it('shows the dash when courtLabel is an empty string', async () => {
    await renderList([{ ...base, _id: 'a', title: 'Alpha', courtName: ID, courtLabel: '' }]);
    const spans = Array.from(container.querySelectorAll('td span')).map((s) => s.textContent);
    expect(spans).toContain('—');
    expectNoId(container);
  });

  it('a typed court name delivered as the label is shown as typed', async () => {
    const typed = 'Civil Judge (Senior Division), Sitapur';
    await renderList([{ ...base, _id: 'a', title: 'Alpha', courtName: typed, courtLabel: typed }]);
    expect(container.textContent).toContain(typed);
  });
});

describe('document page [id]', () => {
  async function renderDoc(extra: Record<string, unknown>) {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        _id: 'doc1',
        title: 'Bail application',
        docType: 'bail_application',
        courtType: 'district_court',
        courtName: ID,
        content: '<p>Para 1.</p>',
        status: 'draft',
        sectionsCited: [],
        filingChecklist: [],
        checklistState: [],
        exportedAs: [],
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        ...extra,
      }),
    }));
    await act(async () => root.render(<DocumentEditorPage />));
    await flush();
  }

  it('header and sidebar show the label, never the id', async () => {
    await renderDoc({ courtLabel: LABEL });
    expect(container.querySelector('h1')).not.toBeNull();
    const header = container.querySelector('h1')!.parentElement!;
    expect(header.textContent).toContain(LABEL);
    // header + sidebar "Court" row
    expect(container.textContent!.split(LABEL).length - 1).toBeGreaterThanOrEqual(2);
    expectNoId(container);
  });

  it('an id without a label shows no id; the sidebar Court row is a dash', async () => {
    await renderDoc({ courtLabel: '' });
    const header = container.querySelector('h1')!.parentElement!;
    expect(header.textContent).not.toContain(ID);
    const dt = Array.from(container.querySelectorAll('dt')).find((d) => d.textContent === 'Court');
    expect(dt).toBeDefined();
    expect(dt!.nextElementSibling!.textContent).toBe('—');
    expectNoId(container);
  });

  it('courtLabel absent altogether: still no id, dash in the sidebar', async () => {
    await renderDoc({});
    const dt = Array.from(container.querySelectorAll('dt')).find((d) => d.textContent === 'Court');
    expect(dt!.nextElementSibling!.textContent).toBe('—');
    expectNoId(container);
  });
});

describe('review page [token]', () => {
  async function renderReview(courtLabel: string | undefined) {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        document: {
          title: 'Bail application',
          docType: 'bail_application',
          courtName: ID,
          ...(courtLabel === undefined ? {} : { courtLabel }),
          content: 'Para 1.',
          sectionsCited: [],
        },
        review: { assignedTo: 'Adv. Kumar', expiresAt: '2030-01-01T00:00:00Z' },
        formSchema: { yes_no_items: [], verdicts: [] },
      }),
    }));
    await act(async () => root.render(<ReviewPage params={Promise.resolve({ token: 'tok-1' })} />));
    await flush();
  }

  it('shows "· label" and never the id', async () => {
    await renderReview(LABEL);
    expect(container.textContent).toContain(`· ${LABEL}`);
    expectNoId(container);
  });

  it('shows nothing for the court when the label is empty', async () => {
    await renderReview('');
    expect(container.textContent).not.toContain('·  ');
    expect(container.textContent).not.toContain(LABEL);
    expect(container.textContent).not.toMatch(/·\s*$/m);
    expectNoId(container);
  });

  it('shows no id when the label is missing', async () => {
    await renderReview(undefined);
    expectNoId(container);
  });
});
