/**
 * T-410 (with T-412 and Ajay 2957f50 item c) - consumer_complaint is filed
 * before a Consumer Commission only.
 *
 * Sources: handoff/legal/T-406-T-410-case-line-signed.md (ruling + Addendum 1),
 * handoff/legal/T-412-cpa-jurisdiction-rules-signed.md,
 * handoff/legal/T-404-cause-title-fields-signed.md (item c: place).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import './setupEnv';

import {
  buildAISystemPrompt,
  buildPlaceholderContext,
  CONSUMER_COMMISSION_BLANK,
  consumerForum,
  CourtLookupData,
  DocumentSection,
  loadCourtRule,
  loadTemplateConfig,
  PlaceholderContext,
  renderTemplateSection,
  TemplateConfig,
} from '../services/template-engine.service';

interface CourtEntry {
  courtId: string;
  designation: string;
  city: string;
  courtType?: string;
  caseNomenclature?: string;
  state?: string;
  formattingRulesRef: string;
}

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'docs', 'templates');

const COURTS: CourtEntry[] = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, 'courts', 'indian-courts.json'), 'utf8'),
).courts;

function court(id: string): CourtEntry {
  const found = COURTS.find((c) => c.courtId === id);
  if (!found) throw new Error(`court fixture missing: ${id}`);
  return found;
}

function lookup(id: string): CourtLookupData {
  const c = court(id);
  return {
    designation: c.designation,
    city: c.city,
    caseNomenclature: c.caseNomenclature ?? '',
    state: c.state,
    courtType: c.courtType,
    formattingRulesRef: c.formattingRulesRef,
    courtRule: loadCourtRule(c.formattingRulesRef) ?? undefined,
  };
}

const COMPLAINT = loadTemplateConfig('consumer_complaint') as TemplateConfig;

const FORM = {
  applicant_name: 'T410_COMPLAINANT',
  father_name: 'T410_FATHER',
  respondent_name: 'T410_OPPOSITE',
  address: 'T410 Road',
  advocate_name: 'T410 Advocate',
};

function ctxAt(courtId?: string): PlaceholderContext {
  return buildPlaceholderContext(COMPLAINT, FORM, undefined, courtId ? lookup(courtId) : undefined);
}

function section(config: TemplateConfig, id: string): DocumentSection {
  const s = config.document_structure.sections.find((x) => x.section_id === id);
  if (!s) throw new Error(`section missing: ${id}`);
  return s;
}

function render(id: string, ctx: PlaceholderContext): string {
  return renderTemplateSection(section(COMPLAINT, id), ctx).content;
}

const YEAR = String(new Date().getFullYear());
const CASE_LINE = `Consumer Complaint No. _____ of ${YEAR}`;
const HEADING_S35 = 'CONSUMER COMPLAINT UNDER SECTION 35 OF THE CONSUMER PROTECTION ACT, 2019';
const HEADING_ACT = 'CONSUMER COMPLAINT UNDER THE CONSUMER PROTECTION ACT, 2019';
const PLACE_BLANK = '[To be confirmed: place]';
const RULES_CITATION =
  'Consumer Protection (Jurisdiction of the District Commission, the State Commission and the National Commission) Rules, 2021';

/** Courts that are not a Commission: sessions, HC, civil, plus a Supreme Court record. */
const NON_COMMISSION = [
  'mh_sessions_mumbai_city',
  'bihar_sessions_patna',
  'allahabad_hc',
  'patna_hc',
  'bihar_civil_patna',
  'bihar_jmfc_patna',
];

const CRIMINAL_WORDS = /Bail|Crl\.|Criminal|State of/;

