// T-524: the offline banner fill is full width; its text sits in the page's content column.
import { OFFLINE_BANNER_COPY, OfflineBanner } from '../OfflineBanner';

import { cleanupMounted, mount, q } from '@/components/ui/__tests__/nl-test-utils';

const setOnline = (v: boolean) =>
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: v });
afterEach(() => {
  cleanupMounted();
  setOnline(true);
});
const cls = (e: Element | null) => (e?.getAttribute('class') ?? '').split(/\s+/);

describe('OfflineBanner layout (T-524)', () => {
  it('the status fill is full width with no side padding; the text is inside the 1180px column with the page gutters', () => {
    setOnline(false);
    const { container } = mount(<OfflineBanner />);
    const banner = q('[role=status]', container)!;
    expect(cls(banner)).toContain('w-full');
    expect(cls(banner)).not.toContain('px-nl-4');
    const column = banner.firstElementChild!;
    expect(cls(column)).toEqual(
      expect.arrayContaining([
        'mx-auto',
        'w-full',
        'min-w-0',
        'max-w-[1180px]',
        'px-nl-4',
        'min-[900px]:px-nl-8',
      ]),
    );
    const p = column.firstElementChild!;
    expect(p.tagName).toBe('P');
    expect(p.textContent).toBe(OFFLINE_BANNER_COPY);
    expect(cls(p)).toContain('break-words');
  });

  it('uses the same column classes as the dashboard page', () => {
    setOnline(false);
    const { container } = mount(<OfflineBanner />);
    const column = cls(q('[role=status]', container)!.firstElementChild);
    for (const c of ['max-w-[1180px]', 'px-nl-4', 'min-[900px]:px-nl-8', 'mx-auto'])
      expect(column).toContain(c);
  });

  it('still renders nothing online, and a custom className lands on the fill', () => {
    const online = mount(<OfflineBanner />);
    expect(online.container.innerHTML).toBe('');
    cleanupMounted();
    setOnline(false);
    const { container } = mount(<OfflineBanner className="sticky" />);
    expect(cls(q('[role=status]', container))).toContain('sticky');
  });
});
