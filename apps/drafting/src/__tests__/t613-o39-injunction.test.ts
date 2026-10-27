/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-613 (Ajay, signed 26 Oct 2026, handoff/legal/T-613-o39-injunction-signed.md): the Order 39
 * temporary injunction pack and the civil-court / State lists.
 *
 * Every signed string is typed here on purpose, byte for byte: a code change cannot move them.
 * The test does not read handoff/.
 *
 *  F1  the cause title carries both parties                                      (A)
 *  F2  the suit number prints as given; blank -> "Suit No. _____ of {year}"      (A)
 *  F4  main_suit_relief (and restraint_sought, title_document_date, suit_number) (B)
 *  F5  prayer (a) is built on restraint_sought and {subject_matter}              (C)
 *  F5  the body: nine signed lines, no "Para N", no Order 25                     (D)
 *  F7  docType injunction, not petition                                          (E)
 *  F8  Civil Court (Junior Division), Patna                                      (F)
 *  F9  one shared State list; the O.39 court scope                               (G)
 *
 * No model call, no network. The routes run on the shipped courts list in an in-memory DB.
 */
import './setupEnv';
import './setupDb';
import { readFileSync } from 'fs';
import { join } from 'path';

import { DOC_TYPES } from '@lawie/shared';
import request from 'supertest';

import app from '../app';
import { Court } from '../models/Court.model';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  renderTemplateSection,
} from '../services/template-engine.service';

const SRC = join(__dirname, '..');
const O39 = 'temporary_injunction_o39';
const readSrc = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf-8');
const PACK: any = JSON.parse(readSrc('config', 'document-rules', `${O39}.json`));
const COURTS_DATA: any = JSON.parse(readSrc('config', 'courts', 'indian-courts.json'));
const ALL_ROWS: Array<Record<string, any>> = COURTS_DATA.courts;
const fieldOf = (id: string): any => PACK.form_schema.fields.find((f: any) => f.id === id);

// ── Ajay's signed strings ────────────────────────────────────────────────────────────────

const SIGNED_CAUSE_TITLE =
  'IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\nI.A. No. _____ of {current_year}\nin\n{suit_number}\n\nIN THE MATTER OF:\n{plaintiff_name} ... Plaintiff/Applicant\nVERSUS\n{defendant_name} ... Defendant/Non-Applicant';
const SIGNED_NOMENCLATURE = 'I.A. No. _____ of {current_year}';

const SIGNED_PRAYER_A =
  'a) Grant a temporary injunction under Order 39 Rules 1 and 2 read with Section 151 CPC restraining the Defendant/Non-Applicant, and all persons acting through or claiming under the Defendant/Non-Applicant, from {restraint_sought} in respect of the suit property described as {subject_matter}, pending final disposal of the suit;';

const SIGNED_BODY_LINES = [
  'Set out the application in this order, each point in its own paragraph or paragraphs:',
  'The main suit: its number as given, the parties and the cause of action.',
  "A brief recap of the plaintiff's case in the main suit, including the relief the suit seeks as given in main_suit_relief.",
  "The plaintiff's legal right, title or possession, with the title document and its date only as the brief gives them.",
  'The specific acts of the defendant, threatened or actual, with dates and particulars only as the brief gives them.',
  'Prima facie case: there is a serious question to be tried.',
  'Balance of convenience: the plaintiff would suffer greater hardship if the relief is refused.',
  'Irreparable injury: why damages would not be an adequate remedy.',
  "The plaintiff's undertaking to compensate the defendant for any loss if the injunction is later found to have been wrongly obtained.",
];

const SIGNED_SUIT_QUESTION =
  'What is the number of the main suit (for example, Title Suit No. 245 of 2026)? If the suit is filed with this application and has no number yet, leave it blank.';
const SIGNED_RESTRAINT_LABEL = 'Acts the defendant should be restrained from';
const SIGNED_RESTRAINT_QUESTION =
  'What should the defendant be stopped from doing from now on (for example: raising any construction, transferring or mortgaging the property, dispossessing the plaintiff)? Describe the acts, not past events.';
