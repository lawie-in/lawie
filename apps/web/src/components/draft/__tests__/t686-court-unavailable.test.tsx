// T-686: PipelineStatus shows `Court unavailable, try again` (with Retry) for a refused start
// whose error code is court_unavailable; every other code keeps the generic line. The fact-question
// routing (generationFailureCopy / FACT_QUESTION_CODES) is unchanged.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  COURT_UNAVAILABLE,
  COURT_UNAVAILABLE_CODE,
  FACT_QUESTION_CODES,
  SOMETHING_DID_NOT_WORK,
  generationFailureCopy,
} from '@/components/intake/generationFailure';

import PipelineStatus from '../PipelineStatus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

let container: HTMLDivElement;
let root: Root;
const onRetry = jest.fn();
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
        onEditForm={jest.fn()}
        generationFailure="request_failed"
        {...extra}
      />,
    ),
  );
}
const text = () => container.textContent ?? '';
const buttons = () =>
  Array.from(container.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());

describe('T-686 PipelineStatus: court unavailable', () => {
  it('constants carry the signed wording', () => {
    expect(COURT_UNAVAILABLE_CODE).toBe('court_unavailable');
    expect(COURT_UNAVAILABLE).toBe('Court unavailable, try again');
  });

  it('request_failed + court_unavailable: the court line and a working Retry', () => {
    show({ generationErrorCode: 'court_unavailable' });
    expect(text()).toContain('Court unavailable, try again');
    expect(text()).not.toContain(SOMETHING_DID_NOT_WORK);
    expect(buttons()).toContain('Retry');
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Retry')!
        .click(),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([[undefined], ['some_other_code'], ['Court Unavailable'], ['insufficient_ink']])(
    'request_failed + code %p: the generic line, not the court line',
    (code) => {
      show({ generationErrorCode: code });
      expect(text()).toContain(SOMETHING_DID_NOT_WORK);
      expect(text()).not.toContain('Court unavailable');
      expect(buttons()).toContain('Retry');
    },
  );

  it('the court line is only for request_failed (a stream failure with that code is not it)', () => {
    show({ generationFailure: 'stream', generationErrorCode: 'court_unavailable' });
    expect(text()).not.toContain('Court unavailable, try again');
  });
});

describe('T-686: fact-question routing unchanged', () => {
  it('court_unavailable is not a fact-question code', () => {
    expect(FACT_QUESTION_CODES.has(COURT_UNAVAILABLE_CODE)).toBe(false);
  });

  it('existing fact-question codes are still in the set', () => {
    expect(FACT_QUESTION_CODES.has('fact_needed')).toBe(true);
    expect(FACT_QUESTION_CODES.has('past_date_in_prayer')).toBe(true);
  });

  it('generationFailureCopy: court_unavailable on an error_event is a plain failure, not a question', () => {
    const copy = generationFailureCopy({
      code: COURT_UNAVAILABLE_CODE,
      reason: 'Court unavailable, try again',
      retryable: true,
      source: 'error_event',
    });
    expect(copy.headline).toBe('The draft did not finish.');
    expect(copy.headline).not.toBe('Court unavailable, try again');
  });

  it('generationFailureCopy: a refused start still gives the reason as the headline', () => {
    const copy = generationFailureCopy({
      code: COURT_UNAVAILABLE_CODE,
      reason: SOMETHING_DID_NOT_WORK,
      retryable: true,
      source: 'start',
    });
    expect(copy).toEqual({
      headline: SOMETHING_DID_NOT_WORK,
      statusLine: null,
      detail: null,
      noInkClaim: false,
    });
  });
});
