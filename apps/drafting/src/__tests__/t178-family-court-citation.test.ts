import fs from 'fs';
import path from 'path';
import { resolveCourtRule } from '../services/prompt-assembler';

const raw = fs.readFileSync(
  path.join(__dirname, '../config/court-rules/family_court.json'),
  'utf8',
);
const rule = JSON.parse(raw) as {
  courtType: string;
  localRules: string[];
  _meta: { applies_to_court_type: string; last_updated: string };
};

// Exact strings signed in AJ-2026-10-08-T178, section B.
const SIGNED_RULE_16 =
  `Tone of pleadings must remain dignified — avoid scandalous, frivolous, vexatious or unnecessarily inflammatory allegations; the Court may strike out such matter under Order VI Rule 16 CPC (applicable through Section 10(1) of the Family Courts Act, 1984).`;
const SIGNED_JURISDICTION =
  `In matrimonial petitions, territorial jurisdiction is fixed by the applicable personal law statute (e.g. Section 19 HMA 1955, Section 31 SMA 1954): place where the marriage was solemnised, where the respondent resides, or where the parties last resided together. The petitioner's own residence founds jurisdiction only where that statute allows it (e.g. a wife-petitioner under Section 19(iiia) HMA, or a respondent residing outside India or not heard of for seven years under Section 19(iv) HMA).`;
const SIGNED_RELIGION =
  `State the religion / personal law applicable to the parties where the relief depends on it (Hindu, Muslim, Christian, Parsi, Special Marriage Act). Do not state caste in the cause title or memo of parties.`;

describe('T-178 family_court.json citation and courtType', () => {
  it('AC1: the three signed localRules lines are present verbatim', () => {
    expect(rule.localRules).toContain(SIGNED_RULE_16);
    expect(rule.localRules).toContain(SIGNED_JURISDICTION);
    expect(rule.localRules).toContain(SIGNED_RELIGION);
  });

  it('AC2: _meta carries the signed values', () => {
    expect(rule._meta.applies_to_court_type).toBe('family_court');
    expect(rule._meta.last_updated).toBe('2026-10-08');
  });

  it('AC2: courtType is family_court', () => {
    expect(rule.courtType).toBe('family_court');
  });

  it('AC1: cites Order VI Rule 16 CPC and never Rule 17', () => {
    expect(rule.localRules.some((l) => l.includes('Order VI Rule 16 CPC'))).toBe(true);
    expect(rule.localRules.some((l) => l.includes('Rule 17'))).toBe(false);
    expect(raw).not.toContain('Order VI Rule 17');
  });

  it('religion line says not to state caste; no caste/community anywhere', () => {
    expect(rule.localRules.some((l) => l.includes('caste/community'))).toBe(false);
    const religion = rule.localRules.find((l) => l.includes('religion'));
    expect(religion).toBeDefined();
    expect(religion).toContain('Do not state caste');
  });

  it('jurisdiction line contains Section 19(iiia) HMA', () => {
    const line = rule.localRules.find((l) => l.includes('territorial jurisdiction'));
    expect(line).toBeDefined();
    expect(line).toContain('Section 19(iiia) HMA');
  });

  it('AC4: resolveCourtRule still returns the family_court rule', () => {
    const resolved = resolveCourtRule('family_court', 'Family Court, Patna');
    expect(resolved?.courtId).toBe('family_court');
  });
});
