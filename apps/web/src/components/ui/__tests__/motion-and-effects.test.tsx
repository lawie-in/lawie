import { act } from 'react';

import {
  clampLevel,
  DustMotes,
  FINE_POINTER_DESKTOP_QUERY,
  Inkwell,
  INKWELL_REDUCED_LEVEL,
  Lamp,
  MOBILE_CAP_QUERY,
  REDUCED_MOTION_QUERY,
  Seal,
  ToastProvider,
  TOAST_AUTO_DISMISS_MS,
  useAmbientMotionAllowed,
  useFinePointerDesktop,
  useMobileCap,
  useMotionAllowed,
  usePageVisible,
  usePrefersReducedMotion,
  useToast,
  type ToastOptions,
} from '@/components/ui';

import { cleanupMounted, click, mount, q, qa, stubMatchMedia } from './nl-test-utils';

afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
});

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
afterEach(() => setVisibility('visible'));

function Hooks() {
  return (
    <output
      data-testid="h"
      data-reduced={String(usePrefersReducedMotion())}
      data-motion={String(useMotionAllowed())}
      data-desktop={String(useFinePointerDesktop())}
      data-mobile={String(useMobileCap())}
      data-ambient={String(useAmbientMotionAllowed())}
      data-visible={String(usePageVisible())}
    />
  );
}
const h = () => (q('[data-testid=h]') as HTMLElement).dataset;

describe('motion hooks', () => {
  it('query strings encode the spec gates (>=900px and fine pointer; mobile cap)', () => {
    expect(FINE_POINTER_DESKTOP_QUERY).toBe('(pointer: fine) and (min-width: 900px)');
    expect(MOBILE_CAP_QUERY).toContain('max-width: 640px');
    expect(MOBILE_CAP_QUERY).toContain('not all and (pointer: fine)');
  });

  it('desktop with a fine pointer and no reduced motion allows ambient motion', () => {
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: true });
    mount(<Hooks />);
    expect(h().desktop).toBe('true');
    expect(h().reduced).toBe('false');
    expect(h().motion).toBe('true');
    expect(h().ambient).toBe('true');
    expect(h().mobile).toBe('false');
  });

  it('reduced motion blocks ambient motion even on desktop', () => {
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: true, [REDUCED_MOTION_QUERY]: true });
    mount(<Hooks />);
    expect(h().reduced).toBe('true');
    expect(h().motion).toBe('false');
    expect(h().ambient).toBe('false');
  });

  it('a narrow or coarse-pointer device blocks ambient motion; the mobile cap reports true', () => {
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: false, [MOBILE_CAP_QUERY]: true });
    mount(<Hooks />);
    expect(h().desktop).toBe('false');
    expect(h().ambient).toBe('false');
    expect(h().mobile).toBe('true');
  });

  it('updates live when the media query changes', () => {
    const mm = stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: false });
    mount(<Hooks />);
    expect(h().ambient).toBe('false');
    mm.set(FINE_POINTER_DESKTOP_QUERY, true);
    expect(h().ambient).toBe('true');
    mm.set(REDUCED_MOTION_QUERY, true);
    expect(h().ambient).toBe('false');
  });

  it('without matchMedia everything falls back to the safe server values', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    mount(<Hooks />);
    expect(h().reduced).toBe('false');
    expect(h().desktop).toBe('false');
    expect(h().ambient).toBe('false');
  });

  it('usePageVisible follows visibilitychange', () => {
    stubMatchMedia();
    mount(<Hooks />);
    expect(h().visible).toBe('true');
    setVisibility('hidden');
    expect(h().visible).toBe('false');
    setVisibility('visible');
    expect(h().visible).toBe('true');
  });

  it('removes its listeners on unmount', () => {
    const mm = stubMatchMedia({});
    const remove = jest.spyOn(document, 'removeEventListener');
    const m = mount(<Hooks />);
    expect(mm.listenerCount(REDUCED_MOTION_QUERY)).toBeGreaterThan(0);
    m.unmount();
    expect(mm.listenerCount(REDUCED_MOTION_QUERY)).toBe(0);
    expect(remove.mock.calls.some((c) => c[0] === 'visibilitychange')).toBe(true);
    remove.mockRestore();
  });
});

