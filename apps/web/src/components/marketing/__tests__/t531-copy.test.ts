// T-531: the top bar strings, byte for byte against Ajay's ruling 83587fe5 (AJ-531-M1..M3,
// handoff/legal/T-511-copy-rulings-ajay.md). Hindi is pinned by code point: the nukta of फ़ is
// the two-code-point form U+092B U+093C, the same as the existing CTA.
import fs from 'fs';
import path from 'path';

import { DASHBOARD_NAV_LABEL, TOP_BAR_COPY } from '../nl-copy';

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const HI_CTA = 'मुफ़्त शुरू कीजिए';
const RULING = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../handoff/legal/T-511-copy-rulings-ajay.md'),
  'utf8',
);

describe('TOP_BAR_COPY and DASHBOARD_NAV_LABEL (Ajay 83587fe5)', () => {
  it('English strings are exact', () => {
    expect(TOP_BAR_COPY.en).toEqual({ cta: 'Start free', menu: 'Menu', navLabel: 'Main' });
    expect(DASHBOARD_NAV_LABEL.en).toBe('Dashboard');
  });

  it('Hindi strings are exact, by code point', () => {
    expect(hex(TOP_BAR_COPY.hi.cta)).toBe(hex(HI_CTA));
    expect(TOP_BAR_COPY.hi.cta).toBe(HI_CTA);
    expect(TOP_BAR_COPY.hi.menu).toBe('मेनू');
    expect(TOP_BAR_COPY.hi.navLabel).toBe('मुख्य');
    expect(DASHBOARD_NAV_LABEL.hi).toBe('डैशबोर्ड');
  });

  it('every string appears byte for byte in the signed ruling', () => {
    for (const s of [
      TOP_BAR_COPY.en.cta,
      TOP_BAR_COPY.hi.cta,
      TOP_BAR_COPY.en.menu,
      TOP_BAR_COPY.hi.menu,
      TOP_BAR_COPY.en.navLabel,
      TOP_BAR_COPY.hi.navLabel,
      DASHBOARD_NAV_LABEL.en,
      DASHBOARD_NAV_LABEL.hi,
    ]) {
      expect(RULING).toContain(s);
    }
  });

  it('the menu name carries no open/closed state, and the CTA is never "Free forever"', () => {
    for (const l of ['en', 'hi'] as const) {
      expect(TOP_BAR_COPY[l].menu).not.toMatch(/open|close|खोल|बंद/i);
      expect(TOP_BAR_COPY[l].cta).not.toMatch(/forever/i);
    }
  });

  it('no surrounding whitespace or invisible characters', () => {
    for (const s of [...Object.values(TOP_BAR_COPY.en), ...Object.values(TOP_BAR_COPY.hi)]) {
      expect(s).toBe(s.trim());
      expect(s).not.toMatch(new RegExp('[\u200B-\u200D\uFEFF\u00A0]'));
    }
  });
});
