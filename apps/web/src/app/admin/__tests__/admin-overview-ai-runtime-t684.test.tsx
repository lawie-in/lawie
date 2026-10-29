// T-684 (web): the AI runtime card on /admin shows one row per role when the drafting service
// sends `models`, and the two pre-T-684 rows when it does not.
import { cleanupMounted, renderAsync, screen, waitFor } from './dom-helpers-t684';

import AdminOverviewPage from '../page';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const res = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

type Runtime = Record<string, unknown>;
let runtime: Runtime | 'http' | 'throw';

afterEach(cleanupMounted);

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockImplementation(async (url: string) => {
    if (url === '/api/drafting/admin/overview/ai-runtime') {
      if (runtime === 'throw') throw new Error('boom');
      if (runtime === 'http') return res({}, false);
      return res(runtime);
    }
    // KPIs, activity and referral codes are not under test.
    return res({}, false);
  });
});

async function renderPage() {
  await renderAsync(<AdminOverviewPage />);
  await waitFor(() => expect(screen.queryByText('Loading overview…')).not.toBeInTheDocument());
  expect(mockApiFetch).toHaveBeenCalledWith('/api/drafting/admin/overview/ai-runtime');
}

/** The runtime row whose label text is exactly `label`. */
function runtimeRow(label: string): HTMLElement {
  const card = screen
    .getByRole('heading', { name: 'AI runtime' })
    .closest('section') as HTMLElement;
  const labelEl = Array.from(card.querySelectorAll('span, code')).find(
    (e) => e.textContent === label && e.children.length === 0,
  );
  if (!labelEl) throw new Error(`no runtime row ${label}`);
  return labelEl.parentElement as HTMLElement;
}
const rowLabels = () => {
  const card = screen
    .getByRole('heading', { name: 'AI runtime' })
    .closest('section') as HTMLElement;
  return Array.from(card.querySelectorAll('div.py-1\\.5')).map(
    (r) => (r.firstElementChild as HTMLElement).textContent,
  );
};
/** The monospace value element of a row (amber when not ok). */
const valueEl = (row: HTMLElement) => row.querySelector('span.font-mono') as HTMLElement;
const tagsOf = (row: HTMLElement) =>
  Array.from(row.querySelectorAll('span.rounded-full')).map((t) => t.textContent);

const FULL = {
  drafting_model: 'test-model-d',
  preflight_model: 'test-model-f',
  models: {
    matcher: 'test-model-m',
    extractor: 'test-model-e',
    drafter: 'test-model-d',
    fact_checker: 'test-model-f',
    legal_reviewer: 'test-model-l',
    language: 'test-model-g',
  },
  model_sources: {
    matcher: 'new',
    extractor: 'new',
    drafter: 'new',
    fact_checker: 'new',
    legal_reviewer: 'new',
    language: 'new',
  },
};

