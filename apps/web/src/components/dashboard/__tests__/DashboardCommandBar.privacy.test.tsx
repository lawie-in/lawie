// T-520 (Ajay's condition on the sessionStorage prefill): no analytics event, Sentry breadcrumb
// or log line may capture the Draft text. Sentry in apps/web is server/edge only (no client
// config) and GA is allowlisted to public pages only; these tests pin both.
import { readFileSync } from 'fs';
import { join } from 'path';

import { useRouter } from 'next/navigation';

import { DashboardCommandBar } from '../DashboardCommandBar';

import { isAnalyticsRoute } from '@/components/analytics/analytics-routes';
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

const mockSentry = {
  addBreadcrumb: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
};
jest.mock('@sentry/nextjs', () => mockSentry, { virtual: true });
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const SECRET = 'Zq-matter-Rao-v-State-7731';
const push = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  (useRouter as jest.Mock).mockReturnValue({ push });
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanupMounted();
  jest.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).gtag;
  delete (window as unknown as Record<string, unknown>).dataLayer;
});

const SRC = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('source guard', () => {
  it.each(['dashboard/DashboardCommandBar.tsx', 'shell/CommandBar.tsx'])(
    '%s has no telemetry, logging or network calls',
    (rel) => {
      const src = read(rel);
      for (const pattern of [
        /sentry/i,
        /gtag/i,
        /dataLayer/i,
        /analytics/i,
        /\btrack\s*\(/,
        /console\./,
        /\bfetch\s*\(/,
        /apiFetch/,
      ]) {
        expect(src).not.toMatch(pattern);
      }
    },
  );
});

describe('behaviour', () => {
  it('Draft with a distinctive string never reaches gtag, dataLayer, console or Sentry', () => {
    const gtag = jest.fn();
    const dataLayer: unknown[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.gtag = gtag;
    w.dataLayer = dataLayer;
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );

    mount(<DashboardCommandBar />);
    typeInto(q('[role=combobox]') as HTMLInputElement, SECRET);
    click(q('button[type=submit]'));

    expect(push).toHaveBeenCalledWith('/dashboard/new');
    expect(window.sessionStorage.getItem('lawie:draft-prefill')).toBe(SECRET);
    const all = [
      gtag,
      mockSentry.addBreadcrumb,
      mockSentry.captureMessage,
      mockSentry.captureException,
      mockApiFetch,
      ...spies,
    ];
    for (const fn of all) {
      expect(JSON.stringify(fn.mock.calls)).not.toContain(SECRET);
    }
    expect(gtag).not.toHaveBeenCalled();
    expect(mockSentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(JSON.stringify(dataLayer)).not.toContain(SECRET);
  });

  it.each([
    ['clicking a chip', '/dashboard/new?kind=bail_regular'],
    ['Enter on a highlighted option', '/dashboard/new?kind=bail_regular'],
    ['Draft with an option highlighted', '/dashboard/new?kind=bail_regular'],
  ])(
    'T-630: %s with text typed never reaches gtag, dataLayer, console, Sentry or the network',
    (how, href) => {
      const text = `Bail application ${SECRET}`;
      const gtag = jest.fn();
      const dataLayer: unknown[] = [];
      const w = window as unknown as Record<string, unknown>;
      w.gtag = gtag;
      w.dataLayer = dataLayer;
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
        jest.spyOn(console, m).mockImplementation(() => undefined),
      );
      const globalFetch = jest.fn();
      const originalFetch = (globalThis as { fetch?: unknown }).fetch;
      (globalThis as { fetch?: unknown }).fetch = globalFetch;
      const beacon = jest.fn();
      Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });

      try {
        mount(<DashboardCommandBar />);
        const input = q('[role=combobox]') as HTMLInputElement;
        typeInto(input, text);
        if (how === 'clicking a chip') {
          click(qa('[role=option]')[0]);
        } else if (how === 'Enter on a highlighted option') {
          press(input, { key: 'ArrowDown' });
          press(input, { key: 'Enter' });
        } else {
          press(input, { key: 'ArrowDown' });
          click(q('button[type=submit]'));
        }

        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith(href);
        expect(window.sessionStorage.getItem('lawie:draft-prefill')).toBe(text);
        expect(JSON.stringify(push.mock.calls)).not.toContain(SECRET);
        const all = [
          gtag,
          mockSentry.addBreadcrumb,
          mockSentry.captureMessage,
          mockSentry.captureException,
          mockApiFetch,
          globalFetch,
          beacon,
          ...spies,
        ];
        for (const fn of all) {
          expect(JSON.stringify(fn.mock.calls)).not.toContain(SECRET);
        }
        expect(gtag).not.toHaveBeenCalled();
        expect(mockSentry.addBreadcrumb).not.toHaveBeenCalled();
        expect(mockApiFetch).not.toHaveBeenCalled();
        expect(globalFetch).not.toHaveBeenCalled();
        expect(beacon).not.toHaveBeenCalled();
        expect(JSON.stringify(dataLayer)).not.toContain(SECRET);
      } finally {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
        delete (navigator as unknown as Record<string, unknown>).sendBeacon;
      }
    },
  );
});

describe('GA route allowlist', () => {
  it('never loads on the dashboard or the new-draft page', () => {
    expect(isAnalyticsRoute('/dashboard')).toBe(false);
    expect(isAnalyticsRoute('/dashboard/')).toBe(false);
    expect(isAnalyticsRoute('/dashboard/new')).toBe(false);
  });
});
