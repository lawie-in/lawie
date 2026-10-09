/**
 * T-176 — A family court heading names its seat, on both paths.
 * Typed path: resolveCourtRule -> postProcess (stand-in LLM first line).
 * List path: chosenCourtHeading, and the annexures pack (Puppeteer mocked).
 */
import './setupEnv';
import './setupDb';

import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
}));

// eslint-disable-next-line import/order
import { buildAnnexuresPack } from '../services/annexures.service';
import { resolveCourtRule } from '../services/prompt-assembler';
import { postProcess } from '../services/post-processor';
import {
  buildPlaceholderContext,
  chosenCourtHeading,
  loadCourtRule,
  loadTemplateConfig,
  type CourtLookupData,
} from '../services/template-engine.service';

const BLANK = '[To be confirmed: place]';
const PARTIES = { petitioner: 'Asha Devi', respondent: 'Ravi Kumar' };
const BODY = 'M.J. No. _____ of 2026\n\nAsha Devi ... PETITIONER\n\nVERSUS\n\nRavi Kumar ... RESPONDENT\n\n1. The petitioner states.';

interface CourtEntry {
  courtId: string;
  designation: string;
  city: string;
  caseNomenclature: string;
  formattingRulesRef: string;
  courtType?: string;
  state?: string;
}

function findEntries(node: unknown, out: Map<string, CourtEntry>): void {
  if (Array.isArray(node)) {
    node.forEach((n) => findEntries(n, out));
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.courtId === 'string' && typeof o.designation === 'string') {
      out.set(o.courtId, o as unknown as CourtEntry);
    }
    Object.values(o).forEach((v) => findEntries(v, out));
  }
}
const ENTRIES = new Map<string, CourtEntry>();
findEntries(
  JSON.parse(readFileSync(join(__dirname, '..', 'config', 'courts', 'indian-courts.json'), 'utf-8')),
  ENTRIES,
);

function courtFor(courtId: string): CourtLookupData {
  const e = ENTRIES.get(courtId);
  if (!e) throw new Error(`court ${courtId} not in indian-courts.json`);
  return {
    designation: e.designation,
    city: e.city,
    caseNomenclature: e.caseNomenclature,
    formattingRulesRef: e.formattingRulesRef,
    courtType: e.courtType,
    state: e.state,
    courtRule: loadCourtRule(e.formattingRulesRef) ?? undefined,
  };
}

/** Typed path: run postProcess on a stand-in LLM text and return the output lines. */
function typed(
  courtType: string,
  courtName: string,
  firstLine: string,
  partyDetails: Record<string, string | undefined> = PARTIES,
): string[] {
  const courtRule = resolveCourtRule(courtType, courtName);
  return postProcess({
    rawText: `${firstLine}\n${BODY}`,
    docRule: null,
    courtRule,
    partyDetails,
    courtName,
  }).formattedText.split('\n');
}

const HEADING_RE = /^(IN THE |BEFORE THE )/;
const headingLines = (lines: string[]) => lines.filter((l) => HEADING_RE.test(l));

