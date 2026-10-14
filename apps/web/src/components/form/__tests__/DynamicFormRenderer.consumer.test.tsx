/* eslint-disable @typescript-eslint/no-explicit-any */
// T-411 AC1-AC6, AC8: DynamicFormRenderer's consumer court block, and bail_regular unchanged.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import DynamicFormRenderer, { TemplateConfig } from '../DynamicFormRenderer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The origin comes from NEXT_PUBLIC_API_URL, which differs by env; compare paths only.
const strip = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');
const NCDRC_LABEL = 'National Consumer Disputes Redressal Commission (NCDRC), New Delhi';
const NO_MATCH = 'No Commission is listed for this state yet.';
const Q = 'template=consumer_complaint';

type FieldPatch = Record<string, unknown>;
function configOf(
  templateId: string,
  patch: { state?: FieldPatch; court?: FieldPatch } = {},
): TemplateConfig {
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
              ...patch.state,
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
              ...patch.court,
            },
          ],
        },
      ],
    },
  } as unknown as TemplateConfig;
}

let routes: Record<string, unknown>;
let held: Record<string, () => void>;
let holdPaths: Set<string>;
let container: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;

beforeEach(() => {
  held = {};
  holdPaths = new Set();
  routes = {
    [`/api/courts/states?${Q}&level=district`]: {
      states: [
        { id: 'delhi', name: 'Delhi' },
        { id: 'kerala', name: 'Kerala' },
      ],
    },
    [`/api/courts/states?${Q}&level=state`]: { states: [{ id: 'delhi', name: 'Delhi' }] },
    [`/api/courts?${Q}&level=district&state=delhi`]: {
      courts: [{ courtId: 'dcdrc_new_delhi', name: 'District Commission, New Delhi' }],
    },
    [`/api/courts?${Q}&level=district&state=kerala`]: { courts: [] },
    [`/api/courts?${Q}&level=state&state=delhi`]: {
      courts: [{ courtId: 'scdrc_delhi', name: 'State Commission, Delhi' }],
    },
    [`/api/courts?${Q}&level=national`]: {
      courts: [{ courtId: 'ncdrc_delhi', name: 'NCDRC (record name)' }],
    },
    '/api/courts/states': { states: [{ id: 'delhi', name: 'Delhi' }] },
    '/api/courts/types?state=delhi': { types: [{ id: 'sessions', label: 'Sessions Court' }] },
    '/api/courts?state=delhi&type=sessions': {
      courts: [{ courtId: 'tis_hazari', name: 'Tis Hazari Sessions Court' }],
    },
  };
  fetchMock = jest.fn(async (url: string) => {
    const path = strip(url);
    if (holdPaths.has(path)) await new Promise<void>((r) => (held[path] = r));
    return { ok: true, json: async () => routes[path] ?? {} };
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
  for (let i = 0; i < 5; i++) await act(async () => {});
}
async function mount(
  templateId: string,
  onSubmit: jest.Mock = jest.fn(),
  patch: { state?: FieldPatch; court?: FieldPatch } = {},
) {
  act(() => {
    root.render(
      <DynamicFormRenderer
        config={configOf(templateId, patch)}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        inkCost={1}
      />,
    );
  });
  await flush();
}
const radios = () => Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]'));
const chip = (name: string) => radios().find((c) => c.textContent === name) as HTMLElement;
const sel = (id: string) => container.querySelector<HTMLSelectElement>(`#${id}`);
const live = () => container.querySelector('[aria-live="polite"]')!.textContent;
const optionTexts = (s: HTMLSelectElement) => Array.from(s.options).map((o) => o.textContent);
async function pick(name: string) {
  act(() => chip(name).click());
  await flush();
}
async function press(el: Element, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
  await flush();
}
const checkedNames = () =>
  radios()
    .filter((c) => c.getAttribute('aria-checked') === 'true')
    .map((c) => c.textContent);
async function choose(id: string, value: string) {
  const s = sel(id)!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(s, value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

describe('DynamicFormRenderer, consumer_complaint court block', () => {
  it('shows the level group first, labelled, and replaces state / type / court fields', async () => {
    await mount('consumer_complaint');
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    const label = document.getElementById(group.getAttribute('aria-labelledby')!)!;
    expect(label.textContent).toBe('Which Commission?');
    expect(radios().map((c) => c.textContent)).toEqual([
      'District Commission',
      'State Commission',
      'National Commission (NCDRC)',
    ]);
    expect(radios().map((c) => c.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ]);
    expect(radios().map((c) => c.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    // Exactly one group, and no select until a level is chosen.
    expect(container.querySelectorAll('[role="radiogroup"]')).toHaveLength(1);
    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent).not.toContain('Court Type');
    // The state list is not fetched until a level is chosen.
    expect(paths().filter((p) => p.startsWith('/api/courts/states'))).toEqual([]);
  });

  it('District: state select then "Consumer Commission" select, template URLs', async () => {
    await mount('consumer_complaint');
    await pick('District Commission');
    expect(paths()).toContain(`/api/courts/states?${Q}&level=district`);
    // The required marker is a child span, so the label reads 'State*' / 'Consumer Commission*'.
    const stateLabel = container.querySelector('label[for="dfr-consumer-state"]')!;
    const courtLabel = container.querySelector('label[for="dfr-consumer-court"]')!;
    expect(stateLabel.textContent).toBe('State*');
    expect(stateLabel.textContent!.startsWith('State')).toBe(true);
    expect(stateLabel.querySelector('span.text-red-400')!.textContent).toBe('*');
    expect(courtLabel.textContent).toBe('Consumer Commission*');
    expect(courtLabel.querySelector('span.text-red-400')!.textContent).toBe('*');
    expect(optionTexts(sel('dfr-consumer-state')!)).toEqual(['Choose', 'Delhi', 'Kerala']);
    expect(sel('dfr-consumer-court')!.disabled).toBe(true);
    await choose('dfr-consumer-state', 'delhi');
    expect(paths()).toContain(`/api/courts?${Q}&level=district&state=delhi`);
    expect(optionTexts(sel('dfr-consumer-court')!)).toEqual([
      'Choose',
      'District Commission, New Delhi',
    ]);
  });

  it('State level uses level=state', async () => {
    await mount('consumer_complaint');
    await pick('State Commission');
    expect(paths()).toContain(`/api/courts/states?${Q}&level=state`);
    await choose('dfr-consumer-state', 'delhi');
    expect(paths()).toContain(`/api/courts?${Q}&level=state&state=delhi`);
  });

  it('never fetches court types in consumer mode', async () => {
    await mount('consumer_complaint');
    await pick('District Commission');
    await choose('dfr-consumer-state', 'delhi');
    await pick('National Commission (NCDRC)');
    await pick('State Commission');
    await choose('dfr-consumer-state', 'delhi');
    expect(paths().some((p) => p.includes('/api/courts/types'))).toBe(false);
  });

  it('National: no state select, one option under Choose, never pre-selected', async () => {
    await mount('consumer_complaint');
    await pick('National Commission (NCDRC)');
    expect(sel('dfr-consumer-state')).toBeNull();
    expect(paths()).toContain(`/api/courts?${Q}&level=national`);
    expect(paths().some((p) => p.startsWith('/api/courts/states'))).toBe(false);
    const court = sel('dfr-consumer-court')!;
    expect(court.disabled).toBe(false);
    expect(optionTexts(court)).toEqual(['Choose', NCDRC_LABEL]);
    expect(court.value).toBe('');
  });

  it('submits state india / tribunal for NCDRC and consumer_commission for District', async () => {
    const onSubmit = jest.fn();
    await mount('consumer_complaint', onSubmit);
    const submit = () =>
      act(() =>
        Array.from(container.querySelectorAll('button'))
          .find((b) => /^Generate document/.test(b.textContent ?? ''))!
          .click(),
      );
    await pick('National Commission (NCDRC)');
    await choose('dfr-consumer-court', 'ncdrc_delhi');
    submit();
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: 'india',
        court_type: 'tribunal',
        court_name: 'ncdrc_delhi',
      }),
    );
    await pick('District Commission');
    await choose('dfr-consumer-state', 'delhi');
    await choose('dfr-consumer-court', 'dcdrc_new_delhi');
    submit();
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: 'delhi',
        court_type: 'consumer_commission',
        court_name: 'dcdrc_new_delhi',
      }),
    );
  });

  it('changing the level clears the state and court', async () => {
    await mount('consumer_complaint');
    await pick('District Commission');
    await choose('dfr-consumer-state', 'delhi');
    await choose('dfr-consumer-court', 'dcdrc_new_delhi');
    expect(sel('dfr-consumer-court')!.value).toBe('dcdrc_new_delhi');
    await pick('State Commission');
    expect(sel('dfr-consumer-state')!.value).toBe('');
    expect(sel('dfr-consumer-court')!.value).toBe('');
    expect(sel('dfr-consumer-court')!.disabled).toBe(true);
    await pick('National Commission (NCDRC)');
    await choose('dfr-consumer-court', 'ncdrc_delhi');
    await pick('District Commission');
    expect(sel('dfr-consumer-state')!.value).toBe('');
    expect(sel('dfr-consumer-court')!.value).toBe('');
  });

  it('moves focus to the first new control', async () => {
    await mount('consumer_complaint');
    await pick('District Commission');
    expect(document.activeElement).toBe(sel('dfr-consumer-state'));
    await pick('National Commission (NCDRC)');
    expect(document.activeElement).toBe(sel('dfr-consumer-court'));
    await pick('State Commission');
    expect(document.activeElement).toBe(sel('dfr-consumer-state'));
  });

  it('announces in a polite live region', async () => {
    await mount('consumer_complaint');
    expect(live()).toBe('');
    await pick('District Commission');
    expect(live()).toBe('State select shown.');
    await choose('dfr-consumer-state', 'delhi');
    expect(live()).toBe('Commission select shown.');
    await pick('National Commission (NCDRC)');
    expect(live()).toBe('State and Commission cleared. No state needed. Commission select shown.');
    await pick('District Commission');
    expect(live()).toBe('State select shown.');
  });

  it('shows the no-match line only after an empty list has loaded', async () => {
    await mount('consumer_complaint');
    await pick('District Commission');
    expect(container.textContent).not.toContain(NO_MATCH);
    holdPaths.add(`/api/courts?${Q}&level=district&state=kerala`);
    await choose('dfr-consumer-state', 'kerala');
    expect(container.textContent).not.toContain(NO_MATCH);
    act(() => held[`/api/courts?${Q}&level=district&state=kerala`]());
    await flush();
    expect(container.textContent).toContain(NO_MATCH);
    await choose('dfr-consumer-state', 'delhi');
    expect(container.textContent).not.toContain(NO_MATCH);
  });

  it('never shows the no-match line for National', async () => {
    routes[`/api/courts?${Q}&level=national`] = { courts: [] };
    await mount('consumer_complaint');
    await pick('National Commission (NCDRC)');
    expect(paths()).toContain(`/api/courts?${Q}&level=national`);
    expect(container.textContent).not.toContain(NO_MATCH);
  });
});

