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

describe('DashboardCommandBar hotkey', () => {
  it('shows no Ctrl K hint (hotkey is off)', () => {
    const { container } = mount(<DashboardCommandBar />);
    expect(container.textContent).not.toMatch(/Ctrl K|⌘ K/);
    expect(input().getAttribute('aria-describedby')).toBeNull();
  });

  it('Ctrl+K does not focus it and is not swallowed; the section finder keeps its own handler', async () => {
    mount(
      <>
        <DashboardCommandBar />
        <SectionFinderPanel />
      </>,
    );
    expect(document.activeElement).not.toBe(input());
    const ev = press(window, { key: 'k', ctrlKey: true });
    await flush();
    expect(document.activeElement).not.toBe(input());
    expect(input().getAttribute('aria-expanded')).toBe('false');
    // the finder's handler ran (it prevents default and toggles the panel)
    expect(ev.defaultPrevented).toBe(true);
  });

  it('on its own, Ctrl+K and Cmd+K do nothing to the bar', () => {
    mount(<DashboardCommandBar />);
    const a = press(window, { key: 'k', ctrlKey: true });
    const b = press(window, { key: 'k', metaKey: true });
    expect(document.activeElement).not.toBe(input());
    expect(a.defaultPrevented).toBe(false);
    expect(b.defaultPrevented).toBe(false);
  });
});
