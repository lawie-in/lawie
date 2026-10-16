/**
 * T-363 — s.138 notice: the 30-day warning, dates in words, the notice wording.
 * Ajay's signed text: handoff/legal/T-363-s138-notice-wording-signed.md (+ Addendum 1 and 2).
 *
 * AC1 brief carries date_check (B2) only for legal_notice_s138 and only when the dates trip it
 * AC2 dates in words fill the memo-received and notice dates; no year stays unread
 * AC3 the twin's demand clause is Ajay's two sentences; nothing says the offence is complete early
 * AC4 proprietor / address blocks, and the averments file (hash pinned)
 *
 * No model call and no database.
 */
import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  buildBrief,
  buildChecklist,
  checkRead,
  type ChecklistItem,
  type GivenValue,
} from '../services/intake-brief';
import { normalizeDate } from '@lawie/shared';
import type { LedgerFact } from '@lawie/shared';
import { datesAsWritten, datesInText } from '../services/intake-text';
import type { DocumentRuleConfig } from '../services/prompt-assembler';
import { generateFilingChecklist } from '../services/post-processor';
import { loadRulePack, readFilingChecklist } from '../services/rule-pack.service';
import {
  S138_COMPUTED_DISPLAYS,
  S138_COMPUTED_KEYS,
  S138_INPUT_KEYS,
  S138_LINE_TEXTS,
  s138BriefDateCheck,
  s138DateChecks,
  s138FactsFromBrief,
  withS138DateChecks,
} from '../services/s138-date-checks';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  replacePlaceholders,
} from '../services/template-engine.service';

const PACK = 'legal_notice_s138';
const kind = { id: PACK, name: 'Legal notice s.138', court_document: false };

function checklist(): ChecklistItem[] {
  const p = loadRulePack(PACK);
  if (!p) throw new Error('no pack');
  return buildChecklist(p);
}

function user(key: string, value: string): GivenValue {
  return { key, value, source: 'user' };
}

function briefWith(dates: Record<string, string>, id: string | null = PACK) {
  return buildBrief({
    kind: { ...kind, id },
    checklist: checklist(),
    values: Object.entries(dates).map(([k, v]) => user(k, v)),
  });
}

const B2_TEXT =
  'Notice not in time: the notice is sent on 30 October 2026, after 15 October 2026, the last of the 30 days from receipt of the return memo on 15 September 2026. Check the dates before sending.';

// ─────────────────────────────────────────────────────────────────────────────
// T-440 Q1 (Ajay, a9bc957): with no notice date the header's Date line is this blank, not
// today. It is the one blank these fixtures may print: it is removed before the no-blank checks.
const DATE_BLANK_LINE = 'Date: [To be confirmed: date the notice is sent]';
const withoutDateBlank = (s: string): string => {
  expect(s.split(DATE_BLANK_LINE).length - 1).toBeLessThanOrEqual(1);
  return s.replace(DATE_BLANK_LINE, '');
};

