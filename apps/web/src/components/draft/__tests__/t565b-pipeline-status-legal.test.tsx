// T-565 wave 2a (Ajay, pre-Anushka legal review 22 Oct; W1, W2, W3 and the string changes): the
// PipelineStatus cards (round 2: W6 409, W7 plan gate, W8 not-started Try again, W10 hard block). Every signed string byte-exact, one `Generate anyway`, no replaced string.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import PipelineStatus, { type GenerationFailure, type PipelineState } from '../PipelineStatus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

let container: HTMLDivElement;
let root: Root;
const handlers = {
  onProceedAnyway: jest.fn(),
  onEditForm: jest.fn(),
  onRetry: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function show(state: PipelineState, extra: Record<string, unknown> = {}) {
  act(() =>
    root.render(
      <PipelineStatus
        state={state}
        questions={['Check the dates']}
        inkCost={3}
        generationRetryable
        {...handlers}
        {...extra}
      />,
    ),
  );
  return container.textContent ?? '';
}
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const buttons = () =>
  Array.from(container.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
const failedText = (failure?: GenerationFailure, extra: Record<string, unknown> = {}) =>
  show('generation_failed', {
    generationFailure: failure,
    generationError: 'Raw reason 409',
    ...extra,
  });

describe('hard block', () => {
  it('W10: `The draft could not start.` shows once (no step label), button `Edit the form`', () => {
    const text = show('hard_block', { hardBlockReason: 'Client name is missing' });
    expect(count(text, 'The draft could not start.')).toBe(1);
    expect(text).not.toContain('Step ');
    expect(text).toContain('Client name is missing');
    expect(buttons()).toContain('Edit the form');
    expect(buttons()).not.toContain('Edit form');
    expect(text).not.toContain('Cannot generate this draft');
  });

  it('`Edit the form` calls onEditForm', () => {
    show('hard_block', { hardBlockReason: 'x' });
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Edit the form')!
        .click(),
    );
    expect(handlers.onEditForm).toHaveBeenCalledTimes(1);
  });
});

describe('soft warning (W2)', () => {
  it('has exactly ONE `Generate anyway`, one `Edit the form`, and the new step label', () => {
    const text = show('soft_warn');
    expect(buttons().filter((b) => b === 'Generate anyway')).toHaveLength(1);
    expect(buttons().filter((b) => b === 'Edit the form')).toHaveLength(1);
    expect(text).toContain('Step 2 of 5 — please check your inputs');
    expect(text).not.toContain('verifier flagged something');
    expect(text).toContain('Please choose one.');
  });

  it('the one cost line is "Uses 3 Ink" and appears once; the one button proceeds once', () => {
    const text = show('soft_warn');
    expect(count(text, 'Uses 3 Ink')).toBe(1);
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Generate anyway')!
        .click(),
    );
    expect(handlers.onProceedAnyway).toHaveBeenCalledTimes(1);
  });

  it('no link-style second button remains after "Please choose one."', () => {
    show('soft_warn');
    const choose = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent === 'Please choose one.',
    )!;
    expect(choose.parentElement?.querySelector('button')).toBeNull();
  });
});

describe('writing the draft', () => {
  it('`Writing your {name}…`, falling back to `document`, and never `Drafting your`', () => {
    const named = show('drafting', { templateName: 'Bail application' });
    expect(named).toContain('Writing your Bail application…');
    expect(named).not.toContain('Drafting your');
    const bare = show('drafting', { templateName: undefined });
    expect(bare).toContain('Writing your document…');
    expect(bare).not.toContain('Drafting your');
  });
});