describe('new shape (models present)', () => {
  it('shows six rows in order with role labels and the resolved ids', async () => {
    runtime = FULL;
    await renderPage();
    expect(rowLabels()).toEqual([
      'Drafter',
      'Extractor',
      'Fact checker',
      'Matcher',
      'Legal reviewer',
      'Language',
    ]);
    expect(valueEl(runtimeRow('Drafter')).textContent).toBe('test-model-d');
    expect(valueEl(runtimeRow('Extractor')).textContent).toBe('test-model-e');
    expect(valueEl(runtimeRow('Fact checker')).textContent).toBe('test-model-f');
    expect(valueEl(runtimeRow('Matcher')).textContent).toBe('test-model-m');
    expect(valueEl(runtimeRow('Legal reviewer')).textContent).toBe('test-model-l');
    expect(valueEl(runtimeRow('Language')).textContent).toBe('test-model-g');
    // The pre-T-684 key-name rows are not shown alongside.
    expect(screen.queryByText('ai.drafting_model')).not.toBeInTheDocument();
    expect(screen.queryByText('ai.preflight_model')).not.toBeInTheDocument();
  });

  it('all set: no amber values and no tags', async () => {
    runtime = FULL;
    await renderPage();
    for (const l of ['Drafter', 'Extractor', 'Fact checker', 'Legal reviewer', 'Language']) {
      expect(valueEl(runtimeRow(l)).className).not.toContain('text-amber-700');
      expect(tagsOf(runtimeRow(l))).toEqual([]);
    }
    expect(tagsOf(runtimeRow('Matcher'))).toEqual([]);
  });

  it('null drafter and extractor: "(not configured)" in amber', async () => {
    runtime = {
      ...FULL,
      models: { ...FULL.models, drafter: null, extractor: null },
      model_sources: { ...FULL.model_sources, drafter: null, extractor: null },
    };
    await renderPage();
    for (const l of ['Drafter', 'Extractor']) {
      const v = valueEl(runtimeRow(l));
      expect(v.textContent).toBe('(not configured)');
      expect(v.className).toContain('text-amber-700');
    }
  });

  it('null fact checker keeps the "(rules-only)" wording and is not amber', async () => {
    runtime = { ...FULL, models: { ...FULL.models, fact_checker: null } };
    await renderPage();
    const v = valueEl(runtimeRow('Fact checker'));
    expect(v.textContent).toBe('(rules-only)');
    expect(v.className).not.toContain('text-amber-700');
  });

  it('null optional roles: "(not set)", not amber', async () => {
    runtime = {
      ...FULL,
      models: { ...FULL.models, matcher: null, legal_reviewer: null, language: null },
    };
    await renderPage();
    for (const l of ['Matcher', 'Legal reviewer', 'Language']) {
      const v = valueEl(runtimeRow(l));
      expect(v.textContent).toBe('(not set)');
      expect(v.className).not.toContain('text-amber-700');
    }
  });

  it('a role missing from models entirely is treated as null', async () => {
    runtime = { ...FULL, models: { extractor: 'test-model-e' } };
    await renderPage();
    expect(valueEl(runtimeRow('Drafter')).textContent).toBe('(not configured)');
    expect(valueEl(runtimeRow('Language')).textContent).toBe('(not set)');
  });

  it('"legacy key" tag only on roles whose source is legacy', async () => {
    runtime = {
      ...FULL,
      model_sources: { ...FULL.model_sources, drafter: 'legacy', fact_checker: 'legacy' },
    };
    await renderPage();
    expect(tagsOf(runtimeRow('Drafter'))).toEqual(['legacy key']);
    expect(tagsOf(runtimeRow('Fact checker'))).toEqual(['legacy key']);
    expect(tagsOf(runtimeRow('Extractor'))).toEqual([]);
    expect(tagsOf(runtimeRow('Matcher'))).toEqual([]);
  });

  it('no model_sources field: no tags and no crash', async () => {
    const { model_sources: _unused, ...rest } = FULL;
    void _unused;
    runtime = rest;
    await renderPage();
    expect(screen.queryByText('legacy key')).not.toBeInTheDocument();
    expect(rowLabels()).toHaveLength(6);
  });

  it('matcher id equal to the extractor id: "falls back to extractor" tag', async () => {
    runtime = { ...FULL, models: { ...FULL.models, matcher: 'test-model-e' } };
    await renderPage();
    expect(tagsOf(runtimeRow('Matcher'))).toEqual(['falls back to extractor']);
    expect(tagsOf(runtimeRow('Extractor'))).toEqual([]);
  });

  it('matcher with its own id: no fallback tag', async () => {
    runtime = FULL;
    await renderPage();
    expect(screen.queryByText('falls back to extractor')).not.toBeInTheDocument();
  });

  it('matcher unset and extractor unset: no fallback tag (null is not "equal")', async () => {
    runtime = { ...FULL, models: { ...FULL.models, matcher: null, extractor: null } };
    await renderPage();
    expect(screen.queryByText('falls back to extractor')).not.toBeInTheDocument();
  });

  it('matcher fallback plus legacy source shows both tags', async () => {
    runtime = {
      ...FULL,
      models: { ...FULL.models, matcher: 'test-model-e' },
      model_sources: { ...FULL.model_sources, matcher: 'legacy' },
    };
    await renderPage();
    expect(tagsOf(runtimeRow('Matcher'))).toEqual(['falls back to extractor', 'legacy key']);
  });
});

describe('old shape (no models field)', () => {
  it('renders exactly the two old rows with their ids', async () => {
    runtime = { drafting_model: 'test-model-d', preflight_model: 'test-model-f' };
    await renderPage();
    expect(rowLabels()).toEqual(['ai.drafting_model', 'ai.preflight_model']);
    expect(valueEl(runtimeRow('ai.drafting_model')).textContent).toBe('test-model-d');
    expect(valueEl(runtimeRow('ai.preflight_model')).textContent).toBe('test-model-f');
    expect(screen.queryByText('Extractor')).not.toBeInTheDocument();
  });

  it('old null values: "(not configured)" amber for drafting, "(rules-only)" for preflight', async () => {
    runtime = { drafting_model: null, preflight_model: null };
    await renderPage();
    const d = valueEl(runtimeRow('ai.drafting_model'));
    expect(d.textContent).toBe('(not configured)');
    expect(d.className).toContain('text-amber-700');
    const p = valueEl(runtimeRow('ai.preflight_model'));
    expect(p.textContent).toBe('(rules-only)');
    expect(p.className).not.toContain('text-amber-700');
  });
});

describe('ai-runtime request failure (page behaviour today)', () => {
  it('http error: falls back to the two old rows showing the unset wording', async () => {
    runtime = 'http';
    await renderPage();
    expect(rowLabels()).toEqual(['ai.drafting_model', 'ai.preflight_model']);
    expect(valueEl(runtimeRow('ai.drafting_model')).textContent).toBe('(not configured)');
    expect(valueEl(runtimeRow('ai.preflight_model')).textContent).toBe('(rules-only)');
  });
});
