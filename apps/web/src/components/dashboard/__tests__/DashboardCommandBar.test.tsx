// T-520 item 8: the dashboard command bar's routing and hotkey.
import { act } from 'react';
import { useRouter } from 'next/navigation';

import {
  COMMAND_CHIP_HREF,
  DashboardCommandBar,
  DRAFT_PREFILL_KEY,
  DRAFT_PREFILL_MAX,
  draftPrefill,
  storeDraftPrefill,
} from '../DashboardCommandBar';

import { flush } from './dash-test-utils';

import { SectionFinderPanel } from '@/components/sections/SectionFinderPanel';
import {
  cleanupMounted,
  click,
  mount,
  press,
  q,
  qa,
  stubMatchMedia,
  typeInto,
} from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const push = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  (useRouter as jest.Mock).mockReturnValue({ push });
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanupMounted();
  jest.restoreAllMocks();
  window.sessionStorage.clear();
});

const input = () => q('[role=combobox]') as HTMLInputElement;
const option = (label: string) => qa('[role=option]').find((o) => o.textContent === label)!;

describe('draftPrefill', () => {
  it('blank or whitespace gives an empty string', () => {
    expect(draftPrefill('')).toBe('');
    expect(draftPrefill('   \n\t ')).toBe('');
  });

  it('trims and keeps inner spaces', () => {
    expect(draftPrefill('  bail for Asha  ')).toBe('bail for Asha');
  });

  it('keeps & # = ? / and % raw (nothing is encoded, it is not a URL)', () => {
    expect(draftPrefill('a&b=c#d?e/f 100%')).toBe('a&b=c#d?e/f 100%');
  });

  it('keeps unicode as-is', () => {
    const text = 'जमानत आवेदन — ₹5,000 “quoted”';
    expect(draftPrefill(text)).toBe(text);
  });

  it('cuts to 500 code points after trimming', () => {
    expect(DRAFT_PREFILL_MAX).toBe(500);
    expect(draftPrefill(`  ${'a'.repeat(600)}  `)).toBe('a'.repeat(500));
    // leading spaces are trimmed first, so they do not eat into the 500
    expect(draftPrefill(` ${'b'.repeat(500)}`)).toBe('b'.repeat(500));
    expect(draftPrefill('c'.repeat(499))).toBe('c'.repeat(499));
    const mid = `w${' '.repeat(10)}${'z'.repeat(600)}`;
    const cut = draftPrefill(mid);
    expect(cut).toHaveLength(500);
    expect(cut.startsWith('w          z')).toBe(true);
  });
});

describe('draftPrefill: astral characters and lone surrogates', () => {
  it('600 emoji give exactly 500 code points and no split pair', () => {
    const got = draftPrefill('😀'.repeat(600));
    expect(Array.from(got)).toHaveLength(500);
    expect(got).toBe('😀'.repeat(500));
    expect(got).toHaveLength(1000);
  });

  it('a pair that straddles unit 500 is not split', () => {
    expect(draftPrefill(`${'a'.repeat(499)}😀tail`)).toBe(`${'a'.repeat(499)}😀`);
  });

  it('a lone surrogate becomes U+FFFD, never throws, and the result is well formed', () => {
    const cases: Array<[string, string]> = [
      ['\ud800', '�'],
      ['abc\udc00def', 'abc�def'],
      [`${'x'.repeat(10)}\ud83d`, `${'x'.repeat(10)}�`],
      ['\ude00\ud83d', '��'],
    ];
    for (const [text, want] of cases) {
      let got = '';
      expect(() => {
        got = draftPrefill(text);
      }).not.toThrow();
      expect(got).toBe(want);
      expect(() => encodeURIComponent(got)).not.toThrow();
    }
  });

  it('a lone surrogate inside the cut window is replaced; one past it is dropped', () => {
    expect(draftPrefill(`${'a'.repeat(499)}\ud800z`)).toBe(`${'a'.repeat(499)}�`);
    expect(draftPrefill(`${'a'.repeat(500)}\ud800`)).toBe('a'.repeat(500));
  });
});

