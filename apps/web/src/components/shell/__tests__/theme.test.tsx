import { act } from 'react';

import {
  ThemeProvider,
  ThemeToggle,
  THEME_INIT_SCRIPT,
  useTheme,
  TopBar,
} from '@/components/shell';
import { InkChip } from '@/components/ui';
import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  removeMatchMedia,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const DARK = '(prefers-color-scheme: dark)';
const root = () => document.documentElement;
const runScript = () => new Function(THEME_INIT_SCRIPT)();

function Probe() {
  const t = useTheme();
  return <output data-testid="probe">{`${t.preference}|${t.resolved}`}</output>;
}
const probe = () => q('[data-testid=probe]')!.textContent;

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute('data-theme');
  root().removeAttribute('data-theme-pref');
  root().className = '';
});
afterEach(() => {
  cleanupMounted();
  jest.restoreAllMocks();
});

describe('ThemeProvider', () => {
  it('defaults to system and resolves daylight when the system is light', () => {
    stubMatchMedia({ [DARK]: false });
    mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toBe('system|daylight');
    expect(root().getAttribute('data-theme')).toBe('daylight');
    expect(root().getAttribute('data-theme-pref')).toBe('system');
  });

  it('resolves night when the system is dark', () => {
    stubMatchMedia({ [DARK]: true });
    mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toBe('system|night');
    expect(root().getAttribute('data-theme')).toBe('night');
  });

  it('follows the system setting live while the preference is system', () => {
    const mm = stubMatchMedia({ [DARK]: false });
    mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    mm.set(DARK, true);
    expect(probe()).toBe('system|night');
    expect(root().getAttribute('data-theme')).toBe('night');
    mm.set(DARK, false);
    expect(root().getAttribute('data-theme')).toBe('daylight');
  });

  it('ignores system changes once the user picked an explicit theme', () => {
    const mm = stubMatchMedia({ [DARK]: false });
    localStorage.setItem('lawie-theme', 'daylight');
    mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    mm.set(DARK, true);
    expect(probe()).toBe('daylight|daylight');
    expect(root().getAttribute('data-theme')).toBe('daylight');
  });

  it('reads a stored preference and ignores garbage', () => {
    stubMatchMedia({ [DARK]: false });
    localStorage.setItem('lawie-theme', 'night');
    const first = mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toBe('night|night');
    first.unmount();
    // the pre-hydration script would have reset <html> for the garbage value
    root().removeAttribute('data-theme-pref');
    localStorage.setItem('lawie-theme', 'purple');
    mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toBe('system|daylight');
  });

  it('setPreference persists under lawie-theme and updates <html>', () => {
    stubMatchMedia({ [DARK]: false });
    let api!: ReturnType<typeof useTheme>;
    function Grab() {
      api = useTheme();
      return null;
    }
    mount(
      <ThemeProvider>
        <Grab />
      </ThemeProvider>,
    );
    act(() => api.setPreference('night'));
    expect(localStorage.getItem('lawie-theme')).toBe('night');
    expect(root().getAttribute('data-theme')).toBe('night');
    expect(root().getAttribute('data-theme-pref')).toBe('night');
    act(() => api.setPreference('system'));
    expect(localStorage.getItem('lawie-theme')).toBe('system');
    expect(root().getAttribute('data-theme')).toBe('daylight');
    // invalid values are rejected
    act(() => api.setPreference('bogus' as never));
    expect(api.preference).toBe('system');
    expect(localStorage.getItem('lawie-theme')).toBe('system');
  });

  it('never adds a dark class to <html> or <body>', () => {
    stubMatchMedia({ [DARK]: true });
    let api!: ReturnType<typeof useTheme>;
    function Grab() {
      api = useTheme();
      return null;
    }
    mount(
      <ThemeProvider>
        <Grab />
      </ThemeProvider>,
    );
    act(() => api.setPreference('night'));
    expect(root().classList.contains('dark')).toBe(false);
    expect(document.body.classList.contains('dark')).toBe(false);
    expect(root().getAttribute('data-theme')).toBe('night');
  });

  it('works when localStorage throws on read and write', () => {
    stubMatchMedia({ [DARK]: true });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    let api!: ReturnType<typeof useTheme>;
    function Grab() {
      api = useTheme();
      return <Probe />;
    }
    mount(
      <ThemeProvider>
        <Grab />
      </ThemeProvider>,
    );
    expect(probe()).toBe('system|night');
    expect(() => act(() => api.setPreference('daylight'))).not.toThrow();
    expect(probe()).toBe('daylight|daylight');
    expect(root().getAttribute('data-theme')).toBe('daylight');
  });

  it('works when matchMedia is missing (daylight)', () => {
    removeMatchMedia();
    mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(probe()).toBe('system|daylight');
    expect(root().getAttribute('data-theme')).toBe('daylight');
  });

  it('adopts a change made in another tab (storage event)', () => {
    stubMatchMedia({ [DARK]: false });
    mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'lawie-theme', newValue: 'night' }));
    });
    expect(probe()).toBe('night|night');
    // other keys are ignored
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'daylight' }));
    });
    expect(probe()).toBe('night|night');
  });

  it('removes the media query listener on unmount', () => {
    const mm = stubMatchMedia({ [DARK]: false });
    const m = mount(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(mm.listenerCount(DARK)).toBeGreaterThan(0);
    m.unmount();
    expect(mm.listenerCount(DARK)).toBe(0);
  });

  it('useTheme outside a provider is a read-only system/daylight fallback', () => {
    mount(<Probe />);
    expect(probe()).toBe('system|daylight');
  });
});

