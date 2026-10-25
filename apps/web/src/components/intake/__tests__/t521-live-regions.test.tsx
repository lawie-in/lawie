// T-521 round 5 (commit 567d9548): one live region on the Generating step, and the visible
// "Reading your description…" status on the Describe step. Behaviour only: roles and text.
import { act } from 'react';

import {
  cleanupMounted,
  mount,
  q,
  qa,
  removeMatchMedia,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

import DescribeStep from '../DescribeStep';
import GeneratingStep from '../GeneratingStep';

jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

afterEach(() => {
  cleanupMounted();
  removeMatchMedia();
  jest.useRealTimers();
});

describe('GeneratingStep live regions', () => {
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

  it('has exactly one aria-live region and it holds the step list', () => {
    stubMatchMedia({});
    const { container } = run({ repairing: true });
    const live = qa('[aria-live]', container);
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute('aria-live')).toBe('polite');
    expect(live[0].tagName).toBe('UL');
    expect(live[0].querySelectorAll('li')).toHaveLength(3);
    expect(live[0].textContent).toContain('Writing the draft');
  });

  it('the Skeleton status is not inside another live region or role=status', () => {
    stubMatchMedia({});
    jest.useFakeTimers();
    const { container } = run();
    act(() => {
      jest.advanceTimersByTime(9000);
    });
    const statuses = qa('[role="status"]', container);
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    for (const s of statuses) {
      expect(s.closest('[aria-live]')).toBeNull();
      expect(s.parentElement?.closest('[role="status"]')).toBeNull();
    }
    expect(container.textContent).toContain('Still working…');
  });

  it('the list changing (repairing) keeps a single live region', () => {
    stubMatchMedia({});
    const { container } = run({ repairing: false });
    expect(qa('[aria-live]', container)).toHaveLength(1);
    expect(qa('li', container)).toHaveLength(2);
  });

  it('the failure card keeps role=alert and has no live region around the steps', () => {
    stubMatchMedia({});
    const { container } = run({
      error: {
        reason: 'Draft service unavailable.',
        retryable: true,
        source: 'error_event',
        code: 'unavailable',
      },
    });
    const alerts = qa('[role="alert"]', container);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(qa('[aria-live]', container)).toHaveLength(0);
    expect(container.textContent).toContain('Back to the brief');
  });
});

describe('DescribeStep reading status', () => {
  const props = (over: Record<string, unknown> = {}) =>
    ({
      value: 'A bail application for a client arrested on Tuesday evening.',
      onChange: jest.fn(),
      onSubmit: jest.fn(),
      onBrowse: jest.fn(),
      submitting: false,
      message: null,
      ...over,
    }) as unknown as Parameters<typeof DescribeStep>[0];

  it('idle: a status element is in the page but empty', () => {
    const { container } = mount(<DescribeStep {...props()} />);
    const status = q('[role="status"]', container);
    expect(status).not.toBeNull();
    expect(status?.textContent).toBe('');
  });

  it('submitting: the same status element says "Reading your description…"', () => {
    const { container } = mount(<DescribeStep {...props({ submitting: true })} />);
    const statuses = qa('[role="status"]', container);
    expect(statuses.map((s) => s.textContent)).toContain('Reading your description…');
  });

  it('the status element is the same node idle and submitting (so the text is announced)', () => {
    const first = mount(<DescribeStep {...props()} />);
    const before = q('[role="status"]', first.container);
    first.rerender(<DescribeStep {...props({ submitting: true })} />);
    expect(q('[role="status"]', first.container)).toBe(before);
    expect(before?.textContent).toBe('Reading your description…');
  });

  it('the button name stays "Continue" while submitting, and it is disabled', () => {
    const { container } = mount(<DescribeStep {...props({ submitting: true })} />);
    const btn = q('button[type="submit"]', container) as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe('Continue');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('the typed text is kept while submitting', () => {
    const { container } = mount(<DescribeStep {...props({ submitting: true })} />);
    expect((q('textarea', container) as HTMLTextAreaElement).value).toContain('bail application');
  });

  it('a form submit while submitting, or with too little text, does not call onSubmit (no double send)', () => {
    const busy = jest.fn();
    const a = mount(<DescribeStep {...props({ submitting: true, onSubmit: busy })} />);
    act(() => {
      (q('form', a.container) as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    const short = jest.fn();
    const b = mount(<DescribeStep {...props({ value: 'too short', onSubmit: short })} />);
    act(() => {
      (q('form', b.container) as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(busy).not.toHaveBeenCalled();
    expect(short).not.toHaveBeenCalled();
  });
});
