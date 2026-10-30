/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-690 (written statement time limit). Legal sign-off: Ajay, 29 Oct 2026, T-681 item 4
 * (handoff/legal/run5-rulings-ajay.md). The signed strings are typed here on purpose, not read from the
 * ruling file, so a wrong edit to the packs fails. No DB, no model call, no network.
 *
 * The em dash is U+2014 and the apostrophe in "court's" is ASCII 0x27.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

const CONFIG = join(__dirname, '..', 'config');
const WS_PATH = join(CONFIG, 'document-rules', 'written_statement.json');
const DC_PATH = join(CONFIG, 'court-rules', 'district_court_generic.json');
const wsText = readFileSync(WS_PATH, 'utf-8');
const dcText = readFileSync(DC_PATH, 'utf-8');
const ws: any = JSON.parse(wsText);
const dc: any = JSON.parse(dcText);

const LABEL =
  'Days from service of summons (due within 30; the court may allow up to 90 for recorded reasons; 120 is the outer limit in a commercial suit)';
const TIME_LIMIT =
  'TIME LIMIT: Order VIII Rule 1 CPC — file the WS within 30 days of service of summons. The court may allow more time for reasons recorded in writing, up to 90 days from service. In a commercial suit the outer limit is 120 days, and after it the WS cannot be filed.';
const DESCRIPTION =
  "Written statement — 30 days; up to 90 days with the court's leave; 120 days outer limit in a commercial suit";
const LOCAL_RULE =
  'Written statements to be filed within 30 days of service of summons (the court may allow up to 90 days for recorded reasons; 120 days is the outer limit in a commercial suit).';
const COMMERCIAL_LINE = '120-day limit in commercial suits is mandatory and inflexible.';

const OLD_WORDINGS = [
  'extendable to 120',
  '30 days, extendable',
  'Court may extend to 120',
  'must be within 30; extendable',
  'extendable to 120 days',
];

/** Count of a string in a text, JSON-escaped the way the file writes it (quotes only; none of ours need more). */
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('T-690: the four signed strings, byte for byte', () => {
  it('both files parse as JSON', () => {
    expect(() => JSON.parse(wsText)).not.toThrow();
    expect(() => JSON.parse(dcText)).not.toThrow();
  });

  it('1. written_statement days_from_service label', () => {
    const fields = ws.form_schema.fields as any[];
    const matches = fields.filter((f) => f.id === 'days_from_service');
    expect(matches).toHaveLength(1);
    expect(matches[0].label).toBe(LABEL);
  });

  it('2. written_statement TIME LIMIT promptInstructions element', () => {
    const lines = ws.prompt_context.promptInstructions as string[];
    const timeLimit = lines.filter((l) => l.startsWith('TIME LIMIT'));
    expect(timeLimit).toEqual([TIME_LIMIT]);
  });

  it('3. written_statement Order VIII R.1 description', () => {
    const sections = (ws.relevantActs as any[]).flatMap((a) => a.sections ?? []);
    const entries = sections.filter((s) => s.number === 'Order VIII R.1');
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe(DESCRIPTION);
  });

  it('4. district_court_generic localRules carries the signed line, once', () => {
    const rules = dc.localRules as string[];
    expect(rules.filter((r) => r === LOCAL_RULE)).toEqual([LOCAL_RULE]);
    expect(rules.filter((r) => r.startsWith('Written statements to be filed'))).toHaveLength(1);
  });

  it('the commercial-suit line stays, unchanged, right after the TIME LIMIT element', () => {
    const lines = ws.prompt_context.promptInstructions as string[];
    const at = lines.indexOf(TIME_LIMIT);
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toBe(COMMERCIAL_LINE);
  });

  it('each signed string appears exactly once in its file (raw text)', () => {
    expect(count(wsText, LABEL)).toBe(1);
    expect(count(wsText, TIME_LIMIT)).toBe(1);
    expect(count(wsText, DESCRIPTION)).toBe(1);
    expect(count(dcText, LOCAL_RULE)).toBe(1);
  });

  it('no old wording is left in either file', () => {
    for (const old of OLD_WORDINGS) {
      expect(wsText).not.toContain(old);
      expect(dcText).not.toContain(old);
    }
  });

  it('the dash is U+2014 and the apostrophe is ASCII 0x27, by char code', () => {
    const dash = TIME_LIMIT.indexOf('Rule 1 CPC ') + 'Rule 1 CPC '.length;
    expect(
      ws.prompt_context.promptInstructions
        .find((l: string) => l.startsWith('TIME LIMIT'))
        [dash].charCodeAt(0),
    ).toBe(0x2014);
    const desc = (ws.relevantActs as any[])
      .flatMap((a) => a.sections ?? [])
      .find((s) => s.number === 'Order VIII R.1').description as string;
    expect(desc.charCodeAt(desc.indexOf('Written statement ') + 'Written statement '.length)).toBe(
      0x2014,
    );
    expect(desc.charCodeAt(desc.indexOf('court') + 5)).toBe(0x27);
    expect(desc).not.toMatch(/[‘’]/);
    expect(wsText).not.toMatch(/[‘’]/);
  });
});

describe('T-690: the label reaches the intake checklist', () => {
  it('days_from_service shows the signed label', () => {
    const pack = loadRulePack('written_statement')!;
    const item = buildChecklist(pack).find((i) => i.key.split('.').pop() === 'days_from_service');
    expect(item).toBeDefined();
    expect(item!.label).toBe(LABEL);
  });
});
