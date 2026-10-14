/**
 * T-363 follow-up: an unanswered optional proprietor is never printed as a
 * placeholder. Ajay's rule (T-365/T-392): "[To be confirmed: ...]" is never a typed value.
 * With no proprietor the s.138 header is "To,\n{respondent_name}\n{respondent_address}",
 * with no blank and no "Proprietor," line (option c).
 *
 * AC1 header, brief + ledger + form paths, drawer_proprietor unanswered
 * AC2 subject line, payee_proprietor unanswered (payee_client)
 * AC3 a given proprietor prints exactly as before
 * AC4 no signed wording changes (the given-case strings are pinned literally)
 * Pin: the placeholders the code derives equal the literals in the twin's computed fields.
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
  loadTemplateConfig,
  replacePlaceholders,
} from '../services/template-engine.service';

const PACK = 'legal_notice_s138';
const kind = { id: PACK, name: 'Legal notice s.138', court_document: false };

const TWIN_PATH = join(__dirname, '../../../../docs/templates/legal_notice_s138.json');
const TWIN = JSON.parse(readFileSync(TWIN_PATH, 'utf8')) as {
  document_structure: { sections: Array<{ section_id: string; template?: string }> };
  computed_fields: Record<string, { logic: string }>;
};
const sectionTemplate = (id: string) =>
  TWIN.document_structure.sections.find((s) => s.section_id === id)!.template as string;

const DRAWER_KEY = 'drawer_proprietor';
const PAYEE_KEY = 'payee_proprietor';

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

function checklist() {
  const p = loadRulePack(PACK);
  if (!p) throw new Error('no pack');
  return buildChecklist(p);
}

function user(key: string, value: string): GivenValue {
  return { key, value, source: 'user' };
}

/** The brief as the real code builds it: BASE answered, plus `extra`; proprietors only if in `extra`. */
// buildBrief accepts a choice only by the pack's option label, not by id.
const TYPE_LABEL: Record<string, string> = {
  individual: 'Individual',
  company: 'Company / LLP',
  partnership: 'Partnership Firm',
  huf: 'HUF',
};

function brief(extra: Record<string, string>, omit: string[] = []): Brief {
  const values = Object.entries({ ...BASE, ...extra })
    .filter(([k]) => !omit.includes(k))
    .map(([k, v]) => user(k, k === 'respondent_type' ? (TYPE_LABEL[v] ?? v) : v));
  return buildBrief({ kind, checklist: checklist(), values });
}

function ledgerFact(key: string, display: string): LedgerFact {
  return { key, label: key, type: 'text', display, source: 'asked' } as never as LedgerFact;
}

function heldFacts(extra: Record<string, string>, omit: string[] = []): LedgerFact[] {
  return (
    Object.entries({ ...BASE, ...extra })
      .filter(([k]) => !omit.includes(k))
      // The real ledger holds an enum by the pack's option label (fact-ledger.service.ts).
      .map(([k, v]) => ledgerFact(k, k === 'respondent_type' ? (TYPE_LABEL[v] ?? v) : v))
  );
}

function renderForm(form: Record<string, unknown>) {
  clearConfigCache();
  const config = loadTemplateConfig(PACK)!;
  const ctx = buildPlaceholderContext(config, form);
  return {
    header: replacePlaceholders(sectionTemplate('header'), ctx),
    subject: replacePlaceholders(sectionTemplate('subject_line'), ctx),
  };
}

function renderBrief(extra: Record<string, string>, omit: string[] = []) {
  clearConfigCache();
  const config = loadTemplateConfig(PACK)!;
  return renderForm(formDataFromBrief(brief(extra, omit), config, 'en'));
}

function renderLedger(extra: Record<string, string>, omit: string[] = []) {
  clearConfigCache();
  const config = loadTemplateConfig(PACK)!;
  const skeleton = ledgerSkeletonBrief(brief({}), heldFacts(extra, omit));
  return renderForm(formDataFromBrief(skeleton, config, 'en'));
}

const CLEAN_HEADER_START = 'To,\nDemo Traders\n5 Lajpat Nagar, Delhi\n';

