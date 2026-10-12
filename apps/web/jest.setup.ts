// T-310: shared setup for web tests.
import '@testing-library/jest-dom';

// next/navigation needs the App Router context, which tests do not have. Tests set the path with
// `(usePathname as jest.Mock).mockReturnValue('/pricing')` (or jest.mocked).
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
  useParams: jest.fn(() => ({})),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

// next/script renders nothing in jsdom by default; render a plain <script> so a test can find it.
jest.mock('next/script', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      const rest = { ...props };
      delete rest.strategy;
      delete rest.onLoad;
      delete rest.onReady;
      return React.createElement('script', rest);
    },
  };
});
