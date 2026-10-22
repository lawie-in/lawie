// T-511 part A: root layout wiring. The theme must never add the legacy `dark` class, the
// pre-paint script must be in <head>, and ThemeProvider must sit around AuthProvider.
// The layout is a plain function returning an element tree, so the tree is inspected directly.
import { isValidElement, type ReactElement, type ReactNode } from 'react';

import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/shell';
import { AuthProvider } from '@/context/AuthContext';

import RootLayout from '../layout';

jest.mock('@/components/AnalyticsConsent', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/signup-source', () => ({ SignupSourceCapture: () => null }));

type El = ReactElement<{
  children?: ReactNode;
  className?: string;
  dangerouslySetInnerHTML?: { __html: string };
  id?: string;
}>;

function find(node: ReactNode, pred: (el: El) => boolean): El | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = find(n, pred);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as El;
  if (pred(el)) return el;
  return find(el.props.children, pred);
}

const child = <p data-page>page</p>;
const tree = RootLayout({ children: child }) as El;

describe('RootLayout (T-511 part A)', () => {
  it('inlines THEME_INIT_SCRIPT, unmodified, in <head>', () => {
    expect(tree.type).toBe('html');
    const head = find(tree, (e) => e.type === 'head')!;
    expect(head).not.toBeNull();
    const script = find(head, (e) => e.type === 'script')!;
    expect(script.props.dangerouslySetInnerHTML!.__html).toBe(THEME_INIT_SCRIPT);
  });

  it('puts no `dark` class on <html> or <body>', () => {
    const body = find(tree, (e) => e.type === 'body')!;
    const htmlClass = (tree.props.className ?? '').split(/\s+/);
    const bodyClass = (body.props.className ?? '').split(/\s+/);
    expect(htmlClass).not.toContain('dark');
    expect(bodyClass).not.toContain('dark');
    expect(bodyClass).not.toContain('night');
    expect(THEME_INIT_SCRIPT).not.toMatch(/classList|className/);
  });

  it('wraps AuthProvider (and the page) in ThemeProvider inside #main', () => {
    const main = find(tree, (e) => e.props.id === 'main')!;
    const theme = find(main, (e) => e.type === ThemeProvider)!;
    expect(theme).not.toBeNull();
    const auth = find(theme.props.children, (e) => e.type === AuthProvider)!;
    expect(auth).not.toBeNull();
    expect(find(auth.props.children, (e) => e === child)).toBe(child);
  });
});
