// T-578 AC2: the document page's top area. Notes row text, Annexures placement by media query
// (one region at a time), save-state placement, and the focus footer prop. The editor is a stub.
import { act, type ReactNode } from 'react';
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
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { plan: 'free' } }) }));

let wide = false;
jest.mock('@/components/ui/motion', () => ({
  ...jest.requireActual('@/components/ui/motion'),
  useMediaQuery: jest.fn((q: string) => (q === '(min-width: 1024px)' ? wide : false)),
}));

interface StubProps {
  saveState?: ReactNode;
  focusFooter?: string | null;
  onFocusModeChange?: (open: boolean) => void;
}
let editorProps: StubProps = {};
jest.mock('@/components/editor/DocumentEditor', () => ({
  __esModule: true,
  default: (p: StubProps) => {
    editorProps = p;
    return (
      <div data-testid="editor">
        <button data-testid="focus-on" onClick={() => p.onFocusModeChange?.(true)} />
        <button data-testid="focus-off" onClick={() => p.onFocusModeChange?.(false)} />
        <div data-testid="toolbar-save">{p.saveState}</div>
      </div>
    );
  },
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Typed out here, independent of the source: the label and disclaimer are the service's text.
const LABEL = 'Starting draft: prepared from a template. Review and edit every part.';
const DISCLAIMER = 'This draft is a starting point and is not legal advice. Check before filing.';

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

async function mount(over: Record<string, unknown> = {}) {
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
      filingChecklist: ['Court fee stamp'],
      checklistState: [false],
      exportedAs: [],
      version: 3,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      courtDocument: true,
      hasParty: true,
      startingDraft: true,
      startingDraftLabel: LABEL,
      disclaimer: DISCLAIMER,
      ...over,
    }),
  }));
  await act(async () => root.render(<DocumentEditorPage />));
  await flush();
}

const regions = () =>
  Array.from(container.querySelectorAll('[role="region"]')).filter((r) =>
    r.textContent?.includes('Create annexures'),
  );
const notes = () => Array.from(container.querySelectorAll('[role="note"]'));
const click = (id: string) =>
  act(async () => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click());

beforeEach(() => {
  wide = false;
  editorProps = {};
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('T-578 AC2: the notes row', () => {
  it('shows the label and the disclaimer byte-identical, each as a role=note, no box', async () => {
    await mount();
    const n = notes();
    expect(n).toHaveLength(2);
    expect(n[0].textContent).toBe(LABEL);
    expect(n[1].textContent).toBe(DISCLAIMER);
    for (const el of n) {
      const wrapper = el.closest('.flex.flex-col.gap-1')!;
      expect(wrapper).not.toBeNull();
      expect(el.outerHTML).not.toMatch(/border|bg-brand|rounded/);
      const p = el.tagName === 'P' ? el : el.querySelector('p')!;
      expect(p.className).toContain('text-nl-muted');
    }
  });

  it('both lines come before the editor in the document order', async () => {
    await mount();
    const editor = container.querySelector('[data-testid="editor"]')!;
    for (const el of notes()) {
      expect(el.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('omits the label when the draft is not a starting draft; the disclaimer stays', async () => {
    await mount({ startingDraft: false });
    expect(notes().map((e) => e.textContent)).toEqual([DISCLAIMER]);
  });

  it('passes the same disclaimer to the editor for the focus footer', async () => {
    await mount();
    expect(editorProps.focusFooter).toBe(DISCLAIMER);
  });
});

describe('T-578 AC2: the Annexures row placement', () => {
  it('below lg: exactly one region, in the editor column before the editor', async () => {
    wide = false;
    await mount();
    expect(regions()).toHaveLength(1);
    const editor = container.querySelector('[data-testid="editor"]')!;
    expect(
      regions()[0].compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('from lg: exactly one region, first in the right rail, before the filing checklist', async () => {
    wide = true;
    await mount();
    expect(regions()).toHaveLength(1);
    const editor = container.querySelector('[data-testid="editor"]')!;
    expect(
      regions()[0].compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    const checklistHeading = Array.from(container.querySelectorAll('*')).find(
      (e) => e.children.length === 0 && e.textContent === 'Filing checklist',
    )!;
    expect(checklistHeading).toBeTruthy();
    expect(
      regions()[0].compareDocumentPosition(checklistHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(regions()[0].parentElement).toBe(checklistHeading.closest('.w-full.shrink-0')!);
  });

  it('no region when the document is not a court document with a party', async () => {
    await mount({ hasParty: false });
    expect(regions()).toHaveLength(0);
  });

  it('the button is described by the help line, which is hidden only below 640px (sm)', async () => {
    await mount();
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Create annexures',
    )!;
    const id = btn.getAttribute('aria-describedby')!;
    expect(id).toBeTruthy();
    const help = container.ownerDocument.getElementById(id)!;
    expect(help.textContent).toBe('Prepared from the details you entered.');
    expect(help.className).toContain('max-[639px]:hidden');
    expect(help.className).not.toContain('max-[479px]');
  });
});

describe('T-578: the save state', () => {
  it('is in the header normally and moves to the editor toolbar in focus mode', async () => {
    await mount();
    const inToolbar = () => container.querySelector('[data-testid="toolbar-save"]')!.textContent;
    const inHeader = () =>
      Array.from(container.querySelectorAll('span')).filter(
        (s) => (s.textContent ?? '').trim() === 'v3' && !s.closest('[data-testid="editor"]'),
      ).length;
    expect(inHeader()).toBe(1);
    // The editor holds the node always; it only shows it in focus mode, so the page shows one copy.
    expect(editorProps.saveState).toBeTruthy();
    await click('focus-on');
    expect(inHeader()).toBe(0);
    expect(inToolbar()).toContain('v3');
    await click('focus-off');
    expect(inHeader()).toBe(1);
  });
});

describe('T-578 review: the save-state text colour (4.5:1)', () => {
  // Header sits on Wall (Muted, 5.08:1 day / 6.08:1 night); the focus toolbar is slate-50 in both
  // themes (slate-600, 7.24:1). The ratios themselves are measured in the Playwright spec.
  it('uses text-nl-muted in the header and text-slate-600 in the focus-mode toolbar', async () => {
    await mount();
    const header = Array.from(container.querySelectorAll('span')).find(
      (s) => (s.textContent ?? '').trim() === 'v3' && !s.closest('[data-testid="editor"]'),
    )!;
    expect(header.className).toContain('text-nl-muted');
    expect(header.className).not.toContain('text-slate-400');
    const toolbarSpan = (editorProps.saveState as React.ReactElement<{ className: string }>).props;
    expect(toolbarSpan.className).toContain('text-slate-600');
    expect(toolbarSpan.className).not.toContain('text-nl-muted');
    expect(toolbarSpan.className).not.toContain('text-slate-400');
  });
});