describe('T-176 family court seat heading', () => {
  describe('AC 1: four launch cities, typed path', () => {
    it.each([
      ['Family Court, Patna', 'IN THE FAMILY COURT AT PATNA'],
      ['Family Court, Lucknow', 'IN THE FAMILY COURT AT LUCKNOW'],
      ['Family Court, Ranchi', 'IN THE FAMILY COURT AT RANCHI'],
      ['Family Court, Delhi', 'IN THE FAMILY COURT AT [To be confirmed: district/complex], DELHI'],
    ])('%j -> %s', (name, expected) => {
      const lines = typed('family_court', name, 'IN THE FAMILY COURT');
      expect(lines[0]).toBe(expected);
      expect(headingLines(lines)).toHaveLength(1);
    });
  });

  describe('AC 2: judge title is never the seat', () => {
    it.each([
      ['Principal Judge, Family Court, Lucknow', 'IN THE FAMILY COURT AT LUCKNOW'],
      ['Additional Principal Judge, Family Court, Patna', 'IN THE FAMILY COURT AT PATNA'],
    ])('%j -> %s', (name, expected) => {
      const out = typed('family_court', name, 'IN THE FAMILY COURT').join('\n');
      expect(out.split('\n')[0]).toBe(expected);
      expect(out).not.toContain('AT PRINCIPAL JUDGE');
      expect(out).not.toContain('AT ADDITIONAL');
    });
  });

  describe('AC 3: unknown seat', () => {
    it.each([['Family Court'], ['']])('%j -> placeholder', (name) => {
      const lines = typed('family_court', name, 'IN THE FAMILY COURT');
      expect(lines[0]).toBe(`IN THE FAMILY COURT AT ${BLANK}`);
    });

    it('never fills the seat from a Bihar state / profile / district', () => {
      const lines = typed('family_court', 'Family Court', 'IN THE FAMILY COURT', {
        ...PARTIES,
        state: 'Bihar',
        district: 'Patna',
        city: 'Patna',
        courtState: 'Bihar',
      });
      expect(lines[0]).toBe(`IN THE FAMILY COURT AT ${BLANK}`);
      expect(lines.join('\n')).not.toContain('IN THE FAMILY COURT AT PATNA');
      expect(lines[0]).not.toMatch(/PATNA|BIHAR/);
    });
  });

  describe('AC 4: heading the LLM already wrote', () => {
    const LLM = [
      'IN THE FAMILY COURT AT PATNA',
      'IN THE COURT OF THE PRINCIPAL JUDGE, FAMILY COURT, PATNA',
      'BEFORE THE FAMILY COURT, PATNA',
    ];
    const TYPED: Array<[string, string]> = [
      ['Family Court, Patna', 'IN THE FAMILY COURT AT PATNA'],
      ['Family Court, Ranchi', 'IN THE FAMILY COURT AT RANCHI'],
      ['Family Court', `IN THE FAMILY COURT AT ${BLANK}`],
    ];
    const cases = LLM.flatMap((l) => TYPED.map(([n, e]) => [l, n, e] as const));

    it.each(cases)('LLM %j, typed %j -> %s', (llm, name, expected) => {
      const lines = typed('family_court', name, llm);
      expect(lines[0]).toBe(expected);
      expect(headingLines(lines)).toEqual([expected]);
      expect(lines.join('\n')).not.toContain(llm === expected ? '\u0000' : llm);
    });
  });

  describe('AC 5: list-path parity', () => {
    it.each([
      ['family_court_patna', 'IN THE FAMILY COURT AT PATNA'],
      ['family_court_lucknow', 'IN THE FAMILY COURT AT LUCKNOW'],
      ['family_court_ranchi', 'IN THE FAMILY COURT AT RANCHI'],
      ['family_court_delhi_tis_hazari', 'IN THE FAMILY COURT AT TIS HAZARI, DELHI'],
    ])('%s prints its stored designation', (id, expected) => {
      expect(ENTRIES.get(id)?.designation).toBe(expected);
      expect(chosenCourtHeading(courtFor(id))?.header).toBe(expected);
    });

    it.each([
      ['family_court_patna', 'Family Court, Patna'],
      ['family_court_lucknow', 'Family Court, Lucknow'],
      ['family_court_ranchi', 'Family Court, Ranchi'],
      ['family_court_delhi_tis_hazari', 'Family Court, Tis Hazari, Delhi'],
    ])('%s: typed and listed give the same line', (id, name) => {
      const listed = chosenCourtHeading(courtFor(id))?.header;
      expect(typed('family_court', name, 'IN THE FAMILY COURT')[0]).toBe(listed);
    });
  });

  describe('AC 6: other courts unchanged', () => {
    it.each([
      ['district_court', 'District Court, Patna', 'IN THE COURT OF [To be confirmed: court designation]'],
      ['district_court', 'Sessions Court, Patna', 'IN THE COURT OF SESSIONS JUDGE'],
      ['district_court', 'JMFC Patna', 'IN THE COURT OF JUDICIAL MAGISTRATE FIRST CLASS'],
      ['high_court', 'Patna High Court', 'IN THE HIGH COURT OF JUDICATURE AT PATNA'],
      ['consumer_forum', 'District Forum', 'IN THE COURT OF [To be confirmed: court designation]'],
    ])('%s %j -> %s', (type, name, expected) => {
      const lines = typed(type, name, 'IN THE COURT OF SOMETHING ELSE, PATNA');
      expect(lines[0]).toBe(expected);
    });

    it('a non-family list heading is unchanged (sessions, Patna)', () => {
      expect(chosenCourtHeading(courtFor('bihar_sessions_patna'))).toEqual({
        header: 'IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA',
        designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
      });
    });
  });

  describe('AC 7: annexures pack heading matches the main draft (Tis Hazari)', () => {
    it('prints the draft court_header in the headed annexures', async () => {
      const court = courtFor('family_court_delhi_tis_hazari');
      const form: Record<string, unknown> = {
        template_id: 'bail_regular',
        applicant_name: 'Asha Devi',
        respondent_name: 'Ravi Kumar',
        advocate_name: 'Adv. Test',
      };
      const draftHeader = buildPlaceholderContext(
        loadTemplateConfig('bail_regular')!,
        form,
        undefined,
        court,
      ).court_header;
      expect(draftHeader).toBe('IN THE FAMILY COURT AT TIS HAZARI, DELHI');
      expect(chosenCourtHeading(court)?.header).toBe(draftHeader);

      const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
      const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
      let html = '';
      page.setContent.mockImplementation((h: string) => {
        html = h;
        return Promise.resolve(undefined);
      });
      await buildAnnexuresPack({ formData: form, bodyParaCount: 8, courtData: court });
      expect(html.split(draftHeader).length - 1).toBeGreaterThanOrEqual(5);
      expect(html).not.toContain('IN THE FAMILY COURT, DELHI');
    });
  });

  describe('Extra inputs', () => {
    it.each([
      ['Family Court at Ranchi', 'IN THE FAMILY COURT AT RANCHI'],
      ['Addl. Principal Judge Family Court Lucknow', 'IN THE FAMILY COURT AT LUCKNOW'],
      ['Family Court, Sessions Division Patna', `IN THE FAMILY COURT AT ${BLANK}`],
      // C-1 (AJ-2026-10-08-T176): a court number or judge grade is not a seat.
      ['Family Court No. 2, Patna', `IN THE FAMILY COURT AT ${BLANK}`],
      ['Family Court-II, Lucknow', `IN THE FAMILY COURT AT ${BLANK}`],
      ['Additional Principal Judge-II, Family Court, Lucknow', `IN THE FAMILY COURT AT ${BLANK}`],
      // Round 3: a court number anywhere in the name, with or without a comma.
      ['Family Court No. 2 Patna', `IN THE FAMILY COURT AT ${BLANK}`],
      ['Family Court II Lucknow', `IN THE FAMILY COURT AT ${BLANK}`],
      ['Family Court-3 Ranchi', `IN THE FAMILY COURT AT ${BLANK}`],
      // Place names that merely contain "ii" / "mill" / "vidisha" letters are kept.
      ['Family Court, Civil Lines, Delhi', 'IN THE FAMILY COURT AT CIVIL LINES, DELHI'],
      ['Family Court, Mill Road, Patna', 'IN THE FAMILY COURT AT MILL ROAD, PATNA'],
      ['Family Court, Vidisha', 'IN THE FAMILY COURT AT VIDISHA'],
      // Kept as typed.
      ['Family Court, Patna, Bihar', 'IN THE FAMILY COURT AT PATNA, BIHAR'],
      ['Family Court, Lucknow (U.P.)', 'IN THE FAMILY COURT AT LUCKNOW (U.P.)'],
    ])('%j -> %s', (name, expected) => {
      expect(typed('family_court', name, 'IN THE FAMILY COURT')[0]).toBe(expected);
    });
  });
  describe('Round 4: rank words and ordinals are not a seat (C-1)', () => {
    it.each([
      'Additional Family Court, Ranchi',
      'Principal Family Court, Patna',
      '2nd Family Court, Patna',
      'IInd Family Court, Lucknow',
      'Second Family Court, Patna',
    ])('%j -> placeholder', (name) => {
      const lines = typed('family_court', name, 'IN THE FAMILY COURT');
      expect(lines[0]).toBe(`IN THE FAMILY COURT AT ${BLANK}`);
      expect(lines.join('\n')).not.toMatch(/AT (ADDITIONAL|PRINCIPAL|2ND|IIND|SECOND)/);
    });
  });

  describe('Round 4: heading shapes in the LLM text', () => {
    const run = (name: string, raw: string): string[] => {
      const courtRule = resolveCourtRule('family_court', name);
      return postProcess({
        rawText: raw,
        docRule: null,
        courtRule,
        partyDetails: PARTIES,
        courtName: name,
      }).formattedText.split('\n');
    };
    const RANCHI = 'IN THE FAMILY COURT AT RANCHI';

    it('two-line LLM heading: the continuation seat is dropped', () => {
      const lines = run(
        'Family Court, Ranchi',
        `IN THE COURT OF THE PRINCIPAL JUDGE, FAMILY COURT\nAT PATNA\n${BODY}`,
      );
      expect(lines[0]).toBe(RANCHI);
      expect(lines.filter((l) => /^(IN THE |BEFORE THE )/.test(l))).toEqual([RANCHI]);
      expect(lines.join('\n')).not.toContain('AT PATNA');
      expect(lines[1]).not.toMatch(/^AT /);
    });

    it('two-line LLM heading with a blank line between: continuation dropped', () => {
      const lines = run(
        'Family Court, Ranchi',
        `IN THE COURT OF THE PRINCIPAL JUDGE, FAMILY COURT\n\nAT PATNA\n${BODY}`,
      );
      expect(lines[0]).toBe(RANCHI);
      expect(lines.join('\n')).not.toContain('AT PATNA');
      expect(lines.filter((l) => /^(IN THE |BEFORE THE )/.test(l))).toEqual([RANCHI]);
    });

    it('mixed-case LLM heading is replaced by the typed seat', () => {
      const lines = run('Family Court, Ranchi', `In the Family Court at Patna\n${BODY}`);
      expect(lines[0]).toBe(RANCHI);
      expect(lines.join('\n')).not.toMatch(/patna/i);
    });

    it('body line starting "Before the" / ending "at Ranchi" with no heading stays byte-identical', () => {
      const body = '1. Before the marriage, the petitioner lived at Ranchi.';
      const raw = `${BODY.replace('1. The petitioner states.', body)}`;
      const lines = run('Family Court, Ranchi', raw);
      expect(lines).toContain(body);
      expect(lines.join('\n')).not.toContain(RANCHI);
    });

    it('"BEFORE THE FAMILY COURT, PATNA" is replaced', () => {
      const lines = run('Family Court, Ranchi', `BEFORE THE FAMILY COURT, PATNA\n${BODY}`);
      expect(lines[0]).toBe(RANCHI);
      expect(lines.join('\n')).not.toContain('BEFORE THE');
      expect(lines.join('\n')).not.toContain('PATNA');
    });

    it('an upper-case body line not right after the heading is kept', () => {
      const raw = `IN THE FAMILY COURT\nM.J. No. _____ of 2026\nAT THE TIME OF FILING\n\n${BODY}`;
      const lines = run('Family Court, Ranchi', raw);
      expect(lines[0]).toBe(RANCHI);
      expect(lines).toContain('AT THE TIME OF FILING');
      expect(lines).toContain('M.J. No. _____ of 2026');
    });

    it('a line right after the heading naming a case number is kept', () => {
      const lines = run(
        'Family Court, Ranchi',
        `IN THE FAMILY COURT AT PATNA\nFAMILY COURT CASE NO. ____ OF 2026\n${BODY}`,
      );
      expect(lines[0]).toBe(RANCHI);
      expect(lines).toContain('FAMILY COURT CASE NO. ____ OF 2026');
    });

    it('"AT THE INSTANCE OF X" after a blank line is kept', () => {
      const lines = run(
        'Family Court, Ranchi',
        `IN THE FAMILY COURT AT PATNA\n\nAT THE INSTANCE OF X\n${BODY}`,
      );
      expect(lines[0]).toBe(RANCHI);
      expect(lines).toContain('AT THE INSTANCE OF X');
    });

    it('"AT THE TIME OF FILING" right after the heading is kept', () => {
      const lines = run(
        'Family Court, Ranchi',
        `IN THE FAMILY COURT AT PATNA\nAT THE TIME OF FILING\n${BODY}`,
      );
      expect(lines[0]).toBe(RANCHI);
      expect(lines).toContain('AT THE TIME OF FILING');
    });
  });
});
