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
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  buildBrief,
  buildChecklist,
  checkRead,
  type ChecklistItem,
  type GivenValue,
} from '../services/intake-brief';
import { normalizeDate } from '@lawie/shared';
import { datesAsWritten, datesInText } from '../services/intake-text';
import { loadRulePack } from '../services/rule-pack.service';
import {
  S138_LINE_TEXTS,
  s138BriefDateCheck,
  s138FactsFromBrief,
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
    expect(section('demand_clause').template).toBe(`DEMAND\n\n${DEMAND_SENTENCE} ${AC3_LINE}`);
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
      respondent_type: 'partnership',
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

  it('header with a drawer proprietor: To, proprietor, Proprietor, firm, address', () => {
    const h = render('header', { drawer_proprietor: 'Mohan Lal' });
    expect(h).toContain('To,\nMohan Lal,\nProprietor,\nDemo Traders,\n5 Lajpat Nagar, Delhi\n');
  });

  it('header without a proprietor omits it: no blank, no MISSING, no stray comma', () => {
    for (const form of [{}, { drawer_proprietor: '' }]) {
      const h = render('header', form);
      expect(h).toContain('To,\nDemo Traders\n5 Lajpat Nagar, Delhi\n');
      expect(h).not.toMatch(/Proprietor/);
      expect(h).not.toMatch(/MISSING|To be confirmed|\{|_____/);
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
