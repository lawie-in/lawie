/**
 * T-404 part 1: the s.138 cause title and the signed advocate and court blanks.
 * Signed: Ajay, 13 Oct 2026 (handoff/legal/T-404-cause-title-fields-signed.md, rules 1-4, Addendum 2 #1, #2, #8).
 *
 * AC1  per-field ruling (Ajay's file; here: the signed text each blank prints)
 * AC3  the s.138 cause title: addressee, address, client, advocate name and address, on the
 *      form, brief and ledger paths; rule 4 (court) and rule 3 (advocate) for any pack.
 * AC2  (questions worded by Rajesh/Meera, built by a lead) is part 2, not tested here.
 *
 * Real loadRulePack -> buildChecklist -> buildBrief -> formDataFromBrief / ledgerSkeletonBrief
 * -> buildPlaceholderContext -> replacePlaceholders. No model call and no database.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import {
  formDataFromBrief,
  ledgerSkeletonBrief,
  missingPlaceholder,
} from '../services/brief-drafter';
import { buildBrief, buildChecklist, type Brief, type GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadCourtRule,
  loadTemplateConfig,
  replacePlaceholders,
  type CourtLookupData,
  type TemplateConfig,
} from '../services/template-engine.service';
import { loadAllDocRules } from '../services/template-promoter';

const PACK = 'legal_notice_s138';
const kind = { id: PACK, name: 'Legal notice s.138', court_document: false };

// The signed text (Ajay, rules 2-4 and Addendum 2 #2, #8). Typed here on purpose: a code change cannot move them.
const CLIENT_BLANK = '[To be confirmed: name of the client]';
const ADDRESSEE_BLANK = '[To be confirmed: name of the addressee]';
const ADDRESS_BLANK = '[To be confirmed: address of the addressee]';
const ADV_NAME_BLANK = "[To be confirmed: advocate's name]";
const ADV_ADDRESS_BLANK = "[To be confirmed: advocate's address]";
const COURT_BLANK = '[To be confirmed: court]';

const TWIN = JSON.parse(
  readFileSync(join(__dirname, '../../../../docs/templates/legal_notice_s138.json'), 'utf8'),
) as {
  document_structure: { sections: Array<{ section_id: string; template?: string }> };
  computed_fields: Record<string, { logic: string }>;
};
const sectionTemplate = (id: string) =>
  TWIN.document_structure.sections.find((s) => s.section_id === id)!.template as string;

const BASE: Record<string, string> = {
  applicant_name: 'Suresh Gupta',
  applicant_address: '12 Karol Bagh, Delhi',
  respondent_name: 'Demo Traders',
  respondent_address: '5 Lajpat Nagar, Delhi',
  advocate_name: 'A. Advocate',
  advocate_address: 'Chamber 3, Tis Hazari',
  respondent_type: 'partnership',
  cheque_number: '123456',
  cheque_date: '2026-05-01',
  cheque_amount: '3,00,000',
  amount_in_words: 'Three Lakh',
  drawee_bank: 'SBI',
  drawee_branch: 'Karol Bagh',
  dishonour_date: '2026-05-10',
};
const CAUSE_KEYS = [
  'applicant_name',
  'respondent_name',
  'respondent_address',
  'advocate_name',
  'advocate_address',
];

function checklist() {
  const p = loadRulePack(PACK);
  if (!p) throw new Error('no pack');
  return buildChecklist(p);
}
function user(key: string, value: string): GivenValue {
  return { key, value, source: 'user' };
}
const TYPE_LABEL: Record<string, string> = {
  partnership: 'Partnership Firm',
  company: 'Company / LLP',
};

function brief(values: Record<string, string>): Brief {
  return buildBrief({
    kind,
    checklist: checklist(),
    values: Object.entries(values).map(([k, v]) =>
      user(k, k === 'respondent_type' ? (TYPE_LABEL[v] ?? v) : v),
    ),
  });
}
function facts(values: Record<string, string>): LedgerFact[] {
  return Object.entries(values).map(
    ([k, v]) =>
      ({
        key: k,
        label: k,
        type: 'text',
        display: k === 'respondent_type' ? (TYPE_LABEL[v] ?? v) : v,
        source: 'asked',
      }) as never as LedgerFact,
  );
}
const without = (v: Record<string, string>, omit: string[]) =>
  Object.fromEntries(Object.entries(v).filter(([k]) => !omit.includes(k)));

/** The enrolment line is a separate ruling (not in this slice); the closing checks skip it. */
const noEnrol = (c: string) => c.replace(/^Enrollment No\..*$/m, '');

