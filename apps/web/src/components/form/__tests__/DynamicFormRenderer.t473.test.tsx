// T-473: a selected chip whose id is not in the option list shows a readable label,
// never the raw snake_case id. Free text the user typed is shown as is.
import { humaniseChipLabel } from '../DynamicFormRenderer';

describe('humaniseChipLabel (T-473)', () => {
  it('reads a bare snake_case id as a sentence', () => {
    expect(humaniseChipLabel('known_state_custody')).toBe('Known state custody');
    expect(humaniseChipLabel('section_2_applies')).toBe('Section 2 applies');
  });

  it('reads a mixed-case id too, keeping its capitals', () => {
    expect(humaniseChipLabel('Known_state')).toBe('Known state');
    expect(humaniseChipLabel('GWA_1890_secular')).toBe('GWA 1890 secular');
  });

  it('shows anything else exactly as typed', () => {
    for (const t of ['Held by the State', 'known', 'known state', 'a-b', '', 'x__y']) {
      expect(humaniseChipLabel(t)).toBe(t);
    }
  });
});
