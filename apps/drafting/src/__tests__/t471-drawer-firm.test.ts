/**
 * T-471: an s.138 draft names the drawer firm. Signed: Ajay, 16 Oct 2026
 * (handoff/legal/T-245-old-new-law-switch-signed.md, "T-471" rulings (a)-(d), and his later rulings:
 * 3 slots with help "up to 3; add any others in the draft", the draft never implies the list is
 * complete, a separate "proprietorship" drawer type, notice only).
 *
 * The signed wording is typed here on purpose: a code change cannot move it.
 * The office wording ("registered office" / "principal place of business") follows respondent_type
 * and is matched loosely on purpose (Ajay's later ruling, still being built).
 *
 * A  respondent_name is read as text, other *_name keys unchanged
 * B  the extract prompt carries the signed line
 * C  the template: proprietorship, company, partnership, gaps, firm only, blanks, DEMAND heading
 * D  nothing says the list of persons is complete
 * E  the verifier: BNSS 144/145 for maintenance_bnss_144 only
 * F  proprietorship drops s.141 from the model's relevant acts (packForDrawer)
 *
 * No model call and no database.
 */
import './setupEnv';

import { CONFIDENCE_FLOORS } from '@lawie/shared';

import { packForDrawer, s141Applies } from '../services/ai.service';
import { factTypeFor } from '../services/fact-ledger.service';
import { verifyDraft, type VerifierInput } from '../services/fact-verifier';
import { EXTRACT_SYSTEM_PROMPT } from '../services/intake.prompts';
import type { ChecklistItem } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  replacePlaceholders,
} from '../services/template-engine.service';

const PACK = 'legal_notice_s138';

// ── A ────────────────────────────────────────────────────────────────────
describe('T-471 A: respondent_name is the drawer as named (text)', () => {
  const item = (key: string, over: Partial<ChecklistItem> = {}): ChecklistItem => ({
    key,
    label: key,
    part: 'facts' as ChecklistItem['part'],
    kind: 'text' as ChecklistItem['kind'],
    required: false,
    options: [],
    modelReadable: true,
    partyName: false,
    dateKind: null,
    ...over,
  });

  it('respondent_name is text, even when the brief marks it a party name', () => {
    expect(factTypeFor(item('respondent_name'))).toBe('text');
    expect(factTypeFor(item('respondent_name', { partyName: true }))).toBe('text');
  });

  it('text is read at the 0.6 floor, which person_name is held above', () => {
    expect(CONFIDENCE_FLOORS.text).toBe(0.6);
  });

  it.each(['applicant_name', 'advocate_name', 'accused_name', 'drawer_proprietor_name'])(
    '%s is still a person name',
    (k) => {
      expect(factTypeFor(item(k))).toBe('person_name');
    },
  );

  it('a party-named item with another key is still a person name', () => {
    expect(factTypeFor(item('payee', { partyName: true }))).toBe('person_name');
  });
});

// ── B ────────────────────────────────────────────────────────────────────
describe('T-471 B: the extract prompt', () => {
  const LINE =
    "A firm or company named as the drawer is the drawer's name. Put the proprietor, partners or directors named with it in their own fields, never in place of the firm.";

  it("carries Ajay's line verbatim, once, as a rule", () => {
    expect(EXTRACT_SYSTEM_PROMPT).toContain(`- ${LINE}\n`);
    expect(EXTRACT_SYSTEM_PROMPT.split(LINE)).toHaveLength(2);
  });
});

// ── C ────────────────────────────────────────────────────────────────────
const BASE: Record<string, string> = {
  applicant_name: 'Suresh Gupta',
  applicant_address: '12 Karol Bagh, Delhi',
  respondent_name: 'Demo Traders',
  respondent_address: '5 Lajpat Nagar, Delhi',
  advocate_name: 'A. Advocate',
  advocate_address: 'Chamber 3, Tis Hazari',
  cheque_number: '123456',
  cheque_date: '2026-05-01',
  cheque_amount: '3,00,000',
  amount_in_words: 'Three Lakh',
  drawee_bank: 'SBI',
  drawee_branch: 'Karol Bagh',
  dishonour_date: '2026-05-10',
};

