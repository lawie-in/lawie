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

import { takeDraftPrefill } from '@/components/intake/initialQuery';
import { DESCRIPTION_MAX } from '@/lib/draftPrefill';

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

// A realistic matter text of exactly `n` characters that ends mid-sentence, so a cut is visible.
const matterText = (n: number): string => {
  const base =
    'The client is a sole earner and was arrested after the chargesheet was filed, the sureties are ready and the magistrate refused bail. ';
  const tail = ' he is the';
  return base.repeat(Math.ceil(n / base.length)).slice(0, n - tail.length) + tail;
};

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

  it('the limit is the shared DESCRIPTION_MAX (4000, pinned here too)', () => {
    expect(DRAFT_PREFILL_MAX).toBe(DESCRIPTION_MAX);
    expect(DRAFT_PREFILL_MAX).toBe(4000);
  });

  it('cuts to the limit after trimming (MAX passes whole, MAX+1 is cut to MAX)', () => {
    const M = DRAFT_PREFILL_MAX;
    expect(draftPrefill(`  ${'a'.repeat(M + 100)}  `)).toBe('a'.repeat(M));
    expect(draftPrefill('a'.repeat(M + 1))).toBe('a'.repeat(M));
    expect(draftPrefill('a'.repeat(M))).toBe('a'.repeat(M));
    // surrounding spaces are trimmed first, so they do not eat into the limit
    expect(draftPrefill(` ${'b'.repeat(M)} `)).toBe('b'.repeat(M));
    expect(draftPrefill('c'.repeat(M - 1))).toBe('c'.repeat(M - 1));
    const mid = `w${' '.repeat(10)}${'z'.repeat(M + 100)}`;
    const cut = draftPrefill(mid);
    expect(cut).toHaveLength(M);
    expect(cut.startsWith('w          z')).toBe(true);
  });

  it('a 500-character and a 501-character description are no longer cut (T-608)', () => {
    expect(draftPrefill('d'.repeat(500))).toHaveLength(500);
    expect(draftPrefill('d'.repeat(501))).toHaveLength(501);
  });

  it('whitespace that ends up at the cut is kept (the cut does not trim again)', () => {
    const M = DRAFT_PREFILL_MAX;
    const got = draftPrefill(`${'a'.repeat(M - 1)} ${'b'.repeat(10)}`);
    expect(got).toBe(`${'a'.repeat(M - 1)} `);
    expect(got).toHaveLength(M);
  });
});