describe('T-410 criterion 1: a court that is not a Commission', () => {
  it.each(NON_COMMISSION)('%s: the three lines are the blank', (id) => {
    const ctx = ctxAt(id);
    expect(ctx.court_header).toBe(CONSUMER_COMMISSION_BLANK);
    expect(ctx.court_designation).toBe(CONSUMER_COMMISSION_BLANK);
    expect(ctx.case_nomenclature).toBe(CONSUMER_COMMISSION_BLANK);
    expect(CONSUMER_COMMISSION_BLANK).toBe('[To be confirmed: Consumer Commission]');
  });

  it.each(NON_COMMISSION)('%s: cause title has no criminal wording', (id) => {
    const ctx = ctxAt(id);
    const title = render('cause_title', ctx);
    expect(
      title.startsWith(`${CONSUMER_COMMISSION_BLANK}\n\n${CONSUMER_COMMISSION_BLANK}\n\n`),
    ).toBe(true);
    expect(title).not.toMatch(CRIMINAL_WORDS);
    expect(title).toContain('T410_COMPLAINANT');
    expect(title).toContain('... Opposite Party');
  });

  it.each(NON_COMMISSION)('%s: addressing clause has the blank and no city line', (id) => {
    const city = court(id).city;
    const clause = render('addressing_clause', ctxAt(id));
    expect(clause).toBe(
      `TO,\nTHE HONOURABLE PRESIDENT AND MEMBERS,\n${CONSUMER_COMMISSION_BLANK}\n\nMOST RESPECTFULLY SHOWETH:`,
    );
    expect(clause).not.toContain(city);
  });

  it.each(NON_COMMISSION)('%s: generation is not blocked (ctx builds, sections render)', (id) => {
    expect(() => ctxAt(id)).not.toThrow();
    for (const s of COMPLAINT.document_structure.sections.filter((x) => x.type === 'template')) {
      expect(() => renderTemplateSection(s, ctxAt(id))).not.toThrow();
    }
  });

  it('every one of the 1,734-ish non-Commission courts gives the blank, no criminal wording, no city', () => {
    const others = COURTS.filter((c) => consumerForum(lookup(c.courtId)) === null);
    expect(others.length).toBeGreaterThan(1500);
    for (const c of others) {
      const ctx = ctxAt(c.courtId);
      const text = `${render('cause_title', ctx)}\n${render('addressing_clause', ctx)}`;
      expect(text).not.toMatch(CRIMINAL_WORDS);
      expect(ctx.case_nomenclature).toBe(CONSUMER_COMMISSION_BLANK);
      expect(render('addressing_clause', ctx)).not.toContain(CONSUMER_COMMISSION_BLANK + ',');
      if (c.city.length > 3) expect(render('addressing_clause', ctx)).not.toContain(c.city);
    }
  });

  it('no court at all: the same three blanks, no city, no state respondent', () => {
    const ctx = ctxAt();
    expect(ctx.court_header).toBe(CONSUMER_COMMISSION_BLANK);
    expect(ctx.court_designation).toBe(CONSUMER_COMMISSION_BLANK);
    expect(ctx.case_nomenclature).toBe(CONSUMER_COMMISSION_BLANK);
    expect(render('cause_title', ctx)).not.toMatch(CRIMINAL_WORDS);
    expect(ctx.state_respondent).toBeUndefined();
  });

  it('the template is Commission-only', () => {
    expect(COMPLAINT.applicable_courts?.court_levels).toEqual(['consumer_commission']);
  });
});

describe('T-410 criterion 2: consumer rule only', () => {
  it.each([...NON_COMMISSION, 'allahabad_hc'])('%s: Complainant / Opposite Party labels', (id) => {
    const ctx = ctxAt(id);
    expect(ctx.party_label_petitioner).toBe('Complainant');
    expect(ctx.party_label_respondent).toBe('Opposite Party');
    expect(ctx.state_respondent).toBeUndefined();
  });

  it.each(NON_COMMISSION)('%s: prayer and verification come from the consumer rule', (id) => {
    const ctx = ctxAt(id);
    const consumerRule = loadCourtRule('consumer_commission_generic');
    expect(consumerRule?.prayer_language).toBeTruthy();
    expect(ctx.prayer_opening).toBe(consumerRule?.prayer_language?.opening);
    expect(ctx.prayer_closing).toBe(consumerRule?.prayer_language?.closing);
    const verification = render('verification', ctx);
    expect(verification).toContain('the Complainant herein above named');
    expect(verification).not.toMatch(/Accused|Applicant herein|Petitioner herein/);
  });

  // At a Commission the SCRUM-50 block still sets state_respondent (pre-existing,
  // outside Addendum 1 item 4); what matters is that no section prints it.
  it.each(['patna_dccdrc', 'bihar_state_consumer_patna', 'ncdrc_delhi'])(
    '%s: no template section prints "State of"',
    (id) => {
      const ctx = ctxAt(id);
      const all = COMPLAINT.document_structure.sections
        .filter((x) => x.type === 'template')
        .map((x) => renderTemplateSection(x, ctx).content)
        .join('\n');
      expect(all).not.toContain('State of');
    },
  );
});

