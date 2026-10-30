/**
 * T-690c (Ajay AJ-690c, "T-690c-2"): the written statement 90-day warning also fires from the
 * service-of-summons date when the days are blank. IST calendar days, strictly over 90, either
 * fact over 90 warns, a future or invalid date never warns, the figure is for the warning only
 * and never reaches the draft or the ledger. Soft only.
 *
 * Part 1  the pure functions with an injected clock (Ajay's five cases, boundaries, IST day flip)
 * Part 2  buildBrief: date only / days only / both / future / invalid; the gate is unchanged
 * Part 3  routes: the blank stays, the computed figure appears nowhere, Confirm and Ink as usual
 * Part 4  the form path (preflightCheck): a soft finding with the signed text, never a block
 *
 * The model is the Anthropic SDK stub. The signed text is checked by length and SHA-256, not typed
 * here, because the T-690b test keeps a list of the files that may hold the literal.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import './setupDb';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { preflightCheck } from '../services/preflight.service';
import { loadRulePack } from '../services/rule-pack.service';
import {
  WS_OVER_90_DAYS_WARNING,
  wsOver90DaysApplies,
  wsOver90DaysWarningApplies,
  wsServiceDateOver90Days,
} from '../services/ws-limitation-warning';
import { sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const SIGNED_SHA256 = 'f58580a7a0e23932a1939bce771bdce8eee40d98904bade32cd0761d5fd6347a';
const FINDING = [{ rule_id: 'ws_over_90_days', text: WS_OVER_90_DAYS_WARNING }];
const IST_MS = (5 * 60 + 30) * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** 12:00 IST on 30 Oct 2026 (06:30 UTC): a fixed clock for the pure tests. */
const NOW = new Date('2026-10-30T06:30:00Z');