function sections(form: Record<string, unknown>): Record<string, string> {
  clearConfigCache();
  const config = loadTemplateConfig(PACK)!;
  const ctx = buildPlaceholderContext(config, { ...BASE, ...form });
  const out: Record<string, string> = {};
  for (const s of config.document_structure.sections) {
    if (s.type === 'template') out[s.section_id] = replacePlaceholders(s.template as string, ctx);
  }
  return out;
}
const toBlock = (header: string) => /To,\n([\s\S]*?)\n\nFrom,/.exec(header)![1];
const SIGNED_TAIL =
  'deemed to be guilty of the offence under Section 138 read with Section 141 of the Negotiable Instruments Act, 1881.';
function para(n: number, name: string, designation: string, role: string, opening = ''): string {
  return (
    `${opening}Accused No. ${n}, ${name}, was, at the time the offence was committed, in charge of and ` +
    `responsible to Accused No. 1 for the conduct of its business, being its ${designation} and ${role}. ` +
    `Accused No. ${n} is therefore ${SIGNED_TAIL}`
  );
}
const OPEN_CO = 'Accused No. 1 is a company, and the cheque was drawn on its account. ';
const OPEN_PF = 'Accused No. 1 is a partnership firm, and the cheque was drawn on its account. ';
const ROLE_BLANK = (n: string) => `[To be confirmed: role of ${n} in the conduct of the business]`;
const CAP_BLANK = '[To be confirmed: authorised signatory / partner / director]';
const OFFICE = '(registered office|principal place of business)';

const TWO = {
  respondent_type: 'company',
  drawer_signatory_capacity: 'authorised_signatory',
  s141_person_1_name: 'Ravi Sharma',
  s141_person_1_designation: 'Managing Director',
  s141_person_1_role: 'head of sales',
  s141_person_2_name: 'Sita Rao',
  s141_person_2_designation: 'Director',
};

describe('T-471 C: proprietorship (Ajay (c))', () => {
  const form = {
    respondent_type: 'proprietorship',
    drawer_proprietor: 'Anil Gupta',
    respondent_name: 'Gupta Electricals',
  };

  it('is addressed "Anil Gupta, proprietor of Gupta Electricals"', () => {
    const s = sections(form);
    expect(toBlock(s.header)).toBe(
      'Anil Gupta, proprietor of Gupta Electricals\n5 Lajpat Nagar, Delhi',
    );
  });

  it('pleads no s.141 anywhere in the notice, and names no accused', () => {
    const s = sections({
      ...form,
      s141_person_1_name: 'Ravi Sharma', // stale from a switched drawer type: must not print
    });
    const all = Object.values(s).join('\n');
    expect(all).not.toContain('141');
    expect(all).not.toContain('Accused No.');
    expect(all).not.toContain('Ravi Sharma');
    expect(s.header).toContain('(Under Section 138 read with Section 142 of');
    expect(s.demand_clause.startsWith('DEMAND\n\nI therefore')).toBe(true);
  });

  it('with no proprietor named: the firm alone, no 141 either', () => {
    const s = sections({ respondent_type: 'proprietorship' });
    expect(toBlock(s.header)).toBe('Demo Traders\n5 Lajpat Nagar, Delhi');
    expect(Object.values(s).join('\n')).not.toContain('141');
  });
});

