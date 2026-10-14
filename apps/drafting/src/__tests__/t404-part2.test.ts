/**
 * T-404 part 2 (Ajay: 2be946d (b), 6f567e6, ff33740, 687c19f).
 *  - execution_place: asked on the deeds (optional, ask_when_empty), required on affidavit_identity.
 *  - bail twins: case line = the court rule's regular_bail / anticipatory_bail line, else the
 *    case-type blank; never the courts-list line ("Civil Suit No.") or a twin default.
 *  - no court: the case-type blank.
 */
import {
  buildBrief,
  buildChecklist,
  buildQuestions,
  type ChecklistItem,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadCourtRule,
  loadTemplateConfig,
  type CourtLookupData,
  type TemplateConfig,
} from '../services/template-engine.service';

const CASE_TYPE_BLANK = '[To be confirmed: case type and number]';

function checklistFor(id: string): ChecklistItem[] {
  const p = loadRulePack(id);
  if (!p) throw new Error(`no pack ${id}`);
  return buildChecklist(p) as ChecklistItem[];
}

beforeEach(() => clearConfigCache());

describe('T-404 part 2: execution_place', () => {
  it('lease_deed: the brief asks execution_place (optional, ask_when_empty)', () => {
    const checklist = checklistFor('lease_deed');
    const item = checklist.find((i) => i.key.split('.').pop() === 'execution_place');
    expect(item).toBeDefined();
    expect(item!.required).toBe(false);
    expect(item!.askWhenEmpty).toBe(true);

    // Only this fact left to ask: required facts rank first and fill the 10-question
    // cap, and ask_when_empty facts follow them.
    const only = [item!];
    const brief = buildBrief({
      kind: { id: 'lease_deed', name: 'Lease deed', court_document: false },
      checklist: only,
      values: [],
    });
    const qs = buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: only });
    expect(qs.map((q) => q.key.split('.').pop())).toContain('execution_place');
  });

  it('affidavit_identity: execution_place is required', () => {
    const item = checklistFor('affidavit_identity').find(
      (i) => i.key.split('.').pop() === 'execution_place',
    );
    expect(item).toBeDefined();
    expect(item!.required).toBe(true);
  });
});

describe('T-404 part 2: bail twins case line', () => {
  const form = { applicant_name: 'Ramesh Kumar', state: 'bihar', fir_number: '12/2026' };
  const cfg = (id: string) => loadTemplateConfig(id) as TemplateConfig;
  const year = String(new Date().getFullYear());

  it('bail_regular at a court whose rule has a regular_bail line prints that line', () => {
    const rule = loadCourtRule('cjm_generic')!;
    expect(rule.case_nomenclature?.regular_bail).toBe('Criminal Case No. _____ of {year}');
    const court: CourtLookupData = {
      designation: 'IN THE COURT OF CHIEF JUDICIAL MAGISTRATE, PATNA',
      city: 'Patna',
      caseNomenclature: 'Courts-list line No. 99',
      formattingRulesRef: 'cjm_generic',
      courtType: 'cjm',
      courtRule: rule,
    };
    const ctx = buildPlaceholderContext(cfg('bail_regular'), form, { advocateName: 'A' }, court);
    expect(ctx.caseNomenclature).toBe(`Criminal Case No. _____ of ${year}`);
  });

  it('bail_anticipatory at a district civil court with no rule line prints the case-type blank', () => {
    const rule = loadCourtRule('district_court_generic')!;
    expect(rule.case_nomenclature?.anticipatory_bail).toBeUndefined();
    const court: CourtLookupData = {
      designation: 'IN THE COURT OF DISTRICT JUDGE, PATNA',
      city: 'Patna',
      caseNomenclature: 'Civil Suit No. _____ of {year}',
      formattingRulesRef: 'district_court_generic',
      courtType: 'district_court',
      courtRule: rule,
    };
    const ctx = buildPlaceholderContext(
      cfg('bail_anticipatory'),
      form,
      { advocateName: 'A' },
      court,
    );
    expect(ctx.caseNomenclature).toBe(CASE_TYPE_BLANK);
    expect(ctx.caseNomenclature).not.toContain('Civil Suit No.');
  });

  it('bail_before_magistrate with no court prints the case-type blank', () => {
    const ctx = buildPlaceholderContext(cfg('bail_before_magistrate'), form, { advocateName: 'A' });
    expect(ctx.caseNomenclature).toBe(CASE_TYPE_BLANK);
  });
});