interface Rendered {
  header: string;
  subject: string;
  closing: string;
}
function renderForm(
  form: Record<string, unknown>,
  extra: { advocateName?: string } = {},
): Rendered {
  clearConfigCache();
  const config = loadTemplateConfig(PACK)!;
  const ctx = buildPlaceholderContext(config, form, extra);
  return {
    header: replacePlaceholders(sectionTemplate('header'), ctx),
    subject: replacePlaceholders(sectionTemplate('subject_line'), ctx),
    closing: replacePlaceholders(sectionTemplate('closing'), ctx),
  };
}
function renderBrief(extra: Record<string, string>, omit: string[] = []): Rendered {
  clearConfigCache();
  const config = loadTemplateConfig(PACK)!;
  return renderForm(formDataFromBrief(brief(without({ ...BASE, ...extra }, omit)), config, 'en'));
}
function renderLedger(extra: Record<string, string>, omit: string[] = []): Rendered {
  clearConfigCache();
  const config = loadTemplateConfig(PACK)!;
  const skeleton = ledgerSkeletonBrief(brief({}), facts(without({ ...BASE, ...extra }, omit)));
  return renderForm(formDataFromBrief(skeleton, config, 'en'));
}
const renderFormPath = (extra: Record<string, string>, omit: string[] = []) =>
  renderForm(without({ ...BASE, ...extra }, omit));

const paths: Array<[string, typeof renderBrief]> = [
  ['form path', renderFormPath],
  ['brief path', renderBrief],
  ['ledger path', renderLedger],
];

/** The label-derived blanks the generators write into the data fed to the twin. */
function generatedBlanks(key: string) {
  const item = brief({}).items.find((i) => i.key === key);
  if (!item) throw new Error(`no ${key}`);
  return { brief: item.placeholder as string, ledger: missingPlaceholder(item.label) };
}

describe.each(paths)('T-404 s.138 cause title, nothing answered: %s', (_n, render) => {
  const r = render({}, CAUSE_KEYS);

  it("the header prints exactly Ajay's blanks and the filled lines unchanged", () => {
    expect(r.header).toContain(
      `To,\n${ADDRESSEE_BLANK}\n${ADDRESS_BLANK}\n\nFrom,\n${CLIENT_BLANK}\n12 Karol Bagh, Delhi\n` +
        `Through: ${ADV_NAME_BLANK}, Advocate\n${ADV_ADDRESS_BLANK}`,
    );
  });

  it('no underscore blank, no brace, no Proprietor line in the header or subject', () => {
    for (const s of [r.header, r.subject]) {
      expect(s).not.toMatch(/_____/);
      expect(s).not.toMatch(/\{|\}/);
      expect(s).not.toMatch(/MISSING/);
    }
    expect(r.header).not.toMatch(/Proprietor,/);
  });

  it('no label-derived text for the five signed fields', () => {
    const all = `${r.header}\n${r.subject}\n${r.closing}`;
    for (const k of ['applicant_name', 'respondent_name', 'respondent_address']) {
      const g = generatedBlanks(k);
      expect(all).not.toContain(g.brief);
      expect(all).not.toContain(g.ledger);
    }
    expect(all).not.toContain('[To be confirmed: drawer');
    expect(all).not.toContain('[To be confirmed: payee');
    expect(all).not.toContain('[To be confirmed: advocate name]');
    expect(all).not.toContain('[To be confirmed: advocate address]');
  });

  it('the subject line and the closing use the client blank', () => {
    expect(r.subject).toContain(`on behalf of my client, ${CLIENT_BLANK}, I hereby serve`);
    expect(r.closing).toContain(`(Counsel for ${CLIENT_BLANK})`);
    expect(r.closing).toContain(`${ADV_NAME_BLANK}\nAdvocate`);
    expect(r.closing).toContain(ADV_ADDRESS_BLANK);
    expect(noEnrol(r.closing)).not.toMatch(/\{|\}/);
  });
});

