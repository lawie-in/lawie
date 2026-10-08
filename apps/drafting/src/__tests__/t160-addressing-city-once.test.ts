/**
 * T-160 - the addressing clause names the court's city once.
 * Covers: CJM Patna once; designation without the city keeps the city line once
 * (also with the unconfirmed blank); case/punctuation-insensitive match; Place:/Verified at
 * unchanged; a city that is only a substring of another word does not count as named.
 */
import './setupEnv';

import {
  designationNamesCity,
  renderTemplateSection,
  sectionTemplate,
} from '../services/template-engine.service';

const CLAUSE = 'TO,\nTHE HON’BLE {court_designation},\n{court_city}\n\nMOST RESPECTFULLY SHOWETH:';
const section = (template: string) =>
  ({ section_id: 's', type: 'template', template }) as never;
const render = (template: string, ctx: Record<string, string>) =>
  renderTemplateSection(section(template), ctx as never).content;
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('T-160 designationNamesCity', () => {
  it.each([
    ['IN THE COURT OF CHIEF JUDICIAL MAGISTRATE, PATNA', 'Patna', true],
    ['CHIEF JUDICIAL MAGISTRATE, PATNA,', 'patna', true],
    ['DISTRICT JUDGE (PATNA)', 'PATNA', true],
    ['AGRAHARA DISTRICT COURT', 'Agra', false],
    ['SESSIONS COURT, AGRAHARA', 'Agra', false],
    ['SESSIONS JUDGE', 'Patna', false],
    ['[To be confirmed: court designation]', 'Patna', false],
    ['SESSIONS JUDGE, PATNA', '', false],
    ['SESSIONS JUDGE, PATNA', undefined, false],
    [undefined, 'Patna', false],
  ])('%p vs %p -> %p', (d, c, expected) => {
    expect(designationNamesCity(d as never, c as never)).toBe(expected);
  });
});

describe('T-160 addressing clause', () => {
  it('CJM Patna: Patna appears once, with no repeated city line', () => {
    const out = render(CLAUSE, {
      court_designation: 'CHIEF JUDICIAL MAGISTRATE, PATNA',
      court_city: 'Patna',
    });
    expect(out).toBe(
      'TO,\nTHE HON’BLE CHIEF JUDICIAL MAGISTRATE, PATNA\n\nMOST RESPECTFULLY SHOWETH:',
    );
    expect(out.match(/patna/gi)).toHaveLength(1);
  });

  it('"PATNA," vs "Patna" (case and punctuation) still prints the city once', () => {
    const out = render(CLAUSE, {
      court_designation: 'DISTRICT & SESSIONS JUDGE, PATNA,',
      court_city: 'Patna',
    });
    expect(out.match(/patna/gi)).toHaveLength(1);
  });

  it('a designation without the city keeps the city line, once', () => {
    const out = render(CLAUSE, { court_designation: 'DISTRICT JUDGE', court_city: 'Patna' });
    expect(out).toBe('TO,\nTHE HON’BLE DISTRICT JUDGE,\nPatna\n\nMOST RESPECTFULLY SHOWETH:');
    expect(count(out, 'Patna')).toBe(1);
  });

  it('the unconfirmed-designation blank keeps the city line, once', () => {
    const blank = '[To be confirmed: court designation]';
    const out = render(CLAUSE, { court_designation: blank, court_city: 'Patna' });
    expect(count(out, blank)).toBe(1);
    expect(count(out, 'Patna')).toBe(1);
    expect(out).toContain(`${blank},\nPatna\n`);
  });

  it('a city that is a substring of another word is not "named"', () => {
    const out = render(CLAUSE, {
      court_designation: 'DISTRICT COURT, AGRAHARA',
      court_city: 'Agra',
    });
    expect(out).toContain('AGRAHARA,\nAgra\n');
  });

  it('Place: and Verified at are unchanged when the designation names the city', () => {
    const ctx = { court_designation: 'CHIEF JUDICIAL MAGISTRATE, PATNA', court_city: 'Patna' };
    const tpl = `${CLAUSE}\n\nPlace: {court_city}\nVerified at {court_city} on this day.`;
    expect(sectionTemplate(tpl, ctx as never)).toContain('Place: {court_city}');
    const out = render(tpl, ctx);
    expect(out).toContain('Place: Patna');
    expect(out).toContain('Verified at Patna on this day.');
    expect(out.match(/patna/gi)).toHaveLength(3);
  });

  it('leaves a template untouched when the designation does not name the city', () => {
    expect(sectionTemplate(CLAUSE, { court_designation: 'X', court_city: 'Patna' } as never)).toBe(
      CLAUSE,
    );
  });
});
