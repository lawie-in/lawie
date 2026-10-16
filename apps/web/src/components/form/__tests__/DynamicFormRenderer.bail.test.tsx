/* eslint-disable @typescript-eslint/no-explicit-any */
// T-425 part 2: the classic form (DynamicFormRenderer) for the six bail packs asks for
// template-scoped court lists, and keeps (never changes) a saved court/type/state the pack
// no longer offers.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { NOT_OFFERED_SUFFIX } from '../../intake/bailCourts';
import DynamicFormRenderer, { SUBMIT_INK_COST_ID, TemplateConfig } from '../DynamicFormRenderer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const strip = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');

const BAIL_IDS = [
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'bail_cancellation',
];

type Saved = { state?: string; court_type?: string; court_name?: string };

function configOf(templateId: string | undefined, saved: Saved = {}): TemplateConfig {
  return {
    template_id: templateId,
    display_name: 'Test form',
    supported_languages: ['en'],
    form_schema: {
      steps: [
        {
          step: 1,
          title: 'Court',
          fields: [
            {
              field_id: 'state',
              label: 'State',
              type: 'dropdown_search',
              source: 'courts_db.states',
              required: true,
              default: saved.state,
            },
            {
              field_id: 'court_type',
              label: 'Court Type',
              type: 'dropdown',
              source: 'courts_db.court_types',
              required: true,
              default: saved.court_type,
            },
            {
              field_id: 'court_name',
              label: 'Court',
              type: 'dropdown_search',
              source: 'courts_db.courts',
              required: true,
              default: saved.court_name,
            },
          ],
        },
      ],
    },
  } as unknown as TemplateConfig;
}

let routes: Record<string, unknown>;
let rejectPaths: Set<string>;
let container: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;

