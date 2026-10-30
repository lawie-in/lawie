// T-616: the "Reconnecting…" session banner: the phase machine (pure and with timers), the view,
// the signed copy, ui/Banner's new kind and the contrast of the warn pair.
import fs from 'fs';
import path from 'path';

import { act } from 'react';

import {
  BANNER_FADE_MS,
  bannerTimerElapsed,
  INITIAL_BANNER_STATE,
  nextBannerState,
  RECONNECTED_SHOWN_MS,
  SessionReconnectingBanner,
  SessionReconnectingBannerView,
  STILL_TRYING_AFTER_MS,
  useReconnectingBannerState,
  type ReconnectingBannerPhase,
  type ReconnectingBannerState,
} from '../SessionReconnectingBanner';
import { SESSION_RECONNECTING_COPY } from '../session-reconnecting-copy';

import { Banner, BANNER_TONE } from '@/components/ui/Banner';
import {
  cleanupMounted,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import { refreshSession, resetRefreshState } from '@/lib/sessionRefresh';

let mockAuth: { user: { id: string } | null; reconnecting?: boolean };
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));

beforeEach(() => {
  jest.useFakeTimers();
  stubMatchMedia();
  mockAuth = { user: { id: 'u1' }, reconnecting: false };
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ── nextBannerState: every transition ─────────────────────────────────────────────────────────

const S = (
  phase: ReconnectingBannerPhase,
  gate: number | null = null,
): ReconnectingBannerState => ({
  phase,
  gate,
});
const ON = { online: true, signedIn: true };

describe('nextBannerState', () => {
  it('constants', () => {
    expect(STILL_TRYING_AFTER_MS).toBe(30_000);
    expect(RECONNECTED_SHOWN_MS).toBe(3_000);
    expect(BANNER_FADE_MS).toBe(150);
    expect(INITIAL_BANNER_STATE).toEqual(S('hidden'));
  });

  it.each(['hidden', 'reconnecting', 'still-trying', 'reconnected'] as const)(
    'not signed in -> hidden at once, gate cleared (from %s)',
    (phase) => {
      expect(
        nextBannerState(S(phase, 4), { reconnecting: true, online: true, signedIn: false }),
      ).toEqual(S('hidden'));
    },
  );

  it.each(['hidden', 'reconnecting', 'still-trying', 'reconnected'] as const)(
    'offline -> hidden at once, current failure count stored as the gate (from %s)',
    (phase) => {
      expect(
        nextBannerState(S(phase), {
          reconnecting: true,
          online: false,
          signedIn: true,
          failureCount: 3,
        }),
      ).toEqual(S('hidden', 3));
    },
  );

  it('offline while not reconnecting (or with no count) stores no gate', () => {
    expect(
      nextBannerState(S('hidden'), {
        reconnecting: false,
        online: false,
        signedIn: true,
        failureCount: 1,
      }),
    ).toEqual(S('hidden'));
    expect(
      nextBannerState(S('hidden'), { reconnecting: true, online: false, signedIn: true }),
    ).toEqual(S('hidden'));
  });

  it('online and reconnecting: hidden and reconnected go to reconnecting; the other phases stay', () => {
    const i = { ...ON, reconnecting: true, failureCount: 2 };
    expect(nextBannerState(S('hidden'), i)).toEqual(S('reconnecting'));
    expect(nextBannerState(S('reconnected'), i)).toEqual(S('reconnecting'));
    expect(nextBannerState(S('reconnecting'), i)).toEqual(S('reconnecting'));
    expect(nextBannerState(S('still-trying'), i)).toEqual(S('still-trying'));
  });

  it('never shown while not reconnecting (0 or 1 failures)', () => {
    for (const failureCount of [0, 1]) {
      expect(nextBannerState(S('hidden'), { ...ON, reconnecting: false, failureCount })).toEqual(
        S('hidden'),
      );
    }
  });

  it('gate: back online while still failing stays hidden until the count goes past the gate', () => {
    const gated = S('hidden', 3);
    expect(nextBannerState(gated, { ...ON, reconnecting: true, failureCount: 3 })).toEqual(
      S('hidden', 3),
    );
    expect(nextBannerState(gated, { ...ON, reconnecting: true, failureCount: 2 })).toEqual(
      S('hidden', 3),
    );
    expect(nextBannerState(gated, { ...ON, reconnecting: true, failureCount: 4 })).toEqual(
      S('reconnecting'),
    );
  });

  it('gate without a count never blocks', () => {
    expect(nextBannerState(S('hidden', 3), { ...ON, reconnecting: true })).toEqual(
      S('reconnecting'),
    );
  });

  it('a refresh succeeded: reconnecting and still-trying go to reconnected; other phases are kept', () => {
    const i = { ...ON, reconnecting: false, failureCount: 0 };
    expect(nextBannerState(S('reconnecting'), i)).toEqual(S('reconnected'));
    expect(nextBannerState(S('still-trying'), i)).toEqual(S('reconnected'));
    expect(nextBannerState(S('reconnected'), i)).toEqual(S('reconnected'));
    expect(nextBannerState(S('hidden'), i)).toEqual(S('hidden'));
    expect(nextBannerState(S('hidden', 3), i)).toEqual(S('hidden')); // success clears the gate
  });

  it('bannerTimerElapsed: reconnecting -> still-trying (30 s), reconnected -> hidden (3 s), others unchanged', () => {
    expect(bannerTimerElapsed(S('reconnecting'))).toEqual(S('still-trying'));
    expect(bannerTimerElapsed(S('reconnected'))).toEqual(S('hidden'));
    expect(bannerTimerElapsed(S('still-trying'))).toEqual(S('still-trying'));
    expect(bannerTimerElapsed(S('hidden'))).toEqual(S('hidden'));
  });
});

// ── the hook with timers ──────────────────────────────────────────────────────────────────────

let phaseNow: ReconnectingBannerPhase;
function Harness(p: {
  reconnecting: boolean;
  online: boolean;
  signedIn?: boolean;
  failureCount?: number;
}) {
  phaseNow = useReconnectingBannerState(p.reconnecting, p.online, {
    signedIn: p.signedIn,
    failureCount: p.failureCount,
  }).phase;
  return null;
}
const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));
/** One animation frame (fake timers drive requestAnimationFrame): the live region gets its text. */
const FRAME_MS = 20;
const flushFrame = () => tick(FRAME_MS);
// T-616 round 3: the live region stays mounted. "Not shown" is phase `hidden`, the sr-only wrapper
// and empty text; "shown" is a visible (non sr-only) wrapper with the phase.
const wrapOf = (c: HTMLElement) => q('[data-session-banner-phase]', c)!;
const phaseOfView = (c: HTMLElement) => wrapOf(c).getAttribute('data-session-banner-phase');
const textOf = (c: HTMLElement) => q('p', c)?.textContent ?? null;
const isVisibleBar = (c: HTMLElement) =>
  wrapOf(c).className.includes('w-full') && !wrapOf(c).className.includes('sr-only');
