// T-690b (Rajesh): Notice, the inline soft-finding note. role="status", the text as sent, no
// button, no dismiss, no heading.
import { Notice as BarrelNotice } from '@/components/ui';

import { Notice } from '../Notice';
import { cleanupMounted, mount } from './nl-test-utils';

afterEach(cleanupMounted);

const WS_TEXT =
  'This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.';

const root = (c: HTMLElement) => c.firstElementChild as HTMLElement;

describe('T-690b Notice', () => {
  it('the signed fixture is the 316-byte text', () => {
    expect(Buffer.byteLength(WS_TEXT, 'utf8')).toBe(316);
  });

  it('renders role="status", never role="alert"', () => {
    const { container } = mount(<Notice variant="warn" text={WS_TEXT} />);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root(container).getAttribute('role')).toBe('status');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-live="assertive"]')).toBeNull();
  });

  it('prints the text verbatim as the only text content', () => {
    const { container } = mount(<Notice variant="warn" text={WS_TEXT} />);
    expect(root(container).textContent).toBe(WS_TEXT);
    expect(container.textContent).toBe(WS_TEXT);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')!.textContent).toBe(WS_TEXT);
  });

  it('has an icon that is hidden from assistive tech and has no name', () => {
    const { container } = mount(<Notice variant="warn" text={WS_TEXT} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    const svg = svgs[0];
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('aria-label')).toBeNull();
    expect(svg.getAttribute('aria-labelledby')).toBeNull();
    expect(svg.querySelector('title')).toBeNull();
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('has no button, link, dismiss control, heading or other interactive element', () => {
    const { container } = mount(<Notice variant="warn" text={WS_TEXT} />);
    expect(
      container.querySelector(
        'button, a, input, select, textarea, [tabindex], [role="button"], h1, h2, h3, h4, h5, h6',
      ),
    ).toBeNull();
  });

  it('carries data-variant="warn" and the amber-soft look', () => {
    const { container } = mount(<Notice variant="warn" text={WS_TEXT} />);
    const el = root(container);
    expect(el.dataset.variant).toBe('warn');
    expect(el.className).toContain('bg-nl-warn-light');
    expect(el.className).toContain('border-nl-line');
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('text-nl-warn');
  });

  it('appends the className prop and keeps the base classes', () => {
    const { container } = mount(<Notice variant="warn" text={WS_TEXT} className="extra-x mt-4" />);
    const cls = root(container).className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['mt-4', 'extra-x', 'flex', 'border']));
  });

  it('wraps long text rather than clipping it', () => {
    const long = 'x'.repeat(400);
    const { container } = mount(<Notice variant="warn" text={long} />);
    const p = container.querySelector('p')!;
    expect(p.className).toContain('break-words');
    expect(p.className).toContain('min-w-0');
    expect(p.className).toContain('whitespace-pre-line');
    expect(p.className).not.toMatch(/truncate|line-clamp|overflow-hidden|whitespace-nowrap/);
    expect(p.textContent).toBe(long);
  });

  it('is exported from the ui barrel', () => {
    expect(BarrelNotice).toBe(Notice);
    const { container } = mount(<BarrelNotice variant="warn" text="Hello" />);
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Hello');
  });
});
