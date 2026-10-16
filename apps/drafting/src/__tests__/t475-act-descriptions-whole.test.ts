/**
 * T-475 — act-section descriptions reach the Drafter whole (Ajay: no truncation of signed text).
 *
 * AC1 habeas_corpus BNSS S.35 description (146 chars) is in the act lines whole
 * AC2 guard: every description in every pack appears whole in actLines(pack), and
 *     ACT_DESCRIPTION_MAX covers the longest one (names the pack when it does not)
 * AC3 the guard's own logic fails for a 1200-char description (in-memory only)
 *
 * No model call and no database.
 */
import { ACT_DESCRIPTION_MAX, actLines } from '../services/brief-drafter';
import { loadAllRulePacks, loadRulePack, type RulePack } from '../services/rule-pack.service';

// The same flattening the Drafter's oneLine does before it cuts.
const flat = (s: string): string => s.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();

interface Described {
  packId: string;
  act: string;
  section: string;
  text: string;
}

function describedSections(packId: string, pack: RulePack): Described[] {
  const out: Described[] = [];
  for (const a of pack.relevantActs) {
    for (const s of a.sections) {
      if (s.description) {
        out.push({ packId, act: a.act, section: s.number, text: flat(s.description) });
      }
    }
  }
  return out;
}

/** The guard's logic, as a list of problems (empty = fine). Reused for the mutation check. */
function cutProblems(packId: string, pack: RulePack, max: number): string[] {
  const joined = actLines(pack).join('\n');
  const problems: string[] = [];
  for (const d of describedSections(packId, pack)) {
    if (!joined.includes(`${d.section} (${d.text})`)) {
      problems.push(
        `${packId}: ${d.act} ${d.section} description (${d.text.length} chars) is cut or missing in actLines`,
      );
    }
    if (d.text.length > max) {
      problems.push(
        `${packId}: ${d.act} ${d.section} description is ${d.text.length} chars, over ACT_DESCRIPTION_MAX ${max}`,
      );
    }
  }
  return problems;
}

describe('T-475 act descriptions reach the Drafter whole', () => {
  const HABEAS = 'S.35(1)(b) BNSS [S.41(1)(b) CrPC]';

  it('AC1: habeas_corpus BNSS S.35 description is in the act lines whole', () => {
    const pack = loadRulePack('habeas_corpus');
    expect(pack).not.toBeNull();
    const lines = actLines(pack as RulePack);
    const line = lines.find((l) => l.includes(HABEAS));
    expect(line).toBeDefined();
    expect(line).toContain(
      'Arrest by police — when permissible; conditions for arrest without warrant in offences punishable up to 7 years: S.35(1)(b) BNSS [S.41(1)(b) CrPC])',
    );
    expect(line).not.toContain('…');
  });

  describe('AC2: every pack, every description', () => {
    const { packs, errors } = loadAllRulePacks();

    it('reads all packs without errors and finds some', () => {
      expect(errors).toEqual([]);
      expect(packs.length).toBeGreaterThan(0);
    });

    it('has act-section descriptions longer than 120 (the guard has something to guard)', () => {
      const all = packs.flatMap((p) => describedSections(p.id, p));
      expect(all.filter((d) => d.text.length > 120).length).toBeGreaterThan(0);
    });

    it('no description is cut or missing in actLines, in any pack', () => {
      const problems = packs.flatMap((p) => cutProblems(p.id, p, ACT_DESCRIPTION_MAX));
      expect(problems).toEqual([]);
    });

    it('ACT_DESCRIPTION_MAX covers the longest description (names the pack if not)', () => {
      const all = packs.flatMap((p) => describedSections(p.id, p));
      const longest = all.reduce((a, b) => (b.text.length > a.text.length ? b : a));
      if (longest.text.length > ACT_DESCRIPTION_MAX) {
        throw new Error(
          `T-475: pack ${longest.packId}, ${longest.act} ${longest.section}: description is ` +
            `${longest.text.length} chars, over ACT_DESCRIPTION_MAX ${ACT_DESCRIPTION_MAX}. ` +
            'Signed text must not be cut; raise the cap (Ajay) rather than let it truncate.',
        );
      }
      expect(ACT_DESCRIPTION_MAX).toBeGreaterThanOrEqual(longest.text.length);
    });
  });

  describe('AC3: mutation check, the guard can fail', () => {
    const synthetic = (len: number): RulePack =>
      ({
        id: 'synthetic_long',
        relevantActs: [
          {
            act: 'Synthetic Act',
            sections: [{ number: 'S.1', description: `${'word '.repeat(len / 5)}`.trim() }],
          },
        ],
      }) as unknown as RulePack;

    it('a 1200-char description is reported as cut / over the cap', () => {
      const problems = cutProblems('synthetic_long', synthetic(1200), ACT_DESCRIPTION_MAX);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join('\n')).toContain('synthetic_long');
      expect(problems.join('\n')).toMatch(/cut or missing/);
    });

    it('a short description passes the same logic', () => {
      expect(cutProblems('synthetic_short', synthetic(200), ACT_DESCRIPTION_MAX)).toEqual([]);
    });
  });
});
