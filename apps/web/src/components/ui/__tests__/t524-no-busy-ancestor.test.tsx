// T-524: no aria-busy on any ancestor of a "Still working…" status (a busy ancestor makes screen
// readers hold the announcement back). The skeleton bars themselves stay aria-hidden + busy.
import { act } from 'react';

import { Card } from '../Card';
import { Skeleton, STILL_WORKING_AFTER_MS } from '../States';

import Loading from '@/app/loading';
import { cleanupMounted, mount, q, qa, stubMatchMedia } from './nl-test-utils';

beforeEach(() => {
  stubMatchMedia();
  jest.useFakeTimers();
});
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
});

const after = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

describe('no busy ancestor of a status region', () => {
  it('Skeleton: the status is not inside any aria-busy element, before and after 8s', () => {
    const { container } = mount(<Skeleton lines={2} />);
    after(STILL_WORKING_AFTER_MS);
    const status = q('[role=status]', container)!;
    expect(status.textContent).toBe('Still working…');
    expect(status.closest('[aria-busy]')).toBeNull();
    const busy = qa('[aria-busy]', container);
    expect(busy).toHaveLength(1);
    expect(busy[0].getAttribute('aria-hidden')).toBe('true');
    expect(busy[0].contains(status)).toBe(false);
  });

  it('Skeleton with slowText="" has no status and the root is not busy', () => {
    const { container } = mount(<Skeleton lines={1} slowText="" />);
    expect(q('[role=status]', container)).toBeNull();
    expect((container.firstElementChild as HTMLElement).hasAttribute('aria-busy')).toBe(false);
  });

  it('Card loading: nothing above the status is busy', () => {
    const { container } = mount(<Card state="loading" />);
    after(STILL_WORKING_AFTER_MS);
    const status = q('[role=status]', container);
    if (status) expect(status.closest('[aria-busy]')).toBeNull();
    const card = container.firstElementChild!;
    expect(card.hasAttribute('aria-busy')).toBe(false);
  });

  it('Card in every state has no aria-busy on its root', () => {
    for (const state of ['ready', 'loading', 'empty', 'error'] as const) {
      const { container } = mount(<Card state={state} />);
      expect(container.firstElementChild!.hasAttribute('aria-busy')).toBe(false);
      cleanupMounted();
      stubMatchMedia();
    }
  });

  it('app/loading.tsx: a status named "Loading" for screen readers, no aria-busy anywhere, "Still working…" after 8s', () => {
    const { container } = mount(<Loading />);
    const status = q('[role=status]', container)!;
    const label = q('.sr-only', status)!;
    expect(label.textContent).toBe('Loading');
    expect(label.getAttribute('aria-hidden')).toBeNull();
    expect(container.querySelector('[aria-busy]')).toBeNull();
    expect(status.closest('[aria-busy]')).toBeNull();
    // the skeleton part is aria-hidden
    expect(q('[aria-hidden=true]', status)).not.toBeNull();
    after(STILL_WORKING_AFTER_MS);
    expect(status.textContent).toContain('Loading');
    expect(status.textContent).toContain('Still working…');
  });
});