describe('THEME_INIT_SCRIPT', () => {
  it('uses the stored preference', () => {
    stubMatchMedia({ [DARK]: false });
    localStorage.setItem('lawie-theme', 'night');
    runScript();
    expect(root().getAttribute('data-theme')).toBe('night');
    expect(root().getAttribute('data-theme-pref')).toBe('night');
  });

  it('system + dark device gives night; system + light gives daylight', () => {
    stubMatchMedia({ [DARK]: true });
    runScript();
    expect(root().getAttribute('data-theme')).toBe('night');
    expect(root().getAttribute('data-theme-pref')).toBe('system');
    stubMatchMedia({ [DARK]: false });
    runScript();
    expect(root().getAttribute('data-theme')).toBe('daylight');
  });

  it('is safe when storage throws', () => {
    stubMatchMedia({ [DARK]: true });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('x');
    });
    expect(runScript).not.toThrow();
    expect(root().getAttribute('data-theme-pref')).toBe('system');
    expect(root().getAttribute('data-theme')).toBe('night');
  });

  it('is safe when matchMedia is missing or throws', () => {
    removeMatchMedia();
    expect(runScript).not.toThrow();
    expect(root().getAttribute('data-theme')).toBe('daylight');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error('x');
      },
    });
    expect(runScript).not.toThrow();
    expect(root().getAttribute('data-theme')).toBe('daylight');
  });

  it('is safe when window.localStorage itself throws', () => {
    stubMatchMedia({ [DARK]: false });
    const spy = jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(runScript).not.toThrow();
    expect(root().getAttribute('data-theme')).toBe('daylight');
    spy.mockRestore();
  });

  it('treats an invalid stored value as system and never touches the dark class', () => {
    stubMatchMedia({ [DARK]: false });
    localStorage.setItem('lawie-theme', 'neon');
    runScript();
    expect(root().getAttribute('data-theme-pref')).toBe('system');
    expect(root().classList.contains('dark')).toBe(false);
  });
});

describe('ThemeToggle', () => {
  it('is a fieldset with legend Theme and three radios', () => {
    stubMatchMedia({ [DARK]: false });
    const { container } = mount(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(q('fieldset', container)).not.toBeNull();
    expect(q('legend', container)!.textContent).toBe('Theme');
    const radios = qa('input[type=radio]', container) as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(['night', 'daylight', 'system']);
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(qa('label', container).map((l) => l.textContent)).toEqual([
      'Night',
      'Daylight',
      'System',
    ]);
    expect(radios.find((r) => r.checked)!.value).toBe('system');
  });

  it('choosing a radio changes the theme, persists it and moves the checked state', () => {
    stubMatchMedia({ [DARK]: false });
    const { container } = mount(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    click(q('input[value=night]', container));
    expect(root().getAttribute('data-theme')).toBe('night');
    expect(localStorage.getItem('lawie-theme')).toBe('night');
    expect((q('input[value=night]', container) as HTMLInputElement).checked).toBe(true);
    expect((q('input[value=system]', container) as HTMLInputElement).checked).toBe(false);
  });

  it('supports translated labels and optional help linked by aria-describedby', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <ThemeToggle legend="थीम" labels={{ night: 'रात' }} help="Follows device." />
      </ThemeProvider>,
    );
    expect(q('legend', container)!.textContent).toBe('थीम');
    expect(qa('label', container)[0].textContent).toBe('रात');
    const helpId = q('fieldset', container)!.getAttribute('aria-describedby')!;
    expect(container.querySelector(`#${CSS.escape(helpId)}`)!.textContent).toBe('Follows device.');
  });

  it('hideLegend keeps the legend in the DOM as sr-only', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <ThemeToggle hideLegend />
      </ThemeProvider>,
    );
    expect(q('legend', container)!.className).toContain('sr-only');
  });
});

describe('TopBar', () => {
  it('signed-in shows brand link, ink chip, theme toggle and menu', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <TopBar
          variant="signed-in"
          homeHref="/dashboard"
          nav={<a href="/x">Docs</a>}
          navLabel="Main"
          inkChip={<InkChip balance={32} />}
          menu={<button>Menu</button>}
        />
      </ThemeProvider>,
    );
    expect(q('header', container)!.getAttribute('data-variant')).toBe('signed-in');
    expect(q('a[href="/dashboard"]', container)!.textContent).toBe('Lawie');
    expect(q('nav[aria-label=Main]', container)).not.toBeNull();
    expect(container.textContent).toContain('32 Ink');
    expect(q('fieldset legend', container)!.textContent).toBe('Theme');
    expect(q('legend', container)!.className).toContain('sr-only');
  });

  it('signed-out hides the ink chip and shows actions; showThemeToggle=false removes the toggle', () => {
    stubMatchMedia();
    const { container } = mount(
      <ThemeProvider>
        <TopBar
          variant="signed-out"
          inkChip={<InkChip balance={5} />}
          actions={<a href="/login">Sign in</a>}
          showThemeToggle={false}
        />
      </ThemeProvider>,
    );
    expect(container.textContent).not.toContain('5 Ink');
    expect(container.textContent).toContain('Sign in');
    expect(q('fieldset', container)).toBeNull();
  });
});
