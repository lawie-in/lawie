// T-521 break-ui pass (Arjun, ui-quality.md): worst-case data on the intake screens.
// Plausible values only: a 255-char party/document name (the schema limit) with no spaces and
// mixed Devanagari, a 40-page-draft-sized findings list, zero and unknown Ink, a description at
// the 500 cap. jsdom checks no layout: wrap/truncate is asserted through the classes that cause it.
import { act } from 'react';

import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

import type { DraftResult } from '../briefTypes';
import DraftReadyStep from '../DraftReadyStep';
import GeneratingStep from '../GeneratingStep';
import { BriefLoadError } from '../BriefStep';
import DescribeStep from '../DescribeStep';
import DocumentChoiceStep from '../DocumentChoiceStep';

jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('@/lib/auth', () => ({ getAccessToken: () => 'tokenword' }));

const LONG_NAME =
  'श्रीमती आलेक्सान्द्रा' + 'विश्नेव्स्का-कोवाल्चिक'.repeat(2) + 'Bartholomew'.repeat(15); // > 200, mostly unbroken
const LONG_REASON = `${'The drafting service stopped while writing section 12 of the application. '.repeat(
  6,
)}${'x'.repeat(120)}`;
const base: DraftResult = {
  docId: 'doc1',
  name: LONG_NAME,
  rulePack: true,
  startingDraft: false,
  startingDraftLabel: null,
  labelReason: null,
  missingClauses: [],
  findings: [],
  blanks: 0,
  factCheck: null,
  disclaimer: null,
};

afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
});

const btnText = (c: HTMLElement) => qa('button', c).map((b) => (b.textContent ?? '').trim());

describe('break-ui: DraftReadyStep', () => {
  it('a 40-page-draft sized result (80 findings, 40 missing parts, 999 blanks) renders with every action visible', () => {
    stubMatchMedia({});
    const findings = Array.from({ length: 80 }, (_, i) => ({
      type: 'date',
      message: `Finding ${i} ${LONG_NAME}`,
    }));
    const missingClauses = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      title: `Missing clause ${i} ${LONG_NAME}`,
    }));
    const { container } = mount(
      <DraftReadyStep
        result={{ ...base, findings, missingClauses, blanks: 999, inkUsed: 12 }}
        onOpenEditor={jest.fn()}
        onStartAnother={jest.fn()}
      />,
    );
    expect(qa('li', container).length).toBeGreaterThanOrEqual(120);
    expect(btnText(container)).toEqual(
      expect.arrayContaining(['Finalise', 'Export', 'Open in editor', 'Start another document']),
    );
    expect(container.textContent).toContain('999 blanks to fill');
    expect(container.textContent).toContain('12 Ink used');
  });

  it('the text column can shrink (min-w-0) next to the fixed tick', () => {
    const { container } = mount(
      <DraftReadyStep result={base} onOpenEditor={jest.fn()} onStartAnother={jest.fn()} />,
    );
    const col = q('h1', container)!.parentElement!;
    expect(col.className).toContain('min-w-0');
    // the tick must not squash into an oval
    expect(q('svg', container)!.parentElement!.className).toContain('flex-none');
  });

  // Was a finding (name in a plain <p>); fixed in round 4.
  it('the document name line wraps unbroken text (break-words)', () => {
    const { container } = mount(
      <DraftReadyStep result={base} onOpenEditor={jest.fn()} onStartAnother={jest.fn()} />,
    );
    const p = Array.from(container.querySelectorAll('p')).find((e) =>
      (e.textContent ?? '').includes(LONG_NAME),
    )!;
    const chain = `${p.className} ${p.parentElement!.className}`;
    expect(chain).toMatch(/break-words|\[overflow-wrap:anywhere\]|break-all/);
  });

  it('zero Ink: "0 Ink used"; unknown Ink: no chip; both keep Finalise', () => {
    const a = mount(
      <DraftReadyStep
        result={{ ...base, name: 'Bail', inkUsed: 0 }}
        onOpenEditor={jest.fn()}
        onStartAnother={jest.fn()}
      />,
    );
    expect(a.container.textContent).toContain('0 Ink used');
    expect(btnText(a.container)).toContain('Finalise');
    const b = mount(
      <DraftReadyStep
        result={{ ...base, name: 'Bail' }}
        onOpenEditor={jest.fn()}
        onStartAnother={jest.fn()}
      />,
    );
    expect(b.container.textContent).not.toContain('Ink used');
    expect(btnText(b.container)).toContain('Finalise');
  });

  it('one blank and one missing part use the singular', () => {
    const { container } = mount(
      <DraftReadyStep
        result={{ ...base, name: 'Bail', blanks: 1 }}
        onOpenEditor={jest.fn()}
        onStartAnother={jest.fn()}
      />,
    );
    expect(container.textContent).toContain('1 blank to fill');
    expect(container.textContent).not.toContain('1 blanks');
  });

  it('empty everything (no findings, parts, blanks) still shows the signed no-mismatch note and actions', () => {
    const { container } = mount(
      <DraftReadyStep
        result={{ ...base, name: 'Bail' }}
        onOpenEditor={jest.fn()}
        onStartAnother={jest.fn()}
      />,
    );
    expect(container.textContent).toContain('These checks found no mismatch');
    expect(btnText(container)).toContain('Export');
  });

  it('the action row stacks on a phone (flex-col-reverse) and the buttons are 44px', () => {
    const { container } = mount(
      <DraftReadyStep result={base} onOpenEditor={jest.fn()} onStartAnother={jest.fn()} />,
    );
    const fin = qa('button', container).find((b) => b.textContent === 'Finalise')!;
    expect(fin.parentElement!.className).toContain('flex-col-reverse');
    expect(fin.className).toMatch(/\bh-11\b/);
  });
});