function expectNotShown(c: HTMLElement) {
  expect(phaseOfView(c)).toBe('hidden');
  expect(wrapOf(c).className).toContain('sr-only');
  expect(isVisibleBar(c)).toBe(false);
  expect(textOf(c)).toBe('');
}

describe('useReconnectingBannerState', () => {
  it('hidden at first; shown only when reconnecting (never at 1 failure, shown at 2)', () => {
    const h = mount(<Harness reconnecting={false} online failureCount={1} />);
    expect(phaseNow).toBe('hidden');
    h.rerender(<Harness reconnecting online failureCount={2} />);
    expect(phaseNow).toBe('reconnecting');
  });

  it('reconnecting -> still-trying at 30 s exactly', () => {
    const h = mount(<Harness reconnecting online failureCount={2} />);
    tick(STILL_TRYING_AFTER_MS - 1);
    expect(phaseNow).toBe('reconnecting');
    tick(1);
    expect(phaseNow).toBe('still-trying');
    h.unmount();
  });

  it('recovery: reconnected for 3 s, then hidden', () => {
    const h = mount(<Harness reconnecting online failureCount={2} />);
    h.rerender(<Harness reconnecting={false} online failureCount={0} />);
    expect(phaseNow).toBe('reconnected');
    tick(RECONNECTED_SHOWN_MS - 1);
    expect(phaseNow).toBe('reconnected');
    tick(1);
    expect(phaseNow).toBe('hidden');
  });

  it('a refresh success while still-trying also gives reconnected', () => {
    const h = mount(<Harness reconnecting online failureCount={2} />);
    tick(STILL_TRYING_AFTER_MS);
    expect(phaseNow).toBe('still-trying');
    h.rerender(<Harness reconnecting={false} online failureCount={0} />);
    expect(phaseNow).toBe('reconnected');
  });

  it('reconnected -> reconnecting at once if failures resume; the old 3 s timer does not hide it', () => {
    const h = mount(<Harness reconnecting online failureCount={2} />);
    h.rerender(<Harness reconnecting={false} online failureCount={0} />);
    tick(1000);
    h.rerender(<Harness reconnecting online failureCount={2} />);
    expect(phaseNow).toBe('reconnecting');
    tick(RECONNECTED_SHOWN_MS);
    expect(phaseNow).toBe('reconnecting');
  });

  it('offline hides at once; back online it stays hidden until the failure count passes the gate', () => {
    const h = mount(<Harness reconnecting online failureCount={2} />);
    expect(phaseNow).toBe('reconnecting');
    h.rerender(<Harness reconnecting online={false} failureCount={2} />);
    expect(phaseNow).toBe('hidden');
    h.rerender(<Harness reconnecting online failureCount={2} />);
    expect(phaseNow).toBe('hidden');
    tick(60_000);
    expect(phaseNow).toBe('hidden');
    h.rerender(<Harness reconnecting online failureCount={3} />);
    expect(phaseNow).toBe('reconnecting');
  });

  it('never shown while offline, even when reconnecting from the start', () => {
    mount(<Harness reconnecting online={false} failureCount={5} />);
    expect(phaseNow).toBe('hidden');
  });

  it('not signed in hides it at once', () => {
    const h = mount(<Harness reconnecting online failureCount={2} />);
    h.rerender(<Harness reconnecting online failureCount={2} signedIn={false} />);
    expect(phaseNow).toBe('hidden');
  });

  it('timers are cleared on unmount and on every phase change', () => {
    const h = mount(<Harness reconnecting online failureCount={2} />);
    expect(jest.getTimerCount()).toBe(1); // the 30 s timer
    h.rerender(<Harness reconnecting={false} online failureCount={0} />);
    expect(jest.getTimerCount()).toBe(1); // replaced by the 3 s timer, not added
    h.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('no state update after unmount (no console error, nothing thrown when the old delays pass)', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = mount(<Harness reconnecting online failureCount={2} />);
    h.unmount();
    expect(() => tick(60_000)).not.toThrow();
    expect(err).not.toHaveBeenCalled();
  });
});

// ── the view ──────────────────────────────────────────────────────────────────────────────────

const FOCUSABLE = 'a,button,input,select,textarea,summary,[tabindex],[contenteditable=true]';

describe('SessionReconnectingBannerView', () => {
  it('markup: role=status, aria-live=polite, aria-atomic=true, data-kind, data-tone=warn, warn colours, min height', () => {
    const { container } = mount(
      <SessionReconnectingBannerView phase="reconnecting" reducedMotion />,
    );
    const bar = q('[data-kind=session-reconnecting]', container)!;
    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.getAttribute('aria-live')).toBe('polite');
    expect(bar.getAttribute('aria-atomic')).toBe('true');
    expect(bar.getAttribute('data-tone')).toBe('warn');
    expect(bar.className).toContain('bg-nl-warn-light');
    expect(bar.className).toContain('text-nl-warn');
    expect(bar.className).toContain('min-h-[44px]');
    expect(bar.className).toContain('border-b');
    expect(q('p', bar)!.className).toContain('nl-body-sm');
    expect(q('p', bar)!.className).toContain('font-medium');
    expect(
      q('[data-session-banner-phase]', container)!.getAttribute('data-session-banner-phase'),
    ).toBe('reconnecting');
  });

  it('three decorative dots: 4px, 4px apart, brass, aria-hidden', () => {
    const { container } = mount(
      <SessionReconnectingBannerView phase="reconnecting" reducedMotion />,
    );
    const holder = q('span[aria-hidden=true]', container)!;
    expect(holder.className).toContain('gap-[4px]');
    const dots = qa('span', holder);
    expect(dots).toHaveLength(3);
    for (const d of dots) {
      expect(d.className).toContain('bg-nl-brass');
      expect(d.className).toContain('h-[4px]');
      expect(d.className).toContain('w-[4px]');
    }
    expect(dots.map((d) => (d as HTMLElement).style.animationDelay)).toEqual([
      '0s',
      '0.4s',
      '0.8s',
    ]);
  });

  it('the keyframe: lawie-session-dot 1 -> .35 over 1.2 s, with a prefers-reduced-motion rule', () => {
    const { container } = mount(<SessionReconnectingBannerView phase="reconnecting" />);
    const css = q('style', container)!.textContent!;
    expect(css).toContain('@keyframes lawie-session-dot');
    expect(css).toMatch(/opacity:\s*1/);
    expect(css).toMatch(/opacity:\s*\.35/);
    expect(css).toContain('1.2s');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\{[^}]*animation:\s*none;\s*opacity:\s*1/,
    );
  });

  it('nothing in it is focusable', () => {
    const { container } = mount(<SessionReconnectingBannerView phase="still-trying" />);
    expect(qa(FOCUSABLE, container)).toHaveLength(0);
  });

  it.each([
    ['reconnecting', SESSION_RECONNECTING_COPY.reconnecting.en, 'Reconnecting…'],
    ['still-trying', SESSION_RECONNECTING_COPY.stillTrying.en, 'Still trying to reconnect.'],
    ['reconnected', SESSION_RECONNECTING_COPY.reconnected.en, 'Reconnected.'],
  ] as const)('phase %s shows the signed EN text', (phase, fromCopy, literal) => {
    const { container } = mount(<SessionReconnectingBannerView phase={phase} reducedMotion />);
    flushFrame(); // the text is set one frame after the bar shows (round 3)
    expect(q('p', container)!.textContent).toBe(fromCopy);
    expect(q('p', container)!.textContent).toBe(literal);
    expect(phaseOfView(container)).toBe(phase);
    expect(isVisibleBar(container)).toBe(true);
  });

  it('hidden: no visible bar; the live region stays mounted, empty and visually hidden (sr-only)', () => {
    const { container } = mount(<SessionReconnectingBannerView phase="hidden" />);
    expectNotShown(container);
    const bar = q('[data-kind=session-reconnecting]', container)!;
    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.getAttribute('aria-live')).toBe('polite');
    expect(bar.getAttribute('aria-atomic')).toBe('true');
    flushFrame();
    expectNotShown(container); // a frame later it is still empty
  });

  it('mounts at opacity 0 and fades in on the next frame (150 ms opacity transition)', () => {
    const h = mount(<SessionReconnectingBannerView phase="hidden" reducedMotion={false} />);
    h.rerender(<SessionReconnectingBannerView phase="reconnecting" reducedMotion={false} />);
    const wrap = () => q('[data-session-banner-phase]', h.container)!;
    expect(wrap().className).toContain('opacity-0');
    expect(wrap().className).toContain('transition-opacity');
    expect(wrap().className).toContain('duration-150');
    tick(50);
    expect(wrap().className).toContain('opacity-100');
    expect(wrap().className).not.toContain('opacity-0');
  });

  it('on hide it fades out for 150 ms, then unmounts; the text of the last phase stays meanwhile', () => {
    const h = mount(<SessionReconnectingBannerView phase="hidden" reducedMotion={false} />);
    h.rerender(<SessionReconnectingBannerView phase="reconnected" reducedMotion={false} />);
    tick(50);
    h.rerender(<SessionReconnectingBannerView phase="hidden" reducedMotion={false} />);
    const wrap = q('[data-session-banner-phase]', h.container)!;
    expect(wrap.className).toContain('opacity-0');
    expect(q('p', h.container)!.textContent).toBe('Reconnected.');
    tick(BANNER_FADE_MS - 1);
    expect(isVisibleBar(h.container)).toBe(true); // still fading, text kept
    expect(textOf(h.container)).toBe('Reconnected.');
    tick(1);
    expectNotShown(h.container); // collapsed to the empty sr-only live region
  });

  it('reduced motion: appears and disappears at once, no transition class, dots static at full opacity', () => {
    const h = mount(<SessionReconnectingBannerView phase="hidden" reducedMotion />);
    h.rerender(<SessionReconnectingBannerView phase="reconnecting" reducedMotion />);
    flushFrame();
    const wrap = q('[data-session-banner-phase]', h.container)!;
    expect(wrap.className).not.toContain('transition');
    expect(wrap.className).toContain('opacity-100');
    for (const d of qa('span[aria-hidden=true] span', h.container) as HTMLElement[]) {
      expect(d.style.animationName).toBe('none');
      expect(d.style.animationPlayState).toBe(''); // longhands only: no conflicting play-state
      expect(d.style.opacity).toBe('1');
    }
    h.rerender(<SessionReconnectingBannerView phase="hidden" reducedMotion />);
    expectNotShown(h.container); // no fade-out wait
  });

  it('reduced motion is read from prefers-reduced-motion when not passed', () => {
    stubMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    const { container } = mount(<SessionReconnectingBannerView phase="reconnecting" />);
    expect(q('[data-session-banner-phase]', container)!.className).not.toContain('transition');
  });

  it('the dot pulse is paused while the tab is hidden, running otherwise', () => {
    const hidden = mount(
      <SessionReconnectingBannerView phase="reconnecting" reducedMotion={false} tabHidden />,
    );
    for (const d of qa('span[aria-hidden=true] span', hidden.container) as HTMLElement[]) {
      expect(d.style.animationPlayState).toBe('paused');
    }
    const shown = mount(
      <SessionReconnectingBannerView
        phase="reconnecting"
        reducedMotion={false}
        tabHidden={false}
      />,
    );
    for (const d of qa('span[aria-hidden=true] span', shown.container) as HTMLElement[]) {
      expect(d.style.animationPlayState).toBe('running');
    }
  });
});

