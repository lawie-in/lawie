// T-565 item 43 + T1, T3, T6 (Ajay, pre-Anushka legal review 22 Oct): PipelineStatus (old form
// flow) wording. Every signed string byte-exact, and no replaced string left in any state.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import PipelineStatus, { type PipelineState } from '../PipelineStatus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const handlers = {
  onProceedAnyway: jest.fn(),
  onEditForm: jest.fn(),
  onRetry: jest.fn(),
  onOpenEditor: jest.fn(),
};

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
const labels = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
const divs = () => Array.from(container.querySelectorAll('div, span, p')).map((e) => e.textContent);

// Strings Ajay's review replaced or deleted. (Four old strings with no signed replacement yet are
// deliberately not in this list: `Step 2 of 5 — verifier flagged something`, `Drafting could not
// finish`, `Please review the flagged inputs before generating.`, and the missing-field hard-block
// fallback.)
const OLD_STRINGS = [
  'Verifying your inputs',
  'Cross-checking sections, dates, and jurisdiction',
  'Takes about 2 seconds',
  'Ek baat dhyan mein aayi',
  'confirm kar lein',
  'Looks correct',
  'Let me fix this',
  'Skip and generate anyway',
  'Verifier paused',
  'Usually around a minute',
  'You can leave this open',
  'Your inputs are saved',
  're-trying does not lose',
  'verifying inputs',
  'verifier hard-blocked',
  'Error —',
  '(streaming)',
  'No warnings',
  'The AI service returned an error',
  'Reading the form',
  'Loading court rules',
  'Thinking through the facts',
  'Synthesizing the grounds',
  'Drafting numbered paragraphs',
  'Citing',
  'Composing the prayer clause',
  'Building the verification block',
  'Cross-checking dates and parties',
  'Final polish',
];
const STATES: PipelineState[] = [
  'verifying',
  'soft_warn',
  'drafting',
  'ready',
  'hard_block',
  'generation_failed',
];

describe('T-565 item 43: no old string in any state', () => {
  it.each(STATES)('%s shows none of the replaced strings (even after a minute)', (state) => {
    let text = show(state, { generationError: 'Model down', hardBlockReason: undefined });
    act(() => {
      jest.advanceTimersByTime(65_000);
    });
    text += container.textContent ?? '';
    for (const old of OLD_STRINGS) expect(text).not.toContain(old);
    expect(text).not.toContain('Verifying'); // the old progress label
    expect(text).not.toContain('Validating'); // the old progress label
  });
});

describe('T-565 item 43 + T3: progress labels', () => {
  // the bar is drawn on the checking and writing cards
  it.each(['verifying', 'drafting'] as PipelineState[])(
    '%s shows the signed five labels',
    (state) => {
      const text = show(state);
      for (const l of [
        'Inputs received',
        'Checking inputs',
        'Drafting',
        'Checking the draft',
        'Ready',
      ]) {
        expect(text).toContain(l);
      }
    },
  );
});

describe('T-565 item 43: checking inputs', () => {
  it('heading `Checking your inputs…`, step line `Step 2 of 5 — checking inputs`, no second line', () => {
    const text = show('verifying');
    expect(divs()).toContain('Checking your inputs…');
    expect(text).toContain('Step 2 of 5 — checking inputs');
    // the card's text block is the heading alone
    const el = Array.from(container.querySelectorAll('div')).find(
      (d) => d.textContent === 'Checking your inputs…',
    )!;
    // no second text line follows the heading (only the textless bar segments)
    expect(el.nextElementSibling?.textContent).toBe('');
  });
});

