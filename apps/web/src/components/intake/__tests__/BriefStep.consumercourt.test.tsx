// T-411 AC9: BriefStep passes the template id to CourtPicker, and a blocked Confirm
// focuses the "Which Commission?" group when no level is chosen.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BriefStep from '../BriefStep';
import type { Brief } from '../briefTypes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const CONFIRM_MESSAGE = 'Choose the court to continue.';

function briefOf(id: string, court: Brief['court'], blocked = true): Brief {
  return {
    kind: { id, name: 'Test document', court_document: true },
    court,
    items: [],
    loose_dates: [],
    unplaced: [],
    still_unknown: [],
    can_confirm: !blocked,
    confirm_blockers: blocked ? ['court'] : [],
    confirm_message: blocked ? CONFIRM_MESSAGE : null,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ states: [], courts: [], types: [] }),
  }));
  Element.prototype.scrollIntoView = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(brief: Brief) {
  const noop = jest.fn();
  act(() => {
    root.render(
      <BriefStep
        brief={brief}
        busy={false}
        confirming={false}
        message={null}
        questionsLeft={0}
        onValue={noop}
        onCourt={noop}
        onKindName={noop}
        onPlaceDate={noop}
        onChangeDocument={noop}
        onMoreQuestions={noop}
        onEditDescription={noop}
        onCancel={noop}
        onConfirm={noop}
      />,
    );
  });
  for (let i = 0; i < 3; i++) await act(async () => {});
}
const paths = () => mockApiFetch.mock.calls.map((c) => c[0] as string);
const click = (el: Element) => act(() => (el as HTMLElement).click());
const messageButton = () =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === CONFIRM_MESSAGE,
  ) as HTMLButtonElement;
const confirmButton = () =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes('Confirm brief and continue'),
  ) as HTMLButtonElement;

describe('BriefStep consumer court (T-411 AC9)', () => {
  const none = { state: null, court_type: null, court: null };

  it('passes brief.kind.id as templateId: consumer_complaint shows the level group', async () => {
    await mount(briefOf('consumer_complaint', none));
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(container.textContent).toContain('Which Commission?');
    expect(container.querySelector('#brief-court-type')).toBeNull();
    expect(paths().some((p) => p.includes('/api/courts/types'))).toBe(false);
  });

  it('another template keeps the court type select and the old state URL', async () => {
    await mount(briefOf('suspension_of_sentence', none));
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.querySelector('#brief-court-type')).not.toBeNull();
    expect(paths()).toEqual(['/api/courts/states']);
  });

  it.each([
    ['message button', () => messageButton()],
    ['Confirm button', () => confirmButton()],
  ])('the blocked %s focuses the level group when no level is chosen', async (_name, getButton) => {
    await mount(briefOf('consumer_complaint', none));
    click(getButton());
    const first = container.querySelector('[role="radio"]');
    expect(document.activeElement).toBe(first);
    expect(document.activeElement!.closest('[role="radiogroup"]')).not.toBeNull();
    expect(document.activeElement!.getAttribute('aria-checked')).toBe('false');
  });

  it('once a level is chosen the blocker focus goes on to the first empty select', async () => {
    await mount(briefOf('consumer_complaint', none));
    click(container.querySelectorAll('[role="radio"]')[0]);
    for (let i = 0; i < 3; i++) await act(async () => {});
    (document.activeElement as HTMLElement | null)?.blur();
    click(messageButton());
    expect(document.activeElement).toBe(container.querySelector('#brief-court-state'));
  });

  it('a non-consumer brief with the court blocked focuses the state select, not a group', async () => {
    await mount(briefOf('suspension_of_sentence', none));
    click(messageButton());
    expect(document.activeElement).toBe(container.querySelector('#brief-court-state'));
  });
});