function expectNoProprietorHeader(h: string) {
  expect(h).toContain(CLEAN_HEADER_START);
  expect(h).not.toMatch(/To be confirmed/i);
  expect(h).not.toMatch(/MISSING/);
  expect(h).not.toMatch(/Proprietor,/);
  expect(h).not.toMatch(/\{|\}/);
}

function expectNoProprietorSubject(s: string) {
  expect(s).not.toMatch(/through its proprietor/);
  expect(s).not.toMatch(/To be confirmed/i);
  expect(s).not.toMatch(/MISSING/);
  expect(s).toContain('on behalf of my client, Suresh Gupta, I hereby serve');
}

// Addendum 4, s.141 guard: the blank is generated by the code from the pack label, never typed here.
const renderers: Array<[string, typeof renderBrief]> = [
  ['brief path', renderBrief],
  ['ledger path', renderLedger],
];

describe.each(renderers)('T-363 s.141 guard: %s', (_n, render) => {
  const sections = (r: { header: string; subject: string }) => `${r.header}\n${r.subject}`;

  it('drawer type left as its placeholder: "138 read with Section 142", no 141 anywhere', () => {
    const r = render({}, ['respondent_type']);
    expect(r.header).toContain('(Under Section 138 read with Section 142 of the Negotiable');
    expect(sections(r)).not.toMatch(/141/);
    expect(sections(r)).not.toMatch(/MISSING/);
  });

  it('the premise: the drawer type really is a placeholder in the data fed to the twin', () => {
    clearConfigCache();
    const config = loadTemplateConfig(PACK)!;
    const b =
      render === renderBrief
        ? brief({}, ['respondent_type'])
        : ledgerSkeletonBrief(brief({}, ['respondent_type']), heldFacts({}, ['respondent_type']));
    const data = formDataFromBrief(b, config, 'en');
    expect(data.respondent_type).toMatch(/^(\[To be confirmed: |\{\{MISSING: )/);
  });

  it('control: individual / HUF give no 141; company and partnership give "Sections 141 and 142"', () => {
    for (const t of ['individual', 'huf']) {
      const r = render({ respondent_type: t });
      expect(r.header).toContain('(Under Section 138 read with Section 142 of');
      expect(sections(r)).not.toMatch(/141/);
    }
    for (const t of ['company', 'partnership']) {
      expect(render({ respondent_type: t }).header).toContain('138 read with Sections 141 and 142');
    }
  });

  it('the drawer type is really placed when answered (not in unplaced), unplaced when omitted', () => {
    for (const t of Object.keys(TYPE_LABEL)) {
      const b = brief({ respondent_type: t });
      const item = b.items.find((i) => i.key === 'respondent_type')!;
      expect(item.value).toBe(TYPE_LABEL[t]);
      expect(b.unplaced.map((u) => u.label)).not.toContain(TYPE_LABEL[t]);
      expect(b.unplaced).toHaveLength(0);
    }
    expect(
      brief({}, ['respondent_type']).items.find((i) => i.key === 'respondent_type')!.value,
    ).toBeNull();
  });
});

const paths: Array<[string, (e: Record<string, string>) => { header: string; subject: string }]> = [
  ['brief path', renderBrief],
  ['ledger path', renderLedger],
];

describe.each(paths)('T-363 proprietor placeholder: %s', (_name, render) => {
  it('the brief really holds the proprietor keys as optional items (premise)', () => {
    const b = brief({});
    for (const k of [DRAWER_KEY, PAYEE_KEY]) {
      const item = b.items.find((i) => i.key === k);
      expect(item).toBeDefined();
      expect(item!.value).toBeNull();
    }
  });

  it('AC1: no drawer_proprietor -> header "To,\\n{respondent}\\n{address}", no placeholder, no Proprietor line', () => {
    expectNoProprietorHeader(render({}).header);
  });

  it('AC2: no payee_proprietor -> subject has no "through its proprietor" and no placeholder', () => {
    expectNoProprietorSubject(render({}).subject);
  });

  it('AC1+AC2 hold together when only one proprietor is given', () => {
    const onlyPayee = render({ [PAYEE_KEY]: 'Ravi Kumar' });
    expectNoProprietorHeader(onlyPayee.header);
    const onlyDrawer = render({ [DRAWER_KEY]: 'Mohan Lal' });
    expectNoProprietorSubject(onlyDrawer.subject);
  });

  it('AC3: a given drawer proprietor prints as before', () => {
    const { header } = render({ [DRAWER_KEY]: 'Mohan Lal' });
    expect(header).toContain(
      'To,\nMohan Lal,\nProprietor,\nDemo Traders,\n5 Lajpat Nagar, Delhi\n',
    );
    expect(header).not.toMatch(/To be confirmed|MISSING/);
  });

  it('AC3: a given payee proprietor prints as before', () => {
    const { subject } = render({ [PAYEE_KEY]: 'Ravi Kumar' });
    expect(subject).toContain(
      'on behalf of my client, Suresh Gupta, through its proprietor Ravi Kumar, I hereby serve',
    );
    expect(subject).not.toMatch(/To be confirmed|MISSING/);
  });

  it('AC3: both given', () => {
    const { header, subject } = render({ [DRAWER_KEY]: 'Mohan Lal', [PAYEE_KEY]: 'Ravi Kumar' });
    expect(header).toContain('To,\nMohan Lal,\nProprietor,\nDemo Traders,\n');
    expect(subject).toContain('through its proprietor Ravi Kumar,');
  });
});

describe('T-363 proprietor placeholder: the form path', () => {
  it('AC1/AC2: the field absent', () => {
    const r = renderForm({ ...BASE });
    expectNoProprietorHeader(r.header);
    expectNoProprietorSubject(r.subject);
  });

  it("AC1/AC2: the field ''", () => {
    const r = renderForm({ ...BASE, [DRAWER_KEY]: '', [PAYEE_KEY]: '' });
    expectNoProprietorHeader(r.header);
    expectNoProprietorSubject(r.subject);
  });

  it('AC3: the field given', () => {
    const r = renderForm({ ...BASE, [DRAWER_KEY]: 'Mohan Lal', [PAYEE_KEY]: 'Ravi Kumar' });
    expect(r.header).toContain(
      'To,\nMohan Lal,\nProprietor,\nDemo Traders,\n5 Lajpat Nagar, Delhi\n',
    );
    expect(r.subject).toContain('Suresh Gupta, through its proprietor Ravi Kumar, I hereby serve');
  });
});

describe('T-363 proprietor placeholder: pin to the twin', () => {
  const labelOf = (key: string) => {
    const item = brief({}).items.find((i) => i.key === key);
    if (!item) throw new Error(`no ${key}`);
    return item.label;
  };
  const logic = (name: string) => TWIN.computed_fields[name].logic;

  it('the brief placeholder derived from the pack label is the literal in the twin', () => {
    for (const [key, field] of [
      [DRAWER_KEY, 'drawer_addressee'],
      [PAYEE_KEY, 'payee_client'],
    ] as const) {
      const placeholder = brief({}).items.find((i) => i.key === key)!.placeholder;
      expect(placeholder).toMatch(/^\[To be confirmed: /);
      expect(logic(field)).toContain(`${key} === '${placeholder}'`);
    }
  });

  it('the ledger placeholder derived from the pack label is the literal in the twin', () => {
    for (const [key, field] of [
      [DRAWER_KEY, 'drawer_addressee_unless_ledger_blank'],
      [PAYEE_KEY, 'payee_client_unless_ledger_blank'],
    ] as const) {
      const ph = missingPlaceholder(labelOf(key));
      const skeleton = ledgerSkeletonBrief(brief({}), heldFacts({}));
      expect(skeleton.items.find((i) => i.key === key)!.placeholder).toBe(ph);
      expect(logic(field)).toContain(`${key} === '${ph}'`);
    }
  });

  it('AC4: the then/else outputs are unchanged', () => {
    expect(logic('drawer_addressee_unless_form_blank')).toBe(
      "if drawer_proprietor === '' then '{addressee_name}' else '{drawer_proprietor},\nProprietor,\n{addressee_name},'",
    );
    expect(logic('payee_client_unless_form_blank')).toBe(
      "if payee_proprietor === '' then '{notice_client_name}' else '{notice_client_name}, through its proprietor {payee_proprietor}'",
    );
  });
});