describe('T-410 criterion 3: State Commission', () => {
  const STATE_IDS = ['bihar_state_consumer_patna', 'mh_state_consumer_mumbai'];

  it.each(STATE_IDS)('%s: no First Appeal and no DISTRICT anywhere in the court lines', (id) => {
    const ctx = ctxAt(id);
    const text = [
      render('cause_title', ctx),
      render('addressing_clause', ctx),
      render('complaint_heading', ctx),
      ctx.court_header,
      ctx.court_designation,
      ctx.case_nomenclature,
    ].join('\n');
    expect(text).not.toMatch(/First Appeal/i);
    expect(text).not.toMatch(/DISTRICT/);
    expect(text).toContain('STATE CONSUMER DISPUTES REDRESSAL COMMISSION');
  });

  it.each(STATE_IDS)('%s: case line is Consumer Complaint No.', (id) => {
    const ctx = ctxAt(id);
    expect(ctx.case_nomenclature).toBe(CASE_LINE);
    expect(render('cause_title', ctx)).toContain(`\n\n${CASE_LINE}\n\nIN THE MATTER OF:`);
  });

  it('the State is taken from the court record', () => {
    expect(ctxAt('mh_state_consumer_mumbai').court_header).toBe(
      'BEFORE THE MAHARASHTRA STATE CONSUMER DISPUTES REDRESSAL COMMISSION, MUMBAI',
    );
    expect(ctxAt('bihar_state_consumer_patna').court_header).toBe(
      'BEFORE THE STATE CONSUMER DISPUTES REDRESSAL COMMISSION, BIHAR',
    );
  });

  it('all 36 State Commissions: no DISTRICT, no First Appeal, Consumer Complaint line', () => {
    const states = COURTS.filter((c) => consumerForum(lookup(c.courtId)) === 'state');
    expect(states).toHaveLength(36);
    for (const c of states) {
      const ctx = ctxAt(c.courtId);
      const text = `${render('cause_title', ctx)}\n${render('addressing_clause', ctx)}`;
      expect(text).not.toMatch(/DISTRICT|First Appeal/i);
      expect(ctx.case_nomenclature).toBe(CASE_LINE);
    }
  });
});

describe('T-410 criterion 4: NCDRC', () => {
  it('ncdrc_delhi: case line is Consumer Complaint No.', () => {
    const ctx = ctxAt('ncdrc_delhi');
    expect(ctx.case_nomenclature).toBe(CASE_LINE);
    expect(render('cause_title', ctx)).toContain(`\n\n${CASE_LINE}\n\nIN THE MATTER OF:`);
    expect(render('cause_title', ctx)).not.toMatch(/DISTRICT|First Appeal/i);
  });
});

describe('T-410 District Commission keeps its lines', () => {
  it('patna_dccdrc: header, case line and addressing clause name the District Commission', () => {
    const ctx = ctxAt('patna_dccdrc');
    expect(ctx.case_nomenclature).toBe(CASE_LINE);
    const title = render('cause_title', ctx);
    expect(title).toContain('DISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION');
    expect(title).not.toContain(CONSUMER_COMMISSION_BLANK);
    const clause = render('addressing_clause', ctx);
    expect(clause).toContain('DISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION');
    expect(clause).toContain('MOST RESPECTFULLY SHOWETH:');
    expect(clause).not.toContain(CONSUMER_COMMISSION_BLANK);
  });
});

