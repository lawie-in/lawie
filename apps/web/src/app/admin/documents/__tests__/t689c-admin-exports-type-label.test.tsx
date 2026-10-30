// T-689c: the admin documents page "Doc type" cell shows the pack's label as written, else the
// raw docType (capitalised by CSS), else a dash.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import AdminDocumentsPage from '@/app/admin/documents/page';
import { apiFetch } from '@/lib/apiFetch';

jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const analytics = {
  kpis: {
    totalDocs: 1,
    totalDocsThisMonth: 1,
    finalisedRate: 0,
    aiCostInr: 0,
    aiGenCount: 0,
    avgCostPerGenInr: 0,
  },
  docTypeBreakdown: [],
  templateUsage: [],
};

const row = (over: Record<string, unknown>) => ({
  _id: 'd1',
  title: 'Reply',
  docType: 'petition',
  userName: 'Adv. Test',
  exportedAs: ['pdf'],
  exportedAt: '2026-10-20T00:00:00Z',
  ...over,
});

async function renderPage(exportRows: Array<Record<string, unknown>>) {
  (apiFetch as jest.Mock).mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('/exports') ? { exports: exportRows } : analytics),
  }));
  await act(async () => root.render(<AdminDocumentsPage />));
  await flush();
}

/** The "Doc type" cell of the export row at `i`: the second cell. */
function typeCell(i = 0): HTMLElement {
  const cells = [...container.querySelectorAll('tbody td')].filter(
    (td) => td.closest('table')?.querySelector('th')?.textContent === 'Title',
  );
  const rows = cells.filter((_, k) => k % 5 === 1);
  return rows[i] as HTMLElement;
}

describe('T-689c: admin exports Doc type cell', () => {
  it('shows "Written Statement" for a petition with a label, not capitalised by CSS, never "petition"', async () => {
    await renderPage([row({ docTypeLabel: 'Written Statement' })]);
    expect(typeCell().textContent).toBe('Written Statement');
    expect(typeCell().className).not.toContain('capitalize');
    expect(container.textContent).not.toContain('petition');
  });

  it('falls back to the raw docType, with the capitalize class, for a null, empty or absent label', async () => {
    await renderPage([
      row({ _id: 'a', docTypeLabel: null, docType: 'bail_application' }),
      row({ _id: 'b', docTypeLabel: '', docType: 'legal_notice' }),
      row({ _id: 'c', docType: 'petition' }),
    ]);
    expect(typeCell(0).textContent).toBe('bail_application');
    expect(typeCell(1).textContent).toBe('legal_notice');
    expect(typeCell(2).textContent).toBe('petition');
    for (const i of [0, 1, 2]) expect(typeCell(i).className).toContain('capitalize');
  });

  it('shows a dash when there is neither a label nor a docType', async () => {
    await renderPage([row({ docTypeLabel: null, docType: '' })]);
    expect(typeCell().textContent).toBe('—');
  });

  it('a label wins over a docType in the same row', async () => {
    await renderPage([
      row({ docTypeLabel: 'Anticipatory Bail Application', docType: 'bail_application' }),
    ]);
    expect(typeCell().textContent).toBe('Anticipatory Bail Application');
  });
});
