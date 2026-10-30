// Small DOM query helpers for the T-684 admin tests. @testing-library/dom is not installed in this
// workspace, so this mirrors the few queries those tests need (getBy / queryBy / findBy for role,
// text and label, plus within, fireEvent and waitFor) on top of the repo's mount helper. Not a
// test file (jest matches *.test.ts(x) only).
import { act } from 'react';

import { cleanupMounted, mount } from '@/components/ui/__tests__/nl-test-utils';

export { cleanupMounted };

type Matcher = string | RegExp;
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const matches = (m: Matcher, text: string) => (typeof m === 'string' ? text === m : m.test(text));

const IMPLICIT: Record<string, string> = {
  BUTTON: 'button',
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  LI: 'listitem',
  UL: 'list',
};
const roleOf = (el: Element) => el.getAttribute('role') ?? IMPLICIT[el.tagName] ?? '';
const nameOf = (el: Element) => norm(el.getAttribute('aria-label') ?? el.textContent);
/** Text of the element's own text nodes only (children excluded), like testing-library getByText. */
const ownText = (el: Element) =>
  norm(
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(''),
  );

function one<T>(found: T[], what: string): T {
  if (found.length === 0) throw new Error(`Unable to find ${what}`);
  if (found.length > 1) throw new Error(`Found ${found.length} elements for ${what}`);
  return found[0];
}

export function queries(root: ParentNode) {
  const all = (sel = '*') => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const allByRole = (role: string, opts?: { name?: Matcher }) =>
    all().filter(
      (el) => roleOf(el) === role && (opts?.name === undefined || matches(opts.name, nameOf(el))),
    );
  const allByText = (m: Matcher) =>
    all().filter((el) => !['SCRIPT', 'STYLE'].includes(el.tagName) && matches(m, ownText(el)));
  const allByLabel = (m: Matcher) => {
    const out: HTMLElement[] = [];
    for (const label of all('label')) {
      if (!matches(m, norm(label.textContent))) continue;
      const id = label.getAttribute('for');
      const target = id
        ? (root as Document | HTMLElement).querySelector<HTMLElement>(`[id="${id}"]`)
        : null;
      if (target) out.push(target);
    }
    return out;
  };
  const q = {
    getAllByRole: (role: string, opts?: { name?: Matcher }) => {
      const f = allByRole(role, opts);
      if (!f.length) throw new Error(`Unable to find role ${role} ${String(opts?.name ?? '')}`);
      return f;
    },
    getByRole: (role: string, opts?: { name?: Matcher }) =>
      one(allByRole(role, opts), `role ${role} ${String(opts?.name ?? '')}`),
    queryByRole: (role: string, opts?: { name?: Matcher }) => allByRole(role, opts)[0] ?? null,
    getByText: (m: Matcher) => one(allByText(m), `text ${String(m)}`),
    getAllByText: (m: Matcher) => {
      const f = allByText(m);
      if (!f.length) throw new Error(`Unable to find text ${String(m)}`);
      return f;
    },
    queryByText: (m: Matcher) => allByText(m)[0] ?? null,
    getByLabelText: (m: Matcher) => one(allByLabel(m), `label ${String(m)}`),
    queryByLabelText: (m: Matcher) => allByLabel(m)[0] ?? null,
  };
  return {
    ...q,
    findByText: (m: Matcher) => waitFor(() => q.getByText(m)),
    findByRole: (r: string, o?: { name?: Matcher }) => waitFor(() => q.getByRole(r, o)),
  };
}

export const screen = new Proxy({} as ReturnType<typeof queries>, {
  get: (_t, prop: string) => (queries(document.body) as Record<string, unknown>)[prop],
});
export const within = (el: HTMLElement) => queries(el);

export function render(element: React.ReactElement) {
  return mount(element);
}

/** Mount and let the mount-time requests settle inside act. */
export async function renderAsync(element: React.ReactElement) {
  let out!: ReturnType<typeof mount>;
  await act(async () => {
    out = mount(element);
    await new Promise((r) => setTimeout(r, 0));
  });
  return out;
}

export async function waitFor<T>(cb: () => T, timeoutMs = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return cb();
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
  }
}

function setNative(el: HTMLElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
}

export const fireEvent = {
  async click(el: HTMLElement) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
  },
  change(el: HTMLElement, init: { target: { value: string } }) {
    act(() => {
      setNative(el, init.target.value);
      el.dispatchEvent(
        new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
      );
    });
  },
};