describe('T-404 s.138: the blank the generator writes is the one the twin tests for', () => {
  it.each([
    ['respondent_name', 'addressee_name'],
    ['respondent_address', 'addressee_address'],
    ['applicant_name', 'notice_client_name'],
  ])('%s -> %s: both generated placeholders map to the signed blank', (key, field) => {
    const g = generatedBlanks(key);
    const signed = {
      addressee_name: ADDRESSEE_BLANK,
      addressee_address: ADDRESS_BLANK,
      notice_client_name: CLIENT_BLANK,
    }[field] as string;
    expect(g.brief).toMatch(/^\[To be confirmed: /);
    expect(g.ledger).toMatch(/^\{\{MISSING: /);
    expect(TWIN.computed_fields[field].logic).toContain(`${key} === '${g.brief}' then '${signed}'`);
    expect(TWIN.computed_fields[`${field}_unless_ledger_blank`].logic).toContain(
      `${key} === '${g.ledger}' then '${signed}'`,
    );
    expect(TWIN.computed_fields[`${field}_unless_form_blank`].logic).toContain(
      `${key} === '' then '${signed}'`,
    );
  });

  it('each chain is exercised end to end by the generator output (brief and ledger, one field at a time)', () => {
    for (const key of ['respondent_name', 'respondent_address', 'applicant_name']) {
      const signed = {
        respondent_name: ADDRESSEE_BLANK,
        respondent_address: ADDRESS_BLANK,
        applicant_name: CLIENT_BLANK,
      }[key]!;
      for (const render of [renderBrief, renderLedger]) {
        const r = render({}, [key]);
        expect(`${r.header}\n${r.subject}`).toContain(signed);
      }
    }
  });
});

describe.each(paths)('T-404 s.138 cause title, filled: %s', (_n, render) => {
  it('prints the answers byte-for-byte as before', () => {
    const r = render({});
    expect(r.header).toContain(
      'To,\nDemo Traders\n5 Lajpat Nagar, Delhi\n\nFrom,\nSuresh Gupta\n12 Karol Bagh, Delhi\n' +
        'Through: A. Advocate, Advocate\nChamber 3, Tis Hazari',
    );
    expect(r.subject).toContain('on behalf of my client, Suresh Gupta, I hereby serve');
    expect(r.closing).toContain('A. Advocate\nAdvocate');
    expect(r.closing).toContain('(Counsel for Suresh Gupta)');
    for (const s of [r.header, r.subject, noEnrol(r.closing)]) {
      expect(s).not.toMatch(/To be confirmed|MISSING/);
    }
  });

  it('proprietors given: unchanged lines', () => {
    const r = render({ drawer_proprietor: 'Mohan Lal', payee_proprietor: 'Ravi Kumar' });
    expect(r.header).toContain(
      'To,\nMohan Lal,\nProprietor,\nDemo Traders,\n5 Lajpat Nagar, Delhi\n',
    );
    expect(r.subject).toContain('Suresh Gupta, through its proprietor Ravi Kumar, I hereby serve');
  });

  it('a proprietor given with an empty firm name: the proprietor prints, the firm line is the signed blank', () => {
    const r = render({ drawer_proprietor: 'Mohan Lal', payee_proprietor: 'Ravi Kumar' }, [
      'respondent_name',
      'applicant_name',
    ]);
    expect(r.header).toContain(
      `To,\nMohan Lal,\nProprietor,\n${ADDRESSEE_BLANK},\n5 Lajpat Nagar, Delhi\n`,
    );
    expect(r.subject).toContain(
      `${CLIENT_BLANK}, through its proprietor Ravi Kumar, I hereby serve`,
    );
    expect(r.header).not.toMatch(/MISSING|_____/);
  });
});

describe('T-404 rule 3: the advocate', () => {
  const cfg = () => {
    clearConfigCache();
    return loadTemplateConfig(PACK)!;
  };

  it('a profile name wins over the blank', () => {
    const ctx = buildPlaceholderContext(cfg(), without(BASE, ['advocate_name']), {
      advocateName: 'P. Profile',
    });
    expect(ctx.advocate_name).toBe('P. Profile');
    expect(ctx.advocateName).toBe('P. Profile');
  });

  it('no name and no profile: the signed blank, in both spellings', () => {
    const ctx = buildPlaceholderContext(cfg(), without(BASE, ['advocate_name']), {});
    expect(ctx.advocate_name).toBe(ADV_NAME_BLANK);
    expect(ctx.advocateName).toBe(ADV_NAME_BLANK);
  });

  it('a typed address wins, untouched', () => {
    const ctx = buildPlaceholderContext(
      cfg(),
      { ...BASE, advocate_address: '  Chamber 3, Tis Hazari ' },
      {},
    );
    expect(ctx.advocate_address).toBe('  Chamber 3, Tis Hazari ');
    expect(ctx.advocateAddress).toBe('  Chamber 3, Tis Hazari ');
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace', '   \n '],
    ['a brief placeholder', '[To be confirmed: advocate address]'],
    ['a ledger MISSING', '{{MISSING: Advocate Address}}'],
  ])('address %s counts as not given', (_n, v) => {
    const form: Record<string, unknown> = { ...BASE };
    if (v === undefined) delete form.advocate_address;
    else form.advocate_address = v;
    const ctx = buildPlaceholderContext(cfg(), form, {});
    expect(ctx.advocate_address).toBe(ADV_ADDRESS_BLANK);
    expect(ctx.advocateAddress).toBe(ADV_ADDRESS_BLANK);
  });
});

describe('T-404 rule 4: the court', () => {
  const { configs, byFile } = loadAllDocRules();
  const bail = configs.get(
    byFile.get('bail_before_magistrate.json')!.template_id,
  ) as TemplateConfig;
  const form = { applicant_name: 'Ramesh Kumar', state: 'bihar', fir_number: '12/2026' };
  const court: CourtLookupData = {
    designation: 'IN THE COURT OF CHIEF JUDICIAL MAGISTRATE, PATNA',
    city: 'Patna',
    caseNomenclature: 'Criminal Case No. _____ of {current_year}',
    formattingRulesRef: 'cjm_generic',
    courtType: 'cjm',
    courtRule: loadCourtRule('cjm_generic') ?? undefined,
  };

  it('no court chosen: the three camelCase tokens print the signed blank', () => {
    const ctx = buildPlaceholderContext(bail, form, { advocateName: 'A' });
    expect(ctx.courtHeader).toBe(COURT_BLANK);
    expect(ctx.courtDesignation).toBe(COURT_BLANK);
    expect(ctx.caseNomenclature).toBe(COURT_BLANK);
  });

  it('no court chosen: snake_case court_designation is not given the blank', () => {
    const ctx = buildPlaceholderContext(bail, form, { advocateName: 'A' });
    expect(ctx.court_designation).not.toBe(COURT_BLANK);
  });

  it('a court chosen: its heading prints, no blank anywhere', () => {
    const ctx = buildPlaceholderContext(bail, form, { advocateName: 'A' }, court);
    expect(ctx.courtDesignation).toContain('CHIEF JUDICIAL MAGISTRATE, PATNA');
    expect(ctx.court_designation).toBe(ctx.courtDesignation);
    expect(ctx.courtHeader).toBeTruthy();
    expect(ctx.courtHeader).not.toContain('court]');
    expect(ctx.caseNomenclature).toBe(`Criminal Case No. _____ of ${new Date().getFullYear()}`);
    for (const k of ['courtHeader', 'courtDesignation', 'caseNomenclature']) {
      expect(ctx[k]).not.toBe(COURT_BLANK);
    }
  });

  it('s.138 (a twin with no court): same rule', () => {
    clearConfigCache();
    const ctx = buildPlaceholderContext(loadTemplateConfig(PACK)!, BASE, {});
    expect(ctx.courtHeader).toBe(COURT_BLANK);
    expect(ctx.courtDesignation).toBe(COURT_BLANK);
    expect(ctx.caseNomenclature).toBe(COURT_BLANK);
  });
});

// ── Round 2: Addendum 3 (client address, enrolment, case line, place) ─────────────────────────

const CLIENT_ADDRESS_BLANK = '[To be confirmed: address of the client]';
const ENROLMENT_BLANK = "[To be confirmed: advocate's enrolment number]";
const CASE_BLANK = '[To be confirmed: case type and number]';
const PLACE_BLANK = '[To be confirmed: place]';

describe.each(paths)('T-404 s.138 client address and enrolment: %s', (_n, render) => {
  it('no client address: the signed blank in the From block, never the label-derived text', () => {
    const r = render({}, ['applicant_address']);
    expect(r.header).toContain(`From,\nSuresh Gupta\n${CLIENT_ADDRESS_BLANK}\nThrough:`);
    expect(r.header).not.toMatch(/MISSING|_____|\{|\}/);
    expect(r.header).not.toContain('[To be confirmed: payee address]');
  });

  it('a given client address prints unchanged', () => {
    expect(render({}).header).toContain('From,\nSuresh Gupta\n12 Karol Bagh, Delhi\nThrough:');
  });

  it('the closing "Enrollment No." line: the signed blank when none is given', () => {
    const r = render({}, ['advocate_enrollment']);
    expect(r.closing).toContain(`Enrollment No. ${ENROLMENT_BLANK}\n`);
    expect(r.closing).not.toMatch(/Enrollment No\. *(_|\{|\n)/);
    expect(r.closing).not.toMatch(/MISSING|\[To be confirmed: advocate enrol?lment/i);
  });

  it('a typed enrolment number prints as typed', () => {
    const r = render({ advocate_enrollment: 'D/123/2015' });
    expect(r.closing).toContain('Enrollment No. D/123/2015\n');
  });
});

describe('T-404 enrolment: the T-311 resolver order, then the blank', () => {
  const cfg = () => {
    clearConfigCache();
    return loadTemplateConfig(PACK)!;
  };
  const form = without(BASE, ['advocate_name', 'advocate_enrollment']);

  it('typed beats the profile', () => {
    const ctx = buildPlaceholderContext(
      cfg(),
      { ...form, advocate_name: 'A. Typed', advocate_enrollment: 'T/1/2000' },
      { advocateName: 'P. Profile', enrollmentNumber: 'P/9/2010' },
    );
    expect(ctx.advocate_enrollment).toBe('T/1/2000');
    expect(ctx.enrollment_number).toBe('T/1/2000');
  });

  it('the profile number is used when the name came from the profile', () => {
    const ctx = buildPlaceholderContext(cfg(), form, {
      advocateName: 'P. Profile',
      enrollmentNumber: 'P/9/2010',
    });
    expect(ctx.advocate_enrollment).toBe('P/9/2010');
    expect(ctx.enrollment_number).toBe('P/9/2010');
  });

  it('the profile number is not used for a typed name: the blank', () => {
    const ctx = buildPlaceholderContext(
      cfg(),
      { ...form, advocate_name: 'A. Typed' },
      { advocateName: 'P. Profile', enrollmentNumber: 'P/9/2010' },
    );
    expect(ctx.enrollment_number).toBe(ENROLMENT_BLANK);
    expect(ctx.advocate_enrollment).toBe(ENROLMENT_BLANK);
  });

  it('nothing at all: the blank, never the underscores', () => {
    const ctx = buildPlaceholderContext(cfg(), form, {});
    expect(ctx.enrollment_number).toBe(ENROLMENT_BLANK);
    expect(ctx.advocate_enrollment).toBe(ENROLMENT_BLANK);
  });

  it('a client enrollment_number is never printed (list A)', () => {
    const ctx = buildPlaceholderContext(cfg(), { ...form, enrollment_number: 'FORGED/1' }, {});
    expect(ctx.enrollment_number).toBe(ENROLMENT_BLANK);
  });
});

describe('T-404 case line and place when a court is chosen or typed', () => {
  const { configs, byFile } = loadAllDocRules();
  const bail = configs.get(
    byFile.get('bail_before_magistrate.json')!.template_id,
  ) as TemplateConfig;
  const form = { applicant_name: 'Ramesh Kumar', state: 'bihar', fir_number: '12/2026' };
  const court = (nomenclature: string): CourtLookupData => ({
    designation: 'IN THE COURT OF CHIEF JUDICIAL MAGISTRATE, PATNA',
    city: 'Patna',
    caseNomenclature: nomenclature,
    formattingRulesRef: 'cjm_generic',
    courtType: 'cjm',
    courtRule: loadCourtRule('cjm_generic') ?? undefined,
  });

  // s.138 has no pack default for the case line, so the court's own line (or the blank) is what prints.
  const s138 = () => {
    clearConfigCache();
    return loadTemplateConfig(PACK)!;
  };

  it('a court with no case line: the case-type blank; the court itself is unchanged', () => {
    const ctx = buildPlaceholderContext(s138(), form, { advocateName: 'A' }, court(''));
    expect(ctx.caseNomenclature).toBe(CASE_BLANK);
    expect(ctx.courtDesignation).toContain('CHIEF JUDICIAL MAGISTRATE, PATNA');
    expect(ctx.courtDesignation).not.toBe(COURT_BLANK);
  });

  it('a court with a case line: it prints as before', () => {
    const ctx = buildPlaceholderContext(
      s138(),
      form,
      { advocateName: 'A' },
      court('Bail Application No. _____ of {current_year}'),
    );
    expect(ctx.caseNomenclature).toBe(`Bail Application No. _____ of ${new Date().getFullYear()}`);
  });

  it('no court: the place is the blank; with a court the city prints', () => {
    const none = buildPlaceholderContext(bail, form, { advocateName: 'A' });
    expect(none.place).toBe(PLACE_BLANK);
    expect(none.courtPlace).toBe(PLACE_BLANK);
    const chosen = buildPlaceholderContext(bail, form, { advocateName: 'A' }, court('X'));
    expect(chosen.place).toBe('Patna');
    expect(chosen.courtPlace).toBe('Patna');
  });
});

describe('T-404 bail twins with no court (bail_regular, bail_anticipatory)', () => {
  it.each(['bail_regular', 'bail_anticipatory'])(
    '%s: court, addressing, case line, place',
    (id) => {
      clearConfigCache();
      const cfg = loadTemplateConfig(id)!;
      const ctx = buildPlaceholderContext(
        cfg,
        { applicant_name: 'Ramesh Kumar' },
        { advocateName: 'A' },
      );
      const sec = (sid: string) =>
        replacePlaceholders(
          cfg.document_structure.sections.find((s) => s.section_id === sid)!.template as string,
          ctx,
        );
      expect(ctx.court_header).toBe(COURT_BLANK);
      expect(ctx.court_designation).toBe(COURT_BLANK);
      expect(ctx.case_nomenclature).toBe(CASE_BLANK);
      const all = cfg.document_structure.sections
        .filter((s) => s.type === 'template')
        .map((s) => replacePlaceholders(s.template as string, ctx))
        .join('\n');
      expect(all).toContain(`THE HONOURABLE ${COURT_BLANK},`);
      expect(all).toContain(`Place: ${PLACE_BLANK}`);
      expect(all).not.toMatch(/HON'BLE COURT/);
      expect(sec('advocate_block')).not.toMatch(/Place: *(\n|_)/);
    },
  );

  it.each(['bail_regular', 'bail_anticipatory'])('%s: a typed court renders as typed', (id) => {
    clearConfigCache();
    const cfg = loadTemplateConfig(id)!;
    const ctx = buildPlaceholderContext(
      cfg,
      { applicant_name: 'Ramesh Kumar', court_name: 'SESSIONS COURT, GAYA' },
      { advocateName: 'A' },
    );
    expect(ctx.court_designation).toBe('SESSIONS COURT, GAYA');
    expect(ctx.court_header).toBe('IN THE COURT OF SESSIONS COURT, GAYA');
  });
});
