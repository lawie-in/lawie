// T-565 wave 2a rows 42 and 48 (Ajay, pre-Anushka legal review 22 Oct): the draft-ready screen.
// Row 42: the checks chip reads `Included`, never `No charge`. Row 48: the save-failure line.
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
}));

const base: DraftResult = {
  docId: 'doc42',
  name: 'Bail application',
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
const SAVE_FAILED =
  'The draft was written but could not be saved. Check your documents list before you start again.';

let container: HTMLDivElement;
let root: Root;
const mount = (result: Partial<DraftResult> = {}) =>
  act(async () => {
    root.render(
      <DraftReadyStep
        result={{ ...base, ...result }}
        onOpenEditor={jest.fn()}
        onStartAnother={jest.fn()}
        onExport={jest.fn()}
      />,
    );
  });
const text = () => container.textContent ?? '';

beforeEach(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-565 row 42: the checks chip', () => {
  it('reads `Included` next to "Checks run for you", and `No charge` is gone', async () => {
    await mount();
    const heading = Array.from(container.querySelectorAll('h2')).find(
      (h) => h.textContent === 'Checks run for you',
    )!;
    expect(heading.parentElement?.textContent).toContain('Included');
    expect(text()).not.toContain('No charge');
  });

  it('the chip is also `Included` when a fact check is present', async () => {
    await mount({
      factCheck: {
        text: 'One date differs.',
        items: [{ check: 'date', label: 'Date', note: 'Check the date' }],
        disclaimer: 'Read before use.',
      },
    });
    expect(text()).toContain('Included');
    expect(text()).not.toContain('No charge');
  });
});

describe('T-565 row 48: the save-failure line', () => {
  it('docId null shows the signed line exactly, in an alert', async () => {
    await mount({ docId: null });
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(SAVE_FAILED);
  });

  it('the old line is gone', async () => {
    await mount({ docId: null });
    expect(text()).not.toContain('so it cannot be opened');
    expect(text()).not.toContain('Please start again.');
  });

  it('with a saved draft the line does not show', async () => {
    await mount();
    expect(text()).not.toContain('could not be saved');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
