// T-411 AC1-AC8: the brief court picker in consumer mode, and the unchanged other templates.
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

import type { BriefCourt } from '../briefTypes';
import CourtPicker from '../CourtPicker';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NCDRC_LABEL = 'National Consumer Disputes Redressal Commission (NCDRC), New Delhi';
const NO_MATCH = 'No Commission is listed for this state yet.';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

/** Responses by path. A path in `held` waits until release() is called. */
let routes: Record<string, unknown>;
let held: Record<string, () => void>;
let holdPaths: Set<string>;

function reply(body: unknown) {
  return { ok: true, json: async () => body };
}

const CONSUMER = 'template=consumer_complaint';
const DISTRICT_STATES = `/api/courts/states?${CONSUMER}&level=district`;
const STATE_STATES = `/api/courts/states?${CONSUMER}&level=state`;
const NATIONAL_COURTS = `/api/courts?${CONSUMER}&level=national`;
const districtCourts = (s: string) => `/api/courts?${CONSUMER}&level=district&state=${s}`;

let container: HTMLDivElement;
let root: Root;
let onChange: jest.Mock;
let last: BriefCourt;

const EMPTY: BriefCourt = { state: null, court_type: null, court: null };

function Harness({
  templateId,
  initial = EMPTY,
  missing = false,
}: {
  templateId?: string;
  initial?: BriefCourt;
  missing?: boolean;
}) {
  const [court, setCourt] = useState<BriefCourt>(initial);
  last = court;
  return (
    <CourtPicker
      court={court}
      missing={missing}
      templateId={templateId}
      onChange={(c) => {
        onChange(c);
        setCourt(c);
      }}
    />
  );
}

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => {});
}
async function mount(props: Parameters<typeof Harness>[0] = {}) {
  act(() => root.render(<Harness {...props} />));
  await flush();
}
const paths = () => mockApiFetch.mock.calls.map((c) => c[0] as string);
const chip = (name: string) =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]')).find(
    (c) => c.textContent === name,
  ) as HTMLElement;
