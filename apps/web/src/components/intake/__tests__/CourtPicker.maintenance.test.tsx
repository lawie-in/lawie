// T-482: the brief court picker for maintenance_bnss_144 asks for template-scoped lists
// (Family Court + JMFC), and keeps (never changes) a saved court the scope does not offer.
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

import type { BriefCourt } from '../briefTypes';
import { isScopedCourtTemplate, MAINTENANCE_TEMPLATE_ID, SAVED_TYPE_NAMES } from '../bailCourts';
import CourtPicker, { NOT_OFFERED_SUFFIX } from '../CourtPicker';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const MAINT = 'maintenance_bnss_144';

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

const u = {
  states: `/api/courts/states?template=${MAINT}`,
  types: `/api/courts/types?state=bihar&template=${MAINT}`,
  fc: `/api/courts?state=bihar&type=family_court&template=${MAINT}`,
  jmfc: `/api/courts?state=bihar&type=jmfc&template=${MAINT}`,
};
const maintRoutes = (): Record<string, unknown> => ({
  [u.states]: { states: [{ id: 'bihar', name: 'Bihar' }] },
  [u.types]: {
    types: [
      { id: 'family_court', label: 'Family Court' },
      { id: 'jmfc', label: 'Judicial Magistrate First Class' },
    ],
  },
  [u.fc]: { courts: [{ courtId: 'family_court_patna', name: 'Family Court, Patna' }] },
  [u.jmfc]: {
    courts: [
      {
        courtId: 'bihar_jmfc_gaya',
        name: 'Court of the Judicial Magistrate First Class, Gaya',
      },
    ],
  },
});