beforeEach(() => {
  rejectPaths = new Set();
  routes = {};
  // A path with no route answers !ok, like the real API for an unknown court.
  fetchMock = jest.fn(async (url: string) => {
    const path = strip(url);
    if (rejectPaths.has(path)) throw new Error('network');
    if (!(path in routes)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => routes[path] };
  });
  (global as any).fetch = fetchMock;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const paths = () => fetchMock.mock.calls.map((c) => strip(c[0] as string));
const byIdCalls = (id: string) => paths().filter((p) => p === `/api/courts/${id}`).length;
async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}
async function mount(templateId: string | undefined, saved: Saved = {}, onSubmit = jest.fn()) {
  act(() => {
    root.render(
      <DynamicFormRenderer
        config={configOf(templateId, saved)}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        inkCost={1}
      />,
    );
  });
  await flush();
  return onSubmit;
}
const typeSelect = () => container.querySelector<HTMLSelectElement>('select')!;
const typeOptions = () => Array.from(typeSelect().options).map((o) => o.textContent);
/** The text shown in the trigger of the nth searchable dropdown (0 state, 1 court). */
const triggerText = (n: number) =>
  Array.from(container.querySelectorAll<HTMLElement>('div.cursor-pointer'))[n].textContent;
/** Open the nth searchable dropdown and list its option buttons. */
function openOptions(n: number): string[] {
  const trigger = Array.from(container.querySelectorAll<HTMLElement>('div.cursor-pointer'))[n];
  act(() => trigger.click());
  const root2 = trigger.parentElement!;
  return Array.from(root2.querySelectorAll('button')).map((b) => b.textContent ?? '');
}
async function chooseType(value: string) {
  const s = typeSelect();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(s, value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

const scopedRoutes = (id: string, state: string, type: string) => ({
  [`/api/courts/states?template=${id}`]: { states: [{ id: 'bihar', name: 'Bihar' }] },
  [`/api/courts/types?state=${state}&template=${id}`]: {
    types: [{ id: 'sessions', label: 'Sessions Court' }],
  },
  [`/api/courts?state=${state}&type=${type}&template=${id}`]: { courts: [] },
});

describe('DynamicFormRenderer, bail packs: scoped URLs', () => {
  it.each(BAIL_IDS)('%s: states, types and courts all carry template=<id>', async (id) => {
    routes = {
      [`/api/courts/states?template=${id}`]: { states: [{ id: 'bihar', name: 'Bihar' }] },
      [`/api/courts/types?state=bihar&template=${id}`]: {
        types: [{ id: 'sessions', label: 'Sessions Court' }],
      },
      [`/api/courts?state=bihar&type=sessions&template=${id}`]: {
        courts: [{ courtId: 'bihar_sessions_patna', name: 'Sessions Court, Patna' }],
      },
    };
    await mount(id, { state: 'bihar', court_type: 'sessions', court_name: 'bihar_sessions_patna' });
    expect(paths()).toEqual(
      expect.arrayContaining([
        `/api/courts/states?template=${id}`,
        `/api/courts/types?state=bihar&template=${id}`,
        `/api/courts?state=bihar&type=sessions&template=${id}`,
      ]),
    );
    // Every list request is scoped, and nothing else is asked for.
    expect(paths().every((p) => p.includes(`template=${id}`))).toBe(true);
    expect(paths()).toHaveLength(3);
    expect(triggerText(1)).toContain('Sessions Court, Patna');
    expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
  });

  it.each([['suspension_of_sentence'], ['some_other_template'], [undefined]])(
    'templateId %p: old URLs, no template=, no by-id lookup, no suffix',
    async (id) => {
      routes = {
        '/api/courts/states': { states: [{ id: 'bihar', name: 'Bihar' }] },
        '/api/courts/types?state=bihar': { types: [{ id: 'sessions', label: 'Sessions Court' }] },
        '/api/courts?state=bihar&type=civil_court': { courts: [] },
      };
      await mount(id, { state: 'bihar', court_type: 'civil_court', court_name: 'bihar_civil' });
      expect(paths()).toEqual([
        '/api/courts/states',
        '/api/courts/types?state=bihar',
        '/api/courts?state=bihar&type=civil_court',
      ]);
      expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
    },
  );

  it('a bail id that is only a prefix match is not a bail pack', async () => {
    routes = { '/api/courts/states': { states: [] } };
    await mount('bail_regular_v2');
    expect(paths()).toEqual(['/api/courts/states']);
  });

  it('consumer_complaint keeps its level URLs, with no bail by-id lookup', async () => {
    routes = {
      '/api/courts/states?template=consumer_complaint&level=district': {
        states: [{ id: 'delhi', name: 'Delhi' }],
      },
    };
    await mount('consumer_complaint');
    expect(paths()).toEqual([]); // nothing is fetched until a level is chosen
    const chip = container.querySelector<HTMLElement>('[role="radio"]')!;
    act(() => chip.click());
    await flush();
    expect(paths()).toEqual(['/api/courts/states?template=consumer_complaint&level=district']);
  });

  it('still renders the ink cost line on the submit step', async () => {
    routes = scopedRoutes('bail_regular', 'bihar', 'sessions');
    await mount('bail_regular', { state: 'bihar', court_type: 'sessions' });
    const line = container.querySelector(`#${SUBMIT_INK_COST_ID}`);
    expect(line).not.toBeNull();
    expect(line!.textContent).toMatch(/1/);
  });
});

describe('DynamicFormRenderer, bail packs: a saved choice the pack does not offer (AC3)', () => {
  const SAVED: Saved = {
    state: 'bihar',
    court_type: 'civil_court',
    court_name: 'bihar_civil_patna',
  };

  it.each(BAIL_IDS)('%s: court and type kept with the suffix', async (id) => {
    routes = {
      ...scopedRoutes(id, 'bihar', 'civil_court'),
      '/api/courts/bihar_civil_patna': { court: { name: 'Civil Court, Patna', state: 'Bihar' } },
    };
    await mount(id, SAVED);
    expect(triggerText(1)).toContain(`Civil Court, Patna${NOT_OFFERED_SUFFIX}`);
    expect(typeOptions()).toEqual([
      'Select…',
      `Civil Court (Senior Division)${NOT_OFFERED_SUFFIX}`,
      'Sessions Court',
    ]);
    expect(typeSelect().value).toBe('civil_court');
    expect(triggerText(0)).toContain('Bihar');
    expect(triggerText(0)).not.toContain(NOT_OFFERED_SUFFIX);
  });

  it('the kept court is the first option of the court list', async () => {
    routes = {
      '/api/courts/states?template=bail_regular': { states: [{ id: 'bihar', name: 'Bihar' }] },
      '/api/courts/types?state=bihar&template=bail_regular': { types: [] },
      '/api/courts?state=bihar&type=civil_court&template=bail_regular': {
        courts: [{ courtId: 'bihar_sessions_patna', name: 'Sessions Court, Patna' }],
      },
      '/api/courts/bihar_civil_patna': { court: { name: 'Civil Court, Patna', state: 'Bihar' } },
    };
    await mount('bail_regular', SAVED);
    expect(openOptions(1)).toEqual([
      `Civil Court, Patna${NOT_OFFERED_SUFFIX}`,
      'Sessions Court, Patna',
    ]);
  });

  it('a saved state the scoped list lacks is kept with the suffix', async () => {
    routes = {
      '/api/courts/states?template=bail_regular': { states: [{ id: 'bihar', name: 'Bihar' }] },
      '/api/courts/types?state=india&template=bail_regular': { types: [] },
      '/api/courts?state=india&type=supreme_court&template=bail_regular': { courts: [] },
      '/api/courts/supreme_court_india': {
        court: { name: 'Supreme Court of India', state: 'India' },
      },
    };
    await mount('bail_regular', {
      state: 'india',
      court_type: 'supreme_court',
      court_name: 'supreme_court_india',
    });
    expect(triggerText(0)).toContain(`India${NOT_OFFERED_SUFFIX}`);
    expect(openOptions(0)).toEqual([`India${NOT_OFFERED_SUFFIX}`, 'Bihar']);
    expect(typeOptions()).toContain(`Supreme Court${NOT_OFFERED_SUFFIX}`);
    expect(triggerText(1)).toContain(`Supreme Court of India${NOT_OFFERED_SUFFIX}`);
  });

  it('never changes the saved value: submit sends exactly what was saved', async () => {
    routes = {
      ...scopedRoutes('bail_regular', 'bihar', 'civil_court'),
      '/api/courts/bihar_civil_patna': { court: { name: 'Civil Court, Patna', state: 'Bihar' } },
    };
    const onSubmit = await mount('bail_regular', SAVED);
    expect(typeSelect().value).toBe('civil_court');
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Generate document',
    )!;
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining(SAVED));
  });

  it('a court the list does offer gets no suffix and no by-id lookup', async () => {
    routes = {
      '/api/courts/states?template=bail_regular': { states: [{ id: 'bihar', name: 'Bihar' }] },
      '/api/courts/types?state=bihar&template=bail_regular': {
        types: [{ id: 'sessions', label: 'Sessions Court' }],
      },
      '/api/courts?state=bihar&type=sessions&template=bail_regular': {
        courts: [{ courtId: 'bihar_sessions_patna', name: 'Sessions Court, Patna' }],
      },
    };
    await mount('bail_regular', {
      state: 'bihar',
      court_type: 'sessions',
      court_name: 'bihar_sessions_patna',
    });
    expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
    expect(paths().some((p) => p.startsWith('/api/courts/bihar_'))).toBe(false);
  });

  it('no saved court: no by-id lookup is made', async () => {
    routes = scopedRoutes('bail_regular', 'bihar', 'sessions');
    await mount('bail_regular', { state: 'bihar', court_type: 'sessions' });
    expect(
      paths().filter((p) => /^\/api\/courts\/[^?]+$/.test(p) && !p.includes('/states')),
    ).toEqual([]);
  });

  it('falls back to the id when GET /api/courts/:id is not ok', async () => {
    routes = scopedRoutes('bail_regular', 'bihar', 'civil_court'); // by-id not routed: !ok
    await mount('bail_regular', SAVED);
    expect(byIdCalls('bihar_civil_patna')).toBe(1);
    expect(triggerText(1)).toContain(`bihar_civil_patna${NOT_OFFERED_SUFFIX}`);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('falls back to the id when GET /api/courts/:id returns no name', async () => {
    routes = {
      ...scopedRoutes('bail_regular', 'bihar', 'civil_court'),
      '/api/courts/bihar_civil_patna': { court: {} },
    };
    await mount('bail_regular', SAVED);
    expect(triggerText(1)).toContain(`bihar_civil_patna${NOT_OFFERED_SUFFIX}`);
  });

  it('falls back to the id when GET /api/courts/:id rejects', async () => {
    routes = scopedRoutes('bail_regular', 'bihar', 'civil_court');
    rejectPaths.add('/api/courts/bihar_civil_patna');
    await mount('bail_regular', SAVED);
    expect(triggerText(1)).toContain(`bihar_civil_patna${NOT_OFFERED_SUFFIX}`);
    expect(typeSelect().value).toBe('civil_court');
  });

  it('a failed by-id lookup is not asked again when the lists reload', async () => {
    routes = {
      ...scopedRoutes('bail_regular', 'bihar', 'civil_court'),
      '/api/courts?state=bihar&type=sessions&template=bail_regular': { courts: [] },
    };
    await mount('bail_regular', SAVED);
    expect(byIdCalls('bihar_civil_patna')).toBe(1);
    // Switching the type reloads the court list; the saved court is still not in it.
    await chooseType('sessions');
    expect(paths()).toContain('/api/courts?state=bihar&type=sessions&template=bail_regular');
    expect(byIdCalls('bihar_civil_patna')).toBe(1);
    expect(triggerText(1)).toContain(`bihar_civil_patna${NOT_OFFERED_SUFFIX}`);
  });

  it('a successful by-id lookup is not repeated when the lists reload', async () => {
    routes = {
      ...scopedRoutes('bail_regular', 'bihar', 'civil_court'),
      '/api/courts?state=bihar&type=sessions&template=bail_regular': { courts: [] },
      '/api/courts/bihar_civil_patna': { court: { name: 'Civil Court, Patna', state: 'Bihar' } },
    };
    await mount('bail_regular', SAVED);
    await chooseType('sessions');
    expect(paths()).toContain('/api/courts?state=bihar&type=sessions&template=bail_regular');
    expect(byIdCalls('bihar_civil_patna')).toBe(1);
    expect(triggerText(1)).toContain(`Civil Court, Patna${NOT_OFFERED_SUFFIX}`);
  });

  it('a non-bail template never adds the suffix option or looks the court up', async () => {
    routes = {
      '/api/courts/states': { states: [{ id: 'bihar', name: 'Bihar' }] },
      '/api/courts/types?state=bihar': { types: [{ id: 'sessions', label: 'Sessions Court' }] },
      '/api/courts?state=bihar&type=civil_court': { courts: [] },
    };
    await mount('suspension_of_sentence', SAVED);
    expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
    expect(byIdCalls('bihar_civil_patna')).toBe(0);
  });
});