describe('Inkwell', () => {
  const rect = (c: HTMLElement) => q('g rect', c) as SVGRectElement;

  it('clampLevel clamps 0-100 and handles NaN/Infinity', () => {
    expect(clampLevel(-20)).toBe(0);
    expect(clampLevel(140)).toBe(100);
    expect(clampLevel(42)).toBe(42);
    expect(clampLevel(Number.NaN)).toBe(0);
    expect(clampLevel(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('renders the balance level and clamps out-of-range values', () => {
    stubMatchMedia();
    const a = mount(<Inkwell balance={40} />);
    expect(q('svg', a.container)!.getAttribute('data-level')).toBe('40');
    expect(rect(a.container).style.transform).toBe('translateY(60%)');
    const hi = mount(<Inkwell balance={250} />);
    expect(q('svg', hi.container)!.getAttribute('data-level')).toBe('100');
    expect(rect(hi.container).style.transform).toBe('translateY(0%)');
    const lo = mount(<Inkwell balance={-5} />);
    expect(q('svg', lo.container)!.getAttribute('data-level')).toBe('0');
    expect(rect(lo.container).style.transform).toBe('translateY(100%)');
  });

  it('is decorative without a label and an img with one', () => {
    stubMatchMedia();
    const dec = mount(<Inkwell balance={10} />);
    expect(q('svg', dec.container)!.getAttribute('aria-hidden')).toBe('true');
    expect(q('svg', dec.container)!.getAttribute('role')).toBeNull();
    const lab = mount(<Inkwell balance={10} label="10 Ink left" />);
    expect(q('svg', lab.container)!.getAttribute('role')).toBe('img');
    expect(q('svg', lab.container)!.getAttribute('aria-label')).toBe('10 Ink left');
  });

  it('draining runs the animation class; idle does not', () => {
    stubMatchMedia();
    const idle = mount(<Inkwell balance={80} />);
    expect(rect(idle.container).getAttribute('class')).not.toContain('nl-ink-draining');
    const run = mount(<Inkwell balance={80} draining />);
    expect(rect(run.container).getAttribute('class')).toContain('nl-ink-draining');
    expect(q('svg', run.container)!.getAttribute('data-draining')).toBe('true');
    expect(rect(run.container).style.animationPlayState).toBe('running');
  });

  it('the drain pauses while the tab is hidden and resumes after', () => {
    stubMatchMedia();
    const m = mount(<Inkwell balance={80} draining />);
    setVisibility('hidden');
    expect(rect(m.container).style.animationPlayState).toBe('paused');
    setVisibility('visible');
    expect(rect(m.container).style.animationPlayState).toBe('running');
  });

  it('reduced motion: draining shows a static 60% level and no animation', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    expect(INKWELL_REDUCED_LEVEL).toBe(60);
    const m = mount(<Inkwell balance={95} draining />);
    const svg = q('svg', m.container)!;
    expect(svg.getAttribute('data-level')).toBe('60');
    expect(svg.getAttribute('data-draining')).toBeNull();
    expect(rect(m.container).getAttribute('class') ?? '').not.toContain('nl-ink-draining');
  });

  it('reduced motion without draining still shows the real balance', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const m = mount(<Inkwell balance={95} />);
    expect(q('svg', m.container)!.getAttribute('data-level')).toBe('95');
  });
});

describe('Seal', () => {
  beforeEach(() => stubMatchMedia());

  it('hidden is invisible and not exposed to assistive tech', () => {
    const { container } = mount(<Seal state="hidden" text="FINAL" />);
    const svg = q('svg', container)!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('class')).toContain('invisible');
  });

  it('stamping carries the stamp animation class and is named', () => {
    const { container } = mount(<Seal state="stamping" text="FINAL" />);
    expect(q('svg', container)!.getAttribute('role')).toBe('img');
    expect(q('svg', container)!.getAttribute('aria-label')).toBe('FINAL');
    expect(q('g', container)!.getAttribute('class')).toContain('nl-seal-stamping');
  });

  it('stamped uses the end-state class; label overrides the name', () => {
    const { container } = mount(<Seal state="stamped" text="FINAL" label="Draft finalised" />);
    expect(q('g', container)!.getAttribute('class')).toContain('nl-seal-stamped');
    expect(q('svg', container)!.getAttribute('aria-label')).toBe('Draft finalised');
    expect(q('text', container)!.textContent).toBe('FINAL');
  });

  it('onStamped fires when the stamping animation ends, not in other states', () => {
    const onStamped = jest.fn();
    const stamping = mount(<Seal state="stamping" text="X" onStamped={onStamped} />);
    act(() => {
      q('g', stamping.container)!.dispatchEvent(new Event('animationend', { bubbles: true }));
    });
    expect(onStamped).toHaveBeenCalledTimes(1);
    const stamped = mount(<Seal state="stamped" text="X" onStamped={onStamped} />);
    act(() => {
      q('g', stamped.container)!.dispatchEvent(new Event('animationend', { bubbles: true }));
    });
    expect(onStamped).toHaveBeenCalledTimes(1);
  });
});

describe('Lamp and DustMotes', () => {
  it('Lamp is a static pool when ambient motion is not allowed (mobile / coarse pointer)', () => {
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: false });
    const { container } = mount(<Lamp />);
    const el = q('div', container)!;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain('nl-lamp-pool');
    expect(el.getAttribute('data-follow')).toBeNull();
    expect(el.children).toHaveLength(0);
  });

  it('Lamp is a static pool under reduced motion even on desktop', () => {
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: true, [REDUCED_MOTION_QUERY]: true });
    const { container } = mount(<Lamp />);
    expect(q('div', container)!.className).toContain('nl-lamp-pool');
    expect(q('div', container)!.children).toHaveLength(0);
  });

  it('Lamp follows the pointer on a fine-pointer desktop and stops listening on unmount', () => {
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: true });
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const m = mount(<Lamp />);
    const el = q('div', m.container)!;
    expect(el.getAttribute('data-follow')).toBe('true');
    expect(el.className).not.toContain('nl-lamp-pool');
    const pool = el.firstElementChild as HTMLElement;
    expect(pool).not.toBeNull();
    const before = pool.style.transform;
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 600, clientY: 300 }));
    });
    expect(pool.style.transform).not.toBe(before);
    expect(pool.style.transform).toContain('150px'); // 600 - 450
    const handlers = add.mock.calls.filter((c) => c[0] === 'pointermove').map((c) => c[1]);
    expect(handlers.length).toBe(1);
    m.unmount();
    expect(remove.mock.calls.filter((c) => c[0] === 'pointermove').map((c) => c[1])).toContain(
      handlers[0],
    );
    jest.restoreAllMocks();
  });

  it('DustMotes renders nothing unless ambient motion is allowed', () => {
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: false });
    expect(mount(<DustMotes />).container.innerHTML).toBe('');
    cleanupMounted();
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: true, [REDUCED_MOTION_QUERY]: true });
    expect(mount(<DustMotes />).container.innerHTML).toBe('');
  });

  it('DustMotes renders 8 by default, clamps to 6..10, is decorative with opacity-safe layout, and pauses when hidden', () => {
    stubMatchMedia({ [FINE_POINTER_DESKTOP_QUERY]: true });
    const m = mount(<DustMotes />);
    expect(q('div', m.container)!.getAttribute('aria-hidden')).toBe('true');
    expect(qa('.nl-mote', m.container)).toHaveLength(8);
    expect((qa('.nl-mote', m.container)[0] as HTMLElement).style.animationPlayState).toBe(
      'running',
    );
    setVisibility('hidden');
    expect((qa('.nl-mote', m.container)[0] as HTMLElement).style.animationPlayState).toBe('paused');
    setVisibility('visible');
    expect(qa('.nl-mote', mount(<DustMotes count={2} />).container)).toHaveLength(6);
    expect(qa('.nl-mote', mount(<DustMotes count={99} />).container)).toHaveLength(10);
  });
});

