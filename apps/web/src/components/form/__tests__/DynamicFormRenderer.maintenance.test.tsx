/* eslint-disable @typescript-eslint/no-explicit-any */
// T-482: the classic form (DynamicFormRenderer) for maintenance_bnss_144 asks for
// template-scoped court lists, and keeps (never changes) a saved court/type/state the pack
// no longer offers.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { NOT_OFFERED_SUFFIX } from '../../intake/bailCourts';
import DynamicFormRenderer, { TemplateConfig } from '../DynamicFormRenderer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const strip = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');

const MAINT = 'maintenance_bnss_144';

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
async function chooseType(value: string) {
  const s = typeSelect();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(s, value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

describe('T-482 DynamicFormRenderer, maintenance_bnss_144', () => {
  it('states, types and courts all carry template=maintenance_bnss_144; types show Family Court', async () => {
    routes = {
      [`/api/courts/states?template=${MAINT}`]: { states: [{ id: 'bihar', name: 'Bihar' }] },
      [`/api/courts/types?state=bihar&template=${MAINT}`]: {
        types: [
          { id: 'family_court', label: 'Family Court' },
          { id: 'jmfc', label: 'Judicial Magistrate First Class' },
        ],
      },
      [`/api/courts?state=bihar&type=jmfc&template=${MAINT}`]: {
        courts: [
          {
            courtId: 'bihar_jmfc_gaya',
            name: 'Court of the Judicial Magistrate First Class, Gaya',
          },
        ],
      },
    };
    await mount(MAINT, { state: 'bihar' });
    expect(paths()).toContain(`/api/courts/states?template=${MAINT}`);
    expect(typeOptions()).toEqual(
      expect.arrayContaining(['Family Court', 'Judicial Magistrate First Class']),
    );
    await chooseType('jmfc');
    expect(paths()).toContain(`/api/courts?state=bihar&type=jmfc&template=${MAINT}`);
    expect(
      paths()
        .filter((p) => p.startsWith('/api/courts'))
        .every((p) => p.includes(`template=${MAINT}`)),
    ).toBe(true);
    expect(paths().some((p) => p.includes('level='))).toBe(false);
  });

  it('a saved Family Court type the scope lacks is kept and named "Family Court"', async () => {
    routes = {
      [`/api/courts/states?template=${MAINT}`]: { states: [{ id: 'bihar', name: 'Bihar' }] },
      [`/api/courts/types?state=bihar&template=${MAINT}`]: {
        types: [{ id: 'jmfc', label: 'Judicial Magistrate First Class' }],
      },
      [`/api/courts?state=bihar&type=family_court&template=${MAINT}`]: { courts: [] },
    };
    await mount(MAINT, { state: 'bihar', court_type: 'family_court' });
    expect(typeOptions()).toContain(`Family Court${NOT_OFFERED_SUFFIX}`);
  });

  it('a template that is not scoped asks without template=', async () => {
    routes = { '/api/courts/states': { states: [{ id: 'bihar', name: 'Bihar' }] } };
    await mount('plaint_recovery');
    expect(
      paths()
        .filter((p) => p.startsWith('/api/courts'))
        .every((p) => !p.includes('template=')),
    ).toBe(true);
  });
});