/** ISO date `n` calendar days before the IST calendar date of `now`. */
const istDaysAgo = (n: number, now: Date = new Date()): string => {
  const d = new Date(now.getTime() + IST_MS);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const WS = 'written_statement';
const applies = (formData: Record<string, unknown>, now: Date = NOW, id = WS) =>
  wsOver90DaysApplies(id, formData, now);

// ── Part 1: the pure functions ───────────────────────────────────────────────

describe('T-690c-2 part 1: wsServiceDateOver90Days and wsOver90DaysApplies', () => {
  it('the text is unchanged: 316 bytes, the signed SHA-256', () => {
    expect(Buffer.byteLength(WS_OVER_90_DAYS_WARNING, 'utf8')).toBe(316);
    expect(createHash('sha256').update(WS_OVER_90_DAYS_WARNING, 'utf8').digest('hex')).toBe(
      SIGNED_SHA256,
    );
  });

  it('the module still has no import and no require statement (pure)', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'ws-limitation-warning.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\s*\(/);
    expect(src).not.toMatch(/\bfrom\s+['"]/);
    expect(src).not.toMatch(/\bimport\s*\(/);
  });

  describe("Ajay's five cases (days blank unless stated)", () => {
    it('service date 120 days before today, days blank -> warning', () => {
      expect(applies({ summons_service_date: istDaysAgo(120, NOW) })).toBe(true);
    });
    it('service date 10 days before today, days blank -> none', () => {
      expect(applies({ summons_service_date: istDaysAgo(10, NOW) })).toBe(false);
    });
    it('typed 95 plus a service date 10 days before -> warning', () => {
      expect(applies({ days_from_service: '95', summons_service_date: istDaysAgo(10, NOW) })).toBe(
        true,
      );
    });
    it('a future service date -> none', () => {
      expect(applies({ summons_service_date: istDaysAgo(-5, NOW) })).toBe(false);
    });
    it('the draft text is unchanged: the functions return a boolean and never write to the input', () => {
      const form = { summons_service_date: istDaysAgo(120, NOW) };
      const before = JSON.stringify(form);
      expect(applies(form)).toBe(true);
      expect(JSON.stringify(form)).toBe(before);
      expect(Object.keys(form)).toEqual(['summons_service_date']);
    });
  });

  describe('date only: the boundary is strictly over 90 calendar days', () => {
    it.each([
      [200, true],
      [120, true],
      [92, true],
      [91, true],
      [90, false],
      [89, false],
      [30, false],
      [1, false],
      [0, false],
      [-1, false],
      [-120, false],
    ])('%i days before today -> %s', (n, expected) => {
      const date = istDaysAgo(n, NOW);
      expect(wsServiceDateOver90Days(date, NOW)).toBe(expected);
      expect(applies({ summons_service_date: date })).toBe(expected);
    });

    it('today is 0 days: no warning', () => {
      expect(wsServiceDateOver90Days('2026-10-30', NOW)).toBe(false);
    });

    it('the clock is read when none is passed (default now)', () => {
      expect(wsServiceDateOver90Days(istDaysAgo(120))).toBe(true);
      expect(wsServiceDateOver90Days(istDaysAgo(10))).toBe(false);
      expect(wsOver90DaysApplies(WS, { summons_service_date: istDaysAgo(120) })).toBe(true);
    });
  });

  describe('a service date that is not a valid stored date never warns', () => {
    it.each([
      ['30 February', '2026-02-30'],
      ['month 13', '2026-13-01'],
      ['month 00', '2026-00-10'],
      ['day 00', '2026-07-00'],
      ['31 April', '2026-04-31'],
      ['29 Feb in a non-leap year', '2025-02-29'],
      ['DD/MM/YYYY', '12/07/2026'],
      ['DD-MM-YYYY', '12-07-2026'],
      ['words', '1 July 2026'],
      ['Not known', 'Not known'],
      ['empty', ''],
      ['whitespace', '   '],
      ['year before 1900', '1800-01-01'],
      ['year after 2100', '2101-01-01'],
      ['a list', ['2026-01-01']],
      ['a number', 20260101],
      ['null', null],
      ['undefined', undefined],
      ['an object', {}],
      ['true', true],
    ])('%s -> false', (_n, v) => {
      expect(wsServiceDateOver90Days(v, NOW)).toBe(false);
      expect(applies({ summons_service_date: v })).toBe(false);
    });

    it('a valid leap day is read', () => {
      expect(wsServiceDateOver90Days('2024-02-29', NOW)).toBe(true);
    });

    it('a whitespace-padded ISO date is read (trimmed)', () => {
      expect(wsServiceDateOver90Days(` ${istDaysAgo(120, NOW)} `, NOW)).toBe(true);
      expect(wsServiceDateOver90Days(` ${istDaysAgo(10, NOW)} `, NOW)).toBe(false);
    });

    it('a missing key is false', () => {
      expect(applies({})).toBe(false);
    });
  });

  describe('days only (T-690b rule, unchanged)', () => {
    it.each([
      [95, true],
      ['95', true],
      [91, true],
      ['91', true],
      [90, false],
      ['90', false],
      [30, false],
      ['30', false],
      [undefined, false],
      ['', false],
      ['   ', false],
      ['abc', false],
      [[95], false],
    ])('days_from_service %j, no date -> %s', (v, expected) => {
      expect(applies({ days_from_service: v })).toBe(expected);
      expect(wsOver90DaysWarningApplies(WS, { days_from_service: v })).toBe(expected);
    });

    it('the days-only function ignores the service date (unchanged)', () => {
      expect(wsOver90DaysWarningApplies(WS, { summons_service_date: istDaysAgo(120, NOW) })).toBe(
        false,
      );
    });
  });

  describe('both given: either one over 90 warns', () => {
    it('typed 95 and a date 10 days back -> warns', () => {
      expect(applies({ days_from_service: 95, summons_service_date: istDaysAgo(10, NOW) })).toBe(
        true,
      );
    });
    it('typed 30 and a date 120 days back -> warns', () => {
      expect(applies({ days_from_service: 30, summons_service_date: istDaysAgo(120, NOW) })).toBe(
        true,
      );
    });
    it('typed 30 and a date 10 days back -> none', () => {
      expect(applies({ days_from_service: 30, summons_service_date: istDaysAgo(10, NOW) })).toBe(
        false,
      );
    });
    it('typed 95 and a future date -> warns (the typed days still count)', () => {
      expect(applies({ days_from_service: 95, summons_service_date: istDaysAgo(-5, NOW) })).toBe(
        true,
      );
    });
    it('typed 95 and an invalid date -> warns', () => {
      expect(applies({ days_from_service: 95, summons_service_date: '2026-02-30' })).toBe(true);
    });
    it('typed junk and a date 120 days back -> warns from the date', () => {
      expect(
        applies({ days_from_service: 'abc', summons_service_date: istDaysAgo(120, NOW) }),
      ).toBe(true);
    });
  });

  describe('only the written statement', () => {
    it.each([
      'replication',
      'legal_notice_s138',
      'bail_regular',
      'WRITTEN_STATEMENT',
      ' written_statement',
      '',
    ])('template %j -> false for date 120 days back and typed 121', (id) => {
      expect(applies({ summons_service_date: istDaysAgo(120, NOW) }, NOW, id)).toBe(false);
      expect(applies({ days_from_service: 121 }, NOW, id)).toBe(false);
      expect(
        applies({ days_from_service: 121, summons_service_date: istDaysAgo(120, NOW) }, NOW, id),
      ).toBe(false);
    });
  });

  describe('IST calendar days: the day flips at 18:30 UTC', () => {
    // 91 days back from 30 Oct 2026 is 31 Jul 2026; from 29 Oct it is 90 days.
    const DATE_91_FROM_30_OCT = '2026-07-31';
    it('18:29 UTC on 29 Oct (23:59 IST, still 29 Oct) -> 90 days -> none', () => {
      expect(wsServiceDateOver90Days(DATE_91_FROM_30_OCT, new Date('2026-10-29T18:29:00Z'))).toBe(
        false,
      );
    });
    it('18:30 UTC on 29 Oct (00:00 IST, 30 Oct) -> 91 days -> warns', () => {
      expect(wsServiceDateOver90Days(DATE_91_FROM_30_OCT, new Date('2026-10-29T18:30:00Z'))).toBe(
        true,
      );
    });
    it('06:30 UTC and 18:29 UTC on 30 Oct are the same IST day (30 Oct): 91 days -> warns at both', () => {
      expect(wsServiceDateOver90Days(DATE_91_FROM_30_OCT, new Date('2026-10-30T06:30:00Z'))).toBe(
        true,
      );
      expect(wsServiceDateOver90Days(DATE_91_FROM_30_OCT, new Date('2026-10-30T18:29:00Z'))).toBe(
        true,
      );
    });
    it('a date that is "today" in IST but tomorrow in UTC is not future: no warning, no throw', () => {
      // 19:00 UTC on 29 Oct is already 30 Oct in India.
      expect(wsServiceDateOver90Days('2026-10-30', new Date('2026-10-29T19:00:00Z'))).toBe(false);
    });
    it('a date that is tomorrow in IST is future at 18:29 UTC', () => {
      expect(wsServiceDateOver90Days('2026-10-30', new Date('2026-10-29T18:29:00Z'))).toBe(false);
    });
    it('a whole-day count does not drift across a year boundary (1 Jan 2027, 91 days back)', () => {
      const now = new Date('2027-01-01T06:30:00Z');
      expect(wsServiceDateOver90Days('2026-10-02', now)).toBe(true); // 91 days
      expect(wsServiceDateOver90Days('2026-10-03', now)).toBe(false); // 90 days
    });
  });

  it('DAY constant sanity: the fixed-clock helper is a pure calendar step', () => {
    expect(istDaysAgo(0, NOW)).toBe('2026-10-30');
    expect((Date.parse('2026-10-30') - Date.parse(istDaysAgo(91, NOW))) / DAY).toBe(91);
  });
});

// ── Part 2: buildBrief ───────────────────────────────────────────────────────

const WS_PACK = loadRulePack('written_statement')!;
const WS_CHECKLIST = buildChecklist(WS_PACK);
const typed = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
const brief = (values: GivenValue[], kindId: string | null = WS) =>
  buildBrief({
    kind: { id: kindId, name: kindId ?? 'Document', court_document: true },
    checklist: WS_CHECKLIST,
    values,
  });
const dateOnly = (n: number) => [typed('summons_service_date', istDaysAgo(n))];

describe('T-690c-2 part 2: buildBrief soft_findings from the service date', () => {
  it('date 120 days back, days blank -> exactly the one signed finding', () => {
    expect(brief(dateOnly(120)).soft_findings).toEqual(FINDING);
  });

  it('date 91 days back -> present; 90 days back -> absent (not an empty array)', () => {
    expect(brief(dateOnly(91)).soft_findings).toEqual(FINDING);
    const b = brief(dateOnly(90));
    expect(b).not.toHaveProperty('soft_findings');
    expect(Object.keys(b)).not.toContain('soft_findings');
  });

  it('date 10 days back, days blank -> absent', () => {
    expect(brief(dateOnly(10))).not.toHaveProperty('soft_findings');
  });

  it('days typed 95 with a date 10 days back -> one finding', () => {
    const b = brief([...dateOnly(10), typed('days_from_service', '95')]);
    expect(b.soft_findings).toEqual(FINDING);
    expect(b.soft_findings).toHaveLength(1);
  });

  it('days typed 30 with a date 120 days back -> one finding (the date alone is enough)', () => {
    const b = brief([...dateOnly(120), typed('days_from_service', '30')]);
    expect(b.soft_findings).toEqual(FINDING);
    expect(b.soft_findings).toHaveLength(1);
  });

  it('both over 90 -> still one finding, not two', () => {
    const b = brief([...dateOnly(120), typed('days_from_service', '121')]);
    expect(b.soft_findings).toHaveLength(1);
  });

  it('days typed 30 with a date 10 days back -> absent', () => {
    expect(brief([...dateOnly(10), typed('days_from_service', '30')])).not.toHaveProperty(
      'soft_findings',
    );
  });

  it('days only 95, no date -> present (T-690b/c behaviour kept)', () => {
    expect(brief([typed('days_from_service', '95')]).soft_findings).toEqual(FINDING);
  });

  it('days only 30 or 90 -> absent', () => {
    expect(brief([typed('days_from_service', '30')])).not.toHaveProperty('soft_findings');
    expect(brief([typed('days_from_service', '90')])).not.toHaveProperty('soft_findings');
  });

  it('a future service date -> absent', () => {
    expect(brief(dateOnly(-5))).not.toHaveProperty('soft_findings');
  });

  it.each(['2026-02-30', '2026-13-01', '12/07/2026', 'Not known', ''])(
    'invalid or non-date service date %j -> absent, and no throw',
    (v) => {
      expect(() => brief([typed('summons_service_date', v)])).not.toThrow();
      expect(brief([typed('summons_service_date', v)])).not.toHaveProperty('soft_findings');
    },
  );

  it('a list value for the service date is ignored', () => {
    const b = brief([
      { key: 'summons_service_date', value: [istDaysAgo(120)], source: 'user' } as GivenValue,
    ]);
    expect(b).not.toHaveProperty('soft_findings');
  });

  it('another kind carrying a date 120 days back -> absent', () => {
    for (const id of ['replication', 'legal_notice_s138', 'bail_regular', null]) {
      expect(brief(dateOnly(120), id)).not.toHaveProperty('soft_findings');
    }
  });

  it('re-evaluated on every build: 120 back, then 10 back, then 120 back', () => {
    expect(brief(dateOnly(120)).soft_findings).toEqual(FINDING);
    expect(brief(dateOnly(10))).not.toHaveProperty('soft_findings');
    expect(brief(dateOnly(120)).soft_findings).toEqual(FINDING);
  });

  it('never blocks: the gate fields are identical with and without the date warning', () => {
    const warned = brief(dateOnly(120));
    const plain = brief(dateOnly(10));
    expect(warned.soft_findings).toEqual(FINDING);
    expect(plain).not.toHaveProperty('soft_findings');
    expect(warned.can_confirm).toBe(plain.can_confirm);
    expect(warned.confirm_blockers).toEqual(plain.confirm_blockers);
    expect(warned.confirm_message).toEqual(plain.confirm_message);
    expect(warned.still_unknown).toEqual(plain.still_unknown);
  });

  it('the figure is never written into the brief: days_from_service stays blank with its blank', () => {
    const warned = brief(dateOnly(137));
    const item = warned.items.find((i) => i.key === 'days_from_service')!;
    expect(item.value).toBeNull();
    expect(item.source).toBeNull();
    expect(item.placeholder).toContain('[To be confirmed: days from service');
    expect(warned.still_unknown.map((u: unknown) => JSON.stringify(u)).join()).toContain(
      'days_from_service',
    );
    const json = JSON.stringify(warned);
    expect(json).not.toContain('137');
    // the warning is carried once and nowhere else
    expect(json.split(WS_OVER_90_DAYS_WARNING).length - 1).toBe(1);
    // the same brief with a recent date has the same item
    const plainItem = brief(dateOnly(10)).items.find((i) => i.key === 'days_from_service')!;
    expect(plainItem).toEqual(item);
  });
});

// ── Part 3: routes ───────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439691';
const MODEL = 'claude-sonnet-4-5-20250929';
const headers = {
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
};
const COURT_ID = 'district_judge_patna';
const court = { state: 'bihar', court_type: 'district_court', court: COURT_ID };
const CLAUSE_IDS = WS_PACK.mandatoryClauses.map((c) => c.id);
const report = () => CLAUSE_IDS.map((id) => `${id}: 1`).join('\n');

const values = (opts: { date?: string; days?: string }) => [
  { key: 'plaintiff_name', value: 'Sample Person 2' },
  { key: 'defendant_name', value: 'Sample Person 1' },
  ...(opts.date === undefined ? [] : [{ key: 'summons_service_date', value: opts.date }]),
  ...(opts.days === undefined ? [] : [{ key: 'days_from_service', value: opts.days }]),
  { key: 'additional_pleas', value: 'The loan was repaid in full before the suit was filed.' },
];
const update = (body: Record<string, unknown>) =>
  request(app).post('/intake/brief/update').set(headers).send(body);
const draft = () =>
  sdkAnswer(
    `1. That the Defendant files this written statement.\n\n2. That the loan was repaid.\n\n${CLAUSES_MARKER}\n${report()}`,
    4000,
    800,
  );
const generate = (opts: { date?: string; days?: string }) => {
  mockMessagesStream.mockResolvedValueOnce(draft());
  return request(app)
    .post('/generate-from-brief')
    .set(headers)
    .send({ kind: WS, values: values(opts), court });
};
const doneOf = (text: string): Record<string, unknown>[] =>
  text
    .split('\n\n')
    .filter((b) => b.startsWith('event: done\n'))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
  await Court.create({
    courtId: COURT_ID,
    name: 'District Court, Patna',
    designation: 'DISTRICT JUDGE, PATNA',
    courtType: 'district_court',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-690c-2 part 3a: POST /intake/brief/update', () => {
  const upd = (opts: { date?: string; days?: string }) =>
    update({ kind: WS, values: values(opts), court });

  it('date 120 days back, days omitted -> 200 and the one signed finding', async () => {
    const res = await upd({ date: istDaysAgo(120) });
    expect(res.status).toBe(200);
    expect(res.body.brief.soft_findings).toEqual(FINDING);
    expect(JSON.stringify(res.body).split(WS_OVER_90_DAYS_WARNING).length - 1).toBe(1);
  });

  it('date 10 days back, days omitted -> none', async () => {
    const res = await upd({ date: istDaysAgo(10) });
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('typed 95 with a date 10 days back -> present', async () => {
    const res = await upd({ date: istDaysAgo(10), days: '95' });
    expect(res.body.brief.soft_findings).toEqual(FINDING);
  });

  it('typed 30 with a date 10 days back -> none', async () => {
    const res = await upd({ date: istDaysAgo(10), days: '30' });
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('a future date -> none', async () => {
    const res = await upd({ date: istDaysAgo(-5) });
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('an invalid date -> none, still 200', async () => {
    for (const d of ['2026-02-30', '12/07/2026', 'Not known']) {
      const res = await upd({ date: d });
      expect(res.status).toBe(200);
      expect(res.body.brief).not.toHaveProperty('soft_findings');
    }
  });

  it('the warning does not touch the gate: can_confirm, blockers, message, unknowns are identical', async () => {
    const warned = (await upd({ date: istDaysAgo(120) })).body.brief;
    const plain = (await upd({ date: istDaysAgo(10) })).body.brief;
    expect(warned.soft_findings).toEqual(FINDING);
    expect(plain).not.toHaveProperty('soft_findings');
    expect(warned.can_confirm).toBe(true);
    expect(warned.can_confirm).toBe(plain.can_confirm);
    expect(warned.confirm_blockers).toEqual(plain.confirm_blockers);
    expect(warned.confirm_message).toEqual(plain.confirm_message);
    expect(warned.still_unknown).toEqual(plain.still_unknown);
  });

  it('the edit: 120 back -> 10 back clears the warning, and back again restores it', async () => {
    expect((await upd({ date: istDaysAgo(120) })).body.brief.soft_findings).toEqual(FINDING);
    expect((await upd({ date: istDaysAgo(10) })).body.brief).not.toHaveProperty('soft_findings');
    expect((await upd({ date: istDaysAgo(120) })).body.brief.soft_findings).toEqual(FINDING);
  });

  it('the days row stays blank in the response and the computed figure is nowhere in it', async () => {
    const res = await upd({ date: istDaysAgo(137) });
    const item = res.body.brief.items.find((i: { key: string }) => i.key === 'days_from_service');
    expect(item.value).toBeNull();
    expect(item.placeholder).toContain('[To be confirmed: days from service');
    expect(JSON.stringify(res.body)).not.toContain('137');
  });
});

describe('T-690c-2 part 3b: POST /generate-from-brief with a date alone', () => {
  it('date 137 days back, days blank: 200, done, the soft finding rides on done, once', async () => {
    const res = await generate({ date: istDaysAgo(137) });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('event: error');
    const done = doneOf(res.text);
    expect(done).toHaveLength(1);
    expect(done[0].soft_findings).toEqual(FINDING);
    expect(res.text.split(WS_OVER_90_DAYS_WARNING).length - 1).toBe(1);
  });

  it('date 10 days back: no soft_findings anywhere', async () => {
    const res = await generate({ date: istDaysAgo(10) });
    expect(res.status).toBe(200);
    const done = doneOf(res.text);
    expect(done).toHaveLength(1);
    expect(done[0]).not.toHaveProperty('soft_findings');
    expect(res.text).not.toContain('soft_findings');
  });

  it('future date: no soft_findings anywhere', async () => {
    const res = await generate({ date: istDaysAgo(-5) });
    expect(res.status).toBe(200);
    expect(doneOf(res.text)[0]).not.toHaveProperty('soft_findings');
  });

  it('typed 95 with a date 10 days back: the finding rides on done', async () => {
    const res = await generate({ date: istDaysAgo(10), days: '95' });
    expect(doneOf(res.text)[0].soft_findings).toEqual(FINDING);
  });

  it('the draft and the ledger never get the computed figure; the blank stays', async () => {
    const res = await generate({ date: istDaysAgo(137) });
    expect(res.status).toBe(200);
    expect(doneOf(res.text)[0].soft_findings).toEqual(FINDING);

    // What the model was sent (the facts / ledger given to the Drafter).
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(mockMessagesStream.mock.calls[0]);
    expect(sent).toContain('[To be confirmed: days from service');
    expect(sent).not.toContain('137');

    // What the user gets back (sections, done payload): the blank, not the figure.
    const out = res.text.replace(WS_OVER_90_DAYS_WARNING, '');
    expect(out).not.toContain('137');
  });

  it('with a recent date the blank is the same as with a date over 90 (the date changes nothing in the draft)', async () => {
    // The brief sends the date as words ("15 June 2026"); only that value may differ.
    const DATE_IN_PROMPT = /\\"date\\": \\"[^\\]*\\"/g;
    mockMessagesStream.mockReset();
    const warned = await generate({ date: istDaysAgo(137) });
    const sentWarned = JSON.stringify(mockMessagesStream.mock.calls[0]).replace(
      DATE_IN_PROMPT,
      'DATE',
    );
    mockMessagesStream.mockReset();
    const plain = await generate({ date: istDaysAgo(10) });
    const sentPlain = JSON.stringify(mockMessagesStream.mock.calls[0]).replace(
      DATE_IN_PROMPT,
      'DATE',
    );
    expect(warned.status).toBe(200);
    expect(plain.status).toBe(200);
    expect(sentWarned).toBe(sentPlain);
  });

  it('Confirm and Ink as usual: the same Ink is charged with and without the date warning', async () => {
    const before = (await User.findById(USER_ID).lean())!.inkTopup as number;
    expect((await generate({ date: istDaysAgo(10) })).status).toBe(200);
    const afterPlain = (await User.findById(USER_ID).lean())!.inkTopup as number;
    expect((await generate({ date: istDaysAgo(137) })).status).toBe(200);
    const afterWarned = (await User.findById(USER_ID).lean())!.inkTopup as number;
    const chargedPlain = before - afterPlain;
    const chargedWarned = afterPlain - afterWarned;
    expect(chargedPlain).toBeGreaterThan(0);
    expect(chargedWarned).toBe(chargedPlain);
  });

  it('a failed run with a warned date: error, no done, no finding, nothing charged', async () => {
    mockMessagesStream.mockRejectedValue(new Error('503 service unavailable'));
    const before = (await User.findById(USER_ID).lean())!.inkTopup as number;
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers)
      .send({ kind: WS, values: values({ date: istDaysAgo(137) }), court });
    expect(res.text).toContain('event: error');
    expect(doneOf(res.text)).toEqual([]);
    expect(res.text).not.toContain('soft_findings');
    expect((await User.findById(USER_ID).lean())!.inkTopup).toBe(before);
  });
});

// ── Part 4: the form path ────────────────────────────────────────────────────

describe('T-690c-2 part 4: preflightCheck (form flow)', () => {
  const warnings = (r: { questions: string[] }) =>
    r.questions.filter((q) => q === WS_OVER_90_DAYS_WARNING);

  it('date 120 days back, days blank -> soft, the signed text once, no block', async () => {
    const r = await preflightCheck(WS, { summons_service_date: istDaysAgo(120) });
    expect(r.verdict).toBe('soft');
    expect(r.hardBlockReason).toBeUndefined();
    expect(warnings(r)).toHaveLength(1);
    expect(r._meta?.rule_hits).toContain('ws_over_90_days');
  });

  it('date 10 days back -> no warning', async () => {
    const r = await preflightCheck(WS, { summons_service_date: istDaysAgo(10) });
    expect(warnings(r)).toHaveLength(0);
    expect(r._meta?.rule_hits ?? []).not.toContain('ws_over_90_days');
  });

  it('typed 95 with a date 10 days back -> one warning', async () => {
    const r = await preflightCheck(WS, {
      days_from_service: 95,
      summons_service_date: istDaysAgo(10),
    });
    expect(r.verdict).toBe('soft');
    expect(warnings(r)).toHaveLength(1);
  });

  it('typed 30 with a date 120 days back -> one warning', async () => {
    const r = await preflightCheck(WS, {
      days_from_service: 30,
      summons_service_date: istDaysAgo(120),
    });
    expect(warnings(r)).toHaveLength(1);
  });

  it('both over 90 -> one warning, not two', async () => {
    const r = await preflightCheck(WS, {
      days_from_service: 121,
      summons_service_date: istDaysAgo(120),
    });
    expect(warnings(r)).toHaveLength(1);
  });

  it('a future or invalid date -> no warning', async () => {
    for (const d of [istDaysAgo(-5), '2026-02-30', '12/07/2026', 'Not known', '']) {
      const r = await preflightCheck(WS, { summons_service_date: d });
      expect(warnings(r)).toHaveLength(0);
    }
  });

  it('another template with the same date -> no warning', async () => {
    for (const id of ['replication', 'legal_notice_s138', 'bail_anticipatory']) {
      const r = await preflightCheck(id, { summons_service_date: istDaysAgo(120) });
      expect(warnings(r)).toHaveLength(0);
    }
  });

  it('a hard finding wins over the date warning: the warning is soft only', async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000);
    const fir = `${String(tomorrow.getDate()).padStart(2, '0')}.${String(tomorrow.getMonth() + 1).padStart(2, '0')}.${tomorrow.getFullYear()}`;
    const r = await preflightCheck(WS, { summons_service_date: istDaysAgo(120), fir_date: fir });
    expect(r.verdict).toBe('hard');
    expect(r.hardBlockReason).toBeDefined();
    expect(r.hardBlockReason).not.toBe(WS_OVER_90_DAYS_WARNING);
  });
});