const SIGNED_MAIN_RELIEF_LABEL = 'Relief sought in the main suit';
const SIGNED_MAIN_RELIEF_QUESTION = 'What relief does the main suit ask for?';
const SIGNED_TITLE_DATE_LABEL = 'Date of the title document (sale deed, gift deed or other)';
const SIGNED_TITLE_DATE_QUESTION =
  'What is the date of the document under which the plaintiff claims the suit property (sale deed, gift deed, will or other)? If the claim does not rest on a document, leave it blank.';

const JUNIOR_DESIGNATION = 'IN THE COURT OF CIVIL JUDGE (JUNIOR DIVISION), PATNA';
const JUNIOR_LABEL = 'Civil Court (Junior Division)';

// ── A. Cause title (F1, F2) ──────────────────────────────────────────────────────────────

describe('T-613 A: O.39 cause title', () => {
  const year = String(new Date().getFullYear());
  const junior = ALL_ROWS.find((r) => r.courtId === 'bihar_civil_junior_patna')!;

  function causeTitle(form: Record<string, unknown>): string {
    clearConfigCache();
    const config = loadTemplateConfig(O39)!;
    expect(config).not.toBeNull();
    const courtData: any = {
      designation: junior.designation,
      city: junior.city,
      caseNomenclature: junior.caseNomenclature,
      formattingRulesRef: junior.formattingRulesRef,
      courtType: junior.courtType,
      state: junior.state,
    };
    const ctx = buildPlaceholderContext(
      config,
      { court_name: junior.courtId, ...form },
      { advocateName: 'Adv. A' },
      courtData,
    );
    const section = config.document_structure.sections.find(
      (s: any) => s.section_id === 'cause_title',
    )!;
    expect(section).toBeDefined();
    return renderTemplateSection(section, ctx).content;
  }

  it('the pack carries the signed cause-title format and nomenclature, byte for byte', () => {
    expect(PACK.causeTitle.format).toBe(SIGNED_CAUSE_TITLE);
    expect(PACK.causeTitle.caseNomenclature).toBe(SIGNED_NOMENCLATURE);
    expect(PACK.causeTitle.partyDesignations).toEqual([
      { role: 'plaintiff', label: 'Plaintiff/Applicant' },
      { role: 'defendant', label: 'Defendant/Non-Applicant' },
    ]);
  });

  it('F1: both parties print, with their labels', () => {
    const t = causeTitle({
      plaintiff_name: 'Ram Kumar Singh',
      defendant_name: 'Shyam Lal Verma',
      suit_number: 'Title Suit No. 245 of 2026',
    });
    expect(t).toContain('Ram Kumar Singh ... Plaintiff/Applicant');
    expect(t).toContain('VERSUS');
    expect(t).toContain('Shyam Lal Verma ... Defendant/Non-Applicant');
    expect(t).not.toMatch(/_{3,}\s*\.\.\.\s*Plaintiff/);
    expect(t).not.toMatch(/_{3,}\s*\.\.\.\s*Defendant/);
  });

  it('F2: the suit number prints as the user gave it, under the I.A. line; no "Civil Suit No."', () => {
    const t = causeTitle({
      plaintiff_name: 'Ram Kumar Singh',
      defendant_name: 'Shyam Lal Verma',
      suit_number: 'Title Suit No. 245 of 2026',
    });
    expect(t).toContain(
      `I.A. No. _____ of ${year}\nin\nTitle Suit No. 245 of 2026\n\nIN THE MATTER OF:`,
    );
    expect(t).not.toContain('Civil Suit No.');
    expect(t).not.toMatch(/\{[A-Za-z_]+\}/);
  });

  it('F2: a suit number of another kind is not rewritten (never guess the suit type)', () => {
    const t = causeTitle({
      plaintiff_name: 'A',
      defendant_name: 'B',
      suit_number: 'Money Suit No. 7 of 2025',
    });
    expect(t).toContain('Money Suit No. 7 of 2025');
    expect(t).not.toContain('Title Suit');
    expect(t).not.toContain('Civil Suit No.');
  });

  it.each([
    ['absent', {}],
    ['empty', { suit_number: '' }],
    ['spaces', { suit_number: '   ' }],
  ])('F2: a suit number that is %s prints "Suit No. _____ of <year>"', (_n, extra) => {
    const t = causeTitle({ plaintiff_name: 'Ram Kumar', defendant_name: 'Shyam Lal', ...extra });
    expect(t).toContain(
      `I.A. No. _____ of ${year}\nin\nSuit No. _____ of ${year}\n\nIN THE MATTER OF:`,
    );
    expect(t).not.toContain('Civil Suit No.');
    expect(t).not.toContain('[To be confirmed');
    expect(t).not.toContain('{{MISSING');
    expect(t).toContain('Ram Kumar ... Plaintiff/Applicant');
    expect(t).toContain('Shyam Lal ... Defendant/Non-Applicant');
  });

  it('the court heading comes from the chosen Junior Division record', () => {
    const t = causeTitle({ plaintiff_name: 'A', defendant_name: 'B', suit_number: 'TS 1 of 2026' });
    expect(t).toContain('CIVIL JUDGE (JUNIOR DIVISION), PATNA');
    // The engine strips a leading "IN THE COURT OF" from the record designation (header
    // split in template-engine.service.ts), and the signed title adds it once.
    expect(t.split('\n').slice(0, 3)).toEqual([JUNIOR_DESIGNATION, 'AT Patna', '']);
    expect(t).not.toMatch(/IN THE COURT OF\s+IN THE COURT OF/);
    expect(t.match(/IN THE COURT OF/g)).toHaveLength(1);
  });
});

