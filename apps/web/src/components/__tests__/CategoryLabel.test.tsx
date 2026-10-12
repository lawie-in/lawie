import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BrowseTypesStep from '../intake/BrowseTypesStep';
import ChangeDocumentDialog from '../intake/ChangeDocumentDialog';

// T-345 (AC4, AC5): the category label on the fallback path. A row with no server
// `catalogueCategoryName` shows its raw `category` id; that id must read as a name
// ("some_value" -> "Some value"), and a server name is shown unchanged. The helper is not
// exported, so it is tested through the two components that use it.
// Mounted with react-dom/client (no @testing-library/dom), as the other suites here.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Kind = Parameters<typeof BrowseTypesStep>[0]['kinds'][number];

const kind = (over: Partial<Kind> & { template_id: string }): Kind => ({
  display_name: over.template_id,
  category: 'civil',
  description: 'A document',
  plan_access: 'free',
  ...over,
});

const KINDS: Kind[] = [
  kind({ template_id: 'fallback_one', display_name: 'Fallback One', category: 'some_value' }),
  kind({
    template_id: 'fallback_two',
    display_name: 'Fallback Two',
    category: 'civil_suit_filing',
  }),
  kind({ template_id: 'padded', display_name: 'Padded', category: '_leading_and_trailing_' }),
  kind({
    template_id: 'served',
    display_name: 'Served',
    category: 'raw_ignored_id',
    catalogueCategory: 'contracts_agreements',
    catalogueCategoryName: 'Contracts & agreements',
    catalogueCategoryOrder: 2,
  }),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const texts = (sel: string) =>
  Array.from(document.body.querySelectorAll(sel)).map((e) => e.textContent ?? '');

describe('BrowseTypesStep category label (T-345)', () => {
  beforeEach(async () => {
    await act(async () => {
      root.render(
        <BrowseTypesStep kinds={KINDS} loading={false} onPick={jest.fn()} onDescribe={jest.fn()} />,
      );
    });
  });

  it('shows "some_value" as "Some value" in the filter chips and on the card', () => {
    expect(texts('[role="group"] button')).toContain('Some value');
    expect(container.textContent).toContain('Some value');
  });

  it('turns every underscore into a space and capitalises only the first letter', () => {
    const chips = texts('[role="group"] button');
    expect(chips).toContain('Civil suit filing');
    expect(chips).toContain('Leading and trailing');
  });

  it('never shows a raw underscore id', () => {
    expect(container.textContent).not.toContain('some_value');
    expect(container.textContent).not.toContain('civil_suit_filing');
    expect(texts('[role="group"] button').join('|')).not.toMatch(/_/);
  });

  it('shows a server name unchanged', () => {
    expect(texts('[role="group"] button')).toContain('Contracts & agreements');
    expect(container.textContent).toContain('Contracts & agreements');
    expect(container.textContent).not.toContain('Raw ignored id');
  });
});

describe('ChangeDocumentDialog category label (T-345)', () => {
  beforeEach(async () => {
    await act(async () => {
      root.render(
        <ChangeDocumentDialog
          open
          onOpenChange={jest.fn()}
          kinds={KINDS}
          currentId={null}
          suggested={[]}
          onChoose={jest.fn()}
        />,
      );
    });
  });

  it('shows "some_value" as "Some value" on its row', () => {
    const rows = texts('[role="option"]');
    expect(rows.some((r) => r.includes('Fallback One') && r.includes('Some value'))).toBe(true);
    expect(rows.some((r) => r.includes('Fallback Two') && r.includes('Civil suit filing'))).toBe(
      true,
    );
  });

  it('never shows a raw underscore id', () => {
    expect(texts('[role="option"]').join('|')).not.toMatch(/_/);
  });

  it('shows a server name unchanged', () => {
    const rows = texts('[role="option"]');
    expect(rows.some((r) => r.includes('Served') && r.includes('Contracts & agreements'))).toBe(
      true,
    );
    expect(rows.join('|')).not.toContain('Raw ignored id');
  });
});
