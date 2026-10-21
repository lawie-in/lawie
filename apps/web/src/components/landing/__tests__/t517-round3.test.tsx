/**
 * T-517 round 3: DemoFolio hairline and hydration-safe reduced motion, shelf (edge, spine label,
 * focus-within), plan card shadow and heading level, primary-only hover halo.
 */
import { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { DemoFolio } from '../DemoFolio';
import { LandingPage } from '../LandingPage';

import { NightPlanCard } from '@/components/marketing/NightPlanCard';
import { nlLinkButton } from '@/components/marketing/nl-link';
import { landingCopy } from '@/components/marketing/nl-copy';
import {
  cleanupMounted,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import { REDUCED_MOTION_QUERY } from '@/components/ui/motion';

const classes = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/);

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('DemoFolio round 3', () => {
  it('the figure has a 1px brass top hairline', () => {
    mount(<DemoFolio lang="en" />);
    const c = classes(q('figure'));
    expect(c).toEqual(expect.arrayContaining(['border', 'border-t', 'border-t-nl-brass']));
    expect(c).toContain('shadow-nl-card');
  });

  it('reduced motion at mount: no typing timer is ever scheduled and the end state shows at once', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const st = jest.spyOn(window, 'setTimeout');
    const si = jest.spyOn(window, 'setInterval');
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    mount(<DemoFolio lang="en" />);
    expect(q('figure')!.getAttribute('data-demo-phase')).toBe('done');
    expect(q('[data-demo-typed]')!.textContent).toBe(landingCopy('en').demo.prompt);
    expect(jest.getTimerCount()).toBe(0);
    act(() => void jest.advanceTimersByTime(10_000));
    expect(q('figure')!.getAttribute('data-demo-phase')).toBe('done');
    const typingCalls = [...st.mock.calls, ...si.mock.calls].filter(
      ([, ms]) => typeof ms === 'number' && ms > 0 && ms <= 30,
    );
    expect(typingCalls).toHaveLength(0);
    expect(raf).not.toHaveBeenCalled();
  });

  it('the mount effect trusts the media query itself, not the hook: matches=true is read at mount', () => {
    const calls: string[] = [];
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => {
        calls.push(query);
        return {
          matches: query === REDUCED_MOTION_QUERY,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        };
      },
    });
    mount(<DemoFolio lang="en" />);
    expect(calls).toContain(REDUCED_MOTION_QUERY);
    expect(jest.getTimerCount()).toBe(0);
    expect(q('figure')!.getAttribute('data-demo-phase')).toBe('done');
  });

  it('hydration: server HTML rendered without a media query, then hydrated under reduced motion, never starts typing', () => {
    // Server-equivalent markup: first render with no media query (the hook's server value).
    // (saveData keeps the pre-render in its initial end state, which is what the server emits.)
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
    const pre = document.createElement('div');
    const preRoot = createRoot(pre);
    act(() => preRoot.render(<DemoFolio lang="en" />));
    const html = pre.innerHTML;
    act(() => preRoot.unmount());
    jest.clearAllTimers();
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
    const container = document.createElement('div');
    // The pre-render's effects already lifted the guard; the server markup still carries it.
    container.innerHTML = html.replace('<figure ', '<figure data-demo-initial="" ');
    document.body.appendChild(container);
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const st = jest.spyOn(window, 'setTimeout');
    jest.spyOn(console, 'error').mockImplementation(() => undefined); // jsdom style re-serialisation
    let root!: ReturnType<typeof hydrateRoot>;
    act(() => {
      root = hydrateRoot(container, <DemoFolio lang="en" />);
    });
    const typingCalls = st.mock.calls.filter(([, ms]) => typeof ms === 'number' && ms <= 30);
    expect(typingCalls).toHaveLength(0);
    expect(container.querySelector('figure')!.getAttribute('data-demo-phase')).toBe('done');
    expect(jest.getTimerCount()).toBe(0);
    act(() => root.unmount());
    container.remove();
  });

  it('control: without reduced motion it still plays on mount', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    mount(<DemoFolio lang="en" />);
    expect(q('figure')!.getAttribute('data-demo-phase')).toBe('typing');
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });
});

