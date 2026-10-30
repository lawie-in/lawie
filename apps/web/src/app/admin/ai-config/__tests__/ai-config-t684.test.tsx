// T-684 (web): /admin/ai-config lists the per-role model and effort keys from the registry, warns
// about unpopulated required keys, and offers the legacy-key migration. Values below are
// deliberately distinctive so a test can prove no stored value leaks into a warning.
import { act } from 'react';

import {
  cleanupMounted,
  fireEvent,
  renderAsync,
  screen,
  waitFor,
  within,
} from '../../__tests__/dom-helpers-t684';

import AiConfigPage from '../page';

interface Entry {
  key: string;
  group: 'model' | 'effort' | 'deprecated';
  role?: string;
  label: string;
  help: string;
  required: boolean;
  deprecated?: boolean;
  replacedBy?: string;
  legacyKey?: string;
  allowedValues?: string[];
}
interface Stored {
  key: string;
  value: string;
  description?: string;
  updatedAt: string;
}

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const ROLES = [
  ['matcher', 'Matcher', false],
  ['extractor', 'Extractor', true],
  ['drafter', 'Drafter', true],
  ['fact_checker', 'Fact checker', true],
  ['legal_reviewer', 'Legal reviewer', false],
  ['language', 'Language', false],
] as const;
const LEGACY_MODEL: Record<string, string> = {
  drafter: 'ai.drafting_model',
  extractor: 'ai.intake_model',
  fact_checker: 'ai.preflight_model',
};
const LEGACY_EFFORT: Record<string, string> = {
  drafter: 'ai.effort.body',
  extractor: 'ai.effort.intake',
  fact_checker: 'ai.effort.preflight',
};
const EFFORT_VALUES = ['low', 'medium', 'high', 'xhigh', 'max'];

function registryFixture(): Entry[] {
  const entries: Entry[] = [];
  for (const [role, label, required] of ROLES) {
    entries.push({
      key: `ai.model.${role}`,
      group: 'model',
      role,
      label: `${label} model`,
      help: `Help for ${role} model.`,
      required,
      ...(LEGACY_MODEL[role] ? { legacyKey: LEGACY_MODEL[role] } : {}),
    });
  }
  for (const [role, label] of ROLES) {
    entries.push({
      key: `ai.effort.${role}`,
      group: 'effort',
      role,
      label: `${label} effort`,
      help: `Help for ${role} effort.`,
      required: false,
      allowedValues: EFFORT_VALUES,
      ...(LEGACY_EFFORT[role] ? { legacyKey: LEGACY_EFFORT[role] } : {}),
    });
  }
  for (const [role, legacy] of Object.entries(LEGACY_MODEL)) {
    entries.push({
      key: legacy,
      group: 'deprecated',
      role,
      label: `${legacy} (deprecated)`,
      help: `Replaced by ai.model.${role}.`,
      required: false,
      deprecated: true,
      replacedBy: `ai.model.${role}`,
    });
  }
  return entries;
}

const row = (key: string, value: string, description?: string): Stored => ({
  key,
  value,
  description,
  updatedAt: '2026-10-01T10:00:00.000Z',
});

const res = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

// Scenario state, reset in beforeEach.
let settings: Stored[];
let registry: Entry[];
let registryMode: 'ok' | 'http' | 'throw';
let settingsMode: 'ok' | 'http' | 'throw' | 'pending';
let putResult: 'ok' | 'error' | 'noerror' | 'throw';
let putError: string;
let listCalls: number;
let listOkCount: number; // list GETs beyond this many fail (http 500)
let onList: ((n: number) => void) | null;
let putGate: Promise<void> | null;

