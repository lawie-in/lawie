// T-520 item 8: the dashboard command bar's routing and hotkey.
import { act } from 'react';
import { useRouter } from 'next/navigation';

import {
  COMMAND_CHIP_HREF,
  COMMAND_QUERY_MAX,
  DashboardCommandBar,
  submitHref,
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
});
afterEach(cleanupMounted);

const input = () => q('[role=combobox]') as HTMLInputElement;
const option = (label: string) => qa('[role=option]').find((o) => o.textContent === label)!;

describe('submitHref', () => {
  it('blank or whitespace goes to plain /dashboard/new', () => {
    expect(submitHref('')).toBe('/dashboard/new');
    expect(submitHref('   \n\t ')).toBe('/dashboard/new');
  });

  it('trims and encodes spaces', () => {
    expect(submitHref('  bail for Asha  ')).toBe('/dashboard/new?q=bail%20for%20Asha');
  });

  it('encodes ampersand, hash, equals, question mark and slash so the query cannot be broken out of', () => {
    const href = submitHref('a&b=c#d?e/f');
    expect(href).toBe('/dashboard/new?q=a%26b%3Dc%23d%3Fe%2Ff');
    expect(new URL(href, 'http://x').searchParams.get('q')).toBe('a&b=c#d?e/f');
  });

  it('encodes unicode and round-trips it', () => {
    const text = 'जमानत आवेदन — ₹5,000 “quoted”';
    const href = submitHref(text);
    expect(href).not.toMatch(/[^\x20-\x7e]/);
    expect(new URL(href, 'http://x').searchParams.get('q')).toBe(text);
  });

  it('cuts to 500 characters after trimming and before encoding', () => {
    expect(COMMAND_QUERY_MAX).toBe(500);
    const long = `  ${'a'.repeat(600)}  `;
    const got = new URL(submitHref(long), 'http://x').searchParams.get('q')!;
    expect(got).toBe('a'.repeat(500));
    // leading spaces are trimmed first, so they do not eat into the 500
    expect(submitHref(` ${'b'.repeat(500)}`)).toBe(`/dashboard/new?q=${'b'.repeat(500)}`);
    // cut happens before encoding, so the cap counts characters, not %-escapes
    const mid = `w${' '.repeat(10)}${'z'.repeat(600)}`;
    const cut = new URL(submitHref(mid), 'http://x').searchParams.get('q')!;
    expect(cut).toHaveLength(500);
    expect(cut.startsWith('w          z')).toBe(true);
  });
});

describe('submitHref: astral characters and lone surrogates', () => {
  it('500 emoji never throw; the cut keeps every pair whole', () => {
    const href = submitHref('😀'.repeat(600));
    const got = new URL(href, 'http://x').searchParams.get('q')!;
    expect(Array.from(got)).toHaveLength(500);
    expect(got).toBe('😀'.repeat(500));
    expect(() => decodeURIComponent(href.split('q=')[1])).not.toThrow();
  });

  it('a pair that straddles unit 500 is not split', () => {
    const got = new URL(submitHref(`${'a'.repeat(499)}😀tail`), 'http://x').searchParams.get('q')!;
    expect(got).toBe(`${'a'.repeat(499)}😀`);
  });

  it('a lone surrogate never throws and yields a valid /dashboard/new href', () => {
    for (const text of ['\ud800', 'abc\udc00def', `${'x'.repeat(10)}\ud83d`]) {
      let href = '';
      expect(() => {
        href = submitHref(text);
      }).not.toThrow();
      expect(href.startsWith('/dashboard/new')).toBe(true);
      expect(() => decodeURIComponent(href.split('q=')[1] ?? '')).not.toThrow();
    }
  });

  it('typing a lone surrogate and pressing Draft does not throw', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), 'bail \ud800 for Asha');
    expect(() => click(q('button[type=submit]'))).not.toThrow();
    expect(push).toHaveBeenCalledTimes(1);
    expect((push.mock.calls[0][0] as string).startsWith('/dashboard/new')).toBe(true);
  });

  it('blank still goes to /dashboard/new', () => {
    expect(submitHref('  \n ')).toBe('/dashboard/new');
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

  it('Draft with text pushes /dashboard/new?q=<text>', () => {
    mount(<DashboardCommandBar />);
    typeInto(input(), '  bail for a client & family ');
    click(q('button[type=submit]'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/new?q=bail%20for%20a%20client%20%26%20family');
  });

  it('Draft with no text pushes nothing (it focuses the input instead)', () => {
    mount(<DashboardCommandBar />);
    click(q('button[type=submit]'));
    expect(push).not.toHaveBeenCalled();
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