describe('T-471 C: company with two named persons (Ajay (d))', () => {
  const s = sections(TWO);

  it('numbers the addressees: the firm is 1, then each person with designation', () => {
    expect(toBlock(s.header)).toMatch(
      new RegExp(
        '^1\\. Demo Traders, through its authorised signatory, at its ' +
          OFFICE +
          ', 5 Lajpat Nagar, Delhi;\\n2\\. Ravi Sharma, Managing Director;\\n3\\. Sita Rao, Director$',
      ),
    );
  });

  it('prints "Accused No. 1 is a company" exactly once, in the whole notice', () => {
    expect(Object.values(s).join('\n').split('Accused No. 1 is a company')).toHaveLength(2);
    expect(s.demand_clause.startsWith(OPEN_CO + 'Accused No. 2, Ravi Sharma')).toBe(true);
  });

  it('one paragraph per person, byte-exact, with the role blank when no role is given', () => {
    const p1 = para(2, 'Ravi Sharma', 'Managing Director', 'head of sales', OPEN_CO);
    const p2 = para(3, 'Sita Rao', 'Director', ROLE_BLANK('Sita Rao'));
    expect(
      s.demand_clause.startsWith(`${p1}\n\n${p2}\n\nDEMAND\n\nI therefore call upon you`),
    ).toBe(true);
    expect(s.demand_clause.split('is therefore deemed to be guilty')).toHaveLength(3);
  });

  it('the s.141 paragraphs sit after the body and before DEMAND; the title cites 141', () => {
    const order = Object.keys(s);
    expect(order.indexOf('demand_clause')).toBeGreaterThan(order.indexOf('subject_line'));
    expect(s.header).toContain(
      '(Under Section 138 read with Sections 141 and 142 of the Negotiable',
    );
    expect(s.demand_clause.indexOf('Accused No. 2')).toBeLessThan(
      s.demand_clause.indexOf('DEMAND'),
    );
  });

  it('no brace, MISSING or underscore blank leaks (the role blank is the one signed blank)', () => {
    const all = `${s.header}\n${s.demand_clause}`
      .replace(ROLE_BLANK('Sita Rao'), '')
      .replace('Date: [To be confirmed: date the notice is sent]', '');
    expect(all).not.toMatch(/\{|\}|MISSING|_____/);
  });
});

describe('T-471 C: partnership, gaps, firm only, blanks', () => {
  it('partnership wording', () => {
    const s = sections({
      ...TWO,
      respondent_type: 'partnership',
      drawer_signatory_capacity: 'partner',
    });
    expect(toBlock(s.header)).toMatch(/^1\. Demo Traders, through its partner, at its /);
    expect(s.demand_clause).toContain(OPEN_PF + 'Accused No. 2, Ravi Sharma');
    expect(s.demand_clause).not.toContain('Accused No. 1 is a company');
    expect(s.header).toContain('Sections 141 and 142');
  });

  it.each([
    ['empty', ''],
    ['Not known', 'Not known'],
    ['To-be-confirmed', '[To be confirmed: name of partner or director 2]'],
    ['MISSING', '{{MISSING: Name of partner or director 2}}'],
  ])('a gap in the slots (%s): numbers run over filled slots, no ";" left over', (_n, v) => {
    const s = sections({
      ...TWO,
      s141_person_2_name: v,
      s141_person_2_designation: '',
      s141_person_3_name: 'Mohan Das',
      s141_person_3_designation: 'Director',
      s141_person_3_role: 'in charge of finance',
    });
    const to = toBlock(s.header);
    expect(to).toMatch(/;\n2\. Ravi Sharma, Managing Director;\n3\. Mohan Das, Director$/);
    expect(to).not.toMatch(/;\s*$/);
    expect(to).not.toContain('4.');
    expect(s.demand_clause).toContain(para(3, 'Mohan Das', 'Director', 'in charge of finance'));
    expect(s.demand_clause).not.toContain('Accused No. 4');
    expect(Object.values(s).join('\n')).not.toMatch(/MISSING|\{|\}/);
  });

  it('only slot 3 filled: it is numbered 2 and opens the s.141 paragraphs', () => {
    const s = sections({
      respondent_type: 'company',
      s141_person_3_name: 'Mohan Das',
      s141_person_3_designation: 'Director',
      s141_person_3_role: 'in charge of finance',
    });
    expect(toBlock(s.header)).toMatch(/;\n2\. Mohan Das, Director$/);
    expect(s.demand_clause.startsWith(OPEN_CO + 'Accused No. 2, Mohan Das')).toBe(true);
  });

  it('a firm with no persons: line 1 only, no ";", no Accused paragraph, plain DEMAND', () => {
    const s = sections({ respondent_type: 'company', drawer_signatory_capacity: 'director' });
    const to = toBlock(s.header);
    expect(to).toMatch(
      new RegExp(
        '^1\\. Demo Traders, through its director, at its ' + OFFICE + ', 5 Lajpat Nagar, Delhi$',
      ),
    );
    expect(to).not.toContain(';');
    expect(s.demand_clause).not.toContain('Accused No.');
    expect(s.demand_clause.startsWith('DEMAND\n\nI therefore')).toBe(true);
  });

  it('capacity not chosen: the signed blank, not a guess', () => {
    const s = sections({ respondent_type: 'company' });
    expect(toBlock(s.header)).toContain(`through its ${CAP_BLANK}, at its `);
  });

  it('designation not given: the blank names the person (pending Ajay), nothing invented', () => {
    const s = sections({ respondent_type: 'company', s141_person_1_name: 'Ravi Sharma' });
    expect(toBlock(s.header)).toContain(
      ';\n2. Ravi Sharma, [To be confirmed: designation of Ravi Sharma]',
    );
    expect(s.demand_clause).toContain(
      'being its [To be confirmed: designation of Ravi Sharma] and ' + ROLE_BLANK('Ravi Sharma'),
    );
  });

  it.each(['individual', 'huf'])('%s: plain "DEMAND", no s.141, no numbering', (t) => {
    const s = sections({ ...TWO, respondent_type: t, drawer_proprietor: '' });
    expect(s.demand_clause.startsWith('DEMAND\n\nI therefore call upon you')).toBe(true);
    expect(Object.values(s).join('\n')).not.toContain('141');
    expect(toBlock(s.header)).toBe('Demo Traders\n5 Lajpat Nagar, Delhi');
  });

  it('respondent_type not answered: plain DEMAND, no 141', () => {
    const s = sections({});
    expect(s.demand_clause.startsWith('DEMAND\n\n')).toBe(true);
    expect(Object.values(s).join('\n')).not.toContain('141');
  });
});

