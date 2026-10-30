// T-689c: the shared review page chip shows the rule pack's label ("Written Statement"),
// else the humanised docType; the label is never replaced by the stored "petition".
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ReviewPage from '@/app/review/[token]/page';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: { alt?: string }) => <span data-testid="img" data-alt={props.alt} />,
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

function payload(documentFields: Record<string, unknown>) {
  return {
    document: {
      title: 'Reply to the plaint',
      courtName: 'Patna HC',
      content: 'Para 1.',
      sectionsCited: [],
      ...documentFields,
    },
    review: { assignedTo: 'Adv. Kumar', expiresAt: '2026-12-01T00:00:00Z' },
    formSchema: {
      yes_no_items: [{ id: 'q1', label: 'Is it accurate?' }],
      verdicts: [{ id: 'approve', label: 'Approve' }],
    },
  };
}

async function renderReview(documentFields: Record<string, unknown>) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload(documentFields),
  }) as unknown as typeof fetch;
  await act(async () => root.render(<ReviewPage params={Promise.resolve({ token: 'tok123' })} />));
  await flush();
}

/** The type chip: the small grey span in the line under the title. */
function chip(): HTMLElement {
  const el = container.querySelector('span.rounded.bg-slate-100') as HTMLElement | null;
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('T-689c: review page type chip', () => {
  it('shows "Written Statement" for docType petition with a label, never "petition"', async () => {
    await renderReview({ docType: 'petition', docTypeLabel: 'Written Statement' });
    expect(chip().textContent).toBe('Written Statement');
    expect(container.textContent).not.toContain('petition');
  });

  it('keeps the label as the pack writes it (no capitalising or underscore change)', async () => {
    await renderReview({ docType: 'petition', docTypeLabel: 'Condonation of Delay Application' });
    expect(chip().textContent).toBe('Condonation of Delay Application');
    expect(chip().className).not.toContain('capitalize');
  });

  it.each([
    ['null', null],
    ['empty', ''],
  ])('a %s label falls back to the humanised docType', async (_n, label) => {
    await renderReview({ docType: 'bail_application', docTypeLabel: label });
    expect(chip().textContent).toBe('bail application');
  });

  it('an absent label falls back to the humanised docType', async () => {
    await renderReview({ docType: 'legal_notice' });
    expect(chip().textContent).toBe('legal notice');
  });

  it('the court label still shows next to the chip', async () => {
    await renderReview({
      docType: 'petition',
      docTypeLabel: 'Written Statement',
      courtLabel: 'High Court of Jharkhand',
    });
    expect(container.textContent).toContain('High Court of Jharkhand');
    expect(chip().textContent).toBe('Written Statement');
  });
});
