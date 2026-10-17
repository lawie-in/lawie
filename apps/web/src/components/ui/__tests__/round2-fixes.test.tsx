import fs from 'fs';
import path from 'path';

import { act } from 'react';

import { LawieMark } from '@/components/shell';
import {
  Input,
  MOBILE_CAP_QUERY,
  Skeleton,
  STILL_WORKING_AFTER_MS,
  Textarea,
  ToastProvider,
  TOAST_REMOVE_AFTER_MS,
  useMediaQuery,
  usePageVisible,
  useToast,
} from '@/components/ui';

import { cleanupMounted, mount, q, qa } from './nl-test-utils';

const WEB_ROOT = path.resolve(__dirname, '../../../..');

afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------- 1. globals.css layering
describe('globals.css cascade layering (source guard)', () => {
  const css = fs
    .readFileSync(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  interface Block {
    prelude: string;
    body: string;
  }
  /** Top-level blocks (brace depth 0) with their raw body. */
  function topLevel(src: string): Block[] {
    const out: Block[] = [];
    let depth = 0;
    let start = 0;
    let bodyStart = 0;
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '{') {
        if (depth === 0) {
          bodyStart = i + 1;
        }
        depth++;
      } else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          out.push({
            prelude: src.slice(start, bodyStart - 1).trim(),
            body: src.slice(bodyStart, i),
          });
          start = i + 1;
        }
      }
    }
    return out;
  }
  const blocks = topLevel(css);

  it('puts .nl-root and the night .nl-root rule inside @layer components', () => {
    const layers = blocks.filter((b) => /^@layer\s+components$/.test(b.prelude));
    expect(layers.length).toBeGreaterThan(0);
    const layered = layers.map((b) => b.body).join('\n');
    expect(layered).toMatch(/(^|\s)\.nl-root\s*\{/);
    expect(layered).toMatch(/html\[data-theme='night'\]\s+\.nl-root\s*\{/);
  });

  it('has no unlayered .nl-root rule', () => {
    const unlayered = blocks.filter((b) => !b.prelude.startsWith('@'));
    expect(unlayered.filter((b) => /\.nl-root/.test(b.prelude))).toEqual([]);
  });

  it('has no unlayered rule on an .nl-* selector (only .nl token blocks and @keyframes are unlayered)', () => {
    const unlayered = blocks.filter((b) => !b.prelude.startsWith('@'));
    expect(unlayered.filter((b) => /\.nl-[a-z]/.test(b.prelude)).map((b) => b.prelude)).toEqual([]);
  });

  it('unlayered .nl token blocks only declare custom properties', () => {
    const tokens = blocks.filter(
      (b) => !b.prelude.startsWith('@') && /\.nl(?![-\w])/.test(b.prelude),
    );
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    for (const b of tokens) {
      const props = b.body
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => d.split(':')[0].trim());
      const nonVars = props.filter((p) => !p.startsWith('--'));
      expect({ selector: b.prelude, nonVars }).toEqual({ selector: b.prelude, nonVars: [] });
    }
  });

  it('the only top-level at-rules are @tailwind, @layer and @keyframes', () => {
    const at = blocks.filter((b) => b.prelude.startsWith('@')).map((b) => b.prelude.split(/\s/)[0]);
    expect(new Set(at)).toEqual(new Set(['@tailwind', '@layer', '@keyframes']));
  });
});

// ---------------------------------------------------------------- 2. package.json guard
describe('apps/web/package.json dependency guard', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(WEB_ROOT, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...(pkg.devDependencies ?? {}) };

  it('pins react-popover to ~1.1.15', () => {
    expect(pkg.dependencies['@radix-ui/react-popover']).toBe('~1.1.15');
  });

  it('has only the four approved Radix packages and no cmdk', () => {
    const radix = Object.keys(all)
      .filter((n) => n.startsWith('@radix-ui/'))
      .sort();
    expect(radix).toEqual([
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-toast',
    ]);
    expect(all).not.toHaveProperty('cmdk');
  });
});

// ---------------------------------------------------------------- 3. Field classes
describe('Field boxed vs underline classes', () => {
  const cls = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);

  it.each([
    ['Input', (a: 'boxed' | 'underline') => <Input aria-label="x" appearance={a} />, 'input'],
    [
      'Textarea',
      (a: 'boxed' | 'underline') => <Textarea aria-label="x" appearance={a} />,
      'textarea',
    ],
  ])('%s: focus adds 1px border and takes it from bottom padding', (_n, make, sel) => {
    for (const a of ['boxed', 'underline'] as const) {
      const { container } = mount(make(a));
      const c = cls(q(sel, container));
      expect(c).toContain('focus:border-b-2');
      expect(c).toContain('focus:pb-[7px]');
    }
  });

  it('bg-transparent only on the underline style; boxed uses the card fill', () => {
    const u = cls(q('input', mount(<Input aria-label="u" appearance="underline" />).container));
    const b = cls(q('input', mount(<Input aria-label="b" appearance="boxed" />).container));
    expect(u).toContain('bg-transparent');
    expect(u).not.toContain('bg-nl-card');
    expect(b).not.toContain('bg-transparent');
    expect(b).toContain('bg-nl-card');
  });
});