describe('DynamicFormRenderer, consumer_complaint keyboard', () => {
  it('two ArrowRights from District reach National, keep focus on the chip and announce', async () => {
    await mount('consumer_complaint');
    chip('District Commission').focus();
    await press(document.activeElement!, 'ArrowRight');
    expect(checkedNames()).toEqual(['State Commission']);
    expect(document.activeElement).toBe(chip('State Commission'));
    expect(live()).toBe('State select shown.');
    await press(document.activeElement!, 'ArrowRight');
    expect(checkedNames()).toEqual(['National Commission (NCDRC)']);
    expect(document.activeElement).toBe(chip('National Commission (NCDRC)'));
    expect(document.activeElement).not.toBe(sel('dfr-consumer-court'));
    expect(live()).toBe('No state needed. Commission select shown.');
    expect(container.querySelector('[role="status"]')!.getAttribute('aria-live')).toBe('polite');
  });

  it.each([['Enter'], [' ']])(
    'key %j on a chip moves focus to the first new control',
    async (k) => {
      await mount('consumer_complaint');
      chip('District Commission').focus();
      await press(document.activeElement!, k);
      expect(checkedNames()).toEqual(['District Commission']);
      expect(document.activeElement).toBe(sel('dfr-consumer-state'));
      chip('National Commission (NCDRC)').focus();
      await press(document.activeElement!, k);
      expect(document.activeElement).toBe(sel('dfr-consumer-court'));
      chip('State Commission').focus();
      await press(document.activeElement!, k);
      expect(document.activeElement).toBe(sel('dfr-consumer-state'));
    },
  );

  it('an arrow after a state was chosen still clears the state and court, and announces it', async () => {
    await mount('consumer_complaint');
    await pick('District Commission');
    await choose('dfr-consumer-state', 'delhi');
    await choose('dfr-consumer-court', 'dcdrc_new_delhi');
    chip('District Commission').focus();
    await press(document.activeElement!, 'ArrowRight');
    expect(sel('dfr-consumer-state')!.value).toBe('');
    expect(sel('dfr-consumer-court')!.value).toBe('');
    expect(sel('dfr-consumer-court')!.disabled).toBe(true);
    expect(document.activeElement).toBe(chip('State Commission'));
    expect(live()).toBe('State and Commission cleared. State select shown.');
    await choose('dfr-consumer-state', 'delhi');
    chip('State Commission').focus();
    await press(document.activeElement!, 'ArrowRight');
    expect(document.activeElement).toBe(chip('National Commission (NCDRC)'));
    expect(sel('dfr-consumer-court')!.value).toBe('');
    expect(live()).toBe('State and Commission cleared. No state needed. Commission select shown.');
  });
});

