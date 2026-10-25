// T-373 (ADR-025 D1): the checks panel reads the rendered clause ids.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DraftReadyStep from '../DraftReadyStep';
import type { DraftResult, RenderedClause } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const result = (extra: Partial<DraftResult> = {}): DraftResult => ({
  docId: 'd1',
  name: 'Bail application',
  rulePack: true,
  startingDraft: false,
  startingDraftLabel: null,
  labelReason: null,
  missingClauses: [],
  findings: [],
  blanks: 0,
  ...extra,
});

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

function mount(r: DraftResult) {
  act(() => {
    root.render(<DraftReadyStep result={r} onOpenEditor={jest.fn()} onStartAnother={jest.fn()} />);
  });
}
const rows = () =>
  Array.from(container.querySelectorAll('li'))
    .filter((li) => (li.textContent ?? '').startsWith('Missing part.'))
    .map((li) => (li.textContent ?? '').replace('Missing part.', '').trim());
const text = () => container.textContent ?? '';
const NOTHING = 'found no mismatch between the draft and your brief';

describe('T-373 checks panel on a D1 pack (rendered present)', () => {
  it('lists only rendered missing clauses, titled from missingClauses', () => {
    const rendered: RenderedClause[] = [
      { clauseId: 'c-ok', status: 'ok' },
      { clauseId: 'c-miss', status: 'missing', missing: ['Date'] },
      { clauseId: 'c-fb', status: 'fallback', reason: 'unverified' },
    ];
    mount(
      result({
        rendered,
        missingClauses: [
          { id: 'c-miss', title: 'Grounds of bail' },
          { id: 'c-ok', title: 'Should not show' },
        ],
      }),
    );
    expect(rows()).toEqual(['Grounds of bail']);
    expect(text()).not.toContain('Should not show');
    expect(text()).not.toContain('c-fb');
    expect(text()).not.toContain(NOTHING);
  });

  it('shows the nothing-found line when rendered has only ok and fallback entries', () => {
    mount(
      result({
        rendered: [
          { clauseId: 'a', status: 'ok' },
          { clauseId: 'b', status: 'fallback', reason: 'not_returned' },
        ],
        // stale legacy list is ignored when rendered is present
        missingClauses: [{ id: 'a', title: 'Stale title' }],
      }),
    );
    expect(rows()).toEqual([]);
    expect(text()).toContain(NOTHING);
    expect(text()).not.toContain('Stale title');
  });

  it('an empty rendered list is still D1: nothing found, legacy list ignored', () => {
    mount(result({ rendered: [], missingClauses: [{ id: 'x', title: 'Legacy' }] }));
    expect(rows()).toEqual([]);
    expect(text()).toContain(NOTHING);
  });

  it('falls back to the blank labels, joined, when missingClauses has no match', () => {
    mount(
      result({
        rendered: [{ clauseId: 'c1', status: 'missing', missing: ['Date', 'Court name'] }],
        missingClauses: [{ id: 'other', title: 'Other' }],
      }),
    );
    expect(rows()).toEqual(['Date, Court name']);
  });

  it('falls back to the clause id when there are no blank labels', () => {
    mount(
      result({
        rendered: [
          { clauseId: 'c-none', status: 'missing' },
          { clauseId: 'c-empty', status: 'missing', missing: [] },
        ],
      }),
    );
    expect(rows()).toEqual(['c-none', 'c-empty']);
  });

  it('other findings still show next to rendered missing rows', () => {
    mount(
      result({
        rendered: [{ clauseId: 'c1', status: 'missing' }],
        findings: [{ type: 'date_mismatch', message: 'Date differs from brief' }],
      }),
    );
    expect(rows()).toEqual(['c1']);
    expect(text()).toContain('Date differs from brief');
  });

  it('factCheck absent: no banner, the disclaimer shows as the neutral note', () => {
    mount(
      result({
        rendered: [{ clauseId: 'c1', status: 'ok' }],
        disclaimer: 'Signed disclaimer line.',
      }),
    );
    const notes = container.querySelectorAll('[role="note"]');
    expect(notes).toHaveLength(1);
    expect(notes[0].getAttribute('aria-labelledby')).toBeNull();
    expect(notes[0].textContent).toBe('Signed disclaimer line.');
    expect(text()).toContain(NOTHING);
  });
});

describe('T-373 checks panel without rendered (non-D1)', () => {
  it('rows come from missingClauses unchanged', () => {
    mount(
      result({
        missingClauses: [
          { id: 'a', title: 'Prayer' },
          { id: 'b', title: 'Verification' },
        ],
        findings: [{ type: 'x', message: 'A finding' }],
      }),
    );
    expect(rows()).toEqual(['Prayer', 'Verification']);
    expect(text()).toContain('A finding');
    expect(text()).not.toContain(NOTHING);
  });

  it('nothing missing and no findings shows the nothing-found line', () => {
    mount(result());
    expect(rows()).toEqual([]);
    expect(text()).toContain(NOTHING);
  });
});
