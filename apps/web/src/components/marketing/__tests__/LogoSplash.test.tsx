import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { LogoSplash } from '../LogoSplash';

// T-332 (AC2): LogoSplash ends the splash before it touches sessionStorage, so a storage throw
// never leaves the consent card held back. jsdom has no Web Animations or SVG text metrics, so
// those two are stubbed; the rest is the real component.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ATTR = 'data-lawie-splash';
const END = 'lawie:splash-end';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.useFakeTimers();
  sessionStorage.clear();
  document.documentElement.removeAttribute(ATTR);
  (Element.prototype as unknown as { animate: unknown }).animate = () => ({ cancel: () => {} });
  (SVGElement.prototype as unknown as { getStartPositionOfChar: unknown }).getStartPositionOfChar =
    (i: number) => ({ x: i * 10 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
  document.documentElement.removeAttribute(ATTR);
});

async function mountSplash() {
  await act(async () => {
    root.render(<LogoSplash fontFamily="Fraunces" />);
  });
}

describe('LogoSplash splash end', () => {
  it('marks the splash open while it shows', async () => {
    await mountSplash();
    expect(document.documentElement.getAttribute(ATTR)).toBe('open');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('ends the splash and fires the end event even when sessionStorage.setItem throws', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const onEnd = jest.fn();
    window.addEventListener(END, onEnd);

    await mountSplash();
    expect(document.documentElement.getAttribute(ATTR)).toBe('open');

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });

    expect(document.documentElement.hasAttribute(ATTR)).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(container.querySelector('svg')).toBeNull();
    window.removeEventListener(END, onEnd);
  });

  it('ends the splash and remembers it when storage works', async () => {
    const onEnd = jest.fn();
    window.addEventListener(END, onEnd);
    await mountSplash();
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(document.documentElement.hasAttribute(ATTR)).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('lawie_splash_seen')).toBe('1');
    window.removeEventListener(END, onEnd);
  });

  // T-339 (AC1): blocked storage counts as "not seen". The splash shows, ends, and throws nothing.
  describe.each([
    [
      'getItem throws',
      () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('SecurityError');
        });
        return () => {};
      },
    ],
    [
      'the sessionStorage getter throws',
      () => {
        const own = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
        Object.defineProperty(window, 'sessionStorage', {
          configurable: true,
          get() {
            throw new Error('SecurityError');
          },
        });
        return () => {
          if (own) Object.defineProperty(window, 'sessionStorage', own);
          else delete (window as unknown as Record<string, unknown>).sessionStorage;
        };
      },
    ],
  ])('when %s', (_name, block) => {
    let restore: () => void;
    let errorSpy: jest.SpyInstance;
    const onWindowError = jest.fn();

    beforeEach(() => {
      restore = block();
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      onWindowError.mockClear();
      window.addEventListener('error', onWindowError);
    });

    afterEach(() => {
      window.removeEventListener('error', onWindowError);
      restore();
    });

    it('shows the splash, then ends it and fires the end event once', async () => {
      const onEnd = jest.fn();
      window.addEventListener(END, onEnd);

      await mountSplash();
      expect(document.documentElement.getAttribute(ATTR)).toBe('open');
      expect(container.querySelector('svg')).not.toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });

      expect(document.documentElement.hasAttribute(ATTR)).toBe(false);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(container.querySelector('svg')).toBeNull();
      window.removeEventListener(END, onEnd);
    });

    it('lets no error escape', async () => {
      await expect(mountSplash()).resolves.toBeUndefined();
      await expect(
        act(async () => {
          jest.advanceTimersByTime(10_000);
        }),
      ).resolves.toBeUndefined();

      expect(errorSpy).not.toHaveBeenCalled();
      expect(onWindowError).not.toHaveBeenCalled();
    });
  });

  it('does not show again once seen', async () => {
    sessionStorage.setItem('lawie_splash_seen', '1');
    await mountSplash();
    expect(document.documentElement.hasAttribute(ATTR)).toBe(false);
    expect(container.querySelector('svg')).toBeNull();
  });
});