describe('draftPrefill: astral characters and lone surrogates', () => {
  const M = DRAFT_PREFILL_MAX;

  it('emoji beyond the limit are cut in UTF-16 units with no split pair', () => {
    const got = draftPrefill('😀'.repeat(M));
    expect(got).toHaveLength(M); // M is even: M / 2 whole emoji
    expect(Array.from(got)).toHaveLength(M / 2);
    expect(got).toBe('😀'.repeat(M / 2));
  });

  it('a pair that straddles unit MAX is dropped, not split', () => {
    const got = draftPrefill(`${'a'.repeat(M - 1)}😀tail`);
    expect(got).toBe('a'.repeat(M - 1));
    expect(got).toHaveLength(M - 1);
  });

  it('a pair that ends exactly at unit MAX is kept', () => {
    const got = draftPrefill(`${'a'.repeat(M - 2)}😀tail`);
    expect(got).toBe(`${'a'.repeat(M - 2)}😀`);
    expect(got).toHaveLength(M);
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
    expect(draftPrefill(`${'a'.repeat(M - 1)}\ud800z`)).toBe(`${'a'.repeat(M - 1)}�`);
    expect(draftPrefill(`${'a'.repeat(M)}\ud800`)).toBe('a'.repeat(M));
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

  it('T-608 AC3: a 657-character description typed in the box arrives whole at the reader', () => {
    const text = matterText(657);
    expect(text).toHaveLength(657);
    mount(<DashboardCommandBar />);
    typeInto(input(), text);
    click(q('button[type=submit]'));
    expect(push).toHaveBeenCalledWith('/dashboard/new');
    const got = takeDraftPrefill(window.sessionStorage);
    expect(got).toHaveLength(657);
    expect(got).toBe(text);
    expect(got!.endsWith(' he is the')).toBe(true);
  });

  it.each([
    ['exactly MAX', DESCRIPTION_MAX, DESCRIPTION_MAX],
    ['MAX + 1 (cut to MAX, no error)', DESCRIPTION_MAX + 1, DESCRIPTION_MAX],
  ])(
    'T-608: %s characters typed in the box reach the reader as %d-capped text',
    (_n, typed, want) => {
      const text = matterText(typed);
      mount(<DashboardCommandBar />);
      typeInto(input(), text);
      expect(() => click(q('button[type=submit]'))).not.toThrow();
      expect(push).toHaveBeenCalledWith('/dashboard/new');
      expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBe(text.slice(0, want));
      expect(takeDraftPrefill(window.sessionStorage)).toBe(text.slice(0, want));
    },
  );

  it('T-608: a long description goes through sessionStorage only, never the URL', () => {
    const text = matterText(657);
    mount(<DashboardCommandBar />);
    typeInto(input(), text);
    click(q('button[type=submit]'));
    const url = push.mock.calls[0][0] as string;
    expect(url).toBe('/dashboard/new');
    expect(url).not.toContain('he%20is');
    expect(url).not.toContain('sole');
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

  it('a typed template name picked from the list goes to the chip page and carries the text (T-630)', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'plaint');
    click(option('Plaint'));
    expect(push).toHaveBeenCalledWith('/dashboard/new');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBe('plaint');
  });
});

describe('T-630: a chip or option picked with text typed carries the text and the kind', () => {
  const stored = () => window.sessionStorage.getItem(DRAFT_PREFILL_KEY);
  const draft = () => click(q('button[type=submit]'));
  const highlightFirst = () => press(input(), { key: 'ArrowDown' });

  it.each([
    ['Bail application', '/dashboard/new?kind=bail_regular'],
    ['Written statement', '/dashboard/new?kind=written_statement'],
    ['Legal notice', '/dashboard/new'],
    ['Plaint', '/dashboard/new'],
  ])('clicking "%s" with text typed pushes %s and stores the text', (label, href) => {
    const text = `${label} for Ravi`;
    mount(<DashboardCommandBar />);
    typeInto(input(), text);
    click(option(label));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(href);
    expect(stored()).toBe(text);
  });

  it('Enter on a highlighted option does the same as a click (kind + text)', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'Bail application for Ravi');
    highlightFirst();
    press(input(), { key: 'Enter' });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=bail_regular');
    expect(stored()).toBe('Bail application for Ravi');
  });

  it('Draft with a bail option highlighted pushes ?kind=bail_regular and stores the text', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'Bail application for Ravi');
    highlightFirst();
    draft();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=bail_regular');
    expect(stored()).toBe('Bail application for Ravi');
  });

  it('Draft with a written statement highlighted pushes ?kind=written_statement', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'Written statement for Ravi');
    highlightFirst();
    draft();
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=written_statement');
    expect(stored()).toBe('Written statement for Ravi');
  });

  it('Draft with a kind-less chip highlighted (Plaint) pushes plain /dashboard/new', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'plaint for Ravi');
    highlightFirst();
    draft();
    expect(push).toHaveBeenCalledWith('/dashboard/new');
    expect(stored()).toBe('plaint for Ravi');
  });

  it('plain Draft with no highlight is exactly /dashboard/new, even if the text names a template', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'Bail application for Ravi');
    draft();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toBe('/dashboard/new');
    expect(stored()).toBe('Bail application for Ravi');
  });

  it('after Escape drops the highlight, Draft is plain /dashboard/new', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'Bail application for Ravi');
    highlightFirst();
    press(input(), { key: 'Escape' });
    draft();
    expect(push).toHaveBeenCalledWith('/dashboard/new');
  });

  it('Browse all templates with text typed goes to /dashboard/templates and stores no text', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'browse all templates');
    const set = jest.spyOn(Storage.prototype, 'setItem');
    click(option('Browse all templates'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/templates');
    expect(set).not.toHaveBeenCalled();
    expect(stored()).toBeNull();
  });

  it('Browse all templates with text typed leaves a pre-existing key untouched', () => {
    window.sessionStorage.setItem(DRAFT_PREFILL_KEY, 'kept');
    mount(<DashboardCommandBar />);
    typeInto(input(), 'browse all templates');
    const remove = jest.spyOn(Storage.prototype, 'removeItem');
    click(option('Browse all templates'));
    expect(push).toHaveBeenCalledWith('/dashboard/templates');
    expect(remove).not.toHaveBeenCalled();
    expect(stored()).toBe('kept');
  });

  it('Draft with Browse highlighted goes to /dashboard/new with the text stored (pinned)', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'browse all templates');
    highlightFirst();
    draft();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/new');
    expect(stored()).toBe('browse all templates');
  });

  it('a chip click with the input empty neither writes nor removes the key', () => {
    window.sessionStorage.setItem(DRAFT_PREFILL_KEY, 'kept');
    mount(<DashboardCommandBar />);
    act(() => input().focus());
    const set = jest.spyOn(Storage.prototype, 'setItem');
    const remove = jest.spyOn(Storage.prototype, 'removeItem');
    click(option('Written statement'));
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=written_statement');
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(stored()).toBe('kept');
  });

  it('a whitespace-only input chip click neither writes nor removes the key', () => {
    window.sessionStorage.setItem(DRAFT_PREFILL_KEY, 'kept');
    mount(<DashboardCommandBar />);
    typeInto(input(), '   ');
    const set = jest.spyOn(Storage.prototype, 'setItem');
    const remove = jest.spyOn(Storage.prototype, 'removeItem');
    click(option('Bail application'));
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=bail_regular');
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(stored()).toBe('kept');
  });

  it('text longer than the limit is capped on the chip path', () => {
    const text = `Bail application ${matterText(DESCRIPTION_MAX + 500)}`;
    mount(<DashboardCommandBar />);
    typeInto(input(), text);
    click(option('Bail application'));
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=bail_regular');
    expect(stored()).toHaveLength(DESCRIPTION_MAX);
    expect(stored()).toBe(text.slice(0, DESCRIPTION_MAX));
  });

  it('a lone surrogate and surrounding spaces are sanitised on the chip path', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), '  Bail application \ud800 for Ravi  ');
    click(option('Bail application'));
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=bail_regular');
    expect(stored()).toBe('Bail application � for Ravi');
  });

  it('chip navigation still happens when sessionStorage throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    mount(<DashboardCommandBar />);
    typeInto(input(), 'Bail application for Ravi');
    click(option('Bail application'));
    expect(push).toHaveBeenCalledWith('/dashboard/new?kind=bail_regular');
  });

  it('no pushed URL ever contains the typed text or a q= param', () => {
    const text = 'Bail application for Ravi Zq7731';
    const paths: Array<() => void> = [
      () => click(option('Bail application')),
      () => {
        highlightFirst();
        press(input(), { key: 'Enter' });
      },
      () => {
        highlightFirst();
        draft();
      },
      () => draft(),
    ];
    for (const go of paths) {
      push.mockClear();
      window.sessionStorage.clear();
      const m = mount(<DashboardCommandBar />);
      typeInto(input(), text);
      go();
      expect(push).toHaveBeenCalledTimes(1);
      const url = push.mock.calls[0][0] as string;
      expect(url).not.toMatch(/Ravi|Zq7731|%|q=/);
      expect(url === '/dashboard/new' || url === '/dashboard/new?kind=bail_regular').toBe(true);
      expect(new URL(url, 'http://x').searchParams.has('q')).toBe(false);
      m.unmount();
    }
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
