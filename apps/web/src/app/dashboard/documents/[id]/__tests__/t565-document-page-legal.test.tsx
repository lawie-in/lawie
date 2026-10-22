// T-565 items 29 and 39 (Ajay, pre-Anushka legal review 22 Oct): the free-tier watermark notice is
// deleted with nothing in its place, and the made-up fallback filing checklist is gone. A checklist
// shows only when the template carries one.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DocumentEditorPage from '@/app/dashboard/documents/[id]/page';

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'doc1' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/dashboard/documents/doc1'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
jest.mock('@/lib/auth', () => ({ getAccessToken: jest.fn(() => 'tok') }));
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
let plan = 'free';
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { plan } }) }));
jest.mock('@/components/editor/DocumentEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="editor" />,
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FALLBACK_ITEMS = [
  'Verify all section references',
  'Review cause title formatting',
  'Confirm party details are correct',
  'Check verification clause details',
  'Attach supporting documents',
  'Print on legal-size paper',
];

let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

async function mount(filingChecklist: string[], checklistState: boolean[] = []) {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      _id: 'doc1',
      title: 'Bail application',
      docType: 'bail_application',
      courtType: 'high_court',
      courtName: 'Patna High Court',
      content: '<p>x</p>',
      status: 'draft',
      sectionsCited: [],
      filingChecklist,
      checklistState,
      exportedAs: [],
      version: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    }),
  }));
  await act(async () => root.render(<DocumentEditorPage />));
  await flush();
}
const text = () => container.textContent ?? '';

beforeEach(() => {
  plan = 'free';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('T-565 item 29: no watermark notice', () => {
  it.each(['free', 'pro'])(
    'a %s user sees no watermark text and no Upgrade to Pro button',
    async (p) => {
      plan = p;
      await mount([]);
      expect(container.querySelector('[data-testid="editor"]')).not.toBeNull(); // page rendered
      expect(text()).not.toMatch(/watermark/i);
      expect(text()).not.toContain('Free tier exports');
      expect(text()).not.toContain('for clean exports');
      const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
      expect(labels).not.toContain('Upgrade to Pro');
    },
  );
});

describe('T-565 item 39: no fallback filing checklist', () => {
  it('a template with no checklist shows no checklist panel and none of the made-up items', async () => {
    await mount([]);
    expect(text()).not.toContain('Filing checklist');
    for (const item of FALLBACK_ITEMS) expect(text()).not.toContain(item);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("a template's own checklist is shown, with its saved ticks, and no fallback items", async () => {
    await mount(['Court fee stamp', 'Affidavit signed'], [true, false]);
    expect(text()).toContain('Filing checklist');
    expect(text()).toContain('Court fee stamp');
    expect(text()).toContain('Affidavit signed');
    for (const item of FALLBACK_ITEMS) expect(text()).not.toContain(item);
  });
});
