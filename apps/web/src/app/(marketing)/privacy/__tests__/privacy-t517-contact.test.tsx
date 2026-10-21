/**
 * T-517 (AJ-517-M14, M15, M11): the privacy page's contact lines. §11 is one line, followed by the
 * M11 officer line only when NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME is set (nothing when unset);
 * §7 "Your Rights" names contact@lawie.in; privacy@lawie.in appears nowhere on the page. The rest
 * of the page is covered by privacy-t115c, -t242 and -t358, which must keep passing.
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import PrivacyPage from '../page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = 'NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME';
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const ONE_LINE =
  'For privacy questions, rights requests, grievances and general support, write to contact@lawie.in.';
const OFFICER_LINE =
  'Grievance Officer: Asha Rao. Email: contact@lawie.in. We acknowledge every complaint within 24 hours and resolve it within 15 days.';

let container: HTMLDivElement;
let root: Root;
let saved: string | undefined;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<PrivacyPage />));
}
beforeEach(() => {
  saved = process.env[KEY];
  delete process.env[KEY];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

const section11 = () => {
  const h = Array.from(container.querySelectorAll('h3')).find((x) =>
    x.textContent?.startsWith('11.'),
  )!;
  return h.parentElement as HTMLElement;
};
const paras = (el: ParentNode) =>
  Array.from(el.querySelectorAll('p')).map((p) => norm(p.textContent));

describe('privacy page contact lines (T-517)', () => {
  it('§11 without a configured name: the one line and nothing more (no fallback sentence)', () => {
    render();
    expect(paras(section11())).toEqual([ONE_LINE]);
    expect(norm(section11().textContent)).not.toContain('For complaints, write to');
    expect(norm(section11().textContent)).not.toContain('Grievance Officer');
  });

  it('§11 with a configured name: the one line, then the M11 officer line', () => {
    process.env[KEY] = 'Asha Rao';
    render();
    expect(paras(section11())).toEqual([ONE_LINE, OFFICER_LINE]);
    const mails = Array.from(section11().querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(mails).toEqual(['mailto:contact@lawie.in', 'mailto:contact@lawie.in']);
  });

  it('a blank name counts as unset', () => {
    process.env[KEY] = '   ';
    render();
    expect(paras(section11())).toEqual([ONE_LINE]);
  });

  it('§7 Your Rights says contact@lawie.in with a mailto link', () => {
    render();
    const h = Array.from(container.querySelectorAll('h3')).find(
      (x) => x.textContent === '7. Your Rights',
    )!;
    const sec = h.parentElement!;
    expect(norm(sec.textContent)).toContain(
      'You can also write to contact@lawie.in from your account email',
    );
    expect(
      Array.from(sec.querySelectorAll('a')).some(
        (a) => a.getAttribute('href') === 'mailto:contact@lawie.in',
      ),
    ).toBe(true);
  });

  it('privacy@lawie.in appears nowhere on the page, in text or links', () => {
    render();
    expect(container.textContent).not.toContain('privacy@lawie.in');
    expect(container.innerHTML).not.toContain('privacy@lawie.in');
    process.env[KEY] = 'Asha Rao';
    act(() => root.render(<PrivacyPage />));
    expect(container.innerHTML).not.toContain('privacy@lawie.in');
  });

  it('keeps all eleven numbered sections and the Contact and Grievances title', () => {
    render();
    const titles = Array.from(container.querySelectorAll('h3')).map((h) => norm(h.textContent));
    expect(titles).toHaveLength(11);
    expect(titles[10]).toBe('11. Contact and Grievances');
    expect(titles[6]).toBe('7. Your Rights');
  });
});