// ── B. Fields (F4, ruling (i) 1 and 2) ───────────────────────────────────────────────────

describe('T-613 B: pack fields', () => {
  it('main_suit_relief: required textarea, signed label and question', () => {
    const f = fieldOf('main_suit_relief');
    expect(f).toBeDefined();
    expect(f.type).toBe('textarea');
    expect(f.required).toBe(true);
    expect(f.label).toBe(SIGNED_MAIN_RELIEF_LABEL);
    expect(f.question).toBe(SIGNED_MAIN_RELIEF_QUESTION);
  });

  it('restraint_sought: required textarea, signed label and question', () => {
    const f = fieldOf('restraint_sought');
    expect(f).toBeDefined();
    expect(f.type).toBe('textarea');
    expect(f.required).toBe(true);
    expect(f.label).toBe(SIGNED_RESTRAINT_LABEL);
    expect(f.question).toBe(SIGNED_RESTRAINT_QUESTION);
  });

  it('title_document_date: a date, not required, asked when empty, signed label and question', () => {
    const f = fieldOf('title_document_date');
    expect(f).toBeDefined();
    expect(f.type).toBe('date');
    expect(f.required).toBe(false);
    expect(f.ask_when_empty).toBe(true);
    expect(f.label).toBe(SIGNED_TITLE_DATE_LABEL);
    expect(f.question).toBe(SIGNED_TITLE_DATE_QUESTION);
    // ruling (i) 2 replaced the "None" wording
    expect(f.question).not.toContain('"None"');
  });

  it('suit_number: optional, asked when empty, signed question', () => {
    const f = fieldOf('suit_number');
    expect(f).toBeDefined();
    expect(f.required).toBe(false);
    expect(f.ask_when_empty).toBe(true);
    expect(f.question).toBe(SIGNED_SUIT_QUESTION);
  });

  it('plaintiff_name and defendant_name stay required', () => {
    expect(fieldOf('plaintiff_name').required).toBe(true);
    expect(fieldOf('defendant_name').required).toBe(true);
  });

  it('no field id appears twice', () => {
    const idList: string[] = PACK.form_schema.fields.map((f: any) => f.id);
    expect(new Set(idList).size).toBe(idList.length);
  });

  it('"suit_number must be filled" is gone from the validation rules; the other rules stay', () => {
    const rules: string[] = PACK.validation_rules;
    expect(rules.some((r) => /suit_number/.test(r))).toBe(false);
    expect(rules).toEqual(
      expect.arrayContaining([
        'prima_facie_case must not be empty',
        'balance_of_convenience must not be empty',
        'irreparable_injury must not be empty',
      ]),
    );
  });

  it('every {placeholder} of the cause title and prayer is a declared field or an engine value', () => {
    const declared = new Set<string>(PACK.form_schema.fields.map((f: any) => f.id));
    const engine = new Set(['courtDesignation', 'courtPlace', 'current_year']);
    const text = [PACK.causeTitle.format, PACK.prayerTemplate].join('\n');
    const used = Array.from(text.matchAll(/\{([A-Za-z_]+)\}/g)).map((m) => m[1]);
    const unknown = used.filter((k) => !declared.has(k) && !engine.has(k));
    expect(unknown).toEqual([]);
  });
});

