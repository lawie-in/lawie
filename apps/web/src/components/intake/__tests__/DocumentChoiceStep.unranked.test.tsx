// T-622: when the server marks the choices unranked, nothing is pre-selected and Continue is
// inert (aria-disabled, still focusable) until a pick. The ranked path is unchanged.
import fs from 'fs';
import path from 'path';

import { cleanupMounted, click, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

import DocumentChoiceStep, { NONE_OF_THESE, PICK_A_DOCUMENT } from '../DocumentChoiceStep';

jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));

const CHOICES = [
  { template_id: 'bail_regular', display_name: 'Regular Bail' },
  { template_id: 'bail_anticipatory', display_name: 'Anticipatory Bail' },
];

afterEach(() => cleanupMounted());

function setup(unranked?: boolean) {
  const onChoose = jest.fn();
  const { container } = mount(
    <DocumentChoiceStep
      choices={CHOICES}
      onChoose={onChoose}
      onEditDescription={jest.fn()}
      submitting={false}
      {...(unranked === undefined ? {} : { unranked })}
    />,
  );
  const radios = () => qa('input[type="radio"]', container) as HTMLInputElement[];
  const labels = () => qa('label', container) as HTMLLabelElement[];
  const cont = () =>
    qa('button', container).find(
      (b) => (b.textContent ?? '').trim() === 'Continue',
    ) as HTMLButtonElement;
  const alert = () => q('[role="alert"]', container);
  return { container, onChoose, radios, labels, cont, alert };
}

describe('DocumentChoiceStep unranked (T-622)', () => {
  it('(1) nothing is checked, no card has the brass border, Continue is aria-disabled but focusable', () => {
    const { radios, labels, cont } = setup(true);
    expect(radios()).toHaveLength(3);
    expect(radios().every((r) => !r.checked)).toBe(true);
    expect(labels()).toHaveLength(3);
    for (const l of labels()) expect(l.className).not.toContain('border-nl-brass');
    const b = cont();
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.hasAttribute('disabled')).toBe(false);
    expect(b.className).toMatch(/(^|\s)cursor-not-allowed(\s|$)/);
    expect(b.className).toMatch(/(^|\s)opacity-50(\s|$)/);
    b.focus();
    expect(document.activeElement).toBe(b);
  });

  it('(2) Continue with nothing picked: no onChoose, alert shown, focus on the first radio', () => {
    const { onChoose, cont, alert, radios } = setup(true);
    click(cont());
    expect(onChoose).not.toHaveBeenCalled();
    expect(alert()).not.toBeNull();
    expect(alert()!.textContent).toBe('Pick a document to continue.');
    expect(document.activeElement).toBe(radios()[0]);
    expect(radios().every((r) => !r.checked)).toBe(true);
  });

  it('(3) picking a card clears the alert, enables Continue, and Continue calls onChoose once', () => {
    const { onChoose, cont, alert, radios, labels } = setup(true);
    click(cont());
    expect(alert()).not.toBeNull();
    click(radios()[1]);
    expect(alert()).toBeNull();
    expect(radios()[1].checked).toBe(true);
    expect(labels()[1].className).toContain('border-nl-brass');
    expect(cont().hasAttribute('aria-disabled')).toBe(false);
    expect(cont().className).not.toMatch(/(^|\s)cursor-not-allowed(\s|$)/);
    click(cont());
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('bail_anticipatory');
  });

  it('(4) "None of these" is a valid pick', () => {
    const { onChoose, cont, radios } = setup(true);
    click(radios()[2]);
    expect(radios()[2].checked).toBe(true);
    click(cont());
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(NONE_OF_THESE);
  });

  it.each([
    ['absent', undefined],
    ['false', false],
  ])(
    '(5) unranked %s: first card checked, no alert, no aria-disabled, Continue picks first',
    (_n, v) => {
      const { onChoose, cont, alert, radios, labels } = setup(v);
      expect(radios()[0].checked).toBe(true);
      expect(radios()[1].checked).toBe(false);
      expect(radios()[2].checked).toBe(false);
      expect(labels()[0].className).toContain('border-nl-brass');
      expect(alert()).toBeNull();
      expect(cont().hasAttribute('aria-disabled')).toBe(false);
      expect(cont().className).not.toMatch(/(^|\s)cursor-not-allowed(\s|$)/);
      click(cont());
      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenCalledWith('bail_regular');
    },
  );

  it('(6) the sub line is unchanged, in both modes', () => {
    for (const v of [true, false]) {
      const { container } = setup(v);
      const subLine = qa('p', container).find((p) => p.getAttribute('role') !== 'alert');
      expect(subLine!.textContent).toBe(
        'Your description could fit more than one. Pick the closest.',
      );
      cleanupMounted();
    }
  });

  it('(7) PICK_A_DOCUMENT matches the Ajay-signed row AJ-622-M1 byte for byte', () => {
    const root = path.resolve(__dirname, '../../../../../..');
    const file = fs.readFileSync(
      path.join(root, 'handoff/legal/T-511-copy-rulings-ajay.md'),
      'utf8',
    );
    const row = file.split('\n').find((l) => l.includes('AJ-622-M1'));
    expect(row).toBeDefined();
    const m = /\*\*Signed\.\*\*\s+`([^`]+)`\s+\/\s+`([^`]+)`\s+A label/u.exec(row!);
    expect(m).not.toBeNull();
    expect(PICK_A_DOCUMENT.en).toBe(m![1]);
    expect(PICK_A_DOCUMENT.hi).toBe(m![2]);
  });

  it('(8) the alert is not rendered at rest', () => {
    expect(setup(true).alert()).toBeNull();
    cleanupMounted();
    expect(setup(false).alert()).toBeNull();
  });
});
