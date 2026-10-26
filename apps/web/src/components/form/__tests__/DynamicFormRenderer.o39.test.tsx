/* eslint-disable @typescript-eslint/no-explicit-any */
// T-613: the classic form (DynamicFormRenderer) for temporary_injunction_o39 asks for
// template-scoped court lists, as the bail packs and maintenance do.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import DynamicFormRenderer, { TemplateConfig } from '../DynamicFormRenderer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const strip = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');
const O39 = 'temporary_injunction_o39';

function configOf(templateId: string | undefined, state?: string): TemplateConfig {
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
              default: state,
            },
            {
              field_id: 'court_type',
              label: 'Court Type',
              type: 'dropdown',
              source: 'courts_db.court_types',
              required: true,
            },
            {
              field_id: 'court_name',
              label: 'Court',
              type: 'dropdown_search',
              source: 'courts_db.courts',
              required: true,
            },
          ],
        },
      ],
    },
  } as unknown as TemplateConfig;
}

let routes: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;

beforeEach(() => {
  routes = {};
  fetchMock = jest.fn(async (url: string) => {
    const path = strip(url);
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
async function mount(templateId: string | undefined, state?: string) {
  act(() => {
    root.render(
      <DynamicFormRenderer
        config={configOf(templateId, state)}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        inkCost={1}
      />,
    );
  });
  await flush();
}

describe('T-613 DynamicFormRenderer, temporary_injunction_o39', () => {
  it('states and types carry template=temporary_injunction_o39; the Junior Division is offered', async () => {
    routes = {
      [`/api/courts/states?template=${O39}`]: { states: [{ id: 'bihar', name: 'Bihar' }] },
      [`/api/courts/types?state=bihar&template=${O39}`]: {
        types: [
          { id: 'civil_court', label: 'Civil Court (Senior Division)' },
          { id: 'civil_court_junior', label: 'Civil Court (Junior Division)' },
        ],
      },
    };
    await mount(O39, 'bihar');
    expect(paths()).toContain(`/api/courts/states?template=${O39}`);
    expect(paths()).toContain(`/api/courts/types?state=bihar&template=${O39}`);
    const opts = Array.from(container.querySelector<HTMLSelectElement>('select')!.options).map(
      (o) => o.textContent,
    );
    expect(opts).toEqual(expect.arrayContaining(['Civil Court (Junior Division)']));
    expect(
      paths()
        .filter((p) => p.startsWith('/api/courts'))
        .every((p) => p.includes(`template=${O39}`)),
    ).toBe(true);
  });

  it('another template asks for the unscoped lists (no template param)', async () => {
    routes = { '/api/courts/states': { states: [{ id: 'bihar', name: 'Bihar' }] } };
    await mount('plaint_injunction');
    expect(paths()).toContain('/api/courts/states');
    expect(paths().some((p) => p.includes('template='))).toBe(false);
  });
});