describe('storeDraftPrefill', () => {
  it('writes the sanitised text under the key', () => {
    expect(DRAFT_PREFILL_KEY).toBe('lawie:draft-prefill');
    storeDraftPrefill('  bail & #1 \ud800 ');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBe('bail & #1 �');
  });

  it('blank text removes a stale key and writes nothing', () => {
    window.sessionStorage.setItem(DRAFT_PREFILL_KEY, 'stale');
    const set = jest.spyOn(Storage.prototype, 'setItem');
    storeDraftPrefill('  \n ');
    expect(set).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
  });

  it('a new value replaces the old one', () => {
    storeDraftPrefill('first');
    storeDraftPrefill('second');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBe('second');
  });

  it('never throws when setItem or removeItem throw', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => storeDraftPrefill('text')).not.toThrow();
    expect(() => storeDraftPrefill('')).not.toThrow();
  });

  it('never throws when the sessionStorage getter throws', () => {
    jest.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => storeDraftPrefill('text')).not.toThrow();
    expect(() => storeDraftPrefill('')).not.toThrow();
  });
});

describe('DashboardCommandBar routing', () => {
  it.each([
    ['Bail application', '/dashboard/new?kind=bail_regular'],
    ['Written statement', '/dashboard/new?kind=written_statement'],
    ['Legal notice', '/dashboard/new'],
    ['Plaint', '/dashboard/new'],
    ['Browse all templates', '/dashboard/templates'],
  ])('chip "%s" pushes %s', (label, href) => {
    mount(<DashboardCommandBar />);
    act(() => input().focus());
    click(option(label));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(href);
  });

  it('the chip table covers all five default chips', () => {
    expect(Object.keys(COMMAND_CHIP_HREF).sort()).toEqual([
      'bail-application',
      'browse-all-templates',
      'legal-notice',
      'plaint',
      'written-statement',
    ]);
  });

  it('Draft with text stores the sanitised text and pushes plain /dashboard/new', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), '  bail for a client & family ');
    click(q('button[type=submit]'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/new');
    expect(push.mock.calls[0][0]).not.toContain('?');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBe('bail for a client & family');
  });

  it('the pushed URL never contains the typed text', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'Asha');
    click(q('button[type=submit]'));
    const url = push.mock.calls[0][0] as string;
    expect(url).toBe('/dashboard/new');
    expect(url).not.toMatch(/Asha|%/);
  });

  it('typing a lone surrogate and pressing Draft stores U+FFFD and navigates', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'bail \ud800 for Asha');
    expect(() => click(q('button[type=submit]'))).not.toThrow();
    expect(push).toHaveBeenCalledWith('/dashboard/new');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBe('bail � for Asha');
  });

  it('Draft still navigates when setItem throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    mount(<DashboardCommandBar />);
    typeInto(input(), 'bail');
    click(q('button[type=submit]'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/new');
  });

  it('Draft still navigates when the sessionStorage getter throws', () => {
    jest.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    mount(<DashboardCommandBar />);
    typeInto(input(), 'bail');
    click(q('button[type=submit]'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/new');
  });

  it('chips do not touch the prefill key', () => {
    window.sessionStorage.setItem(DRAFT_PREFILL_KEY, 'kept');
    const set = jest.spyOn(Storage.prototype, 'setItem');
    const remove = jest.spyOn(Storage.prototype, 'removeItem');
    mount(<DashboardCommandBar />);
    act(() => input().focus());
    click(option('Bail application'));
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=bail_regular');
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBe('kept');
  });

  it('Draft with no text pushes nothing (it focuses the input instead)', () => {
    mount(<DashboardCommandBar />);
    click(q('button[type=submit]'));
    expect(push).not.toHaveBeenCalled();
  });

  it('blank Draft never reaches onSubmit (CommandBar guards it), so it neither navigates nor touches the key', () => {
    window.sessionStorage.setItem(DRAFT_PREFILL_KEY, 'stale');
    mount(<DashboardCommandBar />);
    click(q('button[type=submit]'));
    expect(push).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBe('stale');
  });

  it('a typed template name picks the template, not the free text', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'plaint');
    click(option('Plaint'));
    expect(push).toHaveBeenCalledWith('/dashboard/new');
  });
});