describe('T-363 AC1: the brief warns when the notice is outside 30 days', () => {
  it("Anushka's case (memo 15 Sep 2026, notice 30 Oct 2026) gives date_check B2 with the signed words", () => {
    const b = briefWith({ memo_received_date: '2026-09-15', notice_sent_date: '2026-10-30' });
    expect(b.date_check).toEqual({ line: 'B2', text: B2_TEXT });
    expect(b.date_check?.text).toBe(
      S138_LINE_TEXTS.B2.replace('{L5}', '30 October 2026')
        .replace('{end}', '15 October 2026')
        .replace('{L4}', '15 September 2026'),
    );
  });

  it('the confirm rule itself is unchanged: the server does not block (the client holds Confirm)', () => {
    const b = briefWith({ memo_received_date: '2026-09-15', notice_sent_date: '2026-10-30' });
    expect(b.can_confirm).toBe(
      buildBrief({ kind, checklist: checklist(), values: [] }).can_confirm,
    );
  });

  it.each([
    ['inside the 30 days', '2026-10-01'],
    ['the last day (15 Oct, s.9 counting)', '2026-10-15'],
  ])('%s: no date_check, and no key at all', (_n, sent) => {
    const b = briefWith({ memo_received_date: '2026-09-15', notice_sent_date: sent });
    expect(b.date_check).toBeUndefined();
    expect('date_check' in b).toBe(false);
  });

  it('the first day outside (16 Oct) trips it', () => {
    const b = briefWith({ memo_received_date: '2026-09-15', notice_sent_date: '2026-10-16' });
    expect(b.date_check?.line).toBe('B2');
  });

  it.each([
    [
      'notice before memo (B3)',
      { memo_received_date: '2026-09-15', notice_sent_date: '2026-09-01' },
    ],
    ['memo only (B4)', { memo_received_date: '2026-09-15' }],
    ['notice only (B5)', { notice_sent_date: '2026-10-30' }],
    ['neither', {}],
  ])('%s gives no date_check', (_n, dates) => {
    expect(briefWith(dates).date_check).toBeUndefined();
  });

  it('a date that is not one ISO date is read as missing, so nothing is guessed', () => {
    const b = briefWith({ memo_received_date: 'last week', notice_sent_date: '2026-10-30' });
    expect(b.date_check).toBeUndefined();
  });

  it.each(['bail_regular', 'ni_complaint_s138', 'nda', null])(
    'pack %s never gets a date_check, even with the same dates',
    (id) => {
      const items = [
        { key: 'memo_received_date', kind: 'date', value: '2026-09-15' },
        { key: 'notice_sent_date', kind: 'date', value: '2026-10-30' },
      ];
      expect(s138BriefDateCheck(id, items)).toBeNull();
    },
  );

  it('s138BriefDateCheck matches keys on their last segment and ignores non-date kinds', () => {
    const grouped = [
      { key: 'dates.memo_received_date', kind: 'date', value: '2026-09-15' },
      { key: 'dates.notice_sent_date', kind: 'date', value: '2026-10-30' },
    ];
    expect(s138BriefDateCheck(PACK, grouped)?.line).toBe('B2');
    const text = grouped.map((g) => ({ ...g, kind: 'text' }));
    expect(s138BriefDateCheck(PACK, text)).toBeNull();
    expect(s138FactsFromBrief(text)).toEqual([]);
  });

  it('brief facts are source user, never computed, so the banned entry stays banned', () => {
    const facts = s138FactsFromBrief([
      { key: 'memo_received_date', kind: 'date', value: '2026-09-15' },
      { key: 'notice_sent_date', kind: 'date', value: '2026-10-30' },
      { key: 'something_else', kind: 'date', value: '2026-10-30' },
      { key: 'cheque_date', kind: 'date', value: null },
    ]);
    expect(facts.map((f) => f.key)).toEqual(['memo_received_date', 'notice_sent_date']);
    expect(facts.every((f) => f.source === 'user')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('T-363 AC2: dates in words fill the memo and notice dates', () => {
  it.each([
    ['fifteenth September 2026', '2026-09-15'],
    ['Fifteenth September, 2026', '2026-09-15'],
    ['the thirtieth of October 2026', '2026-10-30'],
    ['the thirty-first of January 2026', '2026-01-31'],
    ['twenty first March 2026', '2026-03-21'],
    ['twenty-second Sept 2026', '2026-09-22'],
    ['first January 2026', '2026-01-01'],
  ])('reads %p as %s', (text, value) => {
    expect(datesInText(`memo came on ${text}.`)).toEqual([value]);
    expect(datesAsWritten(`memo came on ${text}.`)[0].value).toBe(value);
  });

  it('shows the words as the advocate wrote them', () => {
    const [d] = datesAsWritten('Return memo received on fifteenth September 2026.');
    expect(d.value).toBe('2026-09-15');
    expect(d.words.toLowerCase()).toContain('fifteenth');
  });

  it.each([
    'fifteenth September',
    'the fifteenth of September',
    'thirty-second September 2026',
    'thirty-first September 2026',
    'twenty-tenth March 2026',
  ])('leaves %p unread (no year, or not a real day)', (text) => {
    expect(datesInText(`memo ${text}.`)).toEqual([]);
  });

  it('the numeric and month-name formats still work', () => {
    const text =
      'a 15/09/2026, b 15-09-2026, c 15.09.2026, d 2026-09-15, e 15 September 2026, f 15th Sept 2026, g September 15, 2026';
    expect(datesInText(text)).toEqual(['2026-09-15']);
    expect(datesInText('on 3/4/2026 and 2026-10-30 and 1st Oct 2026')).toEqual([
      '2026-04-03',
      '2026-10-30',
      '2026-10-01',
    ]);
    expect(datesInText('31/02/2026')).toEqual([]);
  });

  it("the ledger normaliser (shared) and intake-text agree on Anushka's two dates", () => {
    for (const [words, value] of [
      ['fifteenth September 2026', '2026-09-15'],
      ['thirtieth October 2026', '2026-10-30'],
    ]) {
      expect(normalizeDate(words)).toMatchObject({ ok: true, value });
      expect(datesInText(`on ${words}.`)).toEqual([value]);
    }
  });

  it("both Anushka's dates in words fill memo_received_date and notice_sent_date and trip B2", () => {
    const text =
      'Return memo received on fifteenth September 2026. I will send the notice on thirtieth October 2026.';
    const list = checklist();
    const r = checkRead(list, text, {
      outcome: 'read',
      read: [
        {
          id: 'memo_received_date',
          value: '2026-09-15',
          quote: 'Return memo received on fifteenth September 2026',
        },
        {
          id: 'notice_sent_date',
          value: '2026-10-30',
          quote: 'I will send the notice on thirtieth October 2026',
        },
      ],
    });
    expect(r.values.get('memo_received_date')?.value).toBe('2026-09-15');
    expect(r.values.get('notice_sent_date')?.value).toBe('2026-10-30');
    const b = buildBrief({
      kind,
      checklist: list,
      values: [...r.values.entries()].map(([key, v]) => ({
        ...v,
        key,
        source: 'description' as const,
      })),
      description: text,
    });
    const byKey = new Map(b.items.map((i) => [i.key, i]));
    expect(byKey.get('memo_received_date')?.value).toBe('2026-09-15');
    expect(byKey.get('notice_sent_date')?.value).toBe('2026-10-30');
    expect(b.date_check?.line).toBe('B2');
  });

  it('a word date with no year is not filled', () => {
    const text = 'Return memo received on fifteenth September.';
    const r = checkRead(checklist(), text, {
      outcome: 'read',
      read: [
        {
          id: 'memo_received_date',
          value: '2026-09-15',
          quote: 'Return memo received on fifteenth September',
        },
      ],
    });
    expect(r.values.get('memo_received_date')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
const TWIN_PATH = join(__dirname, '../../../../docs/templates/legal_notice_s138.json');
const TWIN_RAW = readFileSync(TWIN_PATH, 'utf8');
const TWIN = JSON.parse(TWIN_RAW) as {
  document_structure: { sections: Array<Record<string, unknown>> };
  form_schema: { steps: Array<{ fields: Array<Record<string, unknown>> }> };
  validation_rules: Record<string, unknown>;
};
const section = (id: string) => TWIN.document_structure.sections.find((s) => s.section_id === id)!;
const allFields = TWIN.form_schema.steps.flatMap((s) => s.fields);

const DEMAND_SENTENCE =
  'I therefore call upon you to pay my client the said amount of Rs. {cheque_amount}, being the amount of the said cheque, within fifteen days of receipt of this notice.';
const AC3_LINE =
  'If you fail to pay the said amount within fifteen days of receipt of this notice, an offence punishable under Section 138 of the Negotiable Instruments Act, 1881 will be complete, and my client will initiate proceedings against you.';

describe('T-363 AC3: the notice never says the offence is complete at issue', () => {
  it("the demand_clause is DEMAND plus Ajay's two sentences, exactly", () => {
    // T-471: the heading is {demand_heading}, plain "DEMAND" unless s.141 paragraphs precede it
    // (rendered in t471-drawer-firm.test.ts); the two signed sentences are unchanged.
    expect(section('demand_clause').template).toBe(
      `{demand_heading}\n\n${DEMAND_SENTENCE} ${AC3_LINE}`,
    );
  });

  it('the AC3 line appears exactly once in the whole twin', () => {
    expect(TWIN_RAW.split(AC3_LINE)).toHaveLength(2);
  });

  it('the old "criminal offence" / "constitutes" paragraphs are gone from every template text', () => {
    const texts: string[] = [];
    for (const s of TWIN.document_structure.sections) {
      for (const k of ['template', 'prompt_context']) {
        if (typeof s[k] === 'string') texts.push(s[k] as string);
      }
    }
    // the only place "offence" may appear is the instruction's ban and Ajay's AC3 line
    for (const t of texts) {
      const stripped = t
        .replace(AC3_LINE, '')
        .replace(
          'Do not state or suggest that any offence is complete when the cheque is issued, presented or dishonoured.',
          '',
        );
      expect(stripped).not.toMatch(/offence/i);
      expect(stripped).not.toMatch(/constitutes? a criminal/i);
      expect(stripped).not.toMatch(/punishable with imprisonment/i);
      expect(stripped).not.toMatch(/upon conviction/i);
    }
  });

  it('no template text says the offence is complete on issue, presentation or dishonour', () => {
    const bad =
      /(offence|crime)[^.]{0,80}(complete|committed|constitut)[^.]{0,80}(issu|present|dishonour)/i;
    const bad2 =
      /(issu|present|dishonour)[^.]{0,80}(constitut|amounts? to)[^.]{0,60}(offence|crime)/i;
    for (const s of TWIN.document_structure.sections) {
      for (const k of ['template', 'prompt_context']) {
        const t = s[k];
        if (typeof t !== 'string') continue;
        const probe = t.replace(
          'Do not state or suggest that any offence is complete when the cheque is issued, presented or dishonoured.',
          '',
        );
        expect(probe).not.toMatch(bad);
        expect(probe).not.toMatch(bad2);
      }
    }
  });

  it("the body instruction starts with Addendum 2's sentences", () => {
    const pc = section('body').prompt_context as string;
    expect(
      pc.startsWith(
        'Generate 3 to 5 numbered paragraphs. Do not state or suggest that any offence is complete when the cheque is issued, presented or dishonoured. On liability, use only the sentence given.',
      ),
    ).toBe(true);
    expect(pc).not.toMatch(/5-7|5 to 7|4 to 6/);
    // Addendum 3: no demand-timing line in the body instruction
    expect(pc).not.toMatch(/within 30 days/i);
    expect(pc).not.toMatch(/proviso \(b\)/i);
  });

  it('the paragraph bounds are 3 to 5, and the validation minimum is 3', () => {
    const body = section('body');
    expect(body.min_paragraphs).toBe(3);
    expect(body.max_paragraphs).toBe(5);
    expect(TWIN.validation_rules.min_body_paragraphs).toBe(3);
  });

  it("the filing checklist holds Ajay's Addendum 3 lines, byte-exact", () => {
    const list = (TWIN as unknown as { filing_checklist: string[] }).filing_checklist;
    expect(list).toContain(
      "Send the notice within 30 days of receiving the bank's return memo (Section 138, proviso (b)).",
    );
    expect(list).toContain(
      'If payment is not made within 15 days of receipt of the notice, file the complaint within one month after those 15 days end (Section 142(1)(b)).',
    );
    expect(list.join('\n')).not.toMatch(/within next 30 days/);
  });

  it('the body paragraphs are numbered with no gap and none states the offence', () => {
    const pc = section('body').prompt_context as string;
    const nums = [...pc.matchAll(/^Para (\d+):/gm)].map((m) => Number(m[1]));
    expect(nums).toEqual(nums.map((_n, i) => i + 1));
    expect(nums.length).toBeGreaterThanOrEqual(1);
    expect(nums.length).toBeLessThanOrEqual(5);
  });

  it('the rendered notice has the demand and no early completion', () => {
    clearConfigCache();
    const config = loadTemplateConfig(PACK)!;
    const ctx = buildPlaceholderContext(config, { cheque_amount: '3,00,000' });
    const demand = section('demand_clause').template as string;
    const out = replacePlaceholders(demand, ctx);
    expect(out).toContain(
      'I therefore call upon you to pay my client the said amount of Rs. 3,00,000, being the amount of the said cheque, within fifteen days of receipt of this notice.',
    );
    expect(out).toContain(AC3_LINE);
    expect(out).not.toMatch(/Rs\. 3,00,000\/-/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('T-363 AC4: proprietor, payee address, invented reasons', () => {
  function render(sectionId: string, form: Record<string, unknown>): string {
    clearConfigCache();
    const config = loadTemplateConfig(PACK)!;
    const ctx = buildPlaceholderContext(config, {
      applicant_name: 'Suresh Gupta',
      applicant_address: '12 Karol Bagh, Delhi',
      respondent_name: 'Demo Traders',
      respondent_address: '5 Lajpat Nagar, Delhi',
      advocate_name: 'A. Advocate',
      advocate_address: 'Chamber 3, Tis Hazari',
      // T-471: individual, so the To block is the plain proprietor form (company/partnership: t471).
      respondent_type: 'individual',
      ...form,
    });
    return replacePlaceholders((section(sectionId) as { template: string }).template, ctx);
  }

  it('the twin has optional payee_proprietor and drawer_proprietor fields', () => {
    for (const id of ['payee_proprietor', 'drawer_proprietor']) {
      const f = allFields.find((x) => x.field_id === id);
      expect(f).toBeDefined();
      expect(f!.required).toBe(false);
    }
  });

  it('header with a drawer proprietor: To, "X, proprietor of Y", address', () => {
    const h = render('header', { drawer_proprietor: 'Mohan Lal' });
    expect(h).toContain('To,\nMohan Lal, proprietor of Demo Traders\n5 Lajpat Nagar, Delhi\n');
  });

  it('header without a proprietor omits it: no blank, no MISSING, no stray comma', () => {
    for (const form of [{}, { drawer_proprietor: '' }]) {
      const h = render('header', form);
      expect(h).toContain('To,\nDemo Traders\n5 Lajpat Nagar, Delhi\n');
      expect(h).not.toMatch(/Proprietor/);
      expect(withoutDateBlank(h)).not.toMatch(/MISSING|To be confirmed|\{|_____/);
    }
  });

  it('the From block prints the payee address', () => {
    const h = render('header', {});
    expect(h).toContain(
      'From,\nSuresh Gupta\n12 Karol Bagh, Delhi\nThrough: A. Advocate, Advocate',
    );
  });

  it('payee_client names the proprietor when given, otherwise only the payee', () => {
    const withP = render('subject_line', { payee_proprietor: 'Ramesh Jain' });
    expect(withP).toContain(
      'my client, Suresh Gupta, through its proprietor Ramesh Jain, I hereby',
    );
    const without = render('subject_line', {});
    expect(without).toContain('my client, Suresh Gupta, I hereby');
    expect(without).not.toMatch(/proprietor/i);
  });

  it('the dishonour reason is not pre-filled with invented examples', () => {
    const f = allFields.find((x) => x.field_id === 'dishonour_reason')!;
    expect(f.placeholder).toBe('Quote only as the memo gives it');
    expect(JSON.stringify(TWIN)).not.toMatch(/account did not exist|account does not exist/i);
    expect(JSON.stringify(TWIN)).not.toMatch(/Funds Insufficient, Account Closed/);
  });

  describe('the averments file', () => {
    const FILE = join(__dirname, '../config/document-rules/_averments/legal_notice_s138.json');
    const raw = readFileSync(FILE);

    it('has the 3 new phrasings', () => {
      const text = raw.toString('utf8');
      for (const p of ['account does not exist', 'account did not exist', 'no such account']) {
        expect(text).toContain(`"${p}"`);
      }
      expect(() => JSON.parse(text)).not.toThrow();
    });

    it('is the file Ajay is re-signing: sha256 f85eb9a1...64bd', () => {
      const sum = createHash('sha256').update(raw).digest('hex');
      expect(sum).toBe('f85eb9a1a170382681d69881f6703ef3fea9b69344b5781c4a9dff94e4a564bd');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The pack (round 3): apps/drafting/src/config/document-rules/legal_notice_s138.json
// ─────────────────────────────────────────────────────────────────────────────
const RULES_PATH = join(__dirname, '../config/document-rules/legal_notice_s138.json');
const RULES_RAW = readFileSync(RULES_PATH, 'utf8');
const RULES = JSON.parse(RULES_RAW) as {
  prayerTemplate: string;
  promptInstructions: string[];
  form_schema: { steps: Array<{ fields: Array<Record<string, unknown>> }> };
  [k: string]: unknown;
};
const packFields = RULES.form_schema.steps.flatMap((s) => s.fields);

describe('T-363 pack: demand and warning wording', () => {
  it("prayerTemplate is Ajay's two sentences, byte-exact, in one paragraph (single space)", () => {
    expect(RULES.prayerTemplate).toBe(
      `${DEMAND_SENTENCE.replace('{cheque_amount}', '{amount}')} ${AC3_LINE}`,
    );
    expect(RULES.prayerTemplate).not.toContain('\n');
  });

  it('the old civil / criminal complaint / amount-in-words demand text is gone', () => {
    for (const gone of [
      'at your risk, cost, and consequences',
      'Criminal Complaint',
      '{amountInWords}',
      'civil proceedings',
    ]) {
      expect(RULES.prayerTemplate).not.toContain(gone);
    }
  });

  it('the AC3 line appears once in the pack outside nothing else', () => {
    expect(RULES_RAW.split(AC3_LINE)).toHaveLength(2);
  });

  it('no pack text says the offence is complete on issue, presentation or dishonour', () => {
    const ban =
      'Do not state or suggest that any offence is complete when the cheque is issued, presented or dishonoured.';
    const early =
      /(offence|crime)[^.]{0,80}(complete|committed|constitut)[^.]{0,80}(issu|present|dishonour)|(issu|present|dishonour)[^.]{0,80}(constitut|amounts? to|is)[^.]{0,60}(an? )?(criminal )?(offence|crime)/i;
    const texts = [
      RULES.prayerTemplate.replace(AC3_LINE, ''),
      ...RULES.promptInstructions.map((t) => t.replace(ban, '')),
    ];
    for (const t of texts) expect(t).not.toMatch(early);
    // "constitutes a criminal offence" style sentences, wherever they sit in the file
    expect(RULES_RAW.replace(AC3_LINE, '').replace(ban, '')).not.toMatch(
      /constitutes? (a|an) (criminal )?offence|offence (is|was|has been) (complete|committed)/i,
    );
  });

  it("the promptInstructions hold Ajay's line at index 9, and T-136's lines stay at 6 to 8", () => {
    expect(RULES.promptInstructions[9]).toBe(
      'Do not state or suggest that any offence is complete when the cheque is issued, presented or dishonoured. On liability, use only the sentence given.',
    );
    expect(RULES.promptInstructions[6]).toBe(
      'The demand for payment and the time allowed for it are added by the system. Do not write a demand in the body.',
    );
    expect(RULES.promptInstructions[7]).toBe(
      'The warning of prosecution is added by the system. Do not write it in the body.',
    );
    expect(RULES.promptInstructions[8]).toMatch(/^Give each date the BRIEF gives:/);
    expect(RULES.promptInstructions).toHaveLength(12);
  });

  it('the return reason is quoted only as the memo gives it (index 5)', () => {
    expect(RULES.promptInstructions[5]).toBe(
      "State the reason for dishonour only as the bank's return memo gives it. Do not add or infer any reason.",
    );
  });

  it('no pack text offers a dishonour reason as an example (averments lists excepted)', () => {
    const examples =
      /insufficient funds|funds insufficient|account closed|account does not exist|account did not exist/i;
    const hits = RULES_RAW.split('\n').filter((l) => examples.test(l));
    expect(hits).toEqual([]);
  });
});

describe("T-363 pack: filingChecklist holds Ajay's Addendum 3 lines", () => {
  const LINE_30 =
    "Send the notice within 30 days of receiving the bank's return memo (Section 138, proviso (b)).";
  const LINE_142 =
    'If payment is not made within 15 days of receipt of the notice, file the complaint within one month after those 15 days end (Section 142(1)(b)).';
  const list = (RULES as unknown as { filingChecklist: string[] }).filingChecklist;

  it('holds both lines byte-exact, once each', () => {
    expect(list.filter((l) => l === LINE_30)).toHaveLength(1);
    expect(list.filter((l) => l === LINE_142)).toHaveLength(1);
  });

  it('has no struck "within 30 days after expiry" or "within next 30 days" line', () => {
    expect(list.join('\n')).not.toMatch(/within 30 days after expiry/i);
    expect(list.join('\n')).not.toMatch(/within next 30 days/i);
    expect(RULES_RAW).not.toMatch(/within 30 days after expiry|within next 30 days/i);
  });

  it('keeps the 15-day wait step', () => {
    expect(list).toContain('Wait 15 days from receipt of notice before filing complaint');
  });

  it('what the advocate receives (generateFilingChecklist / readFilingChecklist) is the same list', () => {
    const rule = RULES as unknown as DocumentRuleConfig;
    expect(generateFilingChecklist(rule)).toEqual(list);
    expect(readFilingChecklist(RULES)).toEqual(list);
    const out = generateFilingChecklist(rule);
    expect(out).toContain(LINE_30);
    expect(out).toContain(LINE_142);
    expect(out.join('\n')).not.toMatch(/within 30 days after expiry|within next 30 days/i);
  });

  it('the loaded rule pack carries the same checklist', () => {
    const p = loadRulePack(PACK) as unknown as { filingChecklist?: string[] } | null;
    expect(p).not.toBeNull();
    expect(readFilingChecklist(p)).toEqual(list);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ajay (13 Oct, after round 1): a date read from the description is acceptable
// for the B2 warning only. A1/B1 and their twin texts need the advocate's date.
// In the ledger, source 'user' = read from the description; 'asked' = the
// advocate typed or confirmed it.
// ─────────────────────────────────────────────────────────────────────────────
describe('T-363: a description-read date unlocks the B2 warning only, never A1/B1', () => {
  const MEMO = '2026-09-15';
  const IN_TIME = '2026-10-01';
  const OUT = '2026-10-30';

  function dateFact(key: string, iso: string, source: 'user' | 'asked'): LedgerFact {
    return {
      id: `f_${key}`,
      key,
      label: key,
      type: 'date',
      value: iso,
      display: iso,
      raw_span: iso,
      source,
      confidence: 0.99,
      required_in_draft: true,
    } as LedgerFact;
  }
  const ledgerOf = (
    source: 'user' | 'asked',
    d: { L1?: string; L3?: string; L4?: string; L5?: string },
  ) =>
    (Object.entries(d) as Array<['L1' | 'L3' | 'L4' | 'L5', string]>).map(([k, v]) =>
      dateFact(S138_INPUT_KEYS[k], v, source),
    );
  const computedKeys = (fs: LedgerFact[]) =>
    fs.filter((f) => f.source === 'computed').map((f) => f.key);
  const BOTH = { L1: '2026-08-01', L3: '2026-08-20', L4: MEMO, L5: IN_TIME };

  it('brief: description-read dates (GivenValue source description) give the B2 warning', () => {
    const b = buildBrief({
      kind,
      checklist: checklist(),
      values: [
        { key: 'memo_received_date', value: MEMO, source: 'description' },
        { key: 'notice_sent_date', value: OUT, source: 'description' },
      ],
    });
    expect(b.date_check?.line).toBe('B2');
    expect(b.items.find((i) => i.key === 'notice_sent_date')?.source).toBe('description');
  });

  it('brief: description-read dates in time give no B1 line and no computed fact', () => {
    const b = buildBrief({
      kind,
      checklist: checklist(),
      values: [
        { key: 'memo_received_date', value: MEMO, source: 'description' },
        { key: 'notice_sent_date', value: IN_TIME, source: 'description' },
      ],
    });
    expect(b.date_check).toBeUndefined();
    const text = JSON.stringify(b);
    expect(text).not.toContain(S138_COMPUTED_DISPLAYS.b);
    expect(text).not.toContain(S138_COMPUTED_KEYS.b);
    expect(text).not.toMatch(/within 30 days \(last day/);
  });

  it('brief check adds no fact: s138BriefDateCheck returns only a B2 line, never B1', () => {
    const items = [
      { key: 'memo_received_date', kind: 'date', value: MEMO },
      { key: 'notice_sent_date', kind: 'date', value: IN_TIME },
    ];
    expect(s138BriefDateCheck(PACK, items)).toBeNull();
  });

  it("control: the advocate's confirmed (asked) dates unlock A1 and B1 and the twin texts", () => {
    const out = withS138DateChecks(ledgerOf('asked', BOTH), PACK);
    expect(computedKeys(out)).toEqual([S138_COMPUTED_KEYS.a, S138_COMPUTED_KEYS.b]);
    expect(out.find((f) => f.key === S138_COMPUTED_KEYS.a)?.display).toBe(S138_COMPUTED_DISPLAYS.a);
    expect(out.find((f) => f.key === S138_COMPUTED_KEYS.b)?.display).toBe(S138_COMPUTED_DISPLAYS.b);
  });

  // Ajay (ruling b): a date read from the description, shown on the brief and
  // confirmed by the advocate counts as the advocate's confirmed date (T-192's
  // user/asked rule stays). The limit is timing and provenance, pinned below.

  describe('(1) no A1/B1 unlock before Confirm', () => {
    const SRC = join(__dirname, '..');
    function sourceFiles(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
      });
    }
    const files = sourceFiles(SRC);
    const using = (name: string) =>
      files
        .filter((f) => !f.endsWith('s138-date-checks.ts'))
        .filter((f) => new RegExp(`\\b${name}\\b`).test(readFileSync(f, 'utf8')))
        .map((f) => f.slice(SRC.length + 1))
        .sort();

    it('only the generate-from-brief route calls withS138DateChecks (documents.routes.ts, after Confirm)', () => {
      expect(using('withS138DateChecks')).toEqual(['routes/documents.routes.ts']);
      const routes = readFileSync(join(SRC, 'routes/documents.routes.ts'), 'utf8');
      const at = routes.indexOf('withS138DateChecks(');
      const route = routes.lastIndexOf("router.post(\n  '/", at);
      expect(routes.slice(route, route + 80)).toContain("'/generate-from-brief'");
    });

    it('nothing else computes A1/B1: s138DateChecks and the computed keys are used by no other source file', () => {
      expect(using('s138DateChecks')).toEqual([]);
      expect(using('S138_COMPUTED_KEYS')).toEqual([]);
      expect(using('S138_COMPUTED_DISPLAYS')).toEqual([]);
      expect(using('computedFact')).toEqual([]);
    });

    it('the pre-Confirm brief reads only s138BriefDateCheck (B2 only), in intake-brief.ts', () => {
      expect(using('s138BriefDateCheck')).toEqual(['services/intake-brief.ts']);
      expect(using('s138FactsFromBrief')).toEqual([]);
    });

    it('the intake routes do not touch the s.138 checks at all', () => {
      const intake = readFileSync(join(SRC, 'routes/intake.routes.ts'), 'utf8');
      expect(intake).not.toMatch(/s138|S138/);
    });

    it.each([
      ['in time', IN_TIME],
      ['out of time', OUT],
      ['no notice date', undefined],
    ])(
      'the brief (dates read from the description, %s) carries no computed fact and no A1/B1 text',
      (_n, sent) => {
        const values: GivenValue[] = [
          { key: 'cheque_date', value: '2026-08-01', source: 'description' },
          { key: 'presentation_date', value: '2026-08-20', source: 'description' },
          { key: 'memo_received_date', value: MEMO, source: 'description' },
        ];
        if (sent) values.push({ key: 'notice_sent_date', value: sent, source: 'description' });
        const b = buildBrief({ kind, checklist: checklist(), values });
        const json = JSON.stringify(b);
        for (const gone of [
          S138_COMPUTED_KEYS.a,
          S138_COMPUTED_KEYS.b,
          S138_COMPUTED_DISPLAYS.a,
          S138_COMPUTED_DISPLAYS.b,
          'checked by Lawie',
          'Notice in time',
          'Presented in time',
          'within 30 days (last day',
        ]) {
          expect(json).not.toContain(gone);
        }
        if (b.date_check) expect(b.date_check.line).toBe('B2');
        expect(
          b.items.every((i) => i.source === null || ['description', 'user'].includes(i.source)),
        ).toBe(true);
      },
    );
  });

  describe('(2) A1/B1 use only a date the brief shows', () => {
    it('all five inputs are brief items of the pack, as dates', () => {
      const byKey = new Map(checklist().map((i) => [i.key, i]));
      for (const key of Object.values(S138_INPUT_KEYS)) {
        expect(byKey.get(key)?.kind).toBe('date');
      }
    });

    it('a date fact with source computed never unlocks A1/B1', () => {
      const fs = [
        ...ledgerOf('asked', { L1: '2026-08-01', L3: '2026-08-20' }),
        dateFact(S138_INPUT_KEYS.L4, MEMO, 'asked'),
        { ...dateFact(S138_INPUT_KEYS.L5, IN_TIME, 'asked'), source: 'computed' } as LedgerFact,
      ];
      const out = withS138DateChecks(fs, PACK);
      expect(computedKeys(out)).toEqual([S138_COMPUTED_KEYS.a]);
      const allComputed = fs.map((f) => ({ ...f, source: 'computed' }) as LedgerFact);
      expect(s138DateChecks(allComputed, PACK).computedFacts).toEqual([]);
    });

    it('a date under a key that is not a brief item (other key, prefixed key) never unlocks', () => {
      for (const [m, n] of [
        ['dishonour_date', 'presentation_date'],
        ['dates.memo_received_date', 'dates.notice_sent_date'],
        ['memo_date', 'notice_date'],
      ]) {
        const fs = [dateFact(m, MEMO, 'asked'), dateFact(n, IN_TIME, 'asked')];
        expect(computedKeys(withS138DateChecks(fs, PACK))).toEqual([]);
        expect(s138DateChecks(fs, PACK).b.line).toBe('B5');
      }
    });

    it('a non-date or unreadable value under an input key never unlocks', () => {
      const text = { ...dateFact(S138_INPUT_KEYS.L4, MEMO, 'asked'), type: 'text' } as LedgerFact;
      const bad = dateFact(S138_INPUT_KEYS.L5, 'last week', 'asked');
      expect(computedKeys(withS138DateChecks([text, bad], PACK))).toEqual([]);
    });

    it('two different dates for one input (a derived or stale second entry) fail closed', () => {
      const fs = [
        dateFact(S138_INPUT_KEYS.L4, MEMO, 'asked'),
        dateFact(S138_INPUT_KEYS.L4, '2026-09-16', 'user'),
        dateFact(S138_INPUT_KEYS.L5, IN_TIME, 'asked'),
      ];
      expect(computedKeys(withS138DateChecks(fs, PACK))).toEqual([]);
    });

    it('an input the ledger holds as unresolved counts as missing', () => {
      const fs = ledgerOf('asked', { L4: MEMO, L5: IN_TIME });
      expect(computedKeys(withS138DateChecks(fs, PACK, ['notice_sent_date']))).toEqual([]);
    });

    it('a stored fact under a computed key is stripped and never trusted', () => {
      const fake = {
        ...dateFact(S138_COMPUTED_KEYS.b, IN_TIME, 'asked'),
        type: 'boolean',
        value: true,
      } as unknown as LedgerFact;
      expect(computedKeys(withS138DateChecks([fake], PACK))).toEqual([]);
      expect(withS138DateChecks([fake], PACK).some((f) => f.key === S138_COMPUTED_KEYS.b)).toBe(
        false,
      );
    });

    it('other packs get no computed fact whatever the dates', () => {
      expect(withS138DateChecks(ledgerOf('asked', BOTH), 'ni_complaint_s138')).toHaveLength(4);
      expect(withS138DateChecks(ledgerOf('asked', BOTH), 'nda')).toHaveLength(4);
    });
  });
});

describe('T-363 pack: proprietor fields', () => {
  it.each([
    [
      'payee_proprietor',
      'Name of the proprietor (if your client is a proprietorship firm)',
      'body',
    ],
    [
      'drawer_proprietor',
      'Name of the proprietor (if the drawer is a proprietorship firm)',
      'header',
    ],
  ])('%s exists, is optional text, and matches the twin', (id, label, inject) => {
    const f = packFields.find((x) => x.field_id === id)!;
    expect(f).toBeDefined();
    expect(f.label).toBe(label);
    expect(f.type).toBe('text');
    expect(f.required).toBe(false);
    expect(f.inject_into).toEqual([inject]);
    const t = allFields.find((x) => x.field_id === id)!;
    expect({
      label: f.label,
      type: f.type,
      required: f.required,
      inject_into: f.inject_into,
    }).toEqual({ label: t.label, type: t.type, required: t.required, inject_into: t.inject_into });
  });

  it('they sit after applicant_name and respondent_name', () => {
    const ids = packFields.map((f) => f.field_id);
    expect(ids.indexOf('payee_proprietor')).toBe(ids.indexOf('applicant_name') + 1);
    expect(ids.indexOf('drawer_proprietor')).toBe(ids.indexOf('respondent_name') + 1);
  });

  it('the dishonour_reason placeholder matches the twin', () => {
    const f = packFields.find((x) => x.field_id === 'dishonour_reason')!;
    expect(f.placeholder).toBe('Quote only as the memo gives it');
    expect(f.required).toBe(true);
  });

  it('the brief adds no required blank for them, and invents nothing when empty', () => {
    const empty = briefWith({});
    const keys = (b: typeof empty) => b.items.map((i) => i.key);
    for (const k of ['payee_proprietor', 'drawer_proprietor']) {
      if (!keys(empty).includes(k)) continue;
      const it = empty.items.find((i) => i.key === k)!;
      expect(it.required).toBe(false);
      expect(it.value).toBeNull();
      expect(it.source).toBeNull();
      expect(empty.still_unknown.map((u) => u.key)).not.toContain(k);
    }
    expect(empty.still_unknown.map((u) => u.key)).not.toContain('payee_proprietor');
    expect(empty.still_unknown.map((u) => u.key)).not.toContain('drawer_proprietor');
    expect(JSON.stringify(empty.confirm_blockers)).not.toMatch(/proprietor/);
    // the same other blanks as a brief built from the checklist without the two fields
    const without = buildBrief({
      kind,
      checklist: checklist().filter((c) => !/proprietor/.test(c.key)),
      values: [],
    });
    expect(empty.still_unknown.map((u) => u.key)).toEqual(without.still_unknown.map((u) => u.key));
    expect(empty.can_confirm).toBe(without.can_confirm);
  });

  it('a proprietor the advocate typed is kept as given', () => {
    const b = briefWith({ drawer_proprietor: 'Anil Gupta', payee_proprietor: 'Ramesh Jain' });
    for (const [k, v] of [
      ['drawer_proprietor', 'Anil Gupta'],
      ['payee_proprietor', 'Ramesh Jain'],
    ]) {
      const it = b.items.find((i) => i.key === k);
      if (it) expect(it.value).toBe(v);
    }
  });
});
