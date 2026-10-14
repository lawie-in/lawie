// T-432: DynamicFormRenderer can start from a snapshot (initialValues, initialStep, initialLevel)
// and reports every change (onStateChange), so the page can show the form again as it was left.
// Also AC4: the button row stacks at phone width and is a row from sm up.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import DynamicFormRenderer, { TemplateConfig } from '../DynamicFormRenderer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

const textStep = (n: number, id: string, extra: Record<string, unknown> = {}) => ({
  step: n,
  title: `Step ${n}`,
  fields: [{ field_id: id, label: id.toUpperCase(), type: 'text', required: false, ...extra }],
});
const config = {
  template_id: 'config_tpl',
  display_name: 'Test form',
  supported_languages: ['en'],
  form_schema: {
    steps: [textStep(1, 'a', { default: 'dflt' }), textStep(2, 'b'), textStep(3, 'c')],
  },
} as unknown as TemplateConfig;

const consumerConfig = {
  template_id: 'consumer_complaint',
  display_name: 'Consumer',
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

let container: HTMLDivElement;
let root: Root;
let setItem: jest.SpyInstance;

beforeEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ states: [], courts: [], types: [] }),
  }));
  setItem = jest.spyOn(Storage.prototype, 'setItem');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

type Props = Partial<React.ComponentProps<typeof DynamicFormRenderer>>;
function mount(props: Props = {}, cfg: TemplateConfig = config) {
  act(() => {
    root.render(
      <DynamicFormRenderer config={cfg} onSubmit={jest.fn()} onCancel={jest.fn()} {...props} />,
    );
  });
}
const anyInput = () => container.querySelector('input[type="text"]') as HTMLInputElement;
const heading = () => container.textContent ?? '';
function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const btn = (re: RegExp) =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    re.test(b.textContent ?? ''),
  ) as HTMLButtonElement;
const next = () => act(() => btn(/^Next/).click());
const back = () => act(() => btn(/^Back/).click());

describe('DynamicFormRenderer snapshot props (T-432)', () => {
  it('no props: schema defaults, step 1, as before', () => {
    mount();
    expect(anyInput().value).toBe('dflt');
    expect(heading()).toContain('Step 1');
    expect(btn(/^Cancel/)).toBeDefined();
  });

  it('initialValues are merged over the defaults', () => {
    mount({ initialValues: { a: 'typed' } });
    expect(anyInput().value).toBe('typed');
  });

  it('keeps defaults for fields the snapshot lacks', () => {
    mount({ initialValues: { b: 'bee' }, initialStep: 1 });
    expect(anyInput().value).toBe('bee');
    back();
    expect(anyInput().value).toBe('dflt');
  });

  it('initialStep starts on that step', () => {
    mount({ initialValues: { b: 'bee' }, initialStep: 1 });
    expect(anyInput().value).toBe('bee');
    expect(btn(/^Back/)).toBeDefined();
    expect(btn(/^Cancel/)).toBeUndefined();
  });

  it.each([
    [99, 'last'],
    [-3, 'first'],
    [1.5, 'first'],
    [Number.NaN, 'first'],
  ])('initialStep %p is clamped or ignored (%s step)', (initialStep, where) => {
    mount({ initialStep });
    if (where === 'last') {
      expect(btn(/^Generate document/)).toBeDefined();
      expect(btn(/^Next/)).toBeUndefined();
    } else {
      expect(btn(/^Cancel/)).toBeDefined();
    }
  });

  it('initialStep is read on mount only', () => {
    mount({ initialStep: 1 });
    mount({ initialStep: 0 });
    expect(btn(/^Back/)).toBeDefined();
  });

  it('initialLevel selects the Commission level on the consumer template', () => {
    mount({ initialLevel: 'state' }, consumerConfig);
    const chip = (l: string) => container.querySelector(`#dfr-consumer-level-${l}`);
    expect(chip('state')?.getAttribute('aria-checked')).toBe('true');
    expect(chip('district')?.getAttribute('aria-checked')).toBe('false');
  });

  it('initialLevel is ignored on other templates', () => {
    const onStateChange = jest.fn();
    mount({ initialLevel: 'state', onStateChange });
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(onStateChange).toHaveBeenLastCalledWith(expect.any(Object), 0, null);
  });
});

describe('DynamicFormRenderer onStateChange (T-432)', () => {
  it('reports the answers on typing', () => {
    const onStateChange = jest.fn();
    mount({ onStateChange });
    type(anyInput(), 'hello');
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ a: 'hello' }),
      0,
      null,
    );
  });

  it('reports a step change, with the answers', () => {
    const onStateChange = jest.fn();
    mount({ onStateChange });
    type(anyInput(), 'hello');
    next();
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ a: 'hello' }),
      1,
      null,
    );
    next();
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ a: 'hello' }),
      2,
      null,
    );
    back();
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ a: 'hello' }),
      1,
      null,
    );
  });

  it('reports the level on a consumer template', () => {
    const onStateChange = jest.fn();
    mount({ onStateChange }, consumerConfig);
    act(() => (container.querySelector('#dfr-consumer-level-national') as HTMLElement).click());
    expect(onStateChange).toHaveBeenLastCalledWith(expect.any(Object), 0, 'national');
  });

  it('a new callback identity on re-render does not re-fire it', () => {
    const first = jest.fn();
    mount({ onStateChange: first });
    const calls = first.mock.calls.length;
    const second = jest.fn();
    mount({ onStateChange: second });
    expect(first.mock.calls.length).toBe(calls);
    expect(second).not.toHaveBeenCalled();
    type(anyInput(), 'x');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first.mock.calls.length).toBe(calls);
  });

  it('a snapshot fed back in is reproduced exactly (round trip)', () => {
    const onStateChange = jest.fn();
    mount({ onStateChange });
    type(anyInput(), 'one');
    next();
    type(anyInput(), 'two');
    const [values, step, level] = onStateChange.mock.calls.at(-1)!;
    act(() => root.unmount());
    root = createRoot(container);
    mount({ initialValues: values, initialStep: step, initialLevel: level });
    expect(anyInput().value).toBe('two');
    back();
    expect(anyInput().value).toBe('one');
  });

  it('writes nothing to browser storage', () => {
    mount({ onStateChange: jest.fn() });
    type(anyInput(), 'secret case detail');
    next();
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('DynamicFormRenderer button row (T-432 AC4)', () => {
  it('stacks at phone width (flex-col-reverse, gap-3) and is a row from sm up', () => {
    mount();
    const row = btn(/^Cancel/).parentElement as HTMLElement;
    const cls = row.className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        'flex',
        'flex-col-reverse',
        'gap-3',
        'sm:flex-row',
        'sm:justify-between',
      ]),
    );
    expect(cls).not.toContain('flex-row');
  });
});
