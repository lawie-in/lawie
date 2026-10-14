// T-411 AC1: the "Which Commission?" level group. Roles, labels, roving tabindex, keys, exact strings.
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

import ConsumerLevelGroup, {
  CONSUMER_COURT_LABEL,
  CONSUMER_GROUP_LABEL,
  CONSUMER_NO_MATCH,
  LIVE_CLEARED,
  LIVE_COURT_SHOWN,
  LIVE_NATIONAL_SHOWN,
  LIVE_STATE_SHOWN,
  NCDRC_OPTION_LABEL,
  type ConsumerLevel,
} from '../ConsumerLevelGroup';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const changes: ConsumerLevel[] = [];

function Harness({ initial = null }: { initial?: ConsumerLevel | null }) {
  const [value, setValue] = useState<ConsumerLevel | null>(initial);
  return (
    <ConsumerLevelGroup
      id="lvl"
      value={value}
      onChange={(l) => {
        changes.push(l);
        setValue(l);
      }}
    />
  );
}

function mount(initial: ConsumerLevel | null = null) {
  act(() => root.render(<Harness initial={initial} />));
}
const chips = () => Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]'));
const key = (el: HTMLElement, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
const checked = () => chips().map((c) => c.getAttribute('aria-checked'));
const tabs = () => chips().map((c) => c.getAttribute('tabindex'));

beforeEach(() => {
  changes.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ConsumerLevelGroup', () => {
  it('exports the signed strings byte for byte', () => {
    expect(CONSUMER_GROUP_LABEL).toBe('Which Commission?');
    expect(NCDRC_OPTION_LABEL).toBe(
      'National Consumer Disputes Redressal Commission (NCDRC), New Delhi',
    );
    expect(CONSUMER_NO_MATCH).toBe('No Commission is listed for this state yet.');
    expect(CONSUMER_COURT_LABEL).toBe('Consumer Commission');
    expect(LIVE_STATE_SHOWN).toBe('State select shown.');
    expect(LIVE_COURT_SHOWN).toBe('Commission select shown.');
    expect(LIVE_NATIONAL_SHOWN).toBe('No state needed. Commission select shown.');
    expect(LIVE_CLEARED).toBe('State and Commission cleared.');
  });

  it('is a radiogroup labelled by the "Which Commission?" label', () => {
    mount();
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group).not.toBeNull();
    const labelId = group.getAttribute('aria-labelledby');
    expect(labelId).toBe('lvl-label');
    expect(document.getElementById(labelId!)!.textContent).toBe('Which Commission?');
  });

  it('has three radio chips with the signed names, in order', () => {
    mount();
    expect(chips().map((c) => c.textContent)).toEqual([
      'District Commission',
      'State Commission',
      'National Commission (NCDRC)',
    ]);
    expect(chips().every((c) => c.tagName === 'BUTTON')).toBe(true);
  });

  it('selects nothing at first and makes only the first chip tabbable', () => {
    mount();
    expect(checked()).toEqual(['false', 'false', 'false']);
    expect(tabs()).toEqual(['0', '-1', '-1']);
  });

  it('click selects one chip and moves the tab stop to it', () => {
    mount();
    act(() => chips()[1].click());
    expect(changes).toEqual(['state']);
    expect(checked()).toEqual(['false', 'true', 'false']);
    expect(tabs()).toEqual(['-1', '0', '-1']);
  });

  it('starts with the given value checked and tabbable', () => {
    mount('national');
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(tabs()).toEqual(['-1', '-1', '0']);
  });

  it('ArrowRight and ArrowDown move focus and select the next chip', () => {
    mount('district');
    key(chips()[0], 'ArrowRight');
    expect(document.activeElement).toBe(chips()[1]);
    expect(checked()).toEqual(['false', 'true', 'false']);
    key(chips()[1], 'ArrowDown');
    expect(document.activeElement).toBe(chips()[2]);
    expect(checked()).toEqual(['false', 'false', 'true']);
  });

  it('ArrowLeft and ArrowUp move to the previous chip', () => {
    mount('national');
    key(chips()[2], 'ArrowLeft');
    expect(document.activeElement).toBe(chips()[1]);
    expect(checked()[1]).toBe('true');
    key(chips()[1], 'ArrowUp');
    expect(document.activeElement).toBe(chips()[0]);
    expect(checked()[0]).toBe('true');
  });

  it('wraps at both ends', () => {
    mount('national');
    key(chips()[2], 'ArrowRight');
    expect(document.activeElement).toBe(chips()[0]);
    expect(checked()).toEqual(['true', 'false', 'false']);
    key(chips()[0], 'ArrowLeft');
    expect(document.activeElement).toBe(chips()[2]);
    expect(checked()).toEqual(['false', 'false', 'true']);
  });

  it('Space selects the focused chip without moving', () => {
    mount();
    key(chips()[0], ' ');
    expect(changes).toEqual(['district']);
    expect(checked()).toEqual(['true', 'false', 'false']);
  });

  it('ignores other keys', () => {
    mount();
    key(chips()[0], 'a');
    key(chips()[0], 'Tab');
    expect(changes).toEqual([]);
    expect(checked()).toEqual(['false', 'false', 'false']);
  });
});