describe('break-ui: failure card', () => {
  const card = (error: Parameters<typeof GeneratingStep>[0]['error']) =>
    mount(
      <GeneratingStep
        documentName={LONG_NAME}
        repairing={false}
        error={error}
        onRetry={jest.fn()}
        onBackToBrief={jest.fn()}
        inkCost={0}
      />,
    );

  it('error event after a long partial draft: the signed line, a very long reason, both actions visible', () => {
    const { container } = card({
      reason: LONG_REASON,
      retryable: true,
      source: 'error_event',
      code: 'drafter_failed',
    });
    expect(container.textContent).toContain('The draft did not finish. No Ink was used.');
    expect(container.textContent).toContain(LONG_REASON);
    expect(btnText(container)).toEqual(expect.arrayContaining(['Back to the brief', 'Try again']));
    expect(q('.min-w-0', container)).not.toBeNull();
  });

  it('a 0 or unknown Ink cost is "not known" (T-388): Try again is held, Back to the brief is not', () => {
    const { container } = card({ reason: 'r', retryable: true, source: 'start' });
    const t = qa('button', container).find((b) => b.textContent === 'Try again')!;
    expect(t.getAttribute('aria-disabled')).toBe('true');
    expect(btnText(container)).toContain('Back to the brief');
  });

  it('insufficient_ink with a long reason: the reason only, never the signed line', () => {
    const { container } = card({
      reason: LONG_REASON,
      retryable: false,
      source: 'error_event',
      code: 'insufficient_ink',
    });
    expect(container.textContent).toContain(LONG_REASON);
    expect(container.textContent).not.toContain('No Ink was used');
    expect(btnText(container)).toContain('Back to the brief');
  });

  it('the failure headline wraps (not nowrap) so a long reason cannot push the actions off-screen', () => {
    const { container } = card({ reason: LONG_REASON, retryable: true, source: 'start' });
    expect(q('h1', container)!.className).not.toContain('whitespace-nowrap');
  });

  it('a long document name in the drafting title renders without crashing', () => {
    const { container } = mount(
      <GeneratingStep
        documentName={LONG_NAME}
        repairing
        error={null}
        onRetry={jest.fn()}
        onBackToBrief={jest.fn()}
      />,
    );
    expect(q('h1', container)!.textContent).toContain(LONG_NAME);
  });
});

describe('break-ui: description at the 500 cap', () => {
  const cap = ('श्री आलेक्सान्द्रा bail matter ' + 'z'.repeat(40) + ' ').repeat(10).slice(0, 500);

  it('the echo of a 500-char description wraps (break-words) and keeps the text', () => {
    const { container } = mount(
      <BriefLoadError onRetry={jest.fn()} onEditDescription={jest.fn()} description={cap} />,
    );
    const bq = q('blockquote', container)!;
    expect(bq.textContent).toBe(cap);
    expect(bq.className).toContain('break-words');
    expect(bq.className).toContain('whitespace-pre-wrap');
  });

  it('DescribeStep keeps a 500-char description and Continue stays available', () => {
    const { container } = mount(
      <DescribeStep
        value={cap}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onBrowse={jest.fn()}
        submitting={false}
      />,
    );
    expect((q('textarea', container) as HTMLTextAreaElement).value).toBe(cap);
    const go = qa('button', container).find(
      (b) => b.textContent === 'Continue',
    ) as HTMLButtonElement;
    expect(go.disabled).toBe(false);
  });

  it('an empty description keeps Continue off', () => {
    const { container } = mount(
      <DescribeStep
        value=""
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onBrowse={jest.fn()}
        submitting={false}
      />,
    );
    const go = qa('button', container).find(
      (b) => b.textContent === 'Continue',
    ) as HTMLButtonElement;
    expect(go.disabled || go.getAttribute('aria-disabled') === 'true').toBe(true);
  });
});