describe('Toast', () => {
  let api!: ReturnType<typeof useToast>;
  function Grab() {
    api = useToast();
    return null;
  }
  const show = (o: ToastOptions) => act(() => void api.show(o));
  const mountToasts = () =>
    mount(
      <ToastProvider closeLabel="Dismiss">
        <Grab />
      </ToastProvider>,
    );
  const texts = () => document.body.textContent ?? '';

  beforeEach(() => {
    stubMatchMedia();
    jest.useFakeTimers();
  });

  it('useToast throws outside a provider', () => {
    jest.useRealTimers();
    function Bad() {
      useToast();
      return null;
    }
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => mount(<Bad />)).toThrow(/ToastProvider/);
    err.mockRestore();
  });

  it('TOAST_AUTO_DISMISS_MS is 6s', () => {
    expect(TOAST_AUTO_DISMISS_MS).toBe(6000);
  });

  it('shows title and message with the kind and a named close button', () => {
    mountToasts();
    show({ kind: 'success', title: 'Saved', message: 'Draft saved.' });
    expect(texts()).toContain('Saved');
    expect(texts()).toContain('Draft saved.');
    expect(q('[data-kind=success]')).not.toBeNull();
    expect(q('button[aria-label=Dismiss]')).not.toBeNull();
  });

  it('defaults to info', () => {
    mountToasts();
    show({ message: 'FYI' });
    expect(q('[data-kind=info]')).not.toBeNull();
  });

  it.each(['info', 'success'] as const)('%s dismisses itself after 6s, not before', (kind) => {
    mountToasts();
    show({ kind, message: 'Auto gone' });
    act(() => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 500);
    });
    expect(q(`[data-kind=${kind}]`)!.getAttribute('data-state')).toBe('open');
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(q(`[data-kind=${kind}]`)?.getAttribute('data-state') ?? 'closed').toBe('closed');
  });

  it('error stays open long after 6s until closed', () => {
    mountToasts();
    show({ kind: 'error', message: 'Boom' });
    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(q('[data-kind=error]')!.getAttribute('data-state')).toBe('open');
    expect(texts()).toContain('Boom');
    click(q('button[aria-label=Dismiss]'));
    expect(q('[data-kind=error]')?.getAttribute('data-state') ?? 'closed').toBe('closed');
  });

  it('dismiss(id) closes just that toast', () => {
    mountToasts();
    let id = 0;
    act(() => {
      id = api.show({ kind: 'error', message: 'One' });
      api.show({ kind: 'error', message: 'Two' });
    });
    act(() => api.dismiss(id));
    const open = qa('[data-kind=error]').filter((e) => e.getAttribute('data-state') === 'open');
    expect(open).toHaveLength(1);
    expect(open[0].textContent).toContain('Two');
  });

  it('action button fires its handler', () => {
    mountToasts();
    const onClick = jest.fn();
    show({ kind: 'error', message: 'Failed', action: { label: 'Retry', onClick } });
    const retry = qa('button').find((b) => b.textContent === 'Retry')!;
    click(retry);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