describe('DashboardCommandBar hotkey (T-524: the bar owns Ctrl/Cmd+K on /dashboard)', () => {
  it('shows the Ctrl K hint and the screen-reader hint, linked to the input', () => {
    const { container } = mount(<DashboardCommandBar />);
    expect(container.textContent).toMatch(/Ctrl K|⌘ K/);
    const id = input().getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)!.className).toContain('sr-only');
    // visible hint only at >= 641px; the SR hint is always there
    const kbd = q('kbd', container) as HTMLElement;
    expect(kbd.className).toContain('hidden');
    expect(kbd.className).toContain('min-[641px]:inline-block');
    expect(kbd.getAttribute('aria-hidden')).toBe('true');
  });

  it('Ctrl+K and Cmd+K focus the bar and are prevented', () => {
    mount(<DashboardCommandBar />);
    const a = press(window, { key: 'k', ctrlKey: true });
    expect(a.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    act(() => input().blur());
    const b = press(window, { key: 'K', metaKey: true });
    expect(b.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it('a bubble-phase window listener (the section finder) never sees the shortcut', () => {
    const finder = jest.fn();
    window.addEventListener('keydown', finder);
    try {
      mount(<DashboardCommandBar />);
      press(window, { key: 'k', ctrlKey: true });
      press(window, { key: 'k', metaKey: true });
      press(document.body, { key: 'k', ctrlKey: true });
      expect(finder).not.toHaveBeenCalled();
      // other keys still reach it; Ctrl+Shift+K no longer does (swallowed, T-524 round 2)
      press(window, { key: 'a' });
      press(window, { key: 'k', ctrlKey: true, shiftKey: true });
      press(window, { key: 'k' });
      expect(finder).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('keydown', finder);
    }
  });

  it('with the real SectionFinderPanel mounted, Ctrl+K focuses the bar and the finder stays shut', async () => {
    const toggled = jest.fn();
    window.addEventListener('keydown', toggled);
    mount(
      <>
        <DashboardCommandBar />
        <SectionFinderPanel />
      </>,
    );
    window.removeEventListener('keydown', toggled);
    const ev = press(window, { key: 'k', ctrlKey: true });
    await flush();
    expect(document.activeElement).toBe(input());
    expect(ev.defaultPrevented).toBe(true);
    // the finder renders a dialog when it opens; it must not exist
    expect(q('[role=dialog]')).toBeNull();
  });

  it('exactly one keydown listener is added for the hotkey, in the capture phase, and removed on unmount', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const m = mount(<DashboardCommandBar />);
    const added = add.mock.calls.filter((c) => c[0] === 'keydown');
    expect(added).toHaveLength(1);
    expect(added[0][2]).toEqual({ capture: true });
    m.unmount();
    const removed = remove.mock.calls.filter((c) => c[0] === 'keydown');
    expect(
      removed.some((c) => c[1] === added[0][1] && (c[2] as { capture: boolean }).capture),
    ).toBe(true);
    // after unmount the finder gets the key again
    const finder = jest.fn();
    window.addEventListener('keydown', finder);
    press(window, { key: 'k', ctrlKey: true });
    window.removeEventListener('keydown', finder);
    expect(finder).toHaveBeenCalledTimes(1);
  });

  it('hotkeySuspended passes through: no keydown listener, and the finder gets Ctrl+K again; toggling restores it', () => {
    const finder = jest.fn();
    window.addEventListener('keydown', finder);
    try {
      const add = jest.spyOn(window, 'addEventListener');
      const m = mount(<DashboardCommandBar hotkeySuspended />);
      expect(add.mock.calls.filter((c) => c[0] === 'keydown')).toHaveLength(0);
      add.mockRestore();
      const ev = press(window, { key: 'k', ctrlKey: true });
      expect(ev.defaultPrevented).toBe(false);
      expect(finder).toHaveBeenCalledTimes(1);
      expect(document.activeElement).not.toBe(input());
      m.rerender(<DashboardCommandBar hotkeySuspended={false} />);
      const back = press(window, { key: 'k', ctrlKey: true });
      expect(back.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(input());
      expect(finder).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', finder);
    }
  });

  it('Ctrl+Shift+K / Ctrl+Alt+K are swallowed (the finder would otherwise toggle) but do not focus the bar', () => {
    const finder = jest.fn();
    window.addEventListener('keydown', finder);
    try {
      mount(<DashboardCommandBar />);
      expect(press(window, { key: 'k', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(
        true,
      );
      expect(press(window, { key: 'k', metaKey: true, altKey: true }).defaultPrevented).toBe(true);
      expect(finder).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(input());
    } finally {
      window.removeEventListener('keydown', finder);
    }
  });

  it('a double Ctrl+K keeps focus on the bar (no toggle-off)', () => {
    mount(<DashboardCommandBar />);
    press(window, { key: 'k', ctrlKey: true });
    press(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(input());
  });
});
