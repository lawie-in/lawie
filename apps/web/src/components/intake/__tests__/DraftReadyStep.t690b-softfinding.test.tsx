// T-690b (Rajesh): the brief's soft findings are the first item in "Checks run for you" on the
// ready screen, once, and change nothing else there.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { DraftResult } from '../briefTypes';
import DraftReadyStep from '../DraftReadyStep';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/lib/auth', () => ({
  getAccessToken: () => 'tokenword',
  getRefreshToken: () => null,
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
  endSessionForced: jest.fn(),
  isTokenExpired: () => false,
  tokenSubject: () => null,
}));

const WS_TEXT =
  'This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.';
const FINDING = { rule_id: 'ws_over_90_days', text: WS_TEXT };
const NO_MISMATCH =
  'These checks found no mismatch between the draft and your brief (dates, names, numbers, sections and parts). They can miss things, and they do not check the law. Read every line before use.';

const base: DraftResult = {
  docId: 'doc42',
  name: 'Written statement',
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
const banner = {
  text: 'Fact check banner text.',
  items: [{ check: 'c1', label: 'Date', note: 'Differs from the brief.' }],
  disclaimer: 'Banner disclaimer line.',
};

describe('DraftReadyStep soft findings (T-690b)', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const show = (result: Partial<DraftResult> = {}) =>
    act(() => {
      root.render(
        <DraftReadyStep
          result={{ ...base, ...result }}
          onOpenEditor={jest.fn()}
          onStartAnother={jest.fn()}
          onExport={jest.fn()}
        />,
      );
    });
  const section = () => container.querySelector('section[aria-labelledby="ready-checks"]')!;
  const cards = () =>
    Array.from(container.querySelectorAll('[role="status"]')).filter((e) =>
      (e.textContent ?? '').includes('more than 90 days after service'),
    ) as HTMLElement[];
  const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

  it('is the first item after the heading row inside the "Checks run for you" section', () => {
    show({ softFindings: [FINDING] });
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toBe(WS_TEXT);
    expect(section().contains(cards()[0])).toBe(true);
    expect(document.getElementById('ready-checks')!.textContent).toBe('Checks run for you');
    const kids = Array.from(section().children);
    expect(kids.indexOf(cards()[0])).toBe(1);
    expect(cards()[0].parentElement).toBe(section());
    // the heading row comes first and holds the heading, not the card
    expect(kids[0].contains(document.getElementById('ready-checks'))).toBe(true);
  });

  it('precedes the fact-check banner, the nothing-found line and the list', () => {
    show({
      softFindings: [FINDING],
      factCheck: banner,
      findings: [{ message: 'A finding.' }] as never,
    });
    const card = cards()[0];
    const note = container.querySelector('#ready-fact-check')!.parentElement!;
    expect(card.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const list = section().querySelector(':scope > ul')!;
    expect(card.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(section().children).indexOf(note)).toBeGreaterThan(
      Array.from(section().children).indexOf(card),
    );
  });

  it('precedes the disclaimer note when there is no banner', () => {
    show({ softFindings: [FINDING], disclaimer: 'Plain disclaimer.' });
    const kids = Array.from(section().children);
    const dis = kids.find((k) => (k.textContent ?? '').includes('Plain disclaimer.'))!;
    expect(kids.indexOf(cards()[0])).toBeLessThan(kids.indexOf(dis));
  });

  it('is not outside the section, and appears once on the screen', () => {
    show({ softFindings: [FINDING, { ...FINDING }, { rule_id: 'dup', text: WS_TEXT }] });
    expect(cards()).toHaveLength(1);
    expect(container.textContent!.split(WS_TEXT).length - 1).toBe(1);
    const outside = Array.from(container.children[0].children).filter(
      (c) => c !== section() && (c.textContent ?? '').includes('more than 90 days'),
    );
    expect(outside).toHaveLength(0);
    expect(cards()[0].querySelector('button, a')).toBeNull();
  });

  it('leaves the signed no-mismatch line and the other content unchanged', () => {
    show();
    const without = norm(container.textContent);
    const buttonsWithout = Array.from(container.querySelectorAll('button')).map((b) =>
      norm(b.textContent),
    );
    expect(without).toContain(NO_MISMATCH);
    show({ softFindings: [FINDING] });
    const withText = norm(container.textContent);
    expect(withText).toContain(NO_MISMATCH);
    expect(withText).toBe(norm(`${without.replace('Included', `Included${WS_TEXT}`)}`));
    expect(
      Array.from(container.querySelectorAll('button')).map((b) => norm(b.textContent)),
    ).toEqual(buttonsWithout);
    // no chip or count for the finding
    expect(container.textContent).not.toMatch(/soft finding|warning[s]? \(?\d/i);
  });

  it('shows no card when softFindings is absent, empty or malformed', () => {
    show();
    expect(cards()).toHaveLength(0);
    expect(section().querySelector('[data-variant="warn"]')).toBeNull();
    show({ softFindings: [] });
    expect(section().querySelector('[data-variant="warn"]')).toBeNull();
    show({ softFindings: [{ rule_id: 'x', text: '' }] });
    expect(section().querySelector('[data-variant="warn"]')).toBeNull();
    expect(container.textContent).toContain(NO_MISMATCH);
  });
});
