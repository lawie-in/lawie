/**
 * T-242 — web side of the sign-up source (Ajay conditions 1-3).
 * sessionStorage only; caps and drops; blocked storage never throws; address bar cleaned.
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import {
  SIGNUP_SOURCE_STORAGE_KEY,
  SignupSourceCapture,
  captureSignupSource,
  clearSignupSource,
  readSignupSource,
  removeUtmFromAddressBar,
  sanitizeUtmValue,
  signupSourceFromSearch,
  urlWithoutUtm,
} from '../signup-source';

// react-dom/client + act (no @testing-library/dom in this workspace, as in AnalyticsConsent.test).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLElement | null = null;
function render(ui: React.ReactElement): { container: HTMLElement } {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
  return { container: host };
}

function stored(): unknown {
  const raw = window.sessionStorage.getItem(SIGNUP_SOURCE_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  jest.restoreAllMocks();
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('sanitizeUtmValue', () => {
  it('trims and keeps a normal value', () => {
    expect(sanitizeUtmValue('  news ')).toBe('news');
  });
  it('caps at 100 characters', () => {
    expect(sanitizeUtmValue('a'.repeat(101))).toBe('a'.repeat(100));
  });
  it.each(['a@b.co', '@x', '9876543210', '1234567', 'id-1234567-x'])('drops %s', (v) => {
    expect(sanitizeUtmValue(v)).toBeUndefined();
  });
  it('keeps 6 digits', () => {
    expect(sanitizeUtmValue('sale123456')).toBe('sale123456');
  });
  it('drops a digit run that straddles the cap', () => {
    expect(sanitizeUtmValue('a'.repeat(97) + '1234567')).toBeUndefined();
  });
  it.each([undefined, null, 3, {}, ['a'], '', '   '])('drops %p', (v) => {
    expect(sanitizeUtmValue(v)).toBeUndefined();
  });
});

describe('captureSignupSource', () => {
  it('stores the three tags from a URL with a usable tag, as camelCase', () => {
    captureSignupSource('?utm_source=x&utm_medium=y&utm_campaign=z');
    expect(stored()).toEqual({ utmSource: 'x', utmMedium: 'y', utmCampaign: 'z' });
    expect(readSignupSource()).toEqual({ utmSource: 'x', utmMedium: 'y', utmCampaign: 'z' });
  });

  it('keeps only the three keys (utm_term, utm_content, gclid, ref are ignored)', () => {
    captureSignupSource('?utm_source=x&utm_term=t&utm_content=c&gclid=g&ref=ABC');
    expect(stored()).toEqual({ utmSource: 'x' });
  });

  it('stores nothing when there is no tag, or none survives', () => {
    captureSignupSource('');
    captureSignupSource('?foo=bar');
    captureSignupSource('?utm_source=a%40b.co&utm_medium=1234567&utm_campaign=');
    expect(window.sessionStorage.length).toBe(0);
    expect(readSignupSource()).toBeNull();
  });

  it('a URL without tags leaves earlier stored tags alone', () => {
    captureSignupSource('?utm_source=first');
    captureSignupSource('?other=1');
    expect(stored()).toEqual({ utmSource: 'first' });
  });

  it('a later tagged link replaces the earlier one', () => {
    captureSignupSource('?utm_source=first&utm_medium=m');
    captureSignupSource('?utm_source=second');
    expect(stored()).toEqual({ utmSource: 'second' });
  });

  it('caps at 100 and drops bad values, keeping good ones', () => {
    captureSignupSource(
      `?utm_source=${'s'.repeat(150)}&utm_medium=a%40b.co&utm_campaign=call9876543210`,
    );
    expect(stored()).toEqual({ utmSource: 's'.repeat(100) });
  });

  it('uses sessionStorage only: localStorage and document.cookie stay untouched', () => {
    const lsSet = jest.spyOn(Storage.prototype, 'setItem');
    captureSignupSource('?utm_source=x&utm_medium=y&utm_campaign=z');
    // Every setItem went to sessionStorage (this === window.sessionStorage).
    // @types/jest types mock.instances as the return type (void); at runtime they are the `this` Storage.
    const instances = lsSet.mock.instances as unknown as Storage[];
    expect(instances.every((i) => i === window.sessionStorage)).toBe(true);
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('writes nothing to localStorage or cookie from the capture component either', () => {
    window.history.replaceState(null, '', '/pricing?utm_source=x');
    render(<SignupSourceCapture />);
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(stored()).toEqual({ utmSource: 'x' });
  });

  it('blocked setItem does not throw', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => captureSignupSource('?utm_source=x')).not.toThrow();
  });

  it('a throwing sessionStorage getter does not throw anywhere', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      expect(() => captureSignupSource('?utm_source=x')).not.toThrow();
      expect(() => readSignupSource()).not.toThrow();
      expect(readSignupSource()).toBeNull();
      expect(() => clearSignupSource()).not.toThrow();
    } finally {
      Object.defineProperty(window, 'sessionStorage', desc);
    }
  });
});

describe('readSignupSource / clearSignupSource', () => {
  it('returns null for empty, corrupt, array and non-object values', () => {
    expect(readSignupSource()).toBeNull();
    for (const raw of ['{bad', '[1]', '"s"', 'null', '5']) {
      window.sessionStorage.setItem(SIGNUP_SOURCE_STORAGE_KEY, raw);
      expect(readSignupSource()).toBeNull();
    }
  });

  it('sanitizes again on read (a tampered value does not get through)', () => {
    window.sessionStorage.setItem(
      SIGNUP_SOURCE_STORAGE_KEY,
      JSON.stringify({
        utmSource: 'a@b.co',
        utmMedium: 'ok',
        utmCampaign: 'x'.repeat(300),
        extra: 1,
      }),
    );
    expect(readSignupSource()).toEqual({ utmMedium: 'ok', utmCampaign: 'x'.repeat(100) });
  });

  it('clear removes the key', () => {
    captureSignupSource('?utm_source=x');
    clearSignupSource();
    expect(readSignupSource()).toBeNull();
    expect(window.sessionStorage.getItem(SIGNUP_SOURCE_STORAGE_KEY)).toBeNull();
  });
});

describe('signupSourceFromSearch', () => {
  it('works with and without the leading ?', () => {
    expect(signupSourceFromSearch('utm_source=a')).toEqual({ utmSource: 'a' });
    expect(signupSourceFromSearch('?utm_source=a')).toEqual({ utmSource: 'a' });
  });
});

describe('urlWithoutUtm / removeUtmFromAddressBar', () => {
  it('urlWithoutUtm removes every utm_* and keeps path, other params and hash', () => {
    expect(
      urlWithoutUtm('https://lawie.in/pricing?a=1&utm_source=x&UTM_Term=t&b=2&utm_medium=y#plans'),
    ).toBe('/pricing?a=1&b=2#plans');
  });
  it('drops the ? when nothing is left', () => {
    expect(urlWithoutUtm('https://lawie.in/pricing?utm_source=x')).toBe('/pricing');
    expect(urlWithoutUtm('https://lawie.in/pricing?utm_source=x#h')).toBe('/pricing#h');
  });
  it('returns null when there is no utm_*, or the URL is invalid', () => {
    expect(urlWithoutUtm('https://lawie.in/pricing?a=1')).toBeNull();
    expect(urlWithoutUtm('not a url')).toBeNull();
  });

  it('removes utm_* from the address bar via replaceState, keeping the rest', () => {
    window.history.replaceState(null, '', '/pricing?ref=ABC&utm_source=x&utm_campaign=z#top');
    const spy = jest.spyOn(window.history, 'replaceState');
    removeUtmFromAddressBar();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/pricing');
    expect(window.location.search).toBe('?ref=ABC');
    expect(window.location.hash).toBe('#top');
  });

  it('does not touch history when there is no utm_*', () => {
    window.history.replaceState(null, '', '/pricing?ref=ABC');
    const spy = jest.spyOn(window.history, 'replaceState');
    removeUtmFromAddressBar();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not throw when replaceState throws', () => {
    window.history.replaceState(null, '', '/p?utm_source=x');
    jest.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(() => removeUtmFromAddressBar()).not.toThrow();
  });
});

describe('SignupSourceCapture', () => {
  it('renders nothing, captures the tags and cleans the address bar', () => {
    window.history.replaceState(null, '', '/pricing?utm_source=x&utm_medium=y&utm_campaign=z');
    const { container } = render(<SignupSourceCapture />);
    expect(container).toBeEmptyDOMElement();
    expect(stored()).toEqual({ utmSource: 'x', utmMedium: 'y', utmCampaign: 'z' });
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/pricing');
  });

  it('captures nothing on a page without tags', () => {
    window.history.replaceState(null, '', '/pricing');
    render(<SignupSourceCapture />);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('with blocked storage it still cleans the address bar and does not throw', () => {
    window.history.replaceState(null, '', '/pricing?utm_source=x');
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => render(<SignupSourceCapture />)).not.toThrow();
    expect(window.location.search).toBe('');
  });
});

describe('no logging', () => {
  it('writes nothing to the console', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    window.history.replaceState(null, '', '/p?utm_source=secretval');
    render(<SignupSourceCapture />);
    readSignupSource();
    expect(spies.every((s) => s.mock.calls.length === 0)).toBe(true);
  });
});