describe('T-410 criterion 5: heading', () => {
  it('District: s.35', () => {
    expect(render('complaint_heading', ctxAt('patna_dccdrc'))).toBe(HEADING_S35);
  });
  it.each(['bihar_state_consumer_patna', 'mh_state_consumer_mumbai', 'ncdrc_delhi'])(
    '%s: the Act-only heading',
    (id) => {
      const heading = render('complaint_heading', ctxAt(id));
      expect(heading).toBe(HEADING_ACT);
      expect(heading).not.toContain('SECTION 35');
    },
  );
  it.each([...NON_COMMISSION, 'none'])('%s: the Act-only heading', (id) => {
    expect(render('complaint_heading', ctxAt(id === 'none' ? undefined : id))).toBe(HEADING_ACT);
  });
});

describe('T-410 criterion 6: place (Ajay 2957f50 item c)', () => {
  const COMMISSIONS = [
    'patna_dccdrc',
    'bihar_state_consumer_patna',
    'mh_state_consumer_mumbai',
    'ncdrc_delhi',
  ];

  it.each(COMMISSIONS)('%s: Verified at / Place are the Commission city', (id) => {
    const city = court(id).city;
    const ctx = ctxAt(id);
    expect(render('verification', ctx)).toContain(`Verified at ${city} on this`);
    expect(render('advocate_block', ctx)).toContain(`Place: ${city}\n`);
  });

  it.each([...NON_COMMISSION, 'none'])('%s: Verified at / Place are the place blank', (id) => {
    const ctx = ctxAt(id === 'none' ? undefined : id);
    const verification = render('verification', ctx);
    const block = render('advocate_block', ctx);
    expect(verification).toContain(`Verified at ${PLACE_BLANK} on this`);
    expect(block).toContain(`Place: ${PLACE_BLANK}\n`);
    if (id !== 'none') {
      const city = court(id).city;
      expect(verification).not.toContain(`Verified at ${city}`);
      expect(block).not.toContain(`Place: ${city}`);
    }
  });

  it('a place typed in the form does not override the Commission rule', () => {
    const ctx = buildPlaceholderContext(
      COMPLAINT,
      { ...FORM, place: 'Nowhere' },
      undefined,
      lookup('mh_sessions_mumbai_city'),
    );
    expect(ctx.place).toBe(PLACE_BLANK);
  });
});

describe('T-410 consumerForum', () => {
  const consumer = COURTS.filter((c) => c.courtType === 'consumer_commission');

  it('covers 116 consumer records: 80 district, 36 state', () => {
    expect(consumer).toHaveLength(116);
    const forums = consumer.map((c) => consumerForum(lookup(c.courtId)));
    expect(forums.filter((f) => f === 'district')).toHaveLength(80);
    expect(forums.filter((f) => f === 'state')).toHaveLength(36);
  });

  it('district records say DISTRICT and state records say STATE in the designation', () => {
    for (const c of consumer) {
      const forum = consumerForum(lookup(c.courtId));
      if (forum === 'district') expect(c.designation).toMatch(/DISTRICT CONSUMER/i);
      else expect(c.designation).toMatch(/STATE CONSUMER/i);
    }
  });

  it('ncdrc is national', () => {
    expect(consumerForum(lookup('ncdrc_delhi'))).toBe('national');
  });

  it.each([...NON_COMMISSION, 'sc_india'].filter((id) => COURTS.some((c) => c.courtId === id)))(
    '%s is null',
    (id) => {
      expect(consumerForum(lookup(id))).toBeNull();
    },
  );

  it('is null with no court, and for a Commission whose designation names neither level', () => {
    expect(consumerForum(undefined)).toBeNull();
    expect(
      consumerForum({
        ...lookup('patna_dccdrc'),
        designation: 'BEFORE THE CONSUMER COMMISSION, PATNA',
      }),
    ).toBeNull();
  });

  it('only 116 + 1 courts are a Commission across the whole list', () => {
    const commissions = COURTS.filter((c) => consumerForum(lookup(c.courtId)) !== null);
    expect(commissions).toHaveLength(117);
  });
});