describe('DynamicFormRenderer, consumer_complaint states fetch and required fields', () => {
  it('drops a stale states response when the level changes quickly', async () => {
    const districtStates = `/api/courts/states?${Q}&level=district`;
    holdPaths.add(districtStates);
    await mount('consumer_complaint');
    await pick('District Commission');
    // District list still in flight; the user moves on to State.
    await pick('State Commission');
    expect(optionTexts(sel('dfr-consumer-state')!)).toEqual(['Choose', 'Delhi']);
    // The first (District) response arrives after the second: Kerala must not appear.
    act(() => held[districtStates]());
    await flush();
    expect(checkedNames()).toEqual(['State Commission']);
    expect(optionTexts(sel('dfr-consumer-state')!)).toEqual(['Choose', 'Delhi']);
  });

  it('shows the * marker on State and Consumer Commission when required', async () => {
    await mount('consumer_complaint');
    await pick('District Commission');
    for (const id of ['dfr-consumer-state', 'dfr-consumer-court']) {
      expect(container.querySelector(`label[for="${id}"] span.text-red-400`)!.textContent).toBe(
        '*',
      );
    }
  });

  it('shows no marker when the fields are not required', async () => {
    await mount('consumer_complaint', jest.fn(), {
      state: { required: false },
      court: { required: false },
    });
    await pick('District Commission');
    expect(container.querySelector('label[for="dfr-consumer-state"] span')).toBeNull();
    expect(container.querySelector('label[for="dfr-consumer-court"] span')).toBeNull();
    expect(container.querySelector('label[for="dfr-consumer-state"]')!.textContent).toBe('State');
    expect(container.querySelector('label[for="dfr-consumer-court"]')!.textContent).toBe(
      'Consumer Commission',
    );
  });

  it('shows the field error under the State and Consumer Commission selects', async () => {
    await mount('consumer_complaint', jest.fn(), {
      state: { validation_pattern: '^delhi$', validation_message: 'State not accepted' },
      court: { validation_pattern: '^none$', validation_message: 'Commission not accepted' },
    });
    await pick('District Commission');
    expect(container.textContent).not.toContain('State not accepted');
    await choose('dfr-consumer-state', 'kerala');
    const stateErr = Array.from(container.querySelectorAll('p.text-red-500')).find(
      (p) => p.textContent === 'State not accepted',
    )!;
    expect(stateErr).toBeDefined();
    expect(sel('dfr-consumer-state')!.parentElement!.contains(stateErr)).toBe(true);
    await choose('dfr-consumer-state', 'delhi');
    expect(container.textContent).not.toContain('State not accepted');
    await choose('dfr-consumer-court', 'dcdrc_new_delhi');
    const courtErr = Array.from(container.querySelectorAll('p.text-red-500')).find(
      (p) => p.textContent === 'Commission not accepted',
    )!;
    expect(courtErr).toBeDefined();
    expect(sel('dfr-consumer-court')!.parentElement!.contains(courtErr)).toBe(true);
  });

  it('shows the field help under the selects while there is no error', async () => {
    await mount('consumer_complaint', jest.fn(), {
      state: { help: 'State help' },
      court: { help: 'Court help' },
    });
    await pick('District Commission');
    expect(sel('dfr-consumer-state')!.parentElement!.textContent).toContain('State help');
    expect(sel('dfr-consumer-court')!.parentElement!.textContent).toContain('Court help');
  });
});

describe('DynamicFormRenderer, bail_regular unchanged', () => {
  it('has no level group, fetches types, and uses the old URLs without template', async () => {
    await mount('bail_regular');
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
    expect(container.textContent).not.toContain('Which Commission?');
    expect(paths()).toEqual(['/api/courts/states']);
    // The old State field is a searchable dropdown: open it, then pick Delhi.
    const trigger = Array.from(container.querySelectorAll<HTMLElement>('div.cursor-pointer'))[0];
    act(() => trigger.click());
    const delhi = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delhi',
    )!;
    act(() => delhi.click());
    await flush();
    expect(paths()).toContain('/api/courts/types?state=delhi');
    expect(paths().some((p) => p.includes('template=') || p.includes('level='))).toBe(false);
  });
});
