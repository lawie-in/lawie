// T-531 AC1 (Rajesh, DESIGN.md Navigation): the phone menu of the top bar. Its name is fixed
// ("Menu"), the open state is aria-expanded, focus goes in and comes back on Escape, it closes
// when the viewport reaches 720px, and it holds exactly one theme fieldset. jsdom has no layout:
// the 720px gate is the same media query the component subscribes to, driven through matchMedia.
import { act } from 'react';

import { ThemeProvider } from '../ThemeProvider';
import { TopBar } from '../TopBar';
import { TOP_BAR_ROW_QUERY, TopBarMenu } from '../TopBarMenu';

import { TOP_BAR_COPY } from '@/components/marketing/nl-copy';
import {
  cleanupMounted,
  click,
  mount,
  press,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const TRIGGER = '[data-topbar-menu-trigger]';
const MENU = '[data-topbar-menu]';
const trigger = () => q(TRIGGER) as HTMLButtonElement;
// Radix restores focus from a setTimeout(0) when the content unmounts.
const settle = () => act(async () => new Promise<void>((r) => setTimeout(r, 10)));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-pref');
});
afterEach(cleanupMounted);

const bar = (extras?: React.ReactNode) => (
  <ThemeProvider>
    <TopBar variant="signed-out" mobileMenuExtras={extras} />
  </ThemeProvider>
);