function installRouter() {
  mockApiFetch.mockImplementation(
    async (url: string, init?: { method?: string; body?: string }) => {
      if (url.startsWith('/api/drafting/admin/ai-usage')) {
        return res({
          month: '2026-10',
          totalTokens: 1000,
          totalCostInr: 55,
          generationCount: 3,
          avgCostPerGenInr: 18,
        });
      }
      if (url === '/api/drafting/admin/app-settings/registry') {
        if (registryMode === 'throw') throw new Error('boom');
        if (registryMode === 'http') return res({}, false, 500);
        return res({ entries: registry });
      }
      if (url === '/api/drafting/admin/app-settings') {
        if (settingsMode === 'throw') throw new Error('boom');
        if (settingsMode === 'http') return res({}, false, 500);
        if (settingsMode === 'pending') return new Promise(() => undefined);
        listCalls += 1;
        onList?.(listCalls);
        if (listCalls > listOkCount) return res({}, false, 500);
        return res({ settings });
      }
      if (url.startsWith('/api/drafting/admin/app-settings/') && init?.method === 'PUT') {
        if (putGate) await putGate;
        if (putResult === 'throw') throw new Error('boom');
        if (putResult === 'error') return res({ error: putError }, false, 400);
        if (putResult === 'noerror') return res({}, false, 500);
        const key = decodeURIComponent(url.split('/').pop() as string);
        const body = JSON.parse(init.body as string);
        settings = settings.filter((s) => s.key !== key);
        settings.push(row(key, body.value, body.description));
        return res({ ok: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  );
}

function puts() {
  return mockApiFetch.mock.calls.filter(([, init]) => init?.method === 'PUT') as [
    string,
    { method: string; body: string },
  ][];
}

async function loaded() {
  await screen.findByText('AI configuration');
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  // The registry request resolves independently of the settings request.
  await waitFor(() =>
    expect(mockApiFetch).toHaveBeenCalledWith('/api/drafting/admin/app-settings/registry'),
  );
  await new Promise((r) => setTimeout(r, 0));
}

async function renderPage() {
  await renderAsync(<AiConfigPage />);
  await loaded();
}

/** The setting card for a key (cards carry shadow-sm; the banners do not). */
function rowOf(key: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('div.rounded-xl.shadow-sm')).find(
    (d) => d.querySelector('code')?.textContent === key,
  );
  if (!found) throw new Error(`no row for ${key}`);
  return found;
}
const hasRow = (key: string) =>
  Array.from(document.querySelectorAll('div.rounded-xl.shadow-sm')).some(
    (d) => d.querySelector('code')?.textContent === key,
  );
function section(heading: string): HTMLElement {
  const h = screen.getByRole('heading', { name: heading });
  return h.closest('section') as HTMLElement;
}
const keysIn = (sec: HTMLElement) =>
  Array.from(sec.querySelectorAll('div.rounded-xl.shadow-sm')).map(
    (d) => d.querySelector('code')?.textContent,
  );
const WARNING = 'Required AI model keys are not configured.';
const warningBanner = () => screen.queryByText(WARNING);
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

afterEach(cleanupMounted);

beforeEach(() => {
  jest.clearAllMocks();
  settings = [];
  registry = registryFixture();
  registryMode = 'ok';
  settingsMode = 'ok';
  putResult = 'ok';
  putError = '';
  listCalls = 0;
  listOkCount = Infinity;
  onList = null;
  putGate = null;
  installRouter();
});

const ALL_NEW_REQUIRED = [
  row('ai.model.drafter', 'VAL-new-drafter'),
  row('ai.model.extractor', 'VAL-new-extractor'),
  row('ai.model.fact_checker', 'VAL-new-factchecker'),
];

describe('loading', () => {
  it('shows a spinner and no sections until the settings list loads', async () => {
    settingsMode = 'pending';
    await renderAsync(<AiConfigPage />);
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Models' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('fetches the settings list and the registry', async () => {
    await renderPage();
    const urls = mockApiFetch.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/drafting/admin/app-settings');
    expect(urls).toContain('/api/drafting/admin/app-settings/registry');
  });
});

describe('sections from the registry', () => {
  beforeEach(() => {
    settings = [
      ...ALL_NEW_REQUIRED,
      row('ai.model.matcher', 'VAL-matcher'),
      row('ai.effort.drafter', 'high'),
      row('ai.drafting_model', 'VAL-old-drafter'),
      row('ai.effort.body', 'VAL-old-effort-body'),
      row('ai.custom_unknown', 'VAL-unknown'),
    ];
  });

  it('Models: six rows in registry order with labels and help', async () => {
    await renderPage();
    expect(keysIn(section('Models'))).toEqual([
      'ai.model.matcher',
      'ai.model.extractor',
      'ai.model.drafter',
      'ai.model.fact_checker',
      'ai.model.legal_reviewer',
      'ai.model.language',
    ]);
    const drafter = within(rowOf('ai.model.drafter'));
    expect(drafter.getByText('Drafter model')).toBeInTheDocument();
    expect(drafter.getByText('Help for drafter model.')).toBeInTheDocument();
  });

  it('Effort: six rows', async () => {
    await renderPage();
    expect(keysIn(section('Effort'))).toEqual(ROLES.map(([r]) => `ai.effort.${r}`));
  });

  it('Required / Optional badge per model key', async () => {
    await renderPage();
    const required = ['drafter', 'extractor', 'fact_checker'];
    for (const [role] of ROLES) {
      const r = within(rowOf(`ai.model.${role}`));
      if (required.includes(role)) {
        expect(r.getByText('Required')).toBeInTheDocument();
        expect(r.queryByText('Optional')).not.toBeInTheDocument();
      } else {
        expect(r.getByText('Optional')).toBeInTheDocument();
        expect(r.queryByText('Required')).not.toBeInTheDocument();
      }
    }
  });

  it('stored model shows Live and its value; unset optional shows Not configured and Set value', async () => {
    await renderPage();
    const matcher = within(rowOf('ai.model.matcher'));
    expect(matcher.getByText('Live')).toBeInTheDocument();
    expect(matcher.getByText('VAL-matcher')).toBeInTheDocument();
    expect(matcher.getByRole('button', { name: 'Edit ai.model.matcher' })).toBeInTheDocument();
    const lang = within(rowOf('ai.model.language'));
    expect(lang.getByText('Not configured')).toBeInTheDocument();
    expect(
      lang.getByRole('button', { name: 'Set value for ai.model.language' }),
    ).toBeInTheDocument();
  });

  it('Deprecated: only legacy model keys that have a stored row', async () => {
    await renderPage();
    const sec = section('Deprecated (read until the next release)');
    expect(keysIn(sec)).toEqual(['ai.drafting_model']);
    const r = within(rowOf('ai.drafting_model'));
    expect(r.getByText('Deprecated')).toBeInTheDocument();
    expect(norm(rowOf('ai.drafting_model').textContent)).toContain('Migrate to ai.model.drafter.');
    expect(r.queryByText('Required')).not.toBeInTheDocument();
    expect(r.queryByText('Optional')).not.toBeInTheDocument();
    expect(hasRow('ai.intake_model')).toBe(false);
    expect(hasRow('ai.preflight_model')).toBe(false);
  });

  it('no Deprecated section when no legacy model row exists', async () => {
    settings = settings.filter((s) => s.key !== 'ai.drafting_model');
    await renderPage();
    expect(
      screen.queryByRole('heading', { name: 'Deprecated (read until the next release)' }),
    ).not.toBeInTheDocument();
  });

  it('Other settings: unknown keys and the legacy effort keys, not registry keys', async () => {
    settings.push(row('ai.effort.intake', 'low'), row('ai.effort.preflight', 'low'));
    await renderPage();
    const keys = keysIn(section('Other settings'));
    expect(keys).toEqual(
      expect.arrayContaining([
        'ai.custom_unknown',
        'ai.effort.body',
        'ai.effort.intake',
        'ai.effort.preflight',
      ]),
    );
    expect(keys).toHaveLength(4);
    const other = within(rowOf('ai.custom_unknown'));
    expect(other.queryByText('Required')).not.toBeInTheDocument();
    expect(other.queryByText('Optional')).not.toBeInTheDocument();
  });

  it('info banner names the new keys and the three old keys', async () => {
    await renderPage();
    const text = norm(document.body.textContent);
    expect(text).toContain('Drafts cannot be generated until ai.model.drafter is populated');
    expect(text).toContain('intake needs ai.model.extractor');
    expect(text).toContain(
      'ai.drafting_model, ai.intake_model and ai.preflight_model are still read',
    );
  });

  it('keeps the AI cost section and the seed-command hint', async () => {
    await renderPage();
    expect(await screen.findByText(/AI cost/)).toBeInTheDocument();
    expect(screen.getByText(/seed:setting/)).toBeInTheDocument();
  });
});

describe('required-key warning banner', () => {
  it('lists each required role with neither key nor legacy key, naming new and legacy keys', async () => {
    await renderPage();
    const alert = screen.getByRole('alert');
    const text = norm(alert.textContent);
    expect(text).toContain('ai.model.drafter is not populated (and neither is ai.drafting_model).');
    expect(text).toContain('ai.model.extractor is not populated (and neither is ai.intake_model).');
    expect(text).toContain(
      'ai.model.fact_checker is not populated (and neither is ai.preflight_model).',
    );
    expect(text).toContain('config warnings until they are populated');
    // Optional keys are never listed.
    expect(text).not.toContain('ai.model.matcher');
    expect(text).not.toContain('ai.model.language');
  });

  it.each([
    ['drafter', 'ai.drafting_model'],
    ['extractor', 'ai.intake_model'],
    ['fact_checker', 'ai.preflight_model'],
  ])('only %s missing: the banner lists just that role', async (role, legacy) => {
    settings = ALL_NEW_REQUIRED.filter((s) => s.key !== `ai.model.${role}`);
    await renderPage();
    const text = norm(screen.getByRole('alert').textContent);
    expect(text).toContain(`ai.model.${role} is not populated (and neither is ${legacy}).`);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    // The missing required row gets the amber card.
    expect(rowOf(`ai.model.${role}`).className).toContain('border-amber-200');
  });

  it('no banner when all new keys are set', async () => {
    settings = [...ALL_NEW_REQUIRED];
    await renderPage();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('no banner when only the legacy keys are set; rows show the legacy notice', async () => {
    settings = [
      row('ai.drafting_model', 'VAL-old-d'),
      row('ai.intake_model', 'VAL-old-e'),
      row('ai.preflight_model', 'VAL-old-f'),
    ];
    await renderPage();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const d = within(rowOf('ai.model.drafter'));
    expect(
      d.getByText('Set via legacy key ai.drafting_model, move it to ai.model.drafter.'),
    ).toBeInTheDocument();
    expect(d.getByText('Legacy key in use')).toBeInTheDocument();
    expect(d.queryByText('Not configured')).not.toBeInTheDocument();
    expect(d.queryByText('Live')).not.toBeInTheDocument();
    // Not an amber required-missing card.
    expect(rowOf('ai.model.drafter').className).not.toContain('border-amber-200');
    expect(d.getByRole('button', { name: 'Set value for ai.model.drafter' })).toBeInTheDocument();
  });

  it('no banner and no legacy notice when both the new and the legacy key are set', async () => {
    settings = [...ALL_NEW_REQUIRED, row('ai.drafting_model', 'VAL-old-d')];
    await renderPage();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Set via legacy key/)).not.toBeInTheDocument();
    expect(within(rowOf('ai.model.drafter')).getByText('Live')).toBeInTheDocument();
  });

  it('a legacy key serving one role does not hide another missing role', async () => {
    settings = [row('ai.drafting_model', 'VAL-old-d')];
    await renderPage();
    const text = norm(screen.getByRole('alert').textContent);
    expect(text).not.toContain('ai.model.drafter is not populated');
    expect(text).toContain('ai.model.extractor is not populated');
    expect(text).toContain('ai.model.fact_checker is not populated');
  });

  it('never renders a stored value inside the alert or an error message', async () => {
    settings = [
      row('ai.model.matcher', 'VAL-leak-matcher'),
      row('ai.model.language', 'VAL-leak-language'),
      row('ai.effort.drafter', 'VAL-leak-effort'),
      row('ai.custom_unknown', 'VAL-leak-unknown', 'VAL-leak-description'),
    ];
    await renderPage();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).not.toMatch(/VAL-/);
    // The values do show in their own rows, so the banner check above is meaningful.
    expect(within(rowOf('ai.model.matcher')).getByText('VAL-leak-matcher')).toBeInTheDocument();
  });

  it('no false banner when the registry request fails (http error)', async () => {
    registryMode = 'http';
    await renderPage();
    expect(warningBanner()).not.toBeInTheDocument();
  });

  it('no false banner when the registry request throws', async () => {
    registryMode = 'throw';
    await renderPage();
    expect(warningBanner()).not.toBeInTheDocument();
  });

  it('no false banner when the settings request fails', async () => {
    settingsMode = 'http';
    await renderPage();
    expect(warningBanner()).not.toBeInTheDocument();
    expect(screen.getByText('Failed to load AI configuration.')).toBeInTheDocument();
  });

  it('no false banner when the settings request throws', async () => {
    settingsMode = 'throw';
    await renderPage();
    expect(warningBanner()).not.toBeInTheDocument();
    expect(screen.getByText('Network error.')).toBeInTheDocument();
  });
});

describe('registry failure', () => {
  beforeEach(() => {
    settings = [
      row('ai.model.drafter', 'VAL-new-drafter'),
      row('ai.effort.drafter', 'high'),
      row('ai.drafting_model', 'VAL-old-d'),
    ];
  });

  it.each(['http', 'throw'] as const)(
    '%s: red banner, no registry sections, every stored row under Other settings',
    async (mode) => {
      registryMode = mode;
      await renderPage();
      expect(
        screen.getByText(/Failed to load the list of AI keys|Network error loading the list/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Models' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Effort' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Deprecated (read until the next release)' }),
      ).not.toBeInTheDocument();
      expect(keysIn(section('Other settings'))).toEqual([
        'ai.model.drafter',
        'ai.effort.drafter',
        'ai.drafting_model',
      ]);
    },
  );

  it('stored rows stay editable and savable', async () => {
    registryMode = 'http';
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.drafter' }));
    const input = screen.getByLabelText(/Value for ai\.model\.drafter/);
    expect(input.tagName).toBe('INPUT');
    fireEvent.change(input, { target: { value: 'test-model-a' } });
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][0]).toBe('/api/drafting/admin/app-settings/ai.model.drafter');
    expect(await within(rowOf('ai.model.drafter')).findByText('Saved')).toBeInTheDocument();
  });
});

describe('editing a model row', () => {
  beforeEach(() => {
    settings = [...ALL_NEW_REQUIRED, row('ai.model.matcher', 'test-model-a', 'old note')];
  });

  it('PUTs the trimmed value and description to the key URL, then shows Saved', async () => {
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.matcher' }));
    fireEvent.change(screen.getByLabelText(/Value for ai\.model\.matcher/), {
      target: { value: '  test-model-b  ' },
    });
    fireEvent.change(screen.getByLabelText('Description for ai.model.matcher (optional)'), {
      target: { value: 'new note' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const [url, init] = puts()[0];
    expect(url).toBe('/api/drafting/admin/app-settings/ai.model.matcher');
    expect(JSON.parse(init.body)).toEqual({ value: 'test-model-b', description: 'new note' });
    const r = within(rowOf('ai.model.matcher'));
    expect(await r.findByText('Saved')).toBeInTheDocument();
    expect(r.getByText('test-model-b')).toBeInTheDocument();
    expect(r.queryByLabelText(/Value for/)).not.toBeInTheDocument();
  });

  it('omits description when blank', async () => {
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Set value for ai.model.language' }));
    fireEvent.change(screen.getByLabelText(/Value for ai\.model\.language/), {
      target: { value: 'test-model-c' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(JSON.parse(puts()[0][1].body)).toEqual({ value: 'test-model-c' });
  });

  it('empty value: "Value is required." and no request', async () => {
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.matcher' }));
    fireEvent.change(screen.getByLabelText(/Value for ai\.model\.matcher/), {
      target: { value: '   ' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Value is required.')).toBeInTheDocument();
    expect(puts()).toHaveLength(0);
  });

  it('server error text is shown inline and the row stays in edit mode', async () => {
    putResult = 'error';
    putError = 'Server says no.';
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.matcher' }));
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Server says no.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Value for ai\.model\.matcher/)).toBeInTheDocument();
  });

  it('error response without a message: "Save failed."', async () => {
    putResult = 'noerror';
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.matcher' }));
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Save failed.')).toBeInTheDocument();
  });

  it('network failure: "Network error."', async () => {
    putResult = 'throw';
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.matcher' }));
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Network error.')).toBeInTheDocument();
  });

  it('Cancel leaves the stored value and sends nothing', async () => {
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.matcher' }));
    await fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(puts()).toHaveLength(0);
    expect(within(rowOf('ai.model.matcher')).getByText('test-model-a')).toBeInTheDocument();
  });

  it('model value field is a free-text input (no allowed list)', async () => {
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.matcher' }));
    expect(screen.getByLabelText(/Value for ai\.model\.matcher/).tagName).toBe('INPUT');
  });
});

describe('editing an effort row', () => {
  const optionTexts = (sel: HTMLElement) =>
    Array.from(sel.querySelectorAll('option')).map((o) => o.textContent);

  it('uses a labelled select with exactly the allowed values plus an unset option', async () => {
    settings = [...ALL_NEW_REQUIRED, row('ai.effort.drafter', 'high')];
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.effort.drafter' }));
    const sel = screen.getByLabelText(/Value for ai\.effort\.drafter/);
    expect(sel.tagName).toBe('SELECT');
    expect(optionTexts(sel)).toEqual(['(unset: choose a value)', ...EFFORT_VALUES]);
    expect((sel as HTMLSelectElement).value).toBe('high');
  });

  it('saving sends the chosen value via PUT', async () => {
    settings = [...ALL_NEW_REQUIRED, row('ai.effort.drafter', 'high')];
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.effort.drafter' }));
    fireEvent.change(screen.getByLabelText(/Value for ai\.effort\.drafter/), {
      target: { value: 'xhigh' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const [url, init] = puts()[0];
    expect(url).toBe('/api/drafting/admin/app-settings/ai.effort.drafter');
    expect(JSON.parse(init.body)).toEqual({ value: 'xhigh' });
    expect(await within(rowOf('ai.effort.drafter')).findByText('Saved')).toBeInTheDocument();
  });

  it('an unset effort row opens on the unset option; saving it gives "Value is required."', async () => {
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Set value for ai.effort.language' }));
    const sel = screen.getByLabelText(/Value for ai\.effort\.language/) as HTMLSelectElement;
    expect(sel.value).toBe('');
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Value is required.')).toBeInTheDocument();
    expect(puts()).toHaveLength(0);
  });

  it('a stored value that is not allowed is shown as "(not an allowed value)"', async () => {
    settings = [...ALL_NEW_REQUIRED, row('ai.effort.drafter', 'ultra')];
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.effort.drafter' }));
    const sel = screen.getByLabelText(/Value for ai\.effort\.drafter/);
    expect(optionTexts(sel)).toEqual([
      '(unset: choose a value)',
      'ultra (not an allowed value)',
      ...EFFORT_VALUES,
    ]);
  });

  it('an allowed value never shows the "not an allowed value" option', async () => {
    settings = [...ALL_NEW_REQUIRED, row('ai.effort.drafter', 'max')];
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.effort.drafter' }));
    expect(screen.queryByText(/not an allowed value/)).not.toBeInTheDocument();
  });

  it('shows the legacy-effort hint for drafter and none for matcher', async () => {
    await renderPage();
    expect(norm(rowOf('ai.effort.drafter').textContent)).toContain('Legacy key: ai.effort.body');
    expect(norm(rowOf('ai.effort.matcher').textContent)).not.toContain('Legacy key');
  });
});

describe('deprecated keys and the Copy action', () => {
  beforeEach(() => {
    settings = [
      row('ai.drafting_model', 'VAL-legacy-drafter', 'legacy note'),
      row('ai.intake_model', 'VAL-legacy-extractor'),
      row('ai.model.extractor', 'VAL-new-extractor'),
      row('ai.model.fact_checker', 'VAL-new-fc'),
    ];
  });

  it('Copy button only when replacedBy has no row; otherwise the "no longer read" text', async () => {
    await renderPage();
    const sec = section('Deprecated (read until the next release)');
    expect(keysIn(sec)).toEqual(['ai.drafting_model', 'ai.intake_model']);
    expect(
      within(rowOf('ai.drafting_model')).getByRole('button', { name: 'Copy to ai.model.drafter' }),
    ).toBeInTheDocument();
    const intake = within(rowOf('ai.intake_model'));
    expect(intake.queryByRole('button', { name: /Copy to/ })).not.toBeInTheDocument();
    expect(norm(rowOf('ai.intake_model').textContent)).toContain(
      'ai.model.extractor is set, so this key is no longer read.',
    );
    expect(screen.getAllByRole('button', { name: /^Copy to/ })).toHaveLength(1);
  });

  it('Copy PUTs the legacy value to the new key with no description, reloads, shows Saved', async () => {
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Copy to ai.model.drafter' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const [url, init] = puts()[0];
    expect(url).toBe('/api/drafting/admin/app-settings/ai.model.drafter');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ value: 'VAL-legacy-drafter' });
    expect(init.body).not.toContain('description');
    const target = within(rowOf('ai.model.drafter'));
    expect(await target.findByText('Saved')).toBeInTheDocument();
    expect(target.getByText('Live')).toBeInTheDocument();
    expect(target.getByText('VAL-legacy-drafter')).toBeInTheDocument();
    // The settings list was fetched again, and the button is now replaced.
    const listFetches = mockApiFetch.mock.calls.filter(
      ([u]) => u === '/api/drafting/admin/app-settings',
    );
    expect(listFetches.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByRole('button', { name: 'Copy to ai.model.drafter' }),
    ).not.toBeInTheDocument();
    expect(norm(rowOf('ai.drafting_model').textContent)).toContain(
      'ai.model.drafter is set, so this key is no longer read.',
    );
  });

  it('copy errors show inline on the deprecated row', async () => {
    putResult = 'error';
    putError = 'Copy rejected.';
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Copy to ai.model.drafter' }));
    expect(
      await within(rowOf('ai.drafting_model')).findByText('Copy rejected.'),
    ).toBeInTheDocument();
    expect(within(rowOf('ai.model.drafter')).queryByText('Saved')).not.toBeInTheDocument();
  });

  it('copy network failure shows "Network error." on the deprecated row', async () => {
    putResult = 'throw';
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Copy to ai.model.drafter' }));
    expect(
      await within(rowOf('ai.drafting_model')).findByText('Network error.'),
    ).toBeInTheDocument();
  });

  it('a deprecated row is still editable like any other', async () => {
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.drafting_model' }));
    fireEvent.change(screen.getByLabelText(/Value for ai\.drafting_model/), {
      target: { value: 'test-model-z' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][0]).toBe('/api/drafting/admin/app-settings/ai.drafting_model');
  });
});

describe('accessibility', () => {
  it('edit buttons name their key; value and description inputs are labelled', async () => {
    settings = [...ALL_NEW_REQUIRED, row('ai.custom_unknown', 'VAL-x')];
    await renderPage();
    for (const key of ['ai.model.drafter', 'ai.custom_unknown']) {
      expect(screen.getByRole('button', { name: `Edit ${key}` })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: 'Set value for ai.model.matcher' }),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.drafter' }));
    expect(screen.getByLabelText(/Value for ai\.model\.drafter/)).toBeInTheDocument();
    const desc = screen.getByLabelText('Description for ai.model.drafter (optional)');
    expect(desc.tagName).toBe('INPUT');
    expect(desc.previousElementSibling?.className).toContain('sr-only');
  });

  it('effort select and stored-only inputs are labelled too', async () => {
    settings = [row('ai.custom_unknown', 'VAL-x')];
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Set value for ai.effort.drafter' }));
    expect(screen.getByLabelText(/Value for ai\.effort\.drafter/).tagName).toBe('SELECT');
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.custom_unknown' }));
    expect(screen.getByLabelText(/Value for ai\.custom_unknown/).tagName).toBe('INPUT');
  });

  it('badges are plain text', async () => {
    await renderPage();
    expect(within(rowOf('ai.model.drafter')).getByText('Required')).toBeInTheDocument();
    expect(within(rowOf('ai.model.matcher')).getByText('Optional')).toBeInTheDocument();
  });
});

describe('settings list failure hides every editable row (T-684 review)', () => {
  const NOTE =
    'Current values could not be loaded, so settings are hidden to avoid overwriting them.';

  it.each(['http', 'throw'] as const)(
    '%s: no Models/Effort/Deprecated/Other, no inputs or edit buttons, neutral note, red alert',
    async (mode) => {
      settingsMode = mode;
      await renderPage();
      for (const h of [
        'Models',
        'Effort',
        'Deprecated (read until the next release)',
        'Other settings',
      ]) {
        expect(screen.queryByRole('heading', { name: h })).not.toBeInTheDocument();
      }
      expect(screen.getByText(NOTE)).toBeInTheDocument();
      expect(screen.queryByText(/Not configured/)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain('Not configured');
      expect(
        screen.queryByRole('button', { name: /^(Edit|Set value for) / }),
      ).not.toBeInTheDocument();
      expect(document.querySelectorAll('input, select')).toHaveLength(0);
      const red = screen.getByRole('alert');
      expect(red.className).toContain('border-red-200');
      expect(red.textContent).toBe(
        mode === 'http' ? 'Failed to load AI configuration.' : 'Network error.',
      );
      expect(warningBanner()).not.toBeInTheDocument();
    },
  );

  it('the note is not shown while the page is loading or after a good load', async () => {
    await renderPage();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    settingsMode = 'pending';
    cleanupMounted();
    await renderAsync(<AiConfigPage />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('a later failed refetch (after a save) hides the rows again', async () => {
    settings = [...ALL_NEW_REQUIRED, row('ai.model.matcher', 'test-model-a')];
    listOkCount = 1; // the initial load succeeds; the reload after the PUT fails
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Models' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.matcher' }));
    fireEvent.change(screen.getByLabelText(/Value for ai\.model\.matcher/), {
      target: { value: 'test-model-b' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Models' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.getByText('Failed to load AI configuration.')).toBeInTheDocument();
    expect(document.querySelectorAll('input, select')).toHaveLength(0);
  });

  it('registry failure alone: red role=alert banner, stored rows editable, no hidden-settings note', async () => {
    registryMode = 'http';
    settings = [row('ai.model.drafter', 'test-model-a')];
    await renderPage();
    const red = screen.getByRole('alert');
    expect(red.className).toContain('border-red-200');
    expect(red.textContent).toMatch(/Failed to load the list of AI keys/);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.model.drafter' }));
    expect(screen.getByLabelText(/Value for ai\.model\.drafter/)).toBeInTheDocument();
  });
});

describe('Copy re-checks the target against a fresh list (T-684 review)', () => {
  const COPY = 'Copy to ai.model.drafter';
  beforeEach(() => {
    settings = [
      row('ai.drafting_model', 'VAL-legacy-drafter'),
      row('ai.model.extractor', 'VAL-new-e'),
      row('ai.model.fact_checker', 'VAL-new-f'),
    ];
  });
  const listCallsBeforeCopy = () => mockApiFetch.mock.calls.length;

  it('re-fetches the settings list before the PUT', async () => {
    await renderPage();
    const before = listCallsBeforeCopy();
    await fireEvent.click(screen.getByRole('button', { name: COPY }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    const after = mockApiFetch.mock.calls.slice(before);
    const firstList = after.findIndex(([u]) => u === '/api/drafting/admin/app-settings');
    const firstPut = after.findIndex(([, i]) => i?.method === 'PUT');
    expect(firstList).toBeGreaterThanOrEqual(0);
    expect(firstList).toBeLessThan(firstPut);
  });

  it('target set meanwhile: no PUT, "set meanwhile" note, button replaced, nothing overwritten', async () => {
    await renderPage();
    onList = () => {
      if (!settings.some((s) => s.key === 'ai.model.drafter')) {
        settings = [...settings, row('ai.model.drafter', 'VAL-someone-else')];
      }
    };
    await fireEvent.click(screen.getByRole('button', { name: COPY }));
    const dep = within(rowOf('ai.drafting_model'));
    await dep.findByText('ai.model.drafter was set meanwhile; not overwritten.');
    expect(puts()).toHaveLength(0);
    expect(dep.queryByRole('button', { name: COPY })).not.toBeInTheDocument();
    expect(norm(rowOf('ai.drafting_model').textContent)).toContain(
      'ai.model.drafter is set, so this key is no longer read.',
    );
    expect(within(rowOf('ai.model.drafter')).getByText('VAL-someone-else')).toBeInTheDocument();
  });

  it('re-fetch fails: inline "Failed to load AI configuration." and no PUT', async () => {
    await renderPage();
    listOkCount = 1; // the page-load list succeeded; the pre-PUT one fails
    await fireEvent.click(screen.getByRole('button', { name: COPY }));
    await within(rowOf('ai.drafting_model')).findByText('Failed to load AI configuration.');
    expect(puts()).toHaveLength(0);
  });

  it('legacy row gone in the fresh list: no PUT and the deprecated row disappears', async () => {
    await renderPage();
    onList = () => {
      settings = settings.filter((s) => s.key !== 'ai.drafting_model');
    };
    // (installed after the page load, so only the pre-PUT list sees the change)
    await fireEvent.click(screen.getByRole('button', { name: COPY }));
    // The row (and its inline message) unmounts with the refreshed list, so there is no text to wait on.
    await waitFor(() => expect(hasRow('ai.drafting_model')).toBe(false));
    expect(puts()).toHaveLength(0);
  });

  it('legacy row emptied in the fresh list: "Nothing to copy."', async () => {
    await renderPage();
    onList = () => {
      settings = settings.map((s) => (s.key === 'ai.drafting_model' ? { ...s, value: '   ' } : s));
    };
    await fireEvent.click(screen.getByRole('button', { name: COPY }));
    await waitFor(() => expect(document.body.textContent).toContain('Nothing to copy.'));
    expect(puts()).toHaveLength(0);
  });

  it('uses the legacy value from the fresh list, not the stale page state', async () => {
    await renderPage();
    onList = () => {
      settings = settings.map((s) =>
        s.key === 'ai.drafting_model' ? { ...s, value: 'VAL-legacy-changed' } : s,
      );
    };
    await fireEvent.click(screen.getByRole('button', { name: COPY }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(JSON.parse(puts()[0][1].body)).toEqual({ value: 'VAL-legacy-changed' });
  });

  it('two clicks in the same tick send exactly one PUT', async () => {
    await renderPage();
    let release!: () => void;
    putGate = new Promise<void>((r) => (release = r));
    const btn = screen.getByRole('button', { name: COPY });
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
    release();
    await waitFor(() => expect(puts()).toHaveLength(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(puts()).toHaveLength(1);
    // While the request is in flight the button is disabled.
  });

  it('the button is disabled while a copy is running', async () => {
    await renderPage();
    putGate = new Promise<void>(() => undefined);
    await fireEvent.click(screen.getByRole('button', { name: COPY }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(screen.getByRole('button', { name: COPY })).toBeDisabled();
  });
});

describe('effort select matches case-insensitively (T-684 review)', () => {
  const optionTexts = (sel: HTMLElement) =>
    Array.from(sel.querySelectorAll('option')).map((o) => o.textContent);

  it.each([
    ['HIGH', 'high'],
    [' Medium ', 'medium'],
  ])(
    'stored %j selects the allowed %s option and saves it in lower case',
    async (stored, canon) => {
      settings = [...ALL_NEW_REQUIRED, row('ai.effort.drafter', stored)];
      await renderPage();
      await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.effort.drafter' }));
      const sel = screen.getByLabelText(/Value for ai\.effort\.drafter/) as HTMLSelectElement;
      expect(optionTexts(sel)).toEqual(['(unset: choose a value)', ...EFFORT_VALUES]);
      expect(sel.value).toBe(canon);
      expect(screen.queryByText(/not an allowed value/)).not.toBeInTheDocument();
      await fireEvent.click(screen.getByRole('button', { name: /Save/ }));
      await waitFor(() => expect(puts()).toHaveLength(1));
      expect(JSON.parse(puts()[0][1].body)).toEqual({ value: canon });
    },
  );

  it('a genuinely unknown value still shows "(not an allowed value)"', async () => {
    settings = [...ALL_NEW_REQUIRED, row('ai.effort.drafter', 'ultra')];
    await renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit ai.effort.drafter' }));
    expect(optionTexts(screen.getByLabelText(/Value for ai\.effort\.drafter/))).toContain(
      'ultra (not an allowed value)',
    );
  });
});