describe('generation failed (W1, W3)', () => {
  it('not started (W1): `The draft could not start.` alone, no other failure line, no Ink line of its own', () => {
    const text = failedText('not_started');
    expect(count(text, 'The draft could not start.')).toBe(1);
    expect(text).not.toContain('The draft did not finish.');
    expect(text).not.toContain('Check your documents list');
    expect(text).not.toContain('Something did not work');
    expect(text).not.toContain('Raw reason');
    expect(buttons()).toContain('Try again');
    expect(buttons()).toContain('Edit the form');
  });

  it('stream (default): `The draft did not finish.` once, with the documents-list line', () => {
    for (const kind of [undefined, 'stream' as const]) {
      const text = failedText(kind);
      expect(count(text, 'The draft did not finish.')).toBe(1);
      expect(text).toContain('Check your documents list to see where this draft stands.');
      expect(text).not.toContain('The draft could not start.');
      expect(buttons()).toContain('Try again');
      expect(text).not.toContain('Raw reason');
    }
  });

  it('request failed (W3): `Something did not work. Try again.` with a `Retry` button, never the reason', () => {
    const text = failedText('request_failed');
    expect(count(text, 'Something did not work. Try again.')).toBe(1);
    expect(buttons()).toContain('Retry');
    expect(buttons()).not.toContain('Try again');
    expect(text).not.toContain('The draft did not finish.');
    expect(text).not.toContain('The draft could not start.');
    expect(text).not.toContain('Check your documents list');
    expect(text).not.toContain('Raw reason');
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Retry')!
        .click(),
    );
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it.each<GenerationFailure | undefined>([undefined, 'stream', 'not_started', 'request_failed'])(
    '%s: the heading `Drafting could not finish` is gone and the step label is not shown',
    (kind) => {
      const text = failedText(kind);
      expect(text).not.toContain('Drafting could not finish');
      expect(container.querySelector('span[style*="uppercase"]')).toBeNull();
    },
  );

  it('`The draft did not finish.` never shows twice (card + step label)', () => {
    expect(count(failedText('stream'), 'The draft did not finish.')).toBe(1);
  });

  it('Edit the form returns to the form on every failure kind', () => {
    for (const kind of ['stream', 'not_started', 'request_failed'] as const) {
      handlers.onEditForm.mockClear();
      failedText(kind);
      act(() =>
        Array.from(container.querySelectorAll('button'))
          .find((b) => b.textContent === 'Edit the form')!
          .click(),
      );
      expect(handlers.onEditForm).toHaveBeenCalledTimes(1);
      expect(buttons()).not.toContain('Edit form');
    }
  });

  it('in progress (W6): the documents-list line alone, no Retry or Try again, even when retryable', () => {
    const text = failedText('in_progress');
    expect(count(text, 'Check your documents list to see where this draft stands.')).toBe(1);
    expect(text).not.toContain('The draft did not finish.');
    expect(text).not.toContain('Something did not work');
    expect(text).not.toContain('Raw reason');
    expect(buttons()).not.toContain('Retry');
    expect(buttons()).not.toContain('Try again');
    expect(buttons()).toContain('Edit the form');
  });

  it('plan gate (W7): the signed plan line alone, no Retry or Try again', () => {
    const text = failedText('plan_required');
    expect(count(text, 'This document is not available on your current plan.')).toBe(1);
    expect(text).not.toContain('Something did not work');
    expect(text).not.toContain('Check your documents list');
    expect(text).not.toContain('Raw reason');
    expect(buttons()).not.toContain('Retry');
    expect(buttons()).not.toContain('Try again');
    expect(buttons()).toContain('Edit the form');
  });

  it.each<GenerationFailure>(['in_progress', 'plan_required'])(
    '%s: no heading `Drafting could not finish` and no step label',
    (kind) => {
      expect(failedText(kind)).not.toContain('Drafting could not finish');
      expect(container.querySelector('span[style*="uppercase"]')).toBeNull();
    },
  );

  it('not started (W8): Try again is enabled with an unknown cost, no notice, no re-check link', () => {
    const onInkCostRetry = jest.fn();
    const text = failedText('not_started', { inkCost: undefined, onInkCostRetry });
    expect(text).not.toContain('We could not work out the Ink cost');
    expect(text).not.toContain('Check the cost again');
    expect(buttons()).not.toContain('Check the cost again');
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Try again',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    act(() => btn.click());
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it('not started (W8): while the cost loads Try again is off and the loading line shows; known shows Uses N Ink', () => {
    let text = failedText('not_started', { inkCost: undefined, inkCostLoading: true });
    expect(text).toContain('Working out the Ink cost...');
    const btn = () =>
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Try again',
      ) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    text = failedText('not_started', { inkCost: 3 });
    expect(text).toContain('Uses 3 Ink');
    expect(btn().disabled).toBe(false);
  });

  it('stream card with an unknown cost (W12): the reason line, no notice or link, Try again disabled and described by it', () => {
    const text = failedText('stream', { inkCost: undefined, onInkCostRetry: jest.fn() });
    expect(count(text, 'You can generate once the Ink cost is shown.')).toBe(1);
    expect(text).not.toContain('We could not work out the Ink cost');
    expect(text).not.toContain('Check the cost again');
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Try again',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    const id = btn.getAttribute('aria-describedby') as string;
    expect(container.querySelector(`#${id}`)?.textContent).toBe(
      'You can generate once the Ink cost is shown.',
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('not retryable: no Try again or Retry button, Edit the form stays', () => {
    failedText('request_failed', { generationRetryable: false });
    expect(buttons()).not.toContain('Retry');
    expect(buttons()).toContain('Edit the form');
  });
});