// ── C. Prayer (a) (F5) ───────────────────────────────────────────────────────────────────

describe('T-613 C: prayer', () => {
  const prayer: string = PACK.prayerTemplate;
  const clauses = prayer.split('\n\n');
  const clause = (letter: string) => clauses.find((c) => c.startsWith(`${letter}) `));

  it('prayer (a) is the signed line, byte for byte', () => {
    expect(clause('a')).toBe(SIGNED_PRAYER_A);
  });

  it('prayer (a) is built on {restraint_sought} and {subject_matter}, never {acts_complained_of}', () => {
    const a = clause('a')!;
    expect(a).toContain('{restraint_sought}');
    expect(a).toContain('{subject_matter}');
    expect(a).not.toContain('{acts_complained_of}');
  });

  it('{acts_complained_of} is nowhere in the prayer', () => {
    expect(prayer).not.toContain('acts_complained_of');
  });

  it('"his" appears nowhere in the prayer (gender-neutral)', () => {
    expect(prayer).not.toMatch(/\bhis\b/i);
    expect(prayer).not.toMatch(/\b(him|her|hers)\b/i);
  });

  it('{subject_matter} is a declared field', () => {
    expect(fieldOf('subject_matter')).toBeDefined();
  });

  it('prayers (b) to (d) and the closing line are unchanged', () => {
    expect(clause('b')).toBe(
      'b) In the alternative and pending notice to the Non-Applicant, grant an ad-interim ex parte order in terms of prayer (a) above for the reasons stated hereinabove, in exercise of powers under the proviso to Order 39 Rule 3 CPC;',
    );
    expect(clause('c')).toBe('c) Award costs of this application;');
    expect(clause('d')).toBe(
      "d) Pass any other order(s) as this Hon'ble Court may deem fit and proper in the interest of justice.",
    );
    expect(clauses[clauses.length - 1]).toBe(
      'And for this act of kindness, the Applicant shall ever pray.',
    );
  });
});

// ── D. Body instructions (F5, ruling (f)) ────────────────────────────────────────────────

describe('T-613 D: body instructions', () => {
  const lines: string[] = PACK.prompt_context.promptInstructions;

  it('the nine signed lines are present, byte for byte, in the signed order, together', () => {
    const start = lines.indexOf(SIGNED_BODY_LINES[0]);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(lines.slice(start, start + SIGNED_BODY_LINES.length)).toEqual(SIGNED_BODY_LINES);
  });

  it('no "Para N:" numbering is left', () => {
    expect(lines.some((l) => /^Para\s*\d/i.test(l))).toBe(false);
    expect(JSON.stringify(PACK)).not.toMatch(/Para \d/);
  });

  it('Order 25 is cited nowhere in the pack (O.25 R.1 is security for costs)', () => {
    expect(JSON.stringify(PACK)).not.toMatch(/Order 25/i);
    expect(JSON.stringify(PACK)).not.toMatch(/O\.\s?25/);
  });

  it('"his" appears in none of the nine signed lines', () => {
    for (const l of SIGNED_BODY_LINES) expect(l).not.toMatch(/\bhis\b/i);
  });

  it('the unchanged O.39 and triple-test instructions are kept', () => {
    expect(lines.some((l) => l.startsWith('Order 39 R.1 '))).toBe(true);
    expect(lines.some((l) => l.startsWith('Triple test'))).toBe(true);
    expect(lines.some((l) => l.startsWith('If ex parte sought'))).toBe(true);
  });
});

// ── E. docType (F7) ──────────────────────────────────────────────────────────────────────

