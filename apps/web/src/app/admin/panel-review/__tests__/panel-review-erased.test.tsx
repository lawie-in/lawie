import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import PanelReviewPage from '@/app/admin/panel-review/page';
import { apiFetch } from '@/lib/apiFetch';

// T-115c — a reviewer who erased their account reads "reviewer: erased" in the admin panel,
// with no name, no initials and no copy-link button (the link string is gone).
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (over: Record<string, unknown>) => ({
  token: 't',
  assignedTo: 'x',
  documentId: 'd1',
  documentTitle: 'Doc One',
  documentType: 'bail_application',
  status: 'submitted',
  verdict: 'minor_edits',
  submittedAt: '2026-10-10T00:00:00Z',
  comments: null,
  checklist: null,
  ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  (apiFetch as jest.Mock).mockImplementation(async (path: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      path.includes('panel-review')
        ? {
            matrix: [
              row({ token: 'erasedhex', assignedTo: null, reviewerErased: true }),
              row({
                token: 'live-token',
                assignedTo: 'Meera Sinha',
                reviewerErased: false,
                documentId: 'd2',
                documentTitle: 'Doc Two',
              }),
            ],
            counts: { total: 2, submitted: 2, pending: 0, expired: 0, verdicts: {} },
          }
        : { documents: [] },
  }));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

describe('panel review page, erased reviewer', () => {
  it('shows "reviewer: erased" for the erased row and the name for the live one', async () => {
    await act(async () => root.render(<PanelReviewPage />));
    await flush();
    const text = container.textContent ?? '';
    expect(text).toContain('reviewer: erased');
    expect(text.match(/reviewer: erased/g)).toHaveLength(1);
    expect(text).toContain('Meera Sinha');
    expect(text).not.toContain('null');
  });

  it('the erased row has no copy-link button; the live row has one', async () => {
    await act(async () => root.render(<PanelReviewPage />));
    await flush();
    const copyButtons = container.querySelectorAll('button[title="Copy review URL"]');
    expect(copyButtons).toHaveLength(1);
  });
});