const sel = (id: string) => container.querySelector<HTMLSelectElement>(`#${id}`);
const live = () => container.querySelector('[aria-live="polite"]')!.textContent;
const labelFor = (id: string) => container.querySelector(`label[for="${id}"]`)?.textContent;
const optionTexts = (s: HTMLSelectElement) => Array.from(s.options).map((o) => o.textContent);
async function pick(name: string) {
  act(() => chip(name).click());
  await flush();
}
async function choose(id: string, value: string) {
  const s = sel(id)!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(s, value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

async function press(el: Element, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
  await flush();
}
const checkedNames = () =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]'))
    .filter((c) => c.getAttribute('aria-checked') === 'true')
    .map((c) => c.textContent);

beforeEach(() => {
  held = {};
  holdPaths = new Set();
  routes = {
    [DISTRICT_STATES]: {
      states: [
        { id: 'delhi', name: 'Delhi' },
        { id: 'kerala', name: 'Kerala' },
      ],
    },
    [STATE_STATES]: { states: [{ id: 'delhi', name: 'Delhi' }] },
    [districtCourts('delhi')]: {
      courts: [
        { courtId: 'dcdrc_new_delhi', name: 'District Commission, New Delhi' },
        { courtId: 'dcdrc_north', name: 'District Commission, North Delhi' },
      ],
    },
    [districtCourts('kerala')]: { courts: [] },
    [`/api/courts?${CONSUMER}&level=state&state=delhi`]: {
      courts: [{ courtId: 'scdrc_delhi', name: 'State Commission, Delhi' }],
    },
    [NATIONAL_COURTS]: {
      courts: [{ courtId: 'ncdrc_delhi', name: 'NCDRC (record name)' }],
    },
    '/api/courts/states': { states: [{ id: 'delhi', name: 'Delhi' }] },
    '/api/courts/types?state=delhi': { types: [{ id: 'sessions', label: 'Sessions Court' }] },
    '/api/courts?state=delhi&type=sessions': {
      courts: [{ courtId: 'tis_hazari', name: 'Tis Hazari Sessions Court' }],
    },
  };
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (holdPaths.has(path)) await new Promise<void>((r) => (held[path] = r));
    if (!(path in routes)) return { ok: false, json: async () => ({}) };
    return reply(routes[path]);
  });
  onChange = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CourtPicker, consumer_complaint', () => {
  it('shows the level group first, labelled, before any select', async () => {
    await mount({ templateId: 'consumer_complaint' });
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group).not.toBeNull();
    const label = document.getElementById(group.getAttribute('aria-labelledby')!)!;
    expect(label.textContent).toBe('Which Commission?');
    // Nothing else in the picker comes before the label and group.
    expect(container.firstElementChild!.firstElementChild!.contains(label)).toBe(true);
    expect(container.querySelector('select')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('[role="radio"]')).map((c) => c.textContent),
    ).toEqual(['District Commission', 'State Commission', 'National Commission (NCDRC)']);
    expect(
      Array.from(container.querySelectorAll('[role="radio"]')).map((c) =>
        c.getAttribute('aria-checked'),
      ),
    ).toEqual(['false', 'false', 'false']);
    // No level, nothing fetched, and never the court types.
    expect(paths()).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('District: state select, then Consumer Commission select, with the template URLs', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    expect(paths()).toContain(DISTRICT_STATES);
    expect(labelFor('brief-court-state')).toBe('State');
    expect(labelFor('brief-court-court')).toBe('Consumer Commission');
    expect(optionTexts(sel('brief-court-state')!)).toEqual(['Choose', 'Delhi', 'Kerala']);
    expect(sel('brief-court-court')!.disabled).toBe(true);
    await choose('brief-court-state', 'delhi');
    expect(paths()).toContain(districtCourts('delhi'));
    expect(sel('brief-court-court')!.disabled).toBe(false);
    expect(optionTexts(sel('brief-court-court')!)).toEqual([
      'Choose',
      'District Commission, New Delhi',
      'District Commission, North Delhi',
    ]);
  });

  it('State level uses level=state in both URLs', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('State Commission');
    expect(paths()).toContain(STATE_STATES);
    await choose('brief-court-state', 'delhi');
    expect(paths()).toContain(`/api/courts?${CONSUMER}&level=state&state=delhi`);
  });

  it('never fetches court types in consumer mode', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    await choose('brief-court-state', 'delhi');
    await pick('National Commission (NCDRC)');
    await pick('State Commission');
    await choose('brief-court-state', 'delhi');
    expect(paths().some((p) => p.includes('/api/courts/types'))).toBe(false);
    expect(container.querySelector('#brief-court-type')).toBeNull();
    expect(container.textContent).not.toContain('Court type');
  });

  it('onChange: District/State get court_type consumer_commission', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    expect(onChange).toHaveBeenLastCalledWith({
      state: null,
      court_type: 'consumer_commission',
      court: null,
    });
    await choose('brief-court-state', 'delhi');
    expect(onChange).toHaveBeenLastCalledWith({
      state: 'delhi',
      court_type: 'consumer_commission',
      court: null,
    });
    await choose('brief-court-court', 'dcdrc_new_delhi');
    expect(onChange).toHaveBeenLastCalledWith({
      state: 'delhi',
      court_type: 'consumer_commission',
      court: 'dcdrc_new_delhi',
    });
  });

  it('National: no state select, one option under Choose, never pre-selected', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('National Commission (NCDRC)');
    expect(sel('brief-court-state')).toBeNull();
    expect(paths()).toContain(NATIONAL_COURTS);
    expect(paths().some((p) => p.startsWith('/api/courts/states'))).toBe(false);
    const court = sel('brief-court-court')!;
    expect(court.disabled).toBe(false);
    expect(optionTexts(court)).toEqual(['Choose', NCDRC_LABEL]);
    expect(court.value).toBe('');
    // The level click is the only onChange; it carries no court.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({
      state: 'india',
      court_type: 'tribunal',
      court: null,
    });
    expect(last.court).toBeNull();
  });

  it('National: choosing the option gives state india, court_type tribunal', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('National Commission (NCDRC)');
    await choose('brief-court-court', 'ncdrc_delhi');
    expect(onChange).toHaveBeenLastCalledWith({
      state: 'india',
      court_type: 'tribunal',
      court: 'ncdrc_delhi',
    });
    expect(sel('brief-court-court')!.value).toBe('ncdrc_delhi');
  });

  it('changing the level clears the state and the court', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    await choose('brief-court-state', 'delhi');
    await choose('brief-court-court', 'dcdrc_new_delhi');
    await pick('State Commission');
    expect(last).toEqual({ state: null, court_type: 'consumer_commission', court: null });
    expect(sel('brief-court-state')!.value).toBe('');
    expect(sel('brief-court-court')!.value).toBe('');
    expect(sel('brief-court-court')!.disabled).toBe(true);
    await pick('National Commission (NCDRC)');
    expect(last).toEqual({ state: 'india', court_type: 'tribunal', court: null });
    await choose('brief-court-court', 'ncdrc_delhi');
    await pick('District Commission');
    expect(last).toEqual({ state: null, court_type: 'consumer_commission', court: null });
    expect(sel('brief-court-state')!.value).toBe('');
  });

  it('clicking the level already chosen changes nothing', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    await choose('brief-court-state', 'delhi');
    onChange.mockClear();
    await pick('District Commission');
    expect(onChange).not.toHaveBeenCalled();
    expect(sel('brief-court-state')!.value).toBe('delhi');
  });

  it('moves focus to the first new control', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    expect(document.activeElement).toBe(sel('brief-court-state'));
    await pick('National Commission (NCDRC)');
    expect(document.activeElement).toBe(sel('brief-court-court'));
    await pick('State Commission');
    expect(document.activeElement).toBe(sel('brief-court-state'));
  });

  it('announces in a polite live region', async () => {
    await mount({ templateId: 'consumer_complaint' });
    const region = container.querySelector('[aria-live="polite"]')!;
    expect(region).not.toBeNull();
    expect(live()).toBe('');
    await pick('District Commission');
    expect(live()).toBe('State select shown.');
    await choose('brief-court-state', 'delhi');
    expect(live()).toBe('Commission select shown.');
    await pick('National Commission (NCDRC)');
    expect(live()).toBe('State and Commission cleared. No state needed. Commission select shown.');
  });

  it('omits the "cleared" prefix when nothing was chosen', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    await pick('National Commission (NCDRC)');
    expect(live()).toBe('No state needed. Commission select shown.');
    await pick('State Commission');
    expect(live()).toBe('State select shown.');
  });

  it('prefixes "cleared" when a state was chosen and the level changes', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    await choose('brief-court-state', 'delhi');
    await pick('State Commission');
    expect(live()).toBe('State and Commission cleared. State select shown.');
  });

  it('shows the no-match line only after an empty list has loaded', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    expect(container.textContent).not.toContain(NO_MATCH);
    holdPaths.add(districtCourts('kerala'));
    await choose('brief-court-state', 'kerala');
    // Request in flight: not loaded, so no line yet.
    expect(container.textContent).not.toContain(NO_MATCH);
    act(() => held[districtCourts('kerala')]());
    await flush();
    expect(container.textContent).toContain(NO_MATCH);
    // A state with courts shows no line.
    await choose('brief-court-state', 'delhi');
    expect(container.textContent).not.toContain(NO_MATCH);
  });

  it('never shows the no-match line for National, even for an empty list', async () => {
    routes[NATIONAL_COURTS] = { courts: [] };
    await mount({ templateId: 'consumer_complaint' });
    await pick('National Commission (NCDRC)');
    expect(paths()).toContain(NATIONAL_COURTS);
    expect(container.textContent).not.toContain(NO_MATCH);
  });

  it('a stored NCDRC court opens on National with the option still chosen', async () => {
    await mount({
      templateId: 'consumer_complaint',
      initial: { state: 'india', court_type: 'tribunal', court: 'ncdrc_delhi' },
    });
    expect(chip('National Commission (NCDRC)').getAttribute('aria-checked')).toBe('true');
    expect(sel('brief-court-state')).toBeNull();
    expect(sel('brief-court-court')!.value).toBe('ncdrc_delhi');
  });

  it('shows the missing flag when the court is needed', async () => {
    await mount({ templateId: 'consumer_complaint', missing: true });
    expect(container.textContent).toContain('Needed to continue');
  });
});