describe('T-410 other packs are unaffected', () => {
  it('bail_regular at allahabad_hc keeps its case line and court header', () => {
    const bail = loadTemplateConfig('bail_regular') as TemplateConfig;
    const ctx = buildPlaceholderContext(bail, FORM, undefined, lookup('allahabad_hc'));
    expect(ctx.case_nomenclature).toContain(
      court('allahabad_hc').caseNomenclature?.replace('{current_year}', YEAR),
    );
    expect(ctx.case_nomenclature).not.toBe(CONSUMER_COMMISSION_BLANK);
    expect(ctx.court_header).toBe('IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD');
    expect(ctx.court_designation).not.toBe(CONSUMER_COMMISSION_BLANK);
    expect(ctx.complaint_heading_text).toBeUndefined();
  });
});

describe('T-412: the 21 December 2021 date', () => {
  function filesUnder(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? filesUnder(p) : [p];
    });
  }

  it('no file under apps/drafting/src/config or docs/templates contains any form of it', () => {
    const files = [...filesUnder(CONFIG_DIR), ...filesUnder(TEMPLATES_DIR)];
    expect(files.length).toBeGreaterThan(100);
    const forms = ['21 December 2021', '21 Dec', '21.12.2021', '21/12/2021', '21-12-2021'];
    const hits = files.flatMap((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return forms
        .filter((x) => text.includes(x))
        .map((x) => `${path.relative(REPO_ROOT, f)}: ${x}`);
    });
    expect(hits).toEqual([]);
  });

  it('the consumer_commission_generic rule carries the Rules citation twice', () => {
    const raw = fs.readFileSync(
      path.join(CONFIG_DIR, 'court-rules', 'consumer_commission_generic.json'),
      'utf8',
    );
    expect(raw.split(`(per the ${RULES_CITATION})`)).toHaveLength(3);
  });

  it('the prompt holds the Rules citation and is otherwise unchanged', () => {
    const body = section(COMPLAINT, 'body') as DocumentSection & { prompt_context?: string };
    const current = body.prompt_context as string;
    expect(current).toContain(`Per the ${RULES_CITATION},`);

    let baseline: {
      document_structure: { sections: { section_id: string; prompt_context?: string }[] };
    };
    try {
      baseline = JSON.parse(
        execFileSync(
          'git',
          ['show', 'origin/develop_staging:docs/templates/consumer_complaint.json'],
          {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
          },
        ),
      );
    } catch {
      throw new Error('origin/develop_staging is not available: fetch it to run this test');
    }
    const old = baseline.document_structure.sections.find((s) => s.section_id === 'body')
      ?.prompt_context as string;
    expect(old).toContain('CPA (Jurisdiction) Notification dated 21 December 2021,');
    // Two signed edits only: T-412 (citation) and Ajay 4e42ef8 (opening drops "Section 35 of").
    const expected = old
      .replace('CPA (Jurisdiction) Notification dated 21 December 2021,', `the ${RULES_CITATION},`)
      .replace(
        'Complaint under Section 35 of the Consumer Protection Act, 2019. Structure:',
        'Complaint under the Consumer Protection Act, 2019. Structure:',
      );
    expect(current).toBe(expected);
  });
});

describe('T-410 pack metadata and NCDRC rule', () => {
  it('display_name and description name all three Commissions', () => {
    expect(COMPLAINT.display_name).toBe('Consumer Complaint');
    expect((COMPLAINT as unknown as { description: string }).description).toBe(
      'Consumer complaint under the Consumer Protection Act, 2019, before the District, State or National Consumer Disputes Redressal Commission',
    );
  });

  it('ncdrc.json has no "10 Crore" and states the 2 Crore limit with the Rules citation', () => {
    const raw = fs.readFileSync(path.join(CONFIG_DIR, 'court-rules', 'ncdrc.json'), 'utf8');
    expect(raw).not.toMatch(/10 Crore/i);
    expect(raw.split(`Rs. 2 Crore (per the ${RULES_CITATION})`).length).toBeGreaterThanOrEqual(3);
  });

  it('the body prompt opens with the Act, not Section 35', () => {
    const body = section(COMPLAINT, 'body') as DocumentSection & { prompt_context?: string };
    const opening = (body.prompt_context as string).split('\n')[0];
    expect(opening).toContain('under the Consumer Protection Act, 2019');
    expect(opening).not.toContain('Section 35');
  });
});

