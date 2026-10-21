// T-520: Spine and Shelf (item 2, Recent documents).
import { act } from 'react';
import { useRouter } from 'next/navigation';

import { Shelf } from '../Shelf';
import { SkeletonSpine, Spine, spineStatus } from '../Spine';
import type { ShelfDocument } from '../useDashboardData';

import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const push = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push });
});
afterEach(() => {
  cleanupMounted();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

const doc = (over: Partial<ShelfDocument> = {}): ShelfDocument => ({
  _id: 'abc123',
  title: 'State v. Rao',
  status: 'draft',
  ...over,
});
const spineLink = (c: ParentNode) => q('a', c) as HTMLAnchorElement;

describe('Spine', () => {
  beforeEach(() => stubMatchMedia());

  it('links to the document; the accessible name is the title and status, with no tooltip', () => {
    const { container } = mount(
      <ul>
        <Spine doc={doc()} index={0} />
      </ul>,
    );
    expect(spineLink(container).getAttribute('href')).toBe('/dashboard/documents/abc123');
    expect(spineLink(container).getAttribute('aria-label')).toBe('State v. Rao (draft)');
    expect(spineLink(container).hasAttribute('title')).toBe(false);
  });

  it('encodes an odd id in the link', () => {
    const { container } = mount(
      <ul>
        <Spine doc={doc({ _id: 'a/b c' })} index={0} />
      </ul>,
    );
    expect(spineLink(container).getAttribute('href')).toBe('/dashboard/documents/a%2Fb%20c');
  });

  it('draft: two bands, no seal mark, status word in the label', () => {
    const { container } = mount(
      <ul>
        <Spine doc={doc()} index={0} />
      </ul>,
    );
    expect(spineLink(container).dataset.status).toBe('draft');
    expect(qa('span[aria-hidden=true] > span.h-1', container)).toHaveLength(2);
    expect(q('svg', container)).toBeNull();
    expect(q('.rounded-full', container)).toBeNull();
    expect(container.textContent).toContain('draft');
  });

  it('finalised: the 26px seal mark (svg), no bands, no dot', () => {
    const { container } = mount(
      <ul>
        <Spine doc={doc({ status: 'finalised' })} index={1} />
      </ul>,
    );
    expect(spineLink(container).dataset.status).toBe('finalised');
    expect(qa('span.h-1', container)).toHaveLength(0);
    expect(q('.rounded-full', container)).toBeNull();
    const seal = q('svg', container)!;
    expect(seal.getAttribute('aria-hidden')).toBe('true');
    expect(seal.getAttribute('viewBox')).toBe('0 0 26 26');
    expect(seal.getAttribute('class')).toContain('h-[1.625rem]');
    expect(seal.getAttribute('class')).toContain('w-[1.625rem]');
    expect(spineLink(container).getAttribute('aria-label')).toBe('State v. Rao (finalised)');
  });

  it('exported is shown as finalised', () => {
    expect(spineStatus('exported')).toBe('finalised');
    expect(spineStatus('finalised')).toBe('finalised');
    expect(spineStatus('draft')).toBe('draft');
    const { container } = mount(
      <ul>
        <Spine doc={doc({ status: 'exported' })} index={0} />
      </ul>,
    );
    expect(spineLink(container).dataset.status).toBe('finalised');
    expect(container.textContent).not.toMatch(/exported/i);
  });

  it('an untitled document is named by just the status', () => {
    const { container } = mount(
      <ul>
        <Spine doc={doc({ title: '   ' })} index={0} />
      </ul>,
    );
    expect(spineLink(container).getAttribute('aria-label')).toBe('draft');
    expect(spineLink(container).hasAttribute('title')).toBe(false);
  });

  it('pulls out on hover only with motion allowed and not on the mobile cap', () => {
    const allowed = mount(
      <ul>
        <Spine doc={doc()} index={0} />
      </ul>,
    );
    expect(spineLink(allowed.container).className).toContain('group-hover:-translate-y-[14px]');
    cleanupMounted();

    stubMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    const reduced = mount(
      <ul>
        <Spine doc={doc()} index={0} />
      </ul>,
    );
    expect(spineLink(reduced.container).className).not.toContain('translate-y');
    cleanupMounted();

    stubMatchMedia({ '(max-width: 640px), not all and (pointer: fine)': true });
    const mobile = mount(
      <ul>
        <Spine doc={doc()} index={0} />
      </ul>,
    );
    expect(spineLink(mobile.container).className).not.toContain('translate-y');
  });

  it('the skeleton spine pulse pauses while the tab is hidden and resumes', () => {
    stubMatchMedia();
    const { container } = mount(
      <ul>
        <SkeletonSpine index={0} />
      </ul>,
    );
    const bar = () => q('.nl-skeleton', container) as HTMLElement;
    expect(bar().style.animationPlayState).toBe('running');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(bar().style.animationPlayState).toBe('paused');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(bar().style.animationPlayState).toBe('running');
  });
});

describe('Shelf', () => {
  beforeEach(() => stubMatchMedia());

  it('loading with no docs: three skeleton spines, busy, no links, no empty state', () => {
    const { container } = mount(<Shelf docs={null} status="loading" />);
    expect(qa('li .nl-skeleton', container)).toHaveLength(3);
    expect(q('section', container)!.getAttribute('aria-busy')).toBe('true');
    expect(qa('a', container)).toHaveLength(0);
    expect(container.textContent).not.toContain('The shelf is empty');
  });

  it('ready with documents: a spine per document and a "View all" link', () => {
    const docs = [doc({ _id: 'a' }), doc({ _id: 'b', status: 'finalised' }), doc({ _id: 'c' })];
    const { container } = mount(<Shelf docs={docs} status="ready" />);
    const hrefs = qa('a', container).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/dashboard/documents/a');
    expect(hrefs).toContain('/dashboard/documents/b');
    expect(hrefs).toContain('/dashboard/documents/c');
    const all = qa('a', container).find((a) => a.textContent === 'View all')!;
    expect(all.getAttribute('href')).toBe('/dashboard/documents');
    expect(qa('li .nl-skeleton', container)).toHaveLength(0);
    expect(q('section', container)!.getAttribute('aria-busy')).toBeNull();
  });

  it('ready and empty: the signed first-time empty state; the button goes to /dashboard/new', () => {
    const { container } = mount(<Shelf docs={[]} status="ready" />);
    expect(container.textContent).toContain('The shelf is empty');
    expect(container.textContent).toContain(
      'Describe your first matter and Lawie will write a first draft for you to review.',
    );
    expect(qa('a', container).find((a) => a.textContent === 'View all')).toBeUndefined();
    click(qa('button', container).find((b) => b.textContent === 'Start your first draft')!);
    expect(push).toHaveBeenCalledWith('/dashboard/new');
  });

  it('error with no docs shows neither spines nor the empty state (the page shows the error)', () => {
    const { container } = mount(<Shelf docs={null} status="error" />);
    expect(container.textContent).toBe('Recent documents');
  });

  it('error after a good load keeps the spines it had', () => {
    const { container } = mount(<Shelf docs={[doc({ _id: 'kept' })]} status="error" />);
    expect(qa('a', container).map((a) => a.getAttribute('href'))).toContain(
      '/dashboard/documents/kept',
    );
  });

  it('a reload in flight keeps the spines (no skeleton flash)', () => {
    const { container } = mount(<Shelf docs={[doc()]} status="loading" />);
    expect(qa('li .nl-skeleton', container)).toHaveLength(0);
    expect(spineLink(container)).not.toBeNull();
  });
});
