// T-521 (AC1, AC4): loading, error and empty states of the intake steps; reduced motion on the
// Generating step; touch targets. Strings are the signed ones.
import { act } from 'react';

import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  removeMatchMedia,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import { REDUCED_MOTION_QUERY } from '@/components/ui/motion';

import { BriefLoadError, BriefLoading } from '../BriefStep';
import DescribeStep from '../DescribeStep';
import GeneratingStep from '../GeneratingStep';

jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

afterEach(() => {
  cleanupMounted();
  removeMatchMedia();
  jest.useRealTimers();
});

describe('BriefLoading', () => {
  it('shows a busy skeleton and the reading line; "Still working…" only after 8s', () => {
    jest.useFakeTimers();
    const { container } = mount(<BriefLoading />);
    expect(container.textContent).toContain('Reading your description…');
    expect(q('[aria-busy="true"]', container)).not.toBeNull();
    expect(container.textContent).not.toContain('Still working…');
    act(() => {
      jest.advanceTimersByTime(7900);
    });
    expect(container.textContent).not.toContain('Still working…');
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(container.textContent).toContain('Still working…');
    expect(qa('[role="status"]', container).some((e) => e.textContent === 'Still working…')).toBe(
      true,
    );
  });

  it('wraps the reading line in a polite live region', () => {
    const { container } = mount(<BriefLoading />);
    expect(q('[aria-live="polite"]', container)!.textContent).toBe('Reading your description…');
  });
});

describe('BriefLoadError', () => {
  const props = () => ({ onRetry: jest.fn(), onEditDescription: jest.fn() });

  it('shows the signed error, Retry, and echoes the description under "Your description"', () => {
    const p = props();
    const { container } = mount(<BriefLoadError {...p} description="Kept words about a client" />);
    expect(container.textContent).toContain('Could not read your description. Try again.');
    expect(container.textContent).toContain('Your description');
    expect(q('blockquote', container)!.textContent).toBe('Kept words about a client');
    expect(q('[role="alert"]', container)).not.toBeNull();
  });

  it('Retry and "Edit my description" call their handlers', () => {
    const p = props();
    const { container } = mount(<BriefLoadError {...p} description="x words" />);
    const b = (t: string) =>
      qa('button', container).find((e) => (e.textContent ?? '').trim() === t) as HTMLElement;
    click(b('Retry'));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    click(b('Edit my description'));
    expect(p.onEditDescription).toHaveBeenCalledTimes(1);
  });

  it('with no description there is no echo block', () => {
    const { container } = mount(<BriefLoadError {...props()} />);
    expect(container.textContent).not.toContain('Your description');
    expect(q('blockquote', container)).toBeNull();
  });
});

describe('GeneratingStep (T-521)', () => {
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

  it('shows the Inkwell drain, three steps when repairing, and a skeleton', () => {
    stubMatchMedia({});
    const { container } = run({ repairing: true });
    expect(container.textContent).toContain('Drafting your Bail application');
    expect(qa('li', container)).toHaveLength(3);
    expect(q('svg[data-draining]', container)).not.toBeNull();
    expect(q('[aria-busy="true"]', container)).not.toBeNull();
    expect(q('[aria-live="polite"]', container)).not.toBeNull();
  });

  it('two steps when not repairing', () => {
    stubMatchMedia({});
    const { container } = run();
    expect(qa('li', container)).toHaveLength(2);
  });

  it('reduced motion: the Inkwell is static at 60% and not draining', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const { container } = run();
    const svg = q('svg', container)!;
    expect(svg.hasAttribute('data-draining')).toBe(false);
    expect(svg.getAttribute('data-level')).toBe('60');
    expect(q('.nl-ink-draining', container)).toBeNull();
  });

  it('motion allowed: the ink layer carries the draining class', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    const { container } = run();
    expect(q('.nl-ink-draining', container)).not.toBeNull();
  });

  it('the failure card is an alert with Back to the brief, and Try again only when retryable', () => {
    const { container, unmount } = run({
      error: { reason: 'Reason', retryable: false, source: 'start' },
    });
    expect(q('[role="alert"]', container)).not.toBeNull();
    const labels = qa('button', container).map((b) => b.textContent);
    expect(labels).toContain('Back to the brief');
    expect(labels).not.toContain('Try again');
    unmount();
    const again = run({ error: { reason: 'Reason', retryable: true, source: 'start' } });
    expect(qa('button', again.container).map((b) => b.textContent)).toContain('Try again');
  });

  it('the failure card buttons are at least 44px (h-11)', () => {
    const { container } = run({ error: { reason: 'R', retryable: true, source: 'start' } });
    const tryAgain = qa('button', container).find((b) => b.textContent === 'Try again')!;
    expect(tryAgain.className).toMatch(/\bh-11\b|min-h-\[44px\]/);
  });
});

describe('DescribeStep (T-521)', () => {
  const props = (over: Record<string, unknown> = {}) =>
    ({
      value: '',
      onChange: jest.fn(),
      onSubmit: jest.fn(),
      onBrowse: jest.fn(),
      submitting: false,
      message: null,
      ...over,
    }) as unknown as Parameters<typeof DescribeStep>[0];

  it('uses the signed placeholder in a textarea', () => {
    const { container } = mount(<DescribeStep {...props()} />);
    const ta = q('textarea', container) as HTMLTextAreaElement;
    expect(ta.placeholder).toBe('A bail application for a client arrested on Tuesday…');
  });

  it('keeps the typed text on an error message', () => {
    const { container } = mount(
      <DescribeStep
        {...props({
          value: 'Typed words stay put',
          message: { text: 'Please describe the matter in a little more detail.' },
        })}
      />,
    );
    expect((q('textarea', container) as HTMLTextAreaElement).value).toBe('Typed words stay put');
    expect(container.textContent).toContain('Please describe the matter in a little more detail.');
  });
});
