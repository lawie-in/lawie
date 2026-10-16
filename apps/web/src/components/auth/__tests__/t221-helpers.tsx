/** T-221 web test helpers: mount with react-dom/client (no @testing-library/dom here). */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

export const flush = () => act(async () => void (await Promise.resolve()));

export async function mountEl(el: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
  await flush();
  await flush();
}

export function unmountEl() {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
}

export function setInput(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export async function type(el: HTMLInputElement, value: string) {
  await act(async () => setInput(el, value));
}

export async function submit() {
  const form = document.querySelector('form') as HTMLFormElement;
  await act(async () => form.requestSubmit());
  await flush();
  await flush();
}

export const text = () => document.body.textContent ?? '';

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    json: async () => body,
  };
}
