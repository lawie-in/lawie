// T-531 AC4: below 640px the consent banner is a flush bottom sheet with the 12px top radius and
// safe-area padding; from 640px the bottom-left card is unchanged. jsdom has no layout, so
// "never covers the first heading" is checked in the browser (see the tester report), and here
// through the classes that bound its height (max(40vh, 8rem)) and pin it to the bottom edge.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';

import AnalyticsConsent from '../AnalyticsConsent';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 204 }),
  );
  (usePathname as jest.Mock).mockReturnValue('/pricing');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AnalyticsConsent />));
  await act(async () => {
    await Promise.resolve();
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.removeAttribute('data-consent-open');
});

const sheet = () => container.querySelector('section')!;
const cls = () => sheet().className.split(/\s+/);

describe('consent banner phone sheet (AC4)', () => {
  it('is shown on first visit', () => {
    expect(sheet()).not.toBeNull();
  });

  it('is flush with the bottom and both sides, with a 12px top radius and a top border only', () => {
    expect(cls()).toEqual(
      expect.arrayContaining(['fixed', 'inset-x-0', 'bottom-0', 'rounded-t-[12px]', 'border-t']),
    );
    expect(cls()).not.toContain('rounded-xl');
    expect(cls()).not.toContain('border');
    expect(cls()).not.toContain('inset-x-3');
  });

  it('clears the home indicator and the side insets', () => {
    expect(cls()).toEqual(
      expect.arrayContaining([
        'pb-[calc(16px+env(safe-area-inset-bottom,0px))]',
        'pl-[max(16px,env(safe-area-inset-left,0px))]',
        'pr-[max(16px,env(safe-area-inset-right,0px))]',
      ]),
    );
  });

  it('keeps its height cap, so it cannot grow over the first heading', () => {
    expect(cls()).toContain('max-h-[max(40vh,8rem)]');
  });

  it('from 640px the card is the bottom-left 400px one, now with the 4px Card radius (T-549)', () => {
    expect(cls()).toEqual(
      expect.arrayContaining([
        'sm:inset-x-auto',
        'sm:bottom-6',
        'sm:left-6',
        'sm:w-[400px]',
        'sm:rounded-nl-md',
        'sm:border',
        'sm:p-5',
      ]),
    );
    expect(cls()).not.toContain('sm:rounded-xl');
  });
});
