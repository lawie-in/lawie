// Shared helpers for the T-511 part A tests. Not a test file (jest matches *.test.ts(x) only).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

export function mount(element: React.ReactElement): {
  container: HTMLElement;
  unmount: () => void;
  rerender: (el: React.ReactElement) => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(element));
  return {
    container,
    unmount: () => act(() => root.unmount()),
    rerender: (el) => act(() => root.render(el)),
  };
}

export function cleanupMounted(): void {
  while (mounted.length) {
    const { root, container } = mounted.pop()!;
    act(() => root.unmount());
    container.remove();
  }
  document.body.innerHTML = '';
}

type Listener = () => void;
interface FakeMql {
  matches: boolean;
  media: string;
  listeners: Set<Listener>;
  addEventListener: (type: string, cb: Listener) => void;
  removeEventListener: (type: string, cb: Listener) => void;
}

/** Controllable matchMedia. `rules` maps an exact query string to its current match. */
export function stubMatchMedia(rules: Record<string, boolean> = {}) {
  const lists = new Map<string, FakeMql>();
  const get = (query: string): FakeMql => {
    let mql = lists.get(query);
    if (!mql) {
      const listeners = new Set<Listener>();
      mql = {
        matches: rules[query] ?? false,
        media: query,
        listeners,
        addEventListener: (_t, cb) => void listeners.add(cb),
        removeEventListener: (_t, cb) => void listeners.delete(cb),
      };
      lists.set(query, mql);
    }
    return mql;
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => get(q),
  });
  return {
    set(query: string, matches: boolean) {
      const mql = get(query);
      mql.matches = matches;
      act(() => mql.listeners.forEach((l) => l()));
    },
    listenerCount: (query: string) => get(query).listeners.size,
  };
}

export function removeMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

export function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(ev);
  });
  return ev;
}

export function click(el: Element | null): void {
  if (!el) throw new Error('click target missing');
  act(() => {
    (el as HTMLElement).click();
  });
}

export function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export const q = (sel: string, root: ParentNode = document.body) => root.querySelector(sel);
export const qa = (sel: string, root: ParentNode = document.body) =>
  Array.from(root.querySelectorAll(sel));