describe('NightPlanCard round 3', () => {
  const props = {
    name: 'Solo',
    price: '₹499 a month',
    ink: '20 Ink a month',
    includes: ['One'],
    button: 'Go',
    href: '/login?mode=signup',
  };

  it('carries no shadow (only the folio and command bar do), keeps the 1px line border', () => {
    mount(<NightPlanCard {...props} />);
    const c = classes(q('article'));
    expect(c).not.toContain('shadow-nl-card');
    expect(c.some((x) => x.startsWith('shadow-'))).toBe(false);
    expect(c).toContain('border');
  });

  it('defaults to h3; headingLevel h2 renders an h2; never both', () => {
    mount(<NightPlanCard {...props} />);
    expect(qa('h3')).toHaveLength(1);
    expect(qa('h2')).toHaveLength(0);
    cleanupMounted();
    mount(<NightPlanCard {...props} headingLevel="h2" />);
    expect(qa('h2').map((h) => h.textContent)).toEqual(['Solo']);
    expect(qa('h3')).toHaveLength(0);
  });

  it('largeHeading still applies on either level', () => {
    mount(<NightPlanCard {...props} headingLevel="h2" largeHeading />);
    expect(classes(q('h2'))).toContain('nl-h2');
  });

  it('the plan button is ghost: no hover halo or lift', () => {
    mount(<NightPlanCard {...props} />);
    const c = (q('article a') as HTMLElement).className;
    expect(c).not.toContain('shadow-nl-halo');
    expect(c).not.toContain('-translate-y-px');
  });
});

describe('landing heading outline', () => {
  it('plan cards stay h3 under the section h2 (Free and Solo)', () => {
    mount(<LandingPage />);
    const prices = q('section[aria-labelledby="prices-heading"]')!;
    expect(qa('h2', prices)).toHaveLength(1);
    const h3 = qa('h3', prices);
    expect(h3.length).toBeGreaterThanOrEqual(2);
    expect(qa('[data-plan]', prices).every((a) => a.querySelector('h3'))).toBe(true);
    expect(qa('[data-plan] h2', prices)).toHaveLength(0);
  });

  it('heading levels never skip downwards', () => {
    mount(<LandingPage />);
    const levels = qa('h1,h2,h3,h4').map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    levels.slice(1).forEach((l, i) => expect(l - levels[i]).toBeLessThanOrEqual(1));
  });
});

describe('nl-link hover (primary only)', () => {
  const HALO = '[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-nl-halo';
  const LIFT = '[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px';
  const NO_LIFT_RM = 'motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:hover:translate-y-0';

  it('primary has the halo, the 1px lift, and no lift under reduced motion', () => {
    const c = nlLinkButton('primary').split(/\s+/);
    expect(c).toEqual(expect.arrayContaining([HALO, LIFT, NO_LIFT_RM]));
  });

  it('ghost has no halo, lift or hover shadow at all', () => {
    const c = nlLinkButton('ghost', 'mt-nl-6 w-full');
    expect(c).not.toContain('shadow-nl-halo');
    expect(c).not.toContain('translate');
    expect(c).not.toMatch(/hover:/);
    expect(c).toContain('border-nl-line');
  });

  it('a caller className does not reintroduce hover on ghost; the shared base has none', () => {
    expect(nlLinkButton('ghost')).not.toMatch(/hover:/);
    expect(nlLinkButton('primary')).toContain('bg-nl-brass');
  });
});

describe('landing shelf round 3', () => {
  it('shelf edge is 10px, spine label is Tiro 15px, spines also lift on focus-within', () => {
    mount(<LandingPage />);
    const shelf = q('ul[aria-label]')!.parentElement!.querySelector('ul.bg-nl-wood') as HTMLElement;
    expect(shelf).not.toBeNull();
    const sc = classes(shelf);
    expect(sc).toContain('border-b-[10px]');
    expect(sc).not.toContain('border-b-4');
    const spines = qa('li', shelf);
    expect(spines.length).toBeGreaterThan(0);
    for (const li of spines) {
      const c = classes(li);
      expect(c).toContain(
        'motion-safe:[@media(pointer:fine)_and_(min-width:641px)]:focus-within:-translate-y-[14px]',
      );
      expect(c).toContain(
        'motion-safe:[@media(hover:hover)_and_(pointer:fine)_and_(min-width:641px)]:hover:-translate-y-[14px]',
      );
      expect(c).toContain('motion-reduce:transition-none');
      const label = li.querySelector('span:not([aria-hidden])') as HTMLElement;
      const lc = classes(label);
      expect(lc).toEqual(expect.arrayContaining(['font-nl-display', 'text-[15px]', 'leading-5']));
      expect(lc).not.toContain('nl-body-sm');
      expect(lc).toContain('whitespace-nowrap');
    }
  });
});
