// T-637: PipelineStatus for a draft the server withheld to ask one question (FACT_QUESTION_CODES).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import PipelineStatus from '../PipelineStatus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

let container: HTMLDivElement;
let root: Root;
const onRetry = jest.fn();
const onEditForm = jest.fn();
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
function show(extra: Record<string, unknown>) {
  act(() =>
    root.render(
      <PipelineStatus
        state="generation_failed"
        questions={[]}
        inkCost={3}
        generationRetryable
        onRetry={onRetry}
        onEditForm={onEditForm}
        {...extra}
      />,
    ),
  );
}
const text = () => container.textContent ?? '';
const buttons = () =>
  Array.from(container.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());

const REASON = 'One detail is needed before the draft: Residential Address.';

describe('T-637 PipelineStatus: a fact question is the headline', () => {
  it.each([
    ['fact_needed', REASON],
    ['past_date_in_prayer', 'The prayer refers to 20 October 2026, which has already passed.'],
  ])('%s: the server reason is shown, no Try again, Edit the form present', (code, reason) => {
    show({ generationError: reason, generationErrorCode: code, generationFailure: 'stream' });
    expect(text()).toContain(reason);
    expect(text()).not.toContain('The draft did not finish.');
    expect(buttons()).not.toContain('Try again');
    expect(buttons()).toContain('Edit the form');
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Edit the form')!
        .click(),
    );
    expect(onEditForm).toHaveBeenCalledTimes(1);
  });

  it('other codes, and no code, are unchanged: signed lines and Try again', () => {
    for (const code of ['generation_failed', undefined]) {
      show({
        generationError: 'Raw reason',
        generationErrorCode: code,
        generationFailure: 'stream',
      });
      expect(text()).toContain('The draft did not finish.');
      expect(text()).not.toContain(REASON);
      expect(buttons()).toContain('Try again');
    }
  });

  it('a fact code on a pre-stream failure kind keeps that kind own line', () => {
    show({
      generationError: REASON,
      generationErrorCode: 'fact_needed',
      generationFailure: 'request_failed',
    });
    expect(text()).not.toContain(REASON);
  });
});