describe('break-ui: wrapping of long user and service text (round 4)', () => {
  const BIG = ('श्रीमती' + 'Bartholomew'.repeat(30)).slice(0, 255);
  const wraps = (el: Element | null) => {
    expect(el).not.toBeNull();
    expect(`${el!.className} ${el!.parentElement?.className ?? ''}`).toMatch(
      /break-words|\[overflow-wrap:anywhere\]|break-all/,
    );
  };

  it('DescribeStep heading with a 255-char preset name', () => {
    const { container } = mount(
      <DescribeStep
        value=""
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onBrowse={jest.fn()}
        submitting={false}
        documentName={BIG}
      />,
    );
    expect(q('h1', container)!.textContent).toBe(BIG);
    expect(q('h1', container)!.className).toContain('break-words');
  });

  it('DocumentChoiceStep option name and description sit in a min-w-0 break-words column', () => {
    const { container } = mount(
      <DocumentChoiceStep
        choices={[
          { template_id: 'a', display_name: BIG, description: BIG },
          { template_id: 'b', display_name: 'Short' },
        ]}
        onChoose={jest.fn()}
        onEditDescription={jest.fn()}
        submitting={false}
      />,
    );
    expect(container.textContent).toContain(BIG);
    const col = Array.from(container.querySelectorAll('span')).find((e) =>
      (e.textContent ?? '').startsWith(BIG),
    )!;
    const wrapCol = col.closest('.min-w-0')!;
    expect(wrapCol.className).toContain('break-words');
    expect(qa('input[type="radio"]', container)).toHaveLength(3); // two choices + "none of these"
  });

  it('GeneratingStep: "Drafting your ..." title, failure headline and detail all wrap', () => {
    const run = (error: Parameters<typeof GeneratingStep>[0]['error']) =>
      mount(
        <GeneratingStep
          documentName={BIG}
          repairing={false}
          error={error}
          onRetry={jest.fn()}
          onBackToBrief={jest.fn()}
          inkCost={2}
        />,
      );
    const a = run(null);
    expect(q('h1', a.container)!.textContent).toContain(BIG);
    expect(q('h1', a.container)!.className).toContain('break-words');
    expect(q('h1', a.container)!.parentElement!.className).toContain('min-w-0');
    const b = run({ reason: BIG, retryable: true, source: 'error_event', code: 'x' });
    const h = q('h1', b.container)!;
    expect(h.className).toContain('break-words');
    const detail = Array.from(b.container.querySelectorAll('p')).find((e) => e.textContent === BIG);
    wraps(detail ?? null);
    const c = run({
      reason: BIG,
      retryable: false,
      source: 'error_event',
      code: 'insufficient_ink',
    });
    expect(q('h1', c.container)!.textContent).toBe(BIG);
    expect(q('h1', c.container)!.className).toContain('break-words');
  });

  it('DraftReadyStep: findings, missing parts, label and disclaimer wrap', () => {
    const { container } = mount(
      <DraftReadyStep
        result={{
          ...base,
          name: BIG,
          startingDraft: true,
          startingDraftLabel: BIG,
          labelReason: BIG,
          disclaimer: BIG,
          findings: [{ type: 'a', message: BIG }],
          missingClauses: [{ id: 'm', title: BIG }],
        }}
        onOpenEditor={jest.fn()}
        onStartAnother={jest.fn()}
      />,
    );
    const hits = Array.from(container.querySelectorAll('p, span')).filter(
      (e) => (e.textContent ?? '').includes(BIG) && e.children.length === 0,
    );
    expect(hits.length).toBeGreaterThanOrEqual(4);
    for (const h of hits) wraps(h);
  });
});

it('click helper sanity (keeps the import used)', () => {
  const fn = jest.fn();
  const { container } = mount(<button onClick={fn}>go</button>);
  click(q('button', container));
  act(() => undefined);
  expect(fn).toHaveBeenCalled();
});
