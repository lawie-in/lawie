// T-510 — app-level error.tsx, not-found.tsx, loading.tsx.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import AppError from '../error';
import Loading from '../loading';
import NotFound from '../not-found';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockCapture = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => mockCapture(...a),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent ?? '';
const backLink = () =>
  Array.from(container.querySelectorAll('a')).find((a) => a.textContent === 'Back to dashboard');

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

describe('T-510 error.tsx', () => {
  const err = Object.assign(new Error('secret db detail'), { digest: 'd1' });

  it('shows plain wording, no error detail, and a way back', async () => {
    await act(async () => root.render(<AppError error={err} reset={jest.fn()} />));
    expect(container.querySelector('h1')!.textContent).toBe('Something went wrong on our side');
    expect(text()).toContain('Please try again.');
    expect(text()).not.toContain('secret db detail');
    expect(backLink()!.getAttribute('href')).toBe('/dashboard');
    expect(document.activeElement).toBe(container.querySelector('h1'));
  });

  it('reports the error to Sentry once, with no extras', async () => {
    await act(async () => root.render(<AppError error={err} reset={jest.fn()} />));
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith(err);
  });

  it('Retry calls reset', async () => {
    const reset = jest.fn();
    await act(async () => root.render(<AppError error={err} reset={reset} />));
    const retry = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Retry',
    )!;
    await act(async () => retry.click());
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('T-510 not-found.tsx', () => {
  it('shows the signed text and links back to the dashboard', async () => {
    await act(async () => root.render(<NotFound />));
    expect(container.querySelector('h1')!.textContent).toBe('This page is not on the shelf');
    expect(text()).toContain('Check the address, or go back to your dashboard.');
    expect(backLink()!.getAttribute('href')).toBe('/dashboard');
  });
});

describe('T-510 loading.tsx', () => {
  it('shows a named status ("Loading", no aria-busy anywhere above it) and "Still working…" only after 8 seconds', async () => {
    jest.useFakeTimers();
    await act(async () => root.render(<Loading />));
    const status = container.querySelector('[role="status"]')!;
    expect(status.textContent).toContain('Loading');
    expect(status.querySelector('.sr-only')!.textContent).toBe('Loading');
    // T-524: no busy ancestor of a live region (it makes screen readers hold announcements back)
    expect(status.closest('[aria-busy]')).toBeNull();
    expect(container.querySelector('[aria-busy]')).toBeNull();
    expect(text()).not.toContain('Still working');
    await act(async () => {
      jest.advanceTimersByTime(7999);
    });
    expect(text()).not.toContain('Still working');
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(text()).toContain('Still working…');
  });

  it('does not show "Still working…" if unmounted before 8 seconds (timer cleared)', async () => {
    jest.useFakeTimers();
    const setSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
    await act(async () => root.render(<Loading />));
    const ours = setSpy.mock.results[setSpy.mock.calls.findIndex((c) => c[1] === 8000)]
      .value as unknown;
    act(() => root.unmount());
    expect(clearSpy).toHaveBeenCalledWith(ours);
    setSpy.mockRestore();
    clearSpy.mockRestore();
    root = createRoot(container);
  });
});