describe('T-482 CourtPicker, maintenance_bnss_144', () => {
  it('the helper treats maintenance as scoped, and only it (besides the bail packs)', () => {
    expect(MAINTENANCE_TEMPLATE_ID).toBe(MAINT);
    expect(isScopedCourtTemplate(MAINT)).toBe(true);
    expect(isScopedCourtTemplate('bail_regular')).toBe(true);
    for (const t of [
      'maintenance_bnss_144_v2',
      'plaint_recovery',
      'consumer_complaint',
      undefined,
      null,
    ]) {
      expect(isScopedCourtTemplate(t as string)).toBe(false);
    }
    expect(SAVED_TYPE_NAMES.family_court).toBe('Family Court');
  });

  it('sends template=maintenance_bnss_144 on states, types and courts, with no level', async () => {
    routes = maintRoutes();
    await mount({ templateId: MAINT });
    expect(paths()).toEqual([u.states]);
    await choose('brief-court-state', 'bihar');
    await choose('brief-court-type', 'jmfc');
    await choose('brief-court-court', 'bihar_jmfc_gaya');
    expect(paths()).toEqual(expect.arrayContaining([u.states, u.types, u.jmfc]));
    expect(paths().every((p) => p.includes(`template=${MAINT}`))).toBe(true);
    expect(paths().some((p) => p.includes('level='))).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({
      state: 'bihar',
      court_type: 'jmfc',
      court: 'bihar_jmfc_gaya',
    });
  });

  it('shows Family Court and Judicial Magistrate First Class as the types, and the Family Court list', async () => {
    routes = maintRoutes();
    await mount({ templateId: MAINT });
    await choose('brief-court-state', 'bihar');
    expect(optionTexts(sel('brief-court-type'))).toEqual([
      'Choose',
      'Family Court',
      'Judicial Magistrate First Class',
    ]);
    await choose('brief-court-type', 'family_court');
    expect(paths()).toContain(u.fc);
    expect(optionTexts(sel('brief-court-court'))).toEqual(['Choose', 'Family Court, Patna']);
  });

  it('a saved Family Court choice displays as "Family Court" (not the raw id) when the scope no longer offers it', async () => {
    routes = {
      [u.states]: { states: [{ id: 'bihar', name: 'Bihar' }] },
      [u.types]: { types: [{ id: 'jmfc', label: 'Judicial Magistrate First Class' }] },
      [u.fc]: { courts: [] },
    };
    await mount({
      templateId: MAINT,
      initial: { state: 'bihar', court_type: 'family_court', court: 'family_court_gaya' },
    });
    expect(optionTexts(sel('brief-court-type'))).toContain(`Family Court${NOT_OFFERED_SUFFIX}`);
    expect(sel('brief-court-type').value).toBe('family_court');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a saved Family Court the scope offers has no suffix', async () => {
    routes = maintRoutes();
    await mount({
      templateId: MAINT,
      initial: { state: 'bihar', court_type: 'family_court', court: 'family_court_patna' },
    });
    expect(optionTexts(sel('brief-court-type'))).toEqual([
      'Choose',
      'Family Court',
      'Judicial Magistrate First Class',
    ]);
    expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('another template sends no template param', async () => {
    routes = {
      '/api/courts/states': { states: [{ id: 'bihar', name: 'Bihar' }] },
    };
    await mount({ templateId: 'plaint_recovery' });
    expect(paths()).toEqual(['/api/courts/states']);
  });

  describe('a saved `tribunal` Family Court (brief saved before the scope)', () => {
    const TRIBUNAL_TYPE = { id: 'tribunal', label: 'Tribunal' };
    const FC_TYPE = { id: 'family_court', label: 'Family Court' };
    const JMFC_TYPE = { id: 'jmfc', label: 'Judicial Magistrate First Class' };
    /** Answer by route kind, whatever the query string, and record the paths. */
    function serve(types: unknown[], courts: unknown[] = []) {
      mockApiFetch.mockImplementation(async (path: string) => {
        if (path.startsWith('/api/courts/states'))
          return reply({ states: [{ id: 'bihar', name: 'Bihar' }] });
        if (path.startsWith('/api/courts/types')) return reply({ types });
        if (path.startsWith('/api/courts/family_court_')) return reply({ court: null });
        return reply({ courts });
      });
    }
    const SAVED: BriefCourt = {
      state: 'bihar',
      court_type: 'tribunal',
      court: 'family_court_patna',
    };
    const PATNA = { courtId: 'family_court_patna', name: 'Family Court, Patna' };

    it('shows "Family Court", not "(not offered)"; asks for type=family_court; never calls onChange', async () => {
      serve([FC_TYPE, JMFC_TYPE], [PATNA]);
      await mount({ templateId: MAINT, initial: SAVED });
      expect(sel('brief-court-type').value).toBe('family_court');
      expect(optionTexts(sel('brief-court-type'))).toEqual([
        'Choose',
        'Family Court',
        'Judicial Magistrate First Class',
      ]);
      expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
      expect(container.textContent).not.toContain('Tribunal');
      expect(paths()).toContain(u.fc);
      // (a first courts request with type=tribunal can go out before the types have loaded; the
      // last one, whose answer is shown, is family_court)
      const courtCalls = paths().filter((p) => p.startsWith('/api/courts?'));
      expect(courtCalls[courtCalls.length - 1]).toBe(u.fc);
      expect(sel('brief-court-court').value).toBe('family_court_patna');
      expect(optionTexts(sel('brief-court-court'))).toEqual(['Choose', 'Family Court, Patna']);
      expect(onChange).not.toHaveBeenCalled(); // no auto-selection, brief left as saved
    });

    it('a later pick by the advocate still goes through onChange with the real values', async () => {
      serve([FC_TYPE, JMFC_TYPE], [PATNA]);
      await mount({ templateId: MAINT, initial: SAVED });
      await choose('brief-court-type', 'jmfc');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ state: 'bihar', court_type: 'jmfc', court: null });
    });

    it('changing only the court keeps the display type (family_court) in the call', async () => {
      serve([FC_TYPE, JMFC_TYPE], [PATNA]);
      await mount({ templateId: MAINT, initial: SAVED });
      await choose('brief-court-court', '');
      expect(onChange).toHaveBeenLastCalledWith({
        state: 'bihar',
        court_type: 'family_court',
        court: null,
      });
    });

    it('another template: the old behaviour, "Tribunal (not offered)" and no mapping', async () => {
      serve([JMFC_TYPE]);
      await mount({ templateId: 'bail_regular', initial: SAVED });
      expect(optionTexts(sel('brief-court-type'))).toContain(`Tribunal${NOT_OFFERED_SUFFIX}`);
      expect(sel('brief-court-type').value).toBe('tribunal');
      expect(paths().some((p) => p.includes('type=family_court'))).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('no template: tribunal stays as saved, the list is asked with type=tribunal', async () => {
      serve([TRIBUNAL_TYPE, JMFC_TYPE]);
      await mount({ initial: SAVED });
      expect(sel('brief-court-type').value).toBe('tribunal');
      expect(paths().some((p) => p.includes('type=tribunal'))).toBe(true);
      expect(paths().some((p) => p.includes('type=family_court'))).toBe(false);
    });

    it('a saved tribunal whose court id is not family_court_*: old behaviour', async () => {
      serve([FC_TYPE, JMFC_TYPE]);
      await mount({
        templateId: MAINT,
        initial: { state: 'bihar', court_type: 'tribunal', court: 'ncdrc_delhi' },
      });
      expect(optionTexts(sel('brief-court-type'))).toContain(`Tribunal${NOT_OFFERED_SUFFIX}`);
      expect(sel('brief-court-type').value).toBe('tribunal');
      expect(paths().some((p) => p.includes('type=family_court'))).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('a saved tribunal with no court chosen: old behaviour', async () => {
      serve([FC_TYPE, JMFC_TYPE]);
      await mount({ templateId: MAINT, initial: { ...SAVED, court: null } });
      expect(optionTexts(sel('brief-court-type'))).toContain(`Tribunal${NOT_OFFERED_SUFFIX}`);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('a state where the scope offers tribunal (unscoped fallback, e.g. Delhi): tribunal is kept as tribunal', async () => {
      serve([TRIBUNAL_TYPE, JMFC_TYPE]);
      await mount({
        templateId: MAINT,
        initial: { state: 'bihar', court_type: 'tribunal', court: 'family_court_delhi_saket' },
      });
      expect(sel('brief-court-type').value).toBe('tribunal');
      expect(optionTexts(sel('brief-court-type'))).toEqual([
        'Choose',
        'Tribunal',
        'Judicial Magistrate First Class',
      ]);
      expect(paths().some((p) => p.includes('type=family_court'))).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('a saved family_court (new style) is unchanged', async () => {
      serve([FC_TYPE, JMFC_TYPE], [PATNA]);
      await mount({ templateId: MAINT, initial: { ...SAVED, court_type: 'family_court' } });
      expect(sel('brief-court-type').value).toBe('family_court');
      expect(container.textContent).not.toContain(NOT_OFFERED_SUFFIX);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