// ── D ────────────────────────────────────────────────────────────────────
describe('T-471 D: nothing implies the list of persons is complete', () => {
  const COMPLETE =
    /\bonly\b|all the (persons|partners|directors)|all (partners|directors)|\bcomplete\b|\bentire\b|\bno other\b/i;

  it('the rendered addressees and s.141 paragraphs use none of those phrases', () => {
    for (const form of [
      TWO,
      { ...TWO, respondent_type: 'partnership' },
      { respondent_type: 'company' },
    ]) {
      const s = sections(form);
      expect(toBlock(s.header)).not.toMatch(COMPLETE);
      const heading = s.demand_clause.slice(0, s.demand_clause.indexOf('DEMAND'));
      expect(heading).not.toMatch(COMPLETE);
    }
  });

  it('the form: 3 slots, help text on person 1 as signed, none on the config says "complete"', () => {
    clearConfigCache();
    const config = loadTemplateConfig(PACK)!;
    const fields = config.form_schema.steps.flatMap((st) => st.fields) as unknown as Array<
      Record<string, unknown>
    >;
    const ids = fields.map((f) => f.field_id as string);
    for (const n of [1, 2, 3]) {
      for (const part of ['name', 'designation', 'role'])
        expect(ids).toContain(`s141_person_${n}_${part}`);
    }
    expect(ids).not.toContain('s141_person_4_name');
    const one = fields.find((f) => f.field_id === 's141_person_1_name')!;
    expect(one.help).toBe('up to 3; add any others in the draft');
    expect(String(one.help)).not.toMatch(COMPLETE);
    for (const f of fields.filter((x) => /^s141_person_/.test(x.field_id as string))) {
      expect(f.required).toBe(false);
      expect(String(f.label)).not.toMatch(COMPLETE);
    }
  });

  it('the drawer types include a separate proprietorship option', () => {
    clearConfigCache();
    const config = loadTemplateConfig(PACK)!;
    const f = (
      config.form_schema.steps.flatMap((st) => st.fields) as unknown as Array<
        Record<string, unknown>
      >
    ).find((x) => x.field_id === 'respondent_type')!;
    const ids = (f.options as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining(['individual', 'proprietorship', 'company', 'partnership', 'huf']),
    );
  });
});