describe('T-613 E: docType', () => {
  // TEMPLATE_TO_DOC_TYPE is private to documents.routes.ts and a full generate run needs a model,
  // so the map is pinned from its source text.
  const routes = readSrc('routes', 'documents.routes.ts');
  const from = routes.indexOf('const TEMPLATE_TO_DOC_TYPE');
  const map = routes.slice(from, routes.indexOf('};', from));

  it('temporary_injunction_o39 maps to DOC_TYPES.INJUNCTION, not PETITION', () => {
    expect(from).toBeGreaterThanOrEqual(0);
    expect(map).toMatch(/temporary_injunction_o39:\s*DOC_TYPES\.INJUNCTION/);
    expect(map).not.toMatch(/temporary_injunction_o39:\s*DOC_TYPES\.PETITION/);
  });

  it('DOC_TYPES.INJUNCTION is "injunction", and is not "petition"', () => {
    expect(DOC_TYPES.INJUNCTION).toBe('injunction');
    expect(DOC_TYPES.INJUNCTION).not.toBe(DOC_TYPES.PETITION);
  });

  it('the other mapped templates are unchanged', () => {
    expect(map).toMatch(/writ_petition:\s*DOC_TYPES\.PETITION/);
    expect(map).toMatch(/criminal_complaint:\s*DOC_TYPES\.COMPLAINT/);
    expect(map).toMatch(/plaint_civil:\s*DOC_TYPES\.PLAINT/);
  });
});

// ── F, G. Courts and States (F8, F9) ─────────────────────────────────────────────────────

interface StateRow {
  id: string;
  name: string;
}
interface CourtRow {
  courtId: string;
  courtType: string;
  stateId?: string;
  [k: string]: unknown;
}

const get = (url: string) => request(app).get(url);
const statesOf = async (q = ''): Promise<StateRow[]> =>
  (await get(`/courts/states${q}`)).body.states;
const courtsOf = async (q = ''): Promise<CourtRow[]> => (await get(`/courts${q}`)).body.courts;
const stateIds = (s: StateRow[]) => s.map((x) => x.id);

// The O.39 court levels (Ajay ruling (i) 3). commercial_court, high_court_original_side and
// commercial_division_high_court have no record in the data yet; they show when one is added.
const O39_TYPES = [
  'civil_court',
  'civil_court_junior',
  'district_court',
  'commercial_court',
  'high_court_original_side',
  'commercial_division_high_court',
];
const BAIL_PACKS = [
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'bail_cancellation',
];

describe('T-613 F: Civil Court (Junior Division), Patna', () => {
  it('the data has the signed Junior Division record, and the Senior one is untouched', () => {
    const j = ALL_ROWS.find((r) => r.courtId === 'bihar_civil_junior_patna')!;
    expect(j).toBeDefined();
    expect(j.designation).toBe(JUNIOR_DESIGNATION);
    expect(j.courtType).toBe('civil_court_junior');
    expect(j.stateId).toBe('bihar');
    expect(j.city).toBe('Patna');
    expect(j.formattingRulesRef).toBe('district_court_generic');
    const s = ALL_ROWS.find((r) => r.courtId === 'bihar_civil_patna')!;
    expect(s.courtType).toBe('civil_court');
    expect(s.designation).toBe('IN THE COURT OF CIVIL JUDGE (SENIOR DIVISION), PATNA');
  });

  it('the court-type list of the data names civil_court_junior as signed', () => {
    const entry = (COURTS_DATA.court_types as Array<{ id: string; label: string }>).find(
      (x) => x.id === 'civil_court_junior',
    );
    expect(entry).toEqual({ id: 'civil_court_junior', label: JUNIOR_LABEL });
  });

  it('v1 holds exactly one Junior and one Senior civil-court record, both in Patna', () => {
    const civil = ALL_ROWS.filter(
      (r) => r.courtType === 'civil_court' || r.courtType === 'civil_court_junior',
    );
    expect(civil.map((r) => r.courtId).sort()).toEqual([
      'bihar_civil_junior_patna',
      'bihar_civil_patna',
    ]);
    expect(civil.every((r) => r.city === 'Patna')).toBe(true);
  });

  describe('through the routes', () => {
    beforeEach(async () => {
      await Court.collection.insertMany(ALL_ROWS.map((r) => ({ ...r, isActive: true })) as never[]);
    });

    it('GET /courts/types?state=bihar lists "Civil Court (Junior Division)" and keeps the Senior label', async () => {
      const res = await get('/courts/types?state=bihar');
      expect(res.status).toBe(200);
      const types: Array<{ id: string; label: string }> = res.body.types;
      expect(types).toContainEqual({ id: 'civil_court_junior', label: JUNIOR_LABEL });
      expect(types).toContainEqual({ id: 'civil_court', label: 'Civil Court (Senior Division)' });
    });

    it('GET /courts/types?state=bihar&template=O.39 lists the Junior and Senior Division', async () => {
      const res = await get(`/courts/types?state=bihar&template=${O39}`);
      expect(res.status).toBe(200);
      const types: Array<{ id: string; label: string }> = res.body.types;
      expect(types).toContainEqual({ id: 'civil_court_junior', label: JUNIOR_LABEL });
      expect(types).toContainEqual({ id: 'civil_court', label: 'Civil Court (Senior Division)' });
    });

    it('GET /courts?state=bihar&type=civil_court_junior&template=O.39 returns the Patna record', async () => {
      const list = await courtsOf(`?state=bihar&type=civil_court_junior&template=${O39}`);
      expect(list.map((c) => c.courtId)).toEqual(['bihar_civil_junior_patna']);
      expect(list[0].name).toBe('Civil Court (Junior Division), Patna');
    });

    it('GET /courts/:courtId carries the signed designation', async () => {
      const res = await get('/courts/bihar_civil_junior_patna');
      expect(res.status).toBe(200);
      expect(res.body.court?.designation ?? res.body.designation).toBe(JUNIOR_DESIGNATION);
    });
  });
});

