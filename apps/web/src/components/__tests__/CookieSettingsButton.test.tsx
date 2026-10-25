import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import CookieSettingsButton from '../CookieSettingsButton';

// T-332 (AC4): CookieSettingsButton. Mounted with react-dom/client (no @testing-library/dom).

const mockOpen = jest.fn();
jest.mock('../AnalyticsConsent', () => ({
  // The real signed strings stay; only the opener is replaced.
  ...jest.requireActual('../AnalyticsConsent'),
  openConsentSettings: (...a: unknown[]) => mockOpen(...a),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockOpen.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(variant: 'footer' | 'privacy' | 'tool') {
  await act(async () => {
    root.render(<CookieSettingsButton variant={variant} />);
  });
  return container.querySelector('button') as HTMLButtonElement;
}

const CASES: Array<['footer' | 'privacy' | 'tool', string]> = [
  ['footer', 'Cookie settings'],
  ['tool', 'Cookie settings'],
  // Ajay's signed S9 (footer, tool) and S10 (privacy), typed out independently of the source.
  ['privacy', 'Change cookie settings'],
];

describe('CookieSettingsButton', () => {
  it.each(CASES)('%s renders one type=button with the signed text', async (variant, text) => {
    const b = await render(variant);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(b.getAttribute('type')).toBe('button');
    expect(b.textContent).toBe(text);
  });

  it.each(CASES)('%s: a click calls openConsentSettings with the button', async (variant) => {
    const b = await render(variant);
    expect(mockOpen).not.toHaveBeenCalled();
    await act(async () => {
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith(b);
  });

  it('only the footer variant has aria-haspopup', async () => {
    expect((await render('footer')).getAttribute('aria-haspopup')).toBe('true');
    expect((await render('tool')).hasAttribute('aria-haspopup')).toBe(false);
    expect((await render('privacy')).hasAttribute('aria-haspopup')).toBe(false);
  });
});