// ── E ────────────────────────────────────────────────────────────────────
describe('T-471 E: BNSS s.144/145 are accepted for maintenance_bnss_144 only', () => {
  const input = (body: string, packId?: string): VerifierInput => ({
    body,
    facts: [],
    unresolved: [],
    lists: { banned: [], allowed: [] },
    skeleton: [],
    packText: [],
    ...(packId ? { packId } : {}),
  });
  const sectionFlags = (body: string, packId?: string) =>
    verifyDraft(input(body, packId)).filter(
      (v) => v.check === 'unsupported' && v.entityType === 'section',
    );

  it.each([
    'The petitioner claims maintenance under Section 144 of the BNSS.',
    'The petitioner claims maintenance under Section 144 BNSS.',
    'The order may be enforced under Section 145 of the BNSS.',
    'The order may be enforced under Section 145 BNSS.',
  ])('accepted for maintenance_bnss_144: %s', (body) => {
    expect(sectionFlags(body, 'maintenance_bnss_144')).toEqual([]);
  });

  // Ajay's later ruling: every sub-section 144(1)-(5) and 145, in common written forms.
  it.each([
    'Section 144(1) of the BNSS',
    'Section 144(2) BNSS',
    'Section 144(3) of the BNSS',
    'Section 144(4) of the BNSS',
    'Section 144(5) BNSS',
    'Section 144 (1) of the BNSS',
    'Section 144(2) of the BNSS',
    'Section 145 of the BNSS',
    'Sections 144 and 145 of the BNSS',
    'S. 144 BNSS',
  ])('sub-section forms accepted for maintenance_bnss_144: %s', (ref) => {
    expect(
      sectionFlags(`The petitioner claims maintenance under ${ref}.`, 'maintenance_bnss_144'),
    ).toEqual([]);
  });

  // The pack's signed text lists 144 (with its sub-sections) and 145 only: nothing else rides along.
  it.each([
    'Section 145(1) of the BNSS',
    'Section 146 of the BNSS',
    'Section 144A of the BNSS',
    'Section 143 of the BNSS',
    'Section 144(6) of the BNSS',
  ])('still flagged inside maintenance_bnss_144: %s', (ref) => {
    expect(
      sectionFlags(`The petitioner claims maintenance under ${ref}.`, 'maintenance_bnss_144'),
    ).toHaveLength(1);
  });

  it('the same sub-section forms stay flagged for another pack', () => {
    expect(
      sectionFlags(
        'The petitioner claims maintenance under Section 144(4) of the BNSS.',
        'bail_regular',
      ),
    ).toHaveLength(1);
  });

  it.each([['bail_regular'], ['legal_notice_s138'], [undefined]])(
    'still flagged for another pack (%s)',
    (packId) => {
      expect(
        sectionFlags('The petitioner claims maintenance under Section 144 of the BNSS.', packId),
      ).toHaveLength(1);
      expect(
        sectionFlags('The order may be enforced under Section 145 of the BNSS.', packId),
      ).toHaveLength(1);
    },
  );

  it('no general whitelist: another section is still flagged inside maintenance_bnss_144', () => {
    expect(
      sectionFlags(
        'The petitioner claims relief under Section 480 of the BNSS.',
        'maintenance_bnss_144',
      ),
    ).toHaveLength(1);
  });
});

// ── F ────────────────────────────────────────────────────────────────────
describe('T-471 F: proprietorship drops s.141 from the model relevant acts', () => {
  const numbers = (p: ReturnType<typeof packForDrawer>) =>
    p.relevantActs
      .filter((a) => /negotiable instruments/i.test(a.act))
      .flatMap((a) => a.sections.map((s) => s.number));
  const pack = () => loadRulePack(PACK)!;

  it('s141Applies is true for company and partnership only', () => {
    expect(s141Applies('company')).toBe(true);
    expect(s141Applies('partnership')).toBe(true);
    expect(s141Applies('proprietorship')).toBe(false);
  });

  it('proprietorship: no 141, the rest kept', () => {
    expect(numbers(packForDrawer(pack(), { respondent_type: 'proprietorship' }))).toEqual([
      '138',
      '142',
      '143',
      '144',
    ]);
  });

  it.each(['company', 'partnership'])('%s: 141 kept', (t) => {
    expect(numbers(packForDrawer(pack(), { respondent_type: t }))).toContain('141');
  });
});