describe('T-613 G: one State list, and the O.39 court scope', () => {
  describe('data: one canonical State list', () => {
    it('every court stateId is a canonical State id; the old "an" id is gone', () => {
      const canonical = new Set<string>(COURTS_DATA.states.map((s: StateRow) => s.id));
      const stray = Array.from(new Set(ALL_ROWS.map((r) => r.stateId as string))).filter(
        (i) => !canonical.has(i),
      );
      expect(stray).toEqual([]);
      expect(ALL_ROWS.some((r) => r.stateId === 'an')).toBe(false);
    });

    it('the Port Blair consumer commission is filed under andaman_nicobar', () => {
      const r = ALL_ROWS.find((x) => x.courtId === 'an_state_consumer_port_blair')!;
      expect(r.stateId).toBe('andaman_nicobar');
    });
  });

  describe('routes', () => {
    beforeEach(async () => {
      await Court.collection.insertMany(ALL_ROWS.map((r) => ({ ...r, isActive: true })) as never[]);
    });

    describe('unscoped GET /courts/states', () => {
      it('lists Andaman once, under its canonical id and name', async () => {
        const s = await statesOf();
        const andaman = s.filter((x) => /andaman/i.test(x.id) || /andaman/i.test(x.name));
        expect(andaman).toEqual([
          { id: 'andaman_nicobar', name: 'Andaman and Nicobar Islands (UT)' },
        ]);
      });

      it('has one entry per id, each named from the canonical list', async () => {
        const s = await statesOf();
        expect(new Set(stateIds(s)).size).toBe(s.length);
        const canonical = new Map<string, string>(
          COURTS_DATA.states.map((x: StateRow) => [x.id, x.name]),
        );
        for (const x of s) expect([x.id, x.name]).toEqual([x.id, canonical.get(x.id)]);
      });

      it('still lists the national "india" (the generic picker is the way to the Supreme Court)', async () => {
        expect(await statesOf()).toContainEqual({ id: 'india', name: 'India (Union)' });
      });
    });

    describe('O.39-scoped lists', () => {
      it('/states: no "india", no duplicates, no "an"; Bihar is there', async () => {
        const s = await statesOf(`?template=${O39}`);
        const ids = stateIds(s);
        expect(ids).not.toContain('india');
        expect(s.some((x) => /^india/i.test(x.name))).toBe(false);
        expect(ids).not.toContain('an');
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain('bihar');
      });

      it('/states: exactly the States that have an O.39 civil / district record', async () => {
        const expected = new Set(
          ALL_ROWS.filter((r) => O39_TYPES.includes(r.courtType)).map((r) => r.stateId as string),
        );
        expect(new Set(stateIds(await statesOf(`?template=${O39}`)))).toEqual(expected);
      });

      it('/courts: only the allowed court types; no supreme_court, NCLAT, tribunal or consumer', async () => {
        const list = await courtsOf(`?template=${O39}`);
        expect(list.length).toBeGreaterThan(0);
        const types = Array.from(new Set(list.map((c) => c.courtType)));
        for (const t of types) expect(O39_TYPES).toContain(t);
        for (const bad of [
          'supreme_court',
          'tribunal',
          'consumer_commission',
          'high_court',
          'sessions',
          'jmfc',
          'cjm',
        ]) {
          expect(types).not.toContain(bad);
        }
        expect(list.some((c) => /nclat|nclt|ncdrc|supreme/i.test(c.courtId))).toBe(false);
        expect(list.some((c) => c.stateId === 'india')).toBe(false);
      });

      it('/courts: every record of an allowed type is offered, Junior and Senior Patna included', async () => {
        const list = await courtsOf(`?template=${O39}`);
        const expected = ALL_ROWS.filter((r) => O39_TYPES.includes(r.courtType))
          .map((r) => r.courtId as string)
          .sort();
        expect(list.map((c) => c.courtId).sort()).toEqual(expected);
        expect(expected).toEqual(
          expect.arrayContaining([
            'bihar_civil_junior_patna',
            'bihar_civil_patna',
            'bihar_district_patna',
          ]),
        );
      });

      it('/types: only allowed types, per State', async () => {
        for (const state of ['bihar', 'delhi', 'jharkhand']) {
          const res = await get(`/courts/types?state=${state}&template=${O39}`);
          expect(res.status).toBe(200);
          const ids: string[] = res.body.types.map((t: { id: string }) => t.id);
          expect(ids.length).toBeGreaterThan(0);
          for (const id of ids) expect(O39_TYPES).toContain(id);
        }
      });

      it('O.39 has no levels: a level param is a 400, as for the bail packs, never a wider list', async () => {
        for (const path of ['/courts', '/courts/states', '/courts/types']) {
          const res = await get(`${path}?template=${O39}&level=national`);
          expect(res.status).toBe(400);
          expect(res.body.courts).toBeUndefined();
          expect(res.body.states).toBeUndefined();
        }
      });

      it('an inactive record is not offered', async () => {
        await Court.collection.updateOne(
          { courtId: 'bihar_civil_junior_patna' },
          { $set: { isActive: false } },
        );
        const list = await courtsOf(`?state=bihar&type=civil_court_junior&template=${O39}`);
        expect(list).toEqual([]);
      });
    });

    describe('other scopes', () => {
      it.each(BAIL_PACKS)('bail pack %s: /states has no "india" (unchanged)', async (id) => {
        const ids = stateIds(await statesOf(`?template=${id}`));
        expect(ids).not.toContain('india');
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('a State named in both the bail and O.39 lists has the same name', async () => {
        const bail = await statesOf('?template=bail_regular');
        const o39 = await statesOf(`?template=${O39}`);
        const bailName = new Map(bail.map((x) => [x.id, x.name]));
        const shared = o39.filter((x) => bailName.has(x.id));
        expect(shared.length).toBeGreaterThan(0);
        for (const x of shared) expect(bailName.get(x.id)).toBe(x.name);
      });

      it('consumer_complaint level=national still lists india', async () => {
        expect(await statesOf('?template=consumer_complaint&level=national')).toEqual([
          { id: 'india', name: 'India (Union)' },
        ]);
      });

      it('consumer_complaint with no level still lists india', async () => {
        expect(stateIds(await statesOf('?template=consumer_complaint'))).toContain('india');
      });

      it('consumer_complaint level=state and level=district list no india', async () => {
        expect(stateIds(await statesOf('?template=consumer_complaint&level=state'))).not.toContain(
          'india',
        );
        expect(
          stateIds(await statesOf('?template=consumer_complaint&level=district')),
        ).not.toContain('india');
      });

      it('maintenance_bnss_144 /states has no india', async () => {
        expect(stateIds(await statesOf('?template=maintenance_bnss_144'))).not.toContain('india');
      });

      it('another template (plaint_injunction) is not narrowed: the unscoped lists', async () => {
        expect(await statesOf('?template=plaint_injunction')).toEqual(await statesOf());
        expect((await courtsOf('?template=plaint_injunction')).length).toBe(
          (await courtsOf()).length,
        );
      });
    });
  });
});