describe('TopBarMenu trigger', () => {
  it('is a 44px button named "Menu" (signed copy), hidden from 720px', () => {
    stubMatchMedia();
    mount(bar());
    const b = trigger();
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-label')).toBe(TOP_BAR_COPY.en.menu);
    expect(b.getAttribute('aria-label')).toBe('Menu');
    const c = b.className.split(/\s+/);
    expect(c).toEqual(expect.arrayContaining(['h-11', 'w-11', 'min-[720px]:hidden']));
    expect(b.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    // The icon carries no text, so the accessible name is the label alone.
    expect(b.textContent).toBe('');
  });

  it('the name never changes with the open state; aria-expanded carries it', () => {
    stubMatchMedia();
    mount(bar());
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-label')).toBe('Menu');
    expect(trigger().textContent).toBe('');
    click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-label')).toBe('Menu');
  });

  it('Hindi: the label comes from props ("मेनू") and stays fixed while open', () => {
    stubMatchMedia();
    mount(
      <ThemeProvider>
        <TopBarMenu label={TOP_BAR_COPY.hi.menu}>
          <p>x</p>
        </TopBarMenu>
      </ThemeProvider>,
    );
    expect(trigger().getAttribute('aria-label')).toBe('मेनू');
    click(trigger());
    expect(trigger().getAttribute('aria-label')).toBe('मेनू');
    expect(q(MENU)!.getAttribute('aria-label')).toBe('मेनू');
  });
});

describe('TopBarMenu content', () => {
  it('is a labelled dialog on the Card fill, mounted only while open', () => {
    stubMatchMedia();
    mount(bar());
    expect(q(MENU)).toBeNull();
    click(trigger());
    const m = q(MENU)!;
    expect(m.getAttribute('role')).toBe('dialog');
    expect(m.getAttribute('aria-label')).toBe('Menu');
    const c = m.className.split(/\s+/);
    expect(c).toEqual(
      expect.arrayContaining([
        'bg-nl-card',
        'shadow-nl-card',
        'overscroll-contain',
        'overflow-y-auto',
      ]),
    );
  });

  it('holds exactly one theme fieldset (three radios), whatever the extras', () => {
    stubMatchMedia();
    mount(bar(<a href="/x">X</a>));
    click(trigger());
    expect(qa('fieldset', q(MENU)!)).toHaveLength(1);
    expect(qa('input[type=radio]', q(MENU)!)).toHaveLength(3);
    // The bar's own toggle sits outside the menu: two groups on the page, one in the menu.
    expect(qa('fieldset')).toHaveLength(2);
  });

  it('moves focus into the menu on open', async () => {
    stubMatchMedia();
    mount(bar(<a href="/x">X</a>));
    trigger().focus();
    click(trigger());
    await settle();
    expect(q(MENU)!.contains(document.activeElement)).toBe(true);
  });

  it('Escape closes it and returns focus to the trigger', async () => {
    stubMatchMedia();
    mount(bar(<a href="/x">X</a>));
    trigger().focus();
    click(trigger());
    await settle();
    expect(q(MENU)!.contains(document.activeElement)).toBe(true);
    press(document.activeElement ?? document.body, { key: 'Escape' });
    await settle();
    expect(q(MENU)).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('clicking a link inside closes it (the anchor navigates behind it)', () => {
    stubMatchMedia();
    mount(bar(<a href="#faq">FAQ</a>));
    click(trigger());
    // jsdom does not implement navigation; keep the click from logging a not-implemented error.
    q(`${MENU} a[href="#faq"]`)!.addEventListener('click', (e) => e.preventDefault());
    click(q(`${MENU} a[href="#faq"]`));
    expect(q(MENU)).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking a control that is not a link (the theme radios) keeps it open', () => {
    stubMatchMedia();
    mount(bar());
    click(trigger());
    click(q(`${MENU} input[value=daylight]`));
    expect(q(MENU)).not.toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBe('daylight');
  });
});

describe('TopBarMenu at 720px and up', () => {
  it('queries exactly (min-width: 720px)', () => {
    expect(TOP_BAR_ROW_QUERY).toBe('(min-width: 720px)');
  });

  it('is forced closed when the viewport reaches 720px while it is open', () => {
    const mm = stubMatchMedia({ [TOP_BAR_ROW_QUERY]: false });
    mount(bar());
    click(trigger());
    expect(q(MENU)).not.toBeNull();
    mm.set(TOP_BAR_ROW_QUERY, true);
    expect(q(MENU)).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('does not open at 720px and up, even if the (hidden) trigger is activated', () => {
    stubMatchMedia({ [TOP_BAR_ROW_QUERY]: true });
    mount(bar());
    click(trigger());
    expect(q(MENU)).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens again after going back below 720px', () => {
    const mm = stubMatchMedia({ [TOP_BAR_ROW_QUERY]: true });
    mount(bar());
    mm.set(TOP_BAR_ROW_QUERY, false);
    click(trigger());
    expect(q(MENU)).not.toBeNull();
  });

  it('unsubscribes from the media query on unmount', () => {
    const mm = stubMatchMedia();
    const m = mount(bar());
    expect(mm.listenerCount(TOP_BAR_ROW_QUERY)).toBeGreaterThan(0);
    m.unmount();
    expect(mm.listenerCount(TOP_BAR_ROW_QUERY)).toBe(0);
  });
});

describe('break-ui: the menu with the worst realistic content', () => {
  const HI_LABELS = [
    'कैसे काम करता है',
    'दस्तावेज़ों के प्रकार',
    'कीमत और इंक की जानकारी',
    'अक्सर पूछे जाने वाले प्रश्न',
  ];

  it('long Hindi labels stay in a width-capped, scrollable column (no fixed height, no nowrap)', () => {
    stubMatchMedia();
    mount(
      bar(
        <nav aria-label="मुख्य">
          {HI_LABELS.map((l) => (
            <a key={l} href={`#${l}`} className="flex min-h-[44px] w-full items-center">
              {l}
            </a>
          ))}
        </nav>,
      ),
    );
    click(trigger());
    const m = q(MENU)!;
    expect(qa('nav a', m).map((a) => a.textContent)).toEqual(HI_LABELS);
    const c = m.className;
    // 320px phone: the menu is min(320px, 100vw - 32px) wide, never wider than the viewport.
    expect(c).toContain('w-[min(320px,calc(100vw-32px))]');
    // Taller content scrolls inside the available height instead of running off the screen.
    expect(c).toContain('max-h-[var(--radix-popover-content-available-height)]');
    expect(c).toContain('overflow-y-auto');
    expect(c).not.toMatch(/whitespace-nowrap|truncate|(^|\s)h-\[/);
    expect(c).toContain('flex-col');
  });
});
