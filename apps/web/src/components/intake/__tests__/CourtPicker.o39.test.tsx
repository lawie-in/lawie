// T-613: the brief court picker for temporary_injunction_o39 asks for template-scoped lists
// (Civil Court Junior/Senior Division, District Court, ...), so no "India" State and no
// Supreme Court or tribunal is offered. The server does the narrowing; the picker must ask.
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

import type { BriefCourt } from '../briefTypes';
import { isScopedCourtTemplate } from '../bailCourts';
import CourtPicker from '../CourtPicker';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const O39 = 'temporary_injunction_o39';

let routes: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;
let onChange: jest.Mock;

const EMPTY: BriefCourt = { state: null, court_type: null, court: null };

function Harness({ templateId }: { templateId?: string }) {
  const [court, setCourt] = useState<BriefCourt>(EMPTY);
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
async function mount(templateId?: string) {
  act(() => root.render(<Harness templateId={templateId} />));
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

beforeEach(() => {
  routes = {};
  onChange = jest.fn();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) =>
    path in routes
      ? { ok: true, json: async () => routes[path] }
      : { ok: false, json: async () => ({}) },
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const u = {
  states: `/api/courts/states?template=${O39}`,
  types: `/api/courts/types?state=bihar&template=${O39}`,
  junior: `/api/courts?state=bihar&type=civil_court_junior&template=${O39}`,
};

describe('T-613 CourtPicker, temporary_injunction_o39', () => {
  it('isScopedCourtTemplate is true for the O.39 pack, and still false for near misses', () => {
    expect(isScopedCourtTemplate(O39)).toBe(true);
    for (const t of ['temporary_injunction_o39_v2', 'plaint_injunction', 'temporary_injunction']) {
      expect(isScopedCourtTemplate(t)).toBe(false);
    }
  });

  it('sends template=temporary_injunction_o39 on states, types and courts, with no level', async () => {
    routes = {
      [u.states]: { states: [{ id: 'bihar', name: 'Bihar' }] },
      [u.types]: {
        types: [
          { id: 'civil_court', label: 'Civil Court (Senior Division)' },
          { id: 'civil_court_junior', label: 'Civil Court (Junior Division)' },
        ],
      },
      [u.junior]: {
        courts: [
          { courtId: 'bihar_civil_junior_patna', name: 'Civil Court (Junior Division), Patna' },
        ],
      },
    };
    await mount(O39);
    expect(paths()).toEqual([u.states]);
    await choose('brief-court-state', 'bihar');
    expect(optionTexts(sel('brief-court-type'))).toEqual([
      'Choose',
      'Civil Court (Senior Division)',
      'Civil Court (Junior Division)',
    ]);
    await choose('brief-court-type', 'civil_court_junior');
    await choose('brief-court-court', 'bihar_civil_junior_patna');
    expect(paths()).toEqual(expect.arrayContaining([u.states, u.types, u.junior]));
    expect(paths().every((p) => p.includes(`template=${O39}`))).toBe(true);
    expect(paths().some((p) => p.includes('level='))).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({
      state: 'bihar',
      court_type: 'civil_court_junior',
      court: 'bihar_civil_junior_patna',
    });
  });

  it('a template that is not scoped sends no template param', async () => {
    routes = { '/api/courts/states': { states: [{ id: 'bihar', name: 'Bihar' }] } };
    await mount('plaint_injunction');
    expect(paths()).toEqual(['/api/courts/states']);
  });
});