describe('T-565 item 43 + T6: soft warning card', () => {
  it('has the signed heading, `Edit the form`, `Please choose one.` and two `Generate anyway` buttons', () => {
    const text = show('soft_warn');
    expect(text).toContain('Please check this before you generate.');
    expect(text).toContain('Please choose one.');
    expect(text).toContain('Check the dates'); // the question is still shown
    const l = labels();
    expect(l.filter((x) => x === 'Generate anyway')).toHaveLength(2);
    expect(l.filter((x) => x === 'Edit the form')).toHaveLength(1);
  });

  it('both `Generate anyway` buttons proceed, and `Edit the form` returns to the form', () => {
    show('soft_warn');
    const gen = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent === 'Generate anyway',
    );
    gen.forEach((b) => act(() => b.click()));
    expect(handlers.onProceedAnyway).toHaveBeenCalledTimes(2);
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Edit the form')!
        .click(),
    );
    expect(handlers.onEditForm).toHaveBeenCalledTimes(1);
  });
});

describe('T-565 item 43: writing the draft', () => {
  it('one static line `Writing the draft…`, step line `Step 3 of 5 — writing the draft`', () => {
    const text = show('drafting', { templateName: 'Bail application' });
    expect(text).toContain('Drafting your Bail application…');
    expect(divs()).toContain('Writing the draft…');
    expect(text).toContain('Step 3 of 5 — writing the draft');
  });

  it('the line never rotates: same text at 0, 6, 30 and 90 seconds, one status line only', () => {
    show('drafting');
    const lineCount = () => divs().filter((t) => t === 'Writing the draft…').length;
    for (const seconds of [0, 6, 24, 60]) {
      act(() => {
        jest.advanceTimersByTime(seconds * 1000);
      });
      expect(lineCount()).toBe(1);
      expect(container.textContent).not.toMatch(
        /Reading the form|Citing|Final polish|almost there/,
      );
    }
  });
});

describe('T-565 T1: the finished draft', () => {
  const ZERO = 'The drafting checks flagged nothing. Read the draft before you use it.';

  it.each([undefined, 0])('warningCount %s shows the signed no-warnings line', (n) => {
    const text = show('ready', { sectionsCited: ['BNS 103'], warningCount: n });
    expect(text).toContain(`Sections: BNS 103. ${ZERO}`);
    expect(text).not.toContain('No warnings');
    expect(text).not.toContain('No mismatch');
    expect(text).not.toContain(`${ZERO}.`); // no doubled full stop
  });

  it('with warnings the count shows and the signed line does not', () => {
    const one = show('ready', { sectionsCited: ['BNS 103'], warningCount: 1 });
    expect(one).toContain('Sections: BNS 103. 1 warning.');
    expect(one).not.toContain(ZERO);
    const two = show('ready', { sectionsCited: ['BNS 103'], warningCount: 2 });
    expect(two).toContain('2 warnings.');
    expect(two).not.toContain(ZERO);
  });
});

describe('T-565 item 43 + T6 + row 41: hard block and failed draft', () => {
  it('hard block: step line `The draft could not start.`', () => {
    const text = show('hard_block', { hardBlockReason: 'Client name is missing' });
    expect(text).toContain('The draft could not start.');
    expect(text).not.toContain('verifier hard-blocked');
  });

  it('failed: signed step line, `The draft did not finish.` and the documents-list line', () => {
    const text = show('generation_failed', { generationError: 'Model down: 503 upstream' });
    expect(text).toContain('The draft did not finish.');
    expect(divs()).toContain('The draft did not finish.');
    expect(divs()).toContain('Check your documents list to see where this draft stands.');
    expect(text).not.toContain('Your inputs are saved');
    expect(text).not.toContain('Error —');
  });

  it('failed: the server reason is never rendered, with or without one', () => {
    const withReason = show('generation_failed', { generationError: 'Model down: 503 upstream' });
    expect(withReason).not.toContain('Model down');
    expect(withReason).not.toContain('503');
    const without = show('generation_failed', { generationError: undefined });
    expect(without).not.toContain('The AI service returned an error');
    expect(without).toContain('Check your documents list to see where this draft stands.');
  });

  it('failed: Try again still retries and Edit form still returns to the form', () => {
    show('generation_failed');
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Try again')!
        .click(),
    );
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
    act(() =>
      Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === 'Edit form')!
        .click(),
    );
    expect(handlers.onEditForm).toHaveBeenCalledTimes(1);
  });
});
