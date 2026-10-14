// T-425: the brief court picker for the six bail packs asks for template-scoped lists, and
// keeps (never changes) a saved court the pack no longer offers.
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

import type { BriefCourt } from '../briefTypes';
import CourtPicker, { NOT_OFFERED_SUFFIX } from '../CourtPicker';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const BAIL_IDS = [
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'bail_cancellation',
];

let routes: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;
let onChange: jest.Mock;

const EMPTY: BriefCourt = { state: null, court_type: null, court: null };

function Harness({ templateId, initial = EMPTY }: { templateId?: string; initial?: BriefCourt }) {
  const [court, setCourt] = useState<BriefCourt>(initial);
  return (
    <CourtPicker
      court={court}
      missing={false}
      templateId={templateId}
      onChange={(c) => {
        onChange(c);
        setCourt(c);
      }}
    />
  );
}

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}
async function mount(props: Parameters<typeof Harness>[0]) {
  act(() => root.render(<Harness {...props} />));
  await flush();
}
const paths = () => mockApiFetch.mock.calls.map((c) => c[0] as string);
const sel = (id: string) => container.querySelector<HTMLSelectElement>(`#${id}`)!;
const optionTexts = (s: HTMLSelectElement) => Array.from(s.options).map((o) => o.textContent);
async function choose(id: string, value: string) {
  const s = sel(id);
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(s, value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

const reply = (body: unknown) => ({ ok: true, json: async () => body });
const fail = () => ({ ok: false, json: async () => ({}) });

const scoped = (id: string) => ({
  states: `/api/courts/states?template=${id}`,
  types: `/api/courts/types?state=bihar&template=${id}`,
  courts: `/api/courts?state=bihar&type=sessions&template=${id}`,
});

function routesFor(id: string): Record<string, unknown> {
  const u = scoped(id);
  return {
    [u.states]: { states: [{ id: 'bihar', name: 'Bihar' }] },
    [u.types]: { types: [{ id: 'sessions', label: 'Sessions Court' }] },
    [u.courts]: { courts: [{ courtId: 'bihar_sessions_patna', name: 'Sessions Court, Patna' }] },
  };
}

beforeEach(() => {
  routes = {};
  onChange = jest.fn();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) =>
    path in routes
      ? routes[path] instanceof Function
        ? (routes[path] as () => unknown)()
        : reply(routes[path])
      : fail(),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CourtPicker, bail packs: scoped URLs', () => {
  it.each(BAIL_IDS)('%s sends template=<id> on states, types and courts', async (id) => {
    routes = routesFor(id);
    await mount({ templateId: id });
    expect(paths()).toEqual([scoped(id).states]);
    await choose('brief-court-state', 'bihar');
    await choose('brief-court-type', 'sessions');
    await choose('brief-court-court', 'bihar_sessions_patna');
    expect(paths()).toEqual(expect.arrayContaining(Object.values(scoped(id))));
    expect(paths().every((p) => p.includes(`template=${id}`))).toBe(true);
    expect(paths().some((p) => p.includes('level='))).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({
      state: 'bihar',
      court_type: 'sessions',
      court: 'bihar_sessions_patna',
    });
  });

  it('an empty brief offers only the list (no saved-court lookup, no suffix option)', async () => {
    routes = routesFor('bail_regular');
    await mount({ templateId: 'bail_regular' });
    expect(optionTexts(sel('brief-court-state'))).toEqual(['Choose', 'Bihar']);
    expect(paths().some((p) => /^\/api\/courts\/[^?]+$/.test(p) && !p.includes('/states'))).toBe(
      false,
    );
  });

  it.each(['suspension_of_sentence', 'bail_regular_v2', undefined])(
    'templateId %p: URLs carry no template',
    async (templateId) => {
      routes = {
        '/api/courts/states': { states: [{ id: 'bihar', name: 'Bihar' }] },
        '/api/courts/types?state=bihar': { types: [{ id: 'sessions', label: 'Sessions Court' }] },
        '/api/courts?state=bihar&type=sessions': { courts: [{ courtId: 'x', name: 'X' }] },
      };
      await mount({ templateId });
      await choose('brief-court-state', 'bihar');
      await choose('brief-court-type', 'sessions');
      expect(paths()).toEqual([
        '/api/courts/states',
        '/api/courts/types?state=bihar',
        '/api/courts?state=bihar&type=sessions',
      ]);
    },
  );
});

describe('CourtPicker, bail packs: a saved court the pack does not offer (AC3)', () => {
  const SAVED: BriefCourt = {
    state: 'bihar',
    court_type: 'civil_court',
    court: 'bihar_civil_patna',
  };

  function savedRoutes(id: string) {
    const u = {
      states: `/api/courts/states?template=${id}`,
      types: `/api/courts/types?state=bihar&template=${id}`,
      courts: `/api/courts?state=bihar&type=civil_court&template=${id}`,
    };
    return {
      [u.states]: { states: [{ id: 'bihar', name: 'Bihar' }] },
      [u.types]: { types: [{ id: 'sessions', label: 'Sessions Court' }] },
      [u.courts]: { courts: [] },
    } as Record<string, unknown>;
  }

  it.each(BAIL_IDS)(
    '%s: court and type shown with the suffix, onChange never called',
    async (id) => {
      routes = {
        ...savedRoutes(id),
        '/api/courts/bihar_civil_patna': {
          court: { name: 'Civil Court, Patna', state: 'Bihar' },
        },
      };
      await mount({ templateId: id, initial: SAVED });
      expect(NOT_OFFERED_SUFFIX).toBe(' (not offered for this document)');
      expect(optionTexts(sel('brief-court-court'))).toEqual([
        'Choose',
        'Civil Court, Patna (not offered for this document)',
      ]);
      expect(sel('brief-court-court').value).toBe('bihar_civil_patna');
      expect(optionTexts(sel('brief-court-type'))).toEqual([
        'Choose',
        'Civil Court (Senior Division) (not offered for this document)',
        'Sessions Court',
      ]);
      expect(sel('brief-court-type').value).toBe('civil_court');
      expect(optionTexts(sel('brief-court-state'))).toEqual(['Choose', 'Bihar']);
      expect(sel('brief-court-state').value).toBe('bihar');
      expect(onChange).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain('No court of this type is listed');
    },
  );

  it('a saved state the scoped list lacks is shown with the suffix', async () => {
    routes = {
      '/api/courts/states?template=bail_regular': { states: [{ id: 'bihar', name: 'Bihar' }] },
      '/api/courts/types?state=india&template=bail_regular': { types: [] },
      '/api/courts?state=india&type=supreme_court&template=bail_regular': { courts: [] },
      '/api/courts/supreme_court_india': {
        court: { name: 'Supreme Court of India', state: 'India' },
      },
    };
    await mount({
      templateId: 'bail_regular',
      initial: { state: 'india', court_type: 'supreme_court', court: 'supreme_court_india' },
    });
    expect(optionTexts(sel('brief-court-state'))).toEqual([
      'Choose',
      `India${NOT_OFFERED_SUFFIX}`,
      'Bihar',
    ]);
    expect(sel('brief-court-state').value).toBe('india');
    expect(optionTexts(sel('brief-court-court'))).toContain(
      `Supreme Court of India${NOT_OFFERED_SUFFIX}`,
    );
    expect(optionTexts(sel('brief-court-type'))).toContain(`Supreme Court${NOT_OFFERED_SUFFIX}`);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to the id when GET /api/courts/:id fails, with no error shown', async () => {
    routes = savedRoutes('bail_regular'); // the by-id path is not routed: apiFetch gives !ok
    await mount({ templateId: 'bail_regular', initial: SAVED });
    expect(paths()).toContain('/api/courts/bihar_civil_patna');
    expect(optionTexts(sel('brief-court-court'))).toEqual([
      'Choose',
      `bihar_civil_patna${NOT_OFFERED_SUFFIX}`,
    ]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to the id when GET /api/courts/:id rejects', async () => {
    routes = savedRoutes('bail_regular');
    routes['/api/courts/bihar_civil_patna'] = () => {
      throw new Error('network');
    };
    await mount({ templateId: 'bail_regular', initial: SAVED });
    expect(optionTexts(sel('brief-court-court'))).toContain(
      `bihar_civil_patna${NOT_OFFERED_SUFFIX}`,
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a saved court the list does offer gets no suffix and no by-id lookup', async () => {
    routes = routesFor('bail_regular');
    await mount({
      templateId: 'bail_regular',
      initial: { state: 'bihar', court_type: 'sessions', court: 'bihar_sessions_patna' },
    });
    expect(optionTexts(sel('brief-court-court'))).toEqual(['Choose', 'Sessions Court, Patna']);
    expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
    expect(paths().some((p) => p.startsWith('/api/courts/bihar_'))).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a non-bail template never adds the suffix option or looks the court up', async () => {
    routes = {
      '/api/courts/states': { states: [{ id: 'bihar', name: 'Bihar' }] },
      '/api/courts/types?state=bihar': { types: [{ id: 'sessions', label: 'Sessions Court' }] },
      '/api/courts?state=bihar&type=civil_court': { courts: [] },
    };
    await mount({ templateId: 'suspension_of_sentence', initial: SAVED });
    expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
    expect(paths().some((p) => p === '/api/courts/bihar_civil_patna')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('choosing from the allowed list afterwards works and drops the saved option', async () => {
    routes = {
      ...savedRoutes('bail_regular'),
      '/api/courts/bihar_civil_patna': { court: { name: 'Civil Court, Patna', state: 'Bihar' } },
      '/api/courts/types?state=bihar&template=bail_regular': {
        types: [{ id: 'sessions', label: 'Sessions Court' }],
      },
      '/api/courts?state=bihar&type=sessions&template=bail_regular': {
        courts: [{ courtId: 'bihar_sessions_patna', name: 'Sessions Court, Patna' }],
      },
    };
    await mount({ templateId: 'bail_regular', initial: SAVED });
    await choose('brief-court-type', 'sessions');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({
      state: 'bihar',
      court_type: 'sessions',
      court: null,
    });
    await choose('brief-court-court', 'bihar_sessions_patna');
    expect(optionTexts(sel('brief-court-court'))).toEqual(['Choose', 'Sessions Court, Patna']);
    expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
  });
});