describe('CourtPicker, consumer_complaint keyboard and reload', () => {
  const STATE_LOOKUP = `/api/courts?${CONSUMER}&level=state&state=delhi`;

  it('two ArrowRights from District reach National, keep focus on the chip and announce', async () => {
    await mount({ templateId: 'consumer_complaint' });
    chip('District Commission').focus();
    await press(document.activeElement!, 'ArrowRight');
    expect(checkedNames()).toEqual(['State Commission']);
    expect(document.activeElement).toBe(chip('State Commission'));
    expect(live()).toBe('State select shown.');
    await press(document.activeElement!, 'ArrowRight');
    expect(checkedNames()).toEqual(['National Commission (NCDRC)']);
    expect(document.activeElement).toBe(chip('National Commission (NCDRC)'));
    expect(document.activeElement).not.toBe(sel('brief-court-court'));
    expect(live()).toBe('No state needed. Commission select shown.');
    expect(container.querySelector('[role="status"]')!.getAttribute('aria-live')).toBe('polite');
  });

  it.each([['Enter'], [' ']])(
    'key %j on a chip moves focus to the first new control',
    async (k) => {
      await mount({ templateId: 'consumer_complaint' });
      chip('District Commission').focus();
      await press(document.activeElement!, k);
      expect(checkedNames()).toEqual(['District Commission']);
      expect(document.activeElement).toBe(sel('brief-court-state'));
      chip('National Commission (NCDRC)').focus();
      await press(document.activeElement!, k);
      expect(document.activeElement).toBe(sel('brief-court-court'));
      chip('State Commission').focus();
      await press(document.activeElement!, k);
      expect(document.activeElement).toBe(sel('brief-court-state'));
    },
  );

  it('an arrow after a state was chosen still clears the state and court, and announces it', async () => {
    await mount({ templateId: 'consumer_complaint' });
    await pick('District Commission');
    await choose('brief-court-state', 'delhi');
    await choose('brief-court-court', 'dcdrc_new_delhi');
    chip('District Commission').focus();
    await press(document.activeElement!, 'ArrowRight');
    expect(last).toEqual({ state: null, court_type: 'consumer_commission', court: null });
    expect(sel('brief-court-state')!.value).toBe('');
    expect(sel('brief-court-court')!.value).toBe('');
    expect(sel('brief-court-court')!.disabled).toBe(true);
    expect(document.activeElement).toBe(chip('State Commission'));
    expect(live()).toBe('State and Commission cleared. State select shown.');
    await choose('brief-court-state', 'delhi');
    chip('State Commission').focus();
    await press(document.activeElement!, 'ArrowRight');
    expect(last).toEqual({ state: 'india', court_type: 'tribunal', court: null });
    expect(document.activeElement).toBe(chip('National Commission (NCDRC)'));
    expect(live()).toBe('State and Commission cleared. No state needed. Commission select shown.');
  });

  it('a saved District court reloads on District by asking which list it is on', async () => {
    await mount({
      templateId: 'consumer_complaint',
      initial: { state: 'delhi', court_type: 'consumer_commission', court: 'dcdrc_new_delhi' },
    });
    expect(paths()).toContain(STATE_LOOKUP);
    expect(checkedNames()).toEqual(['District Commission']);
    expect(paths()).toContain(DISTRICT_STATES);
    expect(sel('brief-court-state')!.value).toBe('delhi');
    expect(sel('brief-court-court')!.value).toBe('dcdrc_new_delhi');
  });

  it('a saved State court reloads on State', async () => {
    await mount({
      templateId: 'consumer_complaint',
      initial: { state: 'delhi', court_type: 'consumer_commission', court: 'scdrc_delhi' },
    });
    expect(checkedNames()).toEqual(['State Commission']);
    expect(sel('brief-court-court')!.value).toBe('scdrc_delhi');
  });

  it('when the level lookup fails, Retry repeats it and the level is restored', async () => {
    delete routes[STATE_LOOKUP];
    await mount({
      templateId: 'consumer_complaint',
      initial: { state: 'delhi', court_type: 'consumer_commission', court: 'scdrc_delhi' },
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector('[role="radio"]')).toBeNull();
    const lookups = () => paths().filter((p) => p === STATE_LOOKUP).length;
    expect(lookups()).toBe(1);
    routes[STATE_LOOKUP] = {
      courts: [{ courtId: 'scdrc_delhi', name: 'State Commission, Delhi' }],
    };
    const retry = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Retry',
    )!;
    act(() => retry.click());
    await flush();
    // The lookup and, once the level is known, the court list share this URL.
    expect(lookups()).toBeGreaterThan(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(checkedNames()).toEqual(['State Commission']);
    expect(sel('brief-court-court')!.value).toBe('scdrc_delhi');
  });
});

describe('CourtPicker, other templates', () => {
  it.each([['bail_regular'], [undefined]])(
    'templateId %p: court type select, old URLs without template, no level group',
    async (templateId) => {
      await mount({ templateId });
      expect(container.querySelector('[role="radiogroup"]')).toBeNull();
      expect(container.querySelector('[aria-live="polite"]')).toBeNull();
      expect(labelFor('brief-court-type')).toBe('Court type');
      expect(labelFor('brief-court-court')).toBe('Court');
      expect(sel('brief-court-type')!.disabled).toBe(true);
      expect(paths()).toEqual(['/api/courts/states']);
      await choose('brief-court-state', 'delhi');
      expect(onChange).toHaveBeenLastCalledWith({ state: 'delhi', court_type: null, court: null });
      expect(paths()).toContain('/api/courts/types?state=delhi');
      expect(optionTexts(sel('brief-court-type')!)).toEqual(['Choose', 'Sessions Court']);
      await choose('brief-court-type', 'sessions');
      expect(paths()).toContain('/api/courts?state=delhi&type=sessions');
      await choose('brief-court-court', 'tis_hazari');
      expect(onChange).toHaveBeenLastCalledWith({
        state: 'delhi',
        court_type: 'sessions',
        court: 'tis_hazari',
      });
      expect(paths().some((p) => p.includes('template='))).toBe(false);
      expect(paths().some((p) => p.includes('level='))).toBe(false);
    },
  );
});
