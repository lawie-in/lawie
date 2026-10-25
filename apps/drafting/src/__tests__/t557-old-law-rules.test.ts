/**
 * T-557 (Ajay, M2, M3, M6, M7): offence-date wording in five rule packs.
 * Signed strings are inline, not read from handoff/, which is stripped from the main snapshot.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');

const m2 = (field: string): string =>
  `${field} uses the code in force on the date of the offence: BNS for an offence on or after 1 July 2024, IPC for an offence before that date (warn only where the sections do not match the offence date).`;

const M3 =
  'Para 3: Brief description of FIR — number, date, PS, district, and the sections as registered in the FIR (BNS for an offence on or after 1 July 2024, IPC for an offence before that date).';
const M6 =
  'Para 2: FIR details — number, date, PS, district, and the sections as registered in the FIR (BNS for an offence on or after 1 July 2024, IPC for an offence before that date; any other Act as named in the FIR).';

const PACKS: Array<[string, string]> = [
  ['discharge_application', 'offences_charged'],
  ['mact_claim', 'sections_charged'],
  ['fir_quashing', 'offences_alleged'],
  ['quashing_528_bnss', 'offences_alleged'],
  ['criminal_appeal', 'offences_convicted'],
];

interface Pack {
  validation_rules: string[];
  prompt_context: { promptInstructions: string[] };
}

const load = (id: string): Pack =>
  JSON.parse(readFileSync(join(RULES_DIR, `${id}.json`), 'utf8')) as Pack;

describe('T-557 validation_rules (M2, M7)', () => {
  it.each(PACKS)('%s carries the exact M2 line for %s, once', (id, field) => {
    const rules = load(id).validation_rules;
    expect(rules.filter((r) => r === m2(field))).toHaveLength(1);
  });
});

describe('T-557 promptInstructions (M3, M6)', () => {
  it('fir_quashing carries M3 exactly', () => {
    expect(load('fir_quashing').prompt_context.promptInstructions).toContain(M3);
  });

  it('quashing_528_bnss carries M6 exactly', () => {
    expect(load('quashing_528_bnss').prompt_context.promptInstructions).toContain(M6);
  });
});

describe('T-557 old BNS-only wording is gone', () => {
  it.each(PACKS)(
    '%s has no "must use BNS sections", "NEVER use IPC" or "not IPC / CrPC / IEA"',
    (id) => {
      const raw = readFileSync(join(RULES_DIR, `${id}.json`), 'utf8');
      expect(raw).not.toContain('must use BNS sections');
      expect(raw).not.toContain('NEVER use IPC');
      expect(raw).not.toContain('not IPC / CrPC / IEA');
    },
  );
});