// ── live region (T-616 round 3, should-fix 5) ─────────────────────────────────────────────────

describe('live region: mounted empty first, text one frame later', () => {
  const show = (phase: ReconnectingBannerPhase, reducedMotion = false) => (
    <SessionReconnectingBannerView phase={phase} reducedMotion={reducedMotion} />
  );

  it('the status region exists, empty, BEFORE the bar shows; the same node then gets the text a frame later', () => {
    const h = mount(show('hidden'));
    const before = q('[data-kind=session-reconnecting]', h.container)!;
    expect(before.getAttribute('role')).toBe('status');
    expect(textOf(h.container)).toBe('');

    h.rerender(show('reconnecting'));
    // Effects ran, the frame has not: visible bar, but still no text for a screen reader to miss.
    expect(phaseOfView(h.container)).toBe('reconnecting');
    expect(textOf(h.container)).toBe('');
    expect(q('[data-kind=session-reconnecting]', h.container)).toBe(before); // same live region node

    flushFrame();
    expect(textOf(h.container)).toBe('Reconnecting…');
    expect(q('[data-kind=session-reconnecting]', h.container)).toBe(before);
  });

  it('the text is set by requestAnimationFrame (not at once), also with reduced motion', () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    const h = mount(show('hidden', true));
    h.rerender(show('reconnecting', true));
    expect(raf).toHaveBeenCalled();
    expect(textOf(h.container)).toBe('');
    flushFrame();
    expect(textOf(h.container)).toBe('Reconnecting…');
  });

  it('a mount that starts in a shown phase is empty until the first frame, then has its text', () => {
    const { container } = mount(show('reconnecting'));
    expect(textOf(container)).toBe('');
    flushFrame();
    expect(textOf(container)).toBe('Reconnecting…');
  });

  it('a phase change while shown swaps the text at once (no empty gap): reconnecting -> still-trying -> reconnected', () => {
    const h = mount(show('reconnecting'));
    flushFrame();
    h.rerender(show('still-trying'));
    expect(textOf(h.container)).toBe('Still trying to reconnect.');
    h.rerender(show('reconnected'));
    expect(textOf(h.container)).toBe('Reconnected.');
  });

  it('hide then show again: after the fade the text is empty, and it comes back only a frame after the next show', () => {
    const h = mount(show('reconnecting'));
    flushFrame();
    h.rerender(show('hidden'));
    tick(BANNER_FADE_MS);
    expectNotShown(h.container);
    h.rerender(show('reconnecting'));
    expect(textOf(h.container)).toBe(''); // re-announced from empty
    flushFrame();
    expect(textOf(h.container)).toBe('Reconnecting…');
  });

  it('shown again during the 150 ms fade-out: it stays up (collapse cancelled), text intact', () => {
    const h = mount(show('reconnecting'));
    flushFrame();
    h.rerender(show('hidden'));
    tick(BANNER_FADE_MS - 50);
    h.rerender(show('reconnecting'));
    flushFrame();
    tick(BANNER_FADE_MS * 2);
    expect(isVisibleBar(h.container)).toBe(true);
    expect(textOf(h.container)).toBe('Reconnecting…');
    expect(phaseOfView(h.container)).toBe('reconnecting');
  });

  it('unmounting before the frame leaves no pending timer or state update', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = mount(show('reconnecting'));
    h.unmount();
    expect(() => tick(1000)).not.toThrow();
    expect(err).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('connected transitions: reconnecting, still-trying 30 s, reconnected 3 s, 150 ms fade', () => {
  beforeEach(() => resetRefreshState());

  it('reconnecting -> still-trying at 30 s (text swap only) -> hidden after reconnected 3 s + 150 ms fade', () => {
    mockAuth = { user: { id: 'u1' }, reconnecting: true };
    const h = mount(<SessionReconnectingBanner />);
    expect(textOf(h.container)).toBe('');
    flushFrame();
    expect(textOf(h.container)).toBe('Reconnecting…');
    expect(phaseOfView(h.container)).toBe('reconnecting');

    tick(STILL_TRYING_AFTER_MS - FRAME_MS - 1);
    expect(textOf(h.container)).toBe('Reconnecting…');
    tick(1);
    expect(phaseOfView(h.container)).toBe('still-trying');
    expect(textOf(h.container)).toBe('Still trying to reconnect.');
    expect(isVisibleBar(h.container)).toBe(true);

    mockAuth = { user: { id: 'u1' }, reconnecting: false }; // a refresh succeeded
    h.rerender(<SessionReconnectingBanner />);
    expect(phaseOfView(h.container)).toBe('reconnected');
    expect(textOf(h.container)).toBe('Reconnected.');

    tick(RECONNECTED_SHOWN_MS - 1);
    expect(phaseOfView(h.container)).toBe('reconnected');
    expect(isVisibleBar(h.container)).toBe(true);
    tick(1); // 3 s: phase hidden, fading out, last text kept
    expect(phaseOfView(h.container)).toBe('hidden');
    expect(wrapOf(h.container).className).toContain('opacity-0');
    expect(textOf(h.container)).toBe('Reconnected.');
    tick(BANNER_FADE_MS - 1);
    expect(isVisibleBar(h.container)).toBe(true);
    tick(1);
    expectNotShown(h.container);
  });

  it('failures resume while "Reconnected." shows: back to reconnecting, the 3 s timer does not hide it', () => {
    mockAuth = { user: { id: 'u1' }, reconnecting: true };
    const h = mount(<SessionReconnectingBanner />);
    flushFrame();
    mockAuth = { user: { id: 'u1' }, reconnecting: false };
    h.rerender(<SessionReconnectingBanner />);
    tick(1000);
    mockAuth = { user: { id: 'u1' }, reconnecting: true };
    h.rerender(<SessionReconnectingBanner />);
    expect(phaseOfView(h.container)).toBe('reconnecting');
    tick(RECONNECTED_SHOWN_MS + BANNER_FADE_MS);
    expect(phaseOfView(h.container)).toBe('reconnecting');
    expect(isVisibleBar(h.container)).toBe(true);
    expect(textOf(h.container)).toBe('Reconnecting…');
  });

  it('signing out hides it at once, then empties the region after the fade', () => {
    mockAuth = { user: { id: 'u1' }, reconnecting: true };
    const h = mount(<SessionReconnectingBanner />);
    flushFrame();
    mockAuth = { user: null, reconnecting: true };
    h.rerender(<SessionReconnectingBanner />);
    expect(phaseOfView(h.container)).toBe('hidden');
    tick(BANNER_FADE_MS);
    expectNotShown(h.container);
  });
});

// ── connected ─────────────────────────────────────────────────────────────────────────────────

describe('SessionReconnectingBanner (connected)', () => {
  beforeEach(() => resetRefreshState());

  it('shows the bar when signed in, online and useAuth().reconnecting', () => {
    mockAuth = { user: { id: 'u1' }, reconnecting: true };
    const { container } = mount(<SessionReconnectingBanner />);
    expect(q('[data-kind=session-reconnecting]', container)).not.toBeNull();
    flushFrame();
    expect(isVisibleBar(container)).toBe(true);
    expect(phaseOfView(container)).toBe('reconnecting');
    expect(q('p', container)!.textContent).toBe('Reconnecting…');
  });

  it('shows nothing when not reconnecting, signed out, or offline', () => {
    mockAuth = { user: { id: 'u1' }, reconnecting: false };
    const a = mount(<SessionReconnectingBanner />).container;
    mockAuth = { user: null, reconnecting: true };
    const b = mount(<SessionReconnectingBanner />).container;
    jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    mockAuth = { user: { id: 'u1' }, reconnecting: true };
    const c = mount(<SessionReconnectingBanner />).container;
    flushFrame();
    for (const container of [a, b, c]) expectNotShown(container);
  });

  it('reconnecting that is only the optional field being absent counts as not reconnecting', () => {
    mockAuth = { user: { id: 'u1' } };
    const { container } = mount(<SessionReconnectingBanner />);
    flushFrame();
    expectNotShown(container);
  });

  it('the real failure count from lib/sessionRefresh feeds the gate (offline then online while failing stays hidden)', async () => {
    const online = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    mockAuth = { user: { id: 'u1' }, reconnecting: true };
    // two real transient failures -> count 2
    localStorage.setItem('lawie_refresh_token', 'R1');
    global.fetch = jest.fn(
      async () => ({ ok: false, status: 503 }) as Response,
    ) as unknown as typeof fetch;
    await refreshSession();
    jest.advanceTimersByTime(1000);
    await refreshSession();
    const h = mount(<SessionReconnectingBanner />);
    flushFrame();
    expect(phaseOfView(h.container)).toBe('reconnecting');
    expect(isVisibleBar(h.container)).toBe(true);
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    tick(BANNER_FADE_MS + 10);
    expectNotShown(h.container);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    tick(BANNER_FADE_MS + 10);
    expectNotShown(h.container); // same count: gated
    localStorage.clear();
  });
});

// ── the signed copy ───────────────────────────────────────────────────────────────────────────

describe('session-reconnecting-copy', () => {
  it('all three rows are signed, with the exact EN and HI strings', () => {
    expect(Object.keys(SESSION_RECONNECTING_COPY).sort()).toEqual([
      'reconnected',
      'reconnecting',
      'stillTrying',
    ]);
    for (const row of Object.values(SESSION_RECONNECTING_COPY)) {
      expect(row.status).toBe('signed');
      expect(row.source).toBeTruthy();
    }
    expect(SESSION_RECONNECTING_COPY.reconnecting.en).toBe('Reconnecting…');
    expect(SESSION_RECONNECTING_COPY.stillTrying.en).toBe('Still trying to reconnect.');
    expect(SESSION_RECONNECTING_COPY.reconnected.en).toBe('Reconnected.');
    expect(SESSION_RECONNECTING_COPY.reconnecting.hi).toBe('फिर जुड़ रहा है…');
    expect(SESSION_RECONNECTING_COPY.stillTrying.hi).toBe('अब भी जुड़ने की कोशिश जारी है।');
    expect(SESSION_RECONNECTING_COPY.reconnected.hi).toBe('फिर जुड़ गया।');
  });

  it('the long "Your changes will be saved..." sentence is in no string and in no rendered phase', () => {
    const strings = Object.values(SESSION_RECONNECTING_COPY).flatMap((r) => [r.en, r.hi, r.source]);
    for (const s of strings) expect(s).not.toMatch(/your changes will be saved/i);
    for (const phase of ['reconnecting', 'still-trying', 'reconnected'] as const) {
      const { container } = mount(<SessionReconnectingBannerView phase={phase} reducedMotion />);
      expect(container.textContent).not.toMatch(/changes will be saved/i);
    }
  });
});

// ── ui/Banner ─────────────────────────────────────────────────────────────────────────────────

describe('ui/Banner: the session-reconnecting kind', () => {
  it('tone is warn', () => {
    expect(BANNER_TONE['session-reconnecting']).toBe('warn');
  });

  it('is never dismissible and never has an action, even if both are passed', () => {
    const { container } = mount(
      <Banner
        kind="session-reconnecting"
        message="x"
        dismissible
        onDismiss={() => undefined}
        dismissLabel="Close"
        action={{ label: 'Retry', onClick: () => undefined }}
      />,
    );
    expect(qa('button', container)).toHaveLength(0);
    expect(container.textContent).toBe('x');
  });

  it('other kinds are unchanged: no aria-live or aria-atomic, action and close still render', () => {
    for (const kind of ['ai-down', 'payment-failed', 'verify-email', 'privacy-reaccept'] as const) {
      const { container } = mount(
        <Banner
          kind={kind}
          message="m"
          dismissible
          onDismiss={() => undefined}
          dismissLabel="Close"
          action={{ label: 'Go', onClick: () => undefined }}
        />,
      );
      const bar = q(`[data-kind=${kind}]`, container)!;
      expect(bar.hasAttribute('aria-live')).toBe(false);
      expect(bar.hasAttribute('aria-atomic')).toBe(false);
      expect(bar.getAttribute('role')).toBe(kind === 'payment-failed' ? 'alert' : 'status');
      expect(qa('button', container)).toHaveLength(2);
    }
  });
});

// ── contrast of the warn pair (from the CSS, like t578-contrast) ──────────────────────────────

const CSS = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf8');
function block(selectorStart: string): string {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS))) {
    const sel = m[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (sel.startsWith(selectorStart)) return m[2];
  }
  throw new Error(`no rule starting with ${selectorStart}`);
}
function token(rule: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(rule);
  if (!m) throw new Error(`no ${name} in rule`);
  return m[1];
}
function lin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('warn pair contrast (--warn on --warn-light), WCAG 2.x, body text needs 4.5:1', () => {
  it.each([
    ['Daylight', ".nl, html[data-theme='daylight'] .nl"],
    ['Night', "html[data-theme='night'] .nl"],
  ])('%s', (_name, selector) => {
    const rule = block(selector);
    const ratio = contrast(token(rule, '--warn'), token(rule, '--warn-light'));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    process.stdout.write(
      `[T-616 contrast] ${_name}: ${token(rule, '--warn')} on ${token(rule, '--warn-light')} = ${ratio.toFixed(2)}:1\n`,
    );
  });
});