describe('T-410 AI system prompt for consumer_complaint', () => {
  // ai.service passes the chosen court's own rule; the engine must not let it leak.
  it.each([...NON_COMMISSION, 'sc_india'].filter((id) => COURTS.some((c) => c.courtId === id)))(
    '%s: consumer party designations only',
    (id) => {
      const prompt = buildAISystemPrompt(COMPLAINT, lookup(id).courtRule, lookup(id));
      expect(prompt).not.toContain('State of');
      expect(prompt).not.toContain('S.H.O.');
      expect(prompt).toContain('Complainant');
      expect(prompt).toContain('Opposite Party');
    },
  );

  it('no court rule at all: Complainant / Opposite Party, no State of, no S.H.O.', () => {
    const prompt = buildAISystemPrompt(COMPLAINT, undefined);
    expect(prompt).not.toContain('State of');
    expect(prompt).not.toContain('S.H.O.');
    expect(prompt).toContain('Complainant');
    expect(prompt).toContain('Opposite Party');
  });

  it('a Commission keeps Complainant / Opposite Party too', () => {
    const prompt = buildAISystemPrompt(
      COMPLAINT,
      lookup('patna_dccdrc').courtRule,
      lookup('patna_dccdrc'),
    );
    expect(prompt).toContain('Complainant');
    expect(prompt).toContain('Opposite Party');
  });
});

describe('T-410 AI system prompt: court-specific rules by level', () => {
  // The RELATED ACTS line names all three levels in the Rules' pecuniary limits
  // ("District Commission up to Rs.50 Lakh, State ..."): pack text, not a court rule.
  // Reported to the lead; this test looks at everything else in the prompt.
  const promptAt = (id: string): string =>
    buildAISystemPrompt(COMPLAINT, lookup(id).courtRule, lookup(id))
      .split('\n')
      .filter((l) => !l.startsWith('RELATED ACTS:'))
      .join('\n');

  it.each(['bihar_state_consumer_patna', 'mh_state_consumer_mumbai'])(
    '%s (State Commission): no "District Commission"',
    (id) => {
      expect(promptAt(id)).not.toContain('District Commission');
    },
  );

  it.each(NON_COMMISSION)('%s: no "District Commission" and no court-specific rules', (id) => {
    const prompt = promptAt(id);
    expect(prompt).not.toContain('District Commission');
    expect(prompt).not.toContain('COURT-SPECIFIC RULES');
  });

  it('patna_dccdrc (District Commission) keeps the District lines', () => {
    const prompt = promptAt('patna_dccdrc');
    expect(prompt).toContain('COURT-SPECIFIC RULES');
    expect(prompt).toContain('District Commission');
  });

  // Ajay 796e177: the exemption holds only while the line is byte-equal to the signed
  // related_acts text in docs/templates/consumer_complaint.json, so nothing else hides in it.
  it.each(['patna_dccdrc', 'bihar_state_consumer_patna', 'ncdrc_delhi', ...NON_COMMISSION])(
    '%s: the RELATED ACTS line is byte-equal to the signed related_acts',
    (id) => {
      const signed = JSON.parse(
        fs.readFileSync(path.join(TEMPLATES_DIR, 'consumer_complaint.json'), 'utf8'),
      ).related_acts as string[];
      const full = buildAISystemPrompt(COMPLAINT, lookup(id).courtRule, lookup(id));
      const lines = full.split('\n').filter((l) => l.startsWith('RELATED ACTS:'));
      expect(lines).toEqual([`RELATED ACTS: ${signed.join(', ')}`]);
    },
  );
});