// ---------------------------------------------------------------- 4. stable subscriptions
describe('motion hooks keep stable subscriptions across renders', () => {
  function Probe({ tick }: { tick: number }) {
    const a = useMediaQuery(MOBILE_CAP_QUERY);
    const v = usePageVisible();
    return <output data-tick={tick} data-a={String(a)} data-v={String(v)} />;
  }

  it('re-rendering does not re-add or remove matchMedia or visibilitychange listeners', () => {
    const add = jest.fn();
    const remove = jest.fn();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: add,
        removeEventListener: remove,
      }),
    });
    const docAdd = jest.spyOn(document, 'addEventListener');
    const docRemove = jest.spyOn(document, 'removeEventListener');
    const visCalls = (spy: jest.SpyInstance) =>
      spy.mock.calls.filter((c) => c[0] === 'visibilitychange').length;

    const m = mount(<Probe tick={0} />);
    const addAfterMount = add.mock.calls.length;
    const visAddAfterMount = visCalls(docAdd);
    expect(addAfterMount).toBe(1);
    expect(visAddAfterMount).toBe(1);

    for (let i = 1; i <= 5; i++) m.rerender(<Probe tick={i} />);

    expect(add).toHaveBeenCalledTimes(addAfterMount);
    expect(remove).not.toHaveBeenCalled();
    expect(visCalls(docAdd)).toBe(visAddAfterMount);
    expect(visCalls(docRemove)).toBe(0);

    m.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(visCalls(docRemove)).toBe(1);
  });
});

// ---------------------------------------------------------------- 5. Skeleton live region
describe('Skeleton live region', () => {
  beforeEach(() => jest.useFakeTimers());

  it('role=status exists and is empty from first render, then fills the same node after 8s', () => {
    const { container } = mount(<Skeleton />);
    const node = q('[role=status]', container);
    expect(node).not.toBeNull();
    expect(node!.textContent).toBe('');
    expect(STILL_WORKING_AFTER_MS).toBe(8000);

    act(() => {
      jest.advanceTimersByTime(STILL_WORKING_AFTER_MS - 1);
    });
    expect(q('[role=status]', container)!.textContent).toBe('');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    const after = q('[role=status]', container);
    expect(after).toBe(node);
    expect(after!.textContent).toBe('Still working…');
    expect(qa('[role=status]', container)).toHaveLength(1);
  });

  it('honours a custom slowAfterMs and slowText in the same node', () => {
    const { container } = mount(<Skeleton slowText="Hang on" slowAfterMs={1000} />);
    const node = q('[role=status]', container);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(q('[role=status]', container)).toBe(node);
    expect(node!.textContent).toBe('Hang on');
  });

  it('slowText="" renders no live region at all', () => {
    const { container } = mount(<Skeleton slowText="" />);
    expect(q('[role=status]', container)).toBeNull();
  });
});

// ---------------------------------------------------------------- 6. LawieMark + Toast removal
describe('LawieMark root class', () => {
  it('has the nl class so tokens resolve outside a themed ancestor', () => {
    const { container } = mount(<LawieMark />);
    const root = container.firstElementChild!;
    expect(root.classList.contains('nl')).toBe(true);
  });
});

describe('Toast removal timer', () => {
  let api!: ReturnType<typeof useToast>;
  function Grab() {
    api = useToast();
    return null;
  }
  const mountToasts = () =>
    mount(
      <ToastProvider closeLabel="Dismiss">
        <Grab />
      </ToastProvider>,
    );

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    jest.useFakeTimers();
    // Pretend an exit animation is running so Radix Presence waits for animationend
    // (which never fires in this test), leaving only our timer to remove the toast.
    const real = window.getComputedStyle.bind(window);
    jest
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) => {
        const style = real(el, pseudo);
        return new Proxy(style, {
          get: (t, p) =>
            p === 'animationName'
              ? el.getAttribute('data-state') === 'closed'
                ? 'nl-toast-out'
                : 'nl-toast-in'
              : Reflect.get(t, p),
        }) as CSSStyleDeclaration;
      });
  });

  it('exports TOAST_REMOVE_AFTER_MS = 300', () => {
    expect(TOAST_REMOVE_AFTER_MS).toBe(300);
  });

  it('removes a dismissed toast from the list after 300ms without animationend', () => {
    mountToasts();
    let id = 0;
    act(() => {
      id = api.show({ kind: 'error', message: 'Gone soon' });
    });
    expect(document.body.textContent).toContain('Gone soon');
    act(() => api.dismiss(id));
    act(() => {
      jest.advanceTimersByTime(TOAST_REMOVE_AFTER_MS - 1);
    });
    expect(document.body.textContent).toContain('Gone soon');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.body.textContent).not.toContain('Gone soon');
  });

  it('dismissing twice schedules one removal and leaves other toasts alone', () => {
    mountToasts();
    let a = 0;
    act(() => {
      a = api.show({ kind: 'error', message: 'AAA' });
      api.show({ kind: 'error', message: 'BBB' });
    });
    act(() => api.dismiss(a));
    act(() => api.dismiss(a));
    act(() => {
      jest.advanceTimersByTime(TOAST_REMOVE_AFTER_MS);
    });
    expect(document.body.textContent).not.toContain('AAA');
    expect(document.body.textContent).toContain('BBB');
  });

  it('clears pending removal timers on unmount, with no state update afterwards', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = mountToasts();
    let id = 0;
    act(() => {
      id = api.show({ kind: 'error', message: 'Bye' });
    });
    act(() => api.dismiss(id));
    const before = jest.getTimerCount();
    expect(before).toBeGreaterThan(0);
    m.unmount();
    expect(jest.getTimerCount()).toBeLessThan(before);
    act(() => {
      jest.advanceTimersByTime(TOAST_REMOVE_AFTER_MS * 3);
    });
    expect(jest.getTimerCount()).toBe(0);
    expect(err).not.toHaveBeenCalled();
  });
});
