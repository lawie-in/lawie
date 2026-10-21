// T-521 (AC1, AC4): GeneratingStep inkwell is real or absent; BriefLoading announces through an
// sr-only status; nlUi class tokens (folio hairline, control line).
import {
  cleanupMounted,
  mount,
  q,
  removeMatchMedia,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import { REDUCED_MOTION_QUERY } from '@/components/ui/motion';

import { BriefLoading } from '../BriefStep';
import GeneratingStep from '../GeneratingStep';
import * as nl from '../nlUi';

jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

afterEach(() => {
  cleanupMounted();
  removeMatchMedia();
});

const run = (over: Partial<Parameters<typeof GeneratingStep>[0]> = {}) =>
  mount(
    <GeneratingStep
      documentName="Bail application"
      repairing={false}
      error={null}
      onRetry={jest.fn()}
      onBackToBrief={jest.fn()}
      inkCost={2}
      {...over}
    />,
  );

describe('GeneratingStep inkwell level', () => {
  it.each([
    ['omitted', undefined],
    ['null', null],
  ])('inkLevel %s: no Inkwell, and never a level of 100', (_n, v) => {
    stubMatchMedia({});
    const { container } = run(v === undefined ? {} : { inkLevel: v });
    expect(q('svg[data-level]', container)).toBeNull();
    expect(container.innerHTML).not.toContain('data-level="100"');
    expect(container.textContent).toContain('Drafting your Bail application');
    expect(q('[aria-busy="true"]', container)).not.toBeNull();
  });

  it('inkLevel 40 renders the Inkwell at 40, draining', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    const { container } = run({ inkLevel: 40 });
    const svg = q('svg[data-level]', container)!;
    expect(svg.getAttribute('data-level')).toBe('40');
    expect(svg.hasAttribute('data-draining')).toBe(true);
  });

  it('inkLevel 0 (an empty well) still renders the Inkwell, at 0', () => {
    stubMatchMedia({});
    const { container } = run({ inkLevel: 0 });
    expect(q('svg[data-level]', container)!.getAttribute('data-level')).toBe('0');
  });

  it('reduced motion: static at 60, not draining, even with a real level', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const { container } = run({ inkLevel: 40 });
    const svg = q('svg[data-level]', container)!;
    expect(svg.getAttribute('data-level')).toBe('60');
    expect(svg.hasAttribute('data-draining')).toBe(false);
  });

  it('the failure view shows no Inkwell', () => {
    stubMatchMedia({});
    const { container } = run({
      inkLevel: 40,
      error: {
        reason: 'The draft did not finish.',
        retryable: true,
        source: 'error_event',
        code: 'x',
      },
    });
    expect(q('svg[data-level]', container)).toBeNull();
  });
});

describe('BriefLoading status', () => {
  it('after the mount effect the sr-only status holds the text; the visible line is aria-hidden', () => {
    const { container } = mount(<BriefLoading />);
    expect(q('p.sr-only[role="status"]', container)!.textContent).toBe('Reading your description…');
    const visible = Array.from(container.querySelectorAll('p')).find(
      (p) => p.getAttribute('aria-hidden') === 'true',
    )!;
    expect(visible.textContent).toBe('Reading your description…');
  });
});

describe('nlUi class tokens', () => {
  it('folio: brass top hairline and the padding steps', () => {
    for (const c of ['border-t-nl-brass', 'p-nl-6', 'min-[900px]:p-nl-10', 'border-nl-line']) {
      expect(nl.folio.split(/\s+/)).toContain(c);
    }
  });
  it('input uses the control line, not the hairline', () => {
    const c = nl.input.split(/\s+/);
    expect(c).toContain('border-[color:var(--line-control)]');
    expect(c).not.toContain('border-nl-line');
  });
  it.each([true, false])(
    'optionCard(%s) uses the control line at rest, not border-nl-line',
    (on) => {
      const c = nl.optionCard(on).split(/\s+/);
      if (on) {
        expect(c).toContain('border-nl-brass');
      } else {
        expect(c).toContain('border-[color:var(--line-control)]');
      }
      expect(c).not.toContain('border-nl-line');
    },
  );
});
