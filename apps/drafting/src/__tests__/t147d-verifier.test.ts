/**
 * T-147d — every draft is checked against the ledger before the advocate sees
 * it (ADR-022 section 2C). The go-live gate for T-147.
 *
 * Covers the mechanism, not Ajay's wording: check names, ids, keys, counts and
 * structure are asserted; the repair prompt's and the banner's exact wording
 * is not (except the plural rule and the placeholder form, which the ticket
 * fixes). The model is the Anthropic SDK stub; every answer is a fixture.
 *
 * AC1 clean draft untouched, four checks; AC2 the replayed run-2 drafts fail
 * (fixtures/t147d); AC3 pack allowlist; AC4 one targeted repair; AC5
 * placeholders and banner; AC6 fact-diff log; AC7 placeholder rate; AC8
 * existing checks still run. Also: weekly report, check 3, check 4 skip,
 * switch off, PII.
 */
import './setupDb';
import { readFileSync } from 'fs';
import { join } from 'path';

import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { FactDiff, FACT_DIFF_TTL_SECONDS } from '../models/FactDiff.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { PlaceholderRate } from '../models/PlaceholderRate.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadAvermentLists } from '../services/averments';
import { CLAUSES_MARKER, packTexts } from '../services/brief-drafter';
import {
  buildWeeklyFactDiffReport,
  deleteFactDiffsFor,
  describeDiff,
  loadWeeklyFactDiffData,
  rulePackVersionOf,
  userRefOf,
  writeFactCheckLog,
} from '../services/fact-diff-log';
import {
  buildFactRepairUserPrompt,
  FACT_CHECK_DISCLAIMER,
  factCheckBannerText,
  FactCheckOutcome,
  FactViolation,
  parseFactRepair,
  REPAIR_PROMPT_VERSION,
  splitParagraphs,
  VERIFIER_VERSION,
  verifyAndRepair,
  verifyDraft,
  VerifierInput,
} from '../services/fact-verifier';
import { DRAFTER_FACT_REPAIR_SYSTEM_PROMPT } from '../services/drafter.prompts';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { decrypt } from '../utils/encryption';
import { SdkStreamParams, sdkAnswer, expectCachedSystem, systemText } from './sdkStream';

// T-373: these tests drive the legacy (text-stream) path. The signed skeletons are on by default, so the
// loader is pinned to null here; every lookup is counted so the last test can show the mock was reached.
const mockSkeletonLookups: string[] = [];
jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: (packId: string) => {
    mockSkeletonLookups.push(packId);
    return null;
  },
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// ── fixtures: Anushka's run-2 drafts, replayed ──────────────────────────────

interface Expected {
  check: 'unsupported' | 'dropped' | 'mutation' | 'banned';
  bannedEntryId?: string;
  ledgerKey?: string;
  reason?: string;
}
interface Fixture {
  pack: string;
  ledger: { facts: never[]; unresolved: never[] };
  skeleton: string[];
  body: string;
  expected: Expected[];
}
const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 't147d', `${name}.json`), 'utf8')) as Fixture;

function inputOf(fx: Fixture, body = fx.body): VerifierInput {
  return {
    body,
    facts: fx.ledger.facts,
    unresolved: fx.ledger.unresolved,
    lists: loadAvermentLists(fx.pack),
    skeleton: fx.skeleton,
    packText: packTexts(loadRulePack(fx.pack)!),
  };
}

function matches(v: FactViolation, e: Expected): boolean {
  return (
    v.check === e.check &&
    (e.bannedEntryId === undefined || v.bannedEntryId === e.bannedEntryId) &&
    (e.ledgerKey === undefined || v.ledgerKey === e.ledgerKey) &&
    (e.reason === undefined || v.reason === e.reason)
  );
}

/** A repair call that records what it was sent and answers with `reply`. */
function repairSpy(reply: string | null) {
  return jest.fn(async (_system: string, _user: string): Promise<string | null> => reply);
}

const checksOf = (vs: readonly FactViolation[]) => [...new Set(vs.map((v) => v.check))].sort();

// A bail ledger/skeleton used by the pure tests that need their own bodies.
const RB = fixture('regular-bail');
const S138 = fixture('s138-notice');
const MAG = fixture('magistrate-bail');

const S138_CLEAN = [
  '1. That you, Demo Traders, issued a cheque dated 01.09.2026 for Rs 3,00,000 drawn on HDFC Bank, Karol Bagh in favour of my client.',
  '2. That my client presented the said cheque for encashment on 15.09.2026.',
  '3. That the said cheque was returned unpaid.',
].join('\n\n');

const RB_CLEAN = [
  '1. That the applicant Testpal Yadav has been in judicial custody since 13 September 2026 in connection with FIR No. 901/2026 registered at Police Station Hazratganj, Lucknow under Section 318(4) of the Bharatiya Nyaya Sanhita, 2023.',
  '2. That the bail application of the applicant was rejected by the learned Chief Judicial Magistrate, Lucknow on 22 September 2026.',
].join('\n\n');

// ═════════════════════════════════════════════════════════════════════════════
// AC1
// ═════════════════════════════════════════════════════════════════════════════
describe('AC1: all four checks run; a draft that passes is unchanged', () => {
  it('a clean s138 draft passes and comes back byte-identical, with no repair call and no banner', async () => {
    expect(verifyDraft(inputOf(S138, S138_CLEAN))).toEqual([]);
    const repair = repairSpy('should never be used');
    const out = await verifyAndRepair(inputOf(S138, S138_CLEAN), repair);
    expect(out.passed).toBe(true);
    expect(out.body).toBe(S138_CLEAN);
    expect(repair).not.toHaveBeenCalled();
    expect(out.repairRan).toBe(false);
    expect(out.banner).toBeNull();
    expect(out.records).toEqual([]);
    expect(out.placeholdersAdded).toBe(0);
  });

  it('a clean bail draft passes untouched, including odd spacing and CRLF it does not own', async () => {
    const body = `${RB_CLEAN}\r\n\r\n3.   That the applicant is  in custody.  `;
    const repair = repairSpy(null);
    const out = await verifyAndRepair(inputOf(RB, body), repair);
    expect(out.passed).toBe(true);
    expect(out.body).toBe(body);
    expect(repair).not.toHaveBeenCalled();
  });

  it('an empty body is not a failure and not changed', async () => {
    const out = await verifyAndRepair(inputOf(RB, ''), repairSpy(null));
    expect(out.body).toBe('');
    expect(out.passed).toBe(true);
  });

  it('one draft with one violation of each kind: all four checks report', () => {
    const body = [
      // unsupported (an amount no fact gives) + dropped (custody_since, 13 September 2026, is left out)
      RB_CLEAN.split('\n\n')[0].replace(
        'has been in judicial custody since 13 September 2026',
        'is in judicial custody',
      ),
      // mutation (the custody date is 13 September 2026; this is the one dropped above, so say it wrongly in para 2)
      '2. That the applicant has been in custody since 14 September 2026 and bail was rejected on 22 September 2026.',
      // banned
      '3. That the applicant is gainfully employed.',
      '4. That the applicant paid Rs 7,50,000 to the complainant.',
    ].join('\n\n');
    const vs = verifyDraft(inputOf(RB, body));
    expect(checksOf(vs)).toEqual(['banned', 'dropped', 'mutation', 'unsupported']);
    expect(vs.find((v) => v.check === 'dropped')?.ledgerKey).toBe('custody_since');
    expect(vs.find((v) => v.check === 'mutation')).toMatchObject({
      ledgerKey: 'custody_since',
      reason: 'differs',
    });
    expect(vs.find((v) => v.check === 'banned')?.bannedEntryId).toBe('gainfully_employed');
    expect(vs.find((v) => v.check === 'unsupported')?.draftValue).toMatch(/7,50,000/);
  });

  it('check 1 alone: an invented police station, court, case number, period and capitalised name', () => {
    const base = RB_CLEAN;
    const cases: Array<[string, string]> = [
      [
        'court',
        `${base}\n\n3. That the applicant appeared before the Chief Judicial Magistrate, Kanpur.`,
      ],
      ['case_no', `${base}\n\n3. That Crime No. 77/2025 is also pending.`],
      ['date', `${base}\n\n3. That the applicant has lived here for 32 years.`],
      ['name', `${base}\n\n3. That the complainant, Mukesh Agarwal, has no objection.`],
      [
        'section',
        `${base}\n\n3. That the applicant is also charged under Section 103 of the Bharatiya Nyaya Sanhita, 2023.`,
      ],
      ['amount', `${base}\n\n3. That the applicant paid Rs 7,50,000.`],
    ];
    for (const [type, body] of cases) {
      const vs = verifyDraft(inputOf(RB, body)).filter((v) => v.check === 'unsupported');
      expect({ type, found: vs.some((v) => v.entityType === type) }).toEqual({ type, found: true });
    }
    // a station the ledger does not hold at all (the s138 ledger has none) is unsupported;
    // where the ledger holds a different station it is a mutation of that fact (check 3)
    const none = verifyDraft(
      inputOf(S138, `${S138_CLEAN}\n\n4. That the matter was noted at Police Station Gomti Nagar.`),
    );
    expect(none.some((v) => v.check === 'unsupported' && v.entityType === 'police_station')).toBe(
      true,
    );
    const other = verifyDraft(
      inputOf(RB, `${RB_CLEAN}\n\n3. That the matter was noted at Police Station Gomti Nagar.`),
    );
    expect(
      other.some(
        (v) =>
          v.check === 'mutation' &&
          v.entityType === 'police_station' &&
          v.ledgerKey === 'police_station',
      ),
    ).toBe(true);
  });

  it('check 2 alone: a required fact left out is reported with its key; a not-required one is not', () => {
    const noFir = RB_CLEAN.replace('FIR No. 901/2026 registered at ', '').replace(
      'in connection with ',
      '',
    );
    const vs = verifyDraft(inputOf(RB, noFir));
    // 901/2026 is in the skeleton (cause title), so it still counts as printed.
    expect(vs.filter((v) => v.check === 'dropped')).toEqual([]);
    const noDate = RB_CLEAN.replace('since 13 September 2026 ', '');
    expect(verifyDraft(inputOf(RB, noDate)).map((v) => [v.check, v.ledgerKey])).toEqual([
      ['dropped', 'custody_since'],
    ]);
    // earlier_order_date is required_in_draft: false
    const noOrder = RB_CLEAN.replace(' on 22 September 2026', '');
    expect(verifyDraft(inputOf(RB, noOrder))).toEqual([]);
  });

  it('check 2 normalises: Rs 3 lakh / Rs. 3,00,000/- / 300000 all satisfy value 300000', () => {
    for (const written of [
      'Rs 3,00,000',
      'Rs. 3,00,000/-',
      '₹3,00,000',
      'Rs 3 lakh',
      'Rs. 300000',
    ]) {
      const body = S138_CLEAN.replace('Rs 3,00,000', written);
      const dropped = verifyDraft(inputOf(S138, body)).filter((v) => v.check === 'dropped');
      expect({ written, dropped: dropped.map((d) => d.ledgerKey) }).toEqual({
        written,
        dropped: [],
      });
    }
  });

  it('check 2 normalises dates: 1 September 2026 / 01.09.2026 / 2026-09-01 satisfy the cheque date', () => {
    for (const written of [
      '01.09.2026',
      '1 September 2026',
      '1st September, 2026',
      '2026-09-01',
      '01/09/2026',
    ]) {
      const body = S138_CLEAN.replace('01.09.2026', written);
      const vs = verifyDraft(inputOf(S138, body));
      expect({ written, vs: vs.map((v) => [v.check, v.ledgerKey]) }).toEqual({ written, vs: [] });
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC2: the headline
// ═════════════════════════════════════════════════════════════════════════════
describe('AC2: the T-147 draft fails this verifier (run-2 replay)', () => {
  it('the fixtures carry the expected counts (4, 4, 2)', () => {
    expect([RB.expected.length, S138.expected.length, MAG.expected.length]).toEqual([4, 4, 2]);
  });

  describe.each([
    ['regular-bail', RB],
    ['s138-notice', S138],
    ['magistrate-bail', MAG],
  ] as const)('%s', (_name, fx) => {
    it('does not pass, and a failed repair leaves no clean delivery', async () => {
      const vs = verifyDraft(inputOf(fx));
      expect(vs.length).toBeGreaterThan(0);
      const out = await verifyAndRepair(inputOf(fx), repairSpy(null));
      expect(out.passed).toBe(false);
      expect(out.banner).not.toBeNull();
    });

    it.each(
      fx.expected.map((e, i) => [`${e.check}:${e.bannedEntryId ?? e.ledgerKey}`, e, i] as const),
    )('catches %s with the named check', (_label, e) => {
      const vs = verifyDraft(inputOf(fx));
      const hit = vs.filter((v) => matches(v, e));
      expect(hit.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('regular bail: the four invented averments are check 4, each once, with the unlocking fact as the label', async () => {
    const vs = verifyDraft(inputOf(RB));
    const banned = vs.filter((v) => v.check === 'banned');
    expect(banned.map((v) => v.bannedEntryId).sort()).toEqual([
      'cooperated_with_investigation',
      'deep_roots_in_society',
      'gainfully_employed',
      'no_criminal_antecedents',
    ]);
    // nothing else in this draft is wrong: no false positive on the true paragraphs
    expect(vs.filter((v) => v.check !== 'banned')).toEqual([]);
    const out = await verifyAndRepair(inputOf(RB), repairSpy(null));
    expect(out.body).not.toMatch(
      /no criminal antecedents|gainfully employed|cooperated with the police|family and social connections/i,
    );
    expect((out.body.match(/\{\{MISSING: [^}]+\}\}/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // the true paragraphs are left alone
    const [p1, p2] = splitParagraphs(RB.body);
    expect(out.body).toContain(p1.text);
    expect(out.body).toContain(p2.text);
  });

  it('s138: Rs 3 lakh and Demo Traders are check 2; the memo date and Karol Bagh are check 3, with the reason', () => {
    const vs = verifyDraft(inputOf(S138));
    expect(
      vs
        .filter((v) => v.check === 'dropped')
        .map((v) => v.ledgerKey)
        .sort(),
    ).toEqual(['cheque_amount', 'respondent_name']);
    const mem = vs.find((v) => v.check === 'mutation' && v.ledgerKey === 'dishonour_date');
    expect(mem?.reason).toBe('unresolved');
    expect(mem?.draftValue).toMatch(/week following the presentation/);
    const bank = vs.find((v) => v.check === 'mutation' && v.ledgerKey === 'drawee_branch');
    expect(bank?.reason).toBe('wrong_fact');
    expect(bank?.draftValue).toBe('Karol Bagh');
    // The paragraph that says "presented ... at HDFC Bank, Karol Bagh" is the one flagged, not the "drawn on" one.
    expect(bank?.paragraphIndex).toBe(1);
  });

  it('s138: the memo-date phrase is replaced by a placeholder; the wrong branch (a held name) is a P1 conflict, never blanked', async () => {
    // T-611 / Ajay ceee45cb: a held name is never blanked. The drawee branch used as the
    // presenting branch stays in the text and is reported as a conflict (the draft is then withheld).
    const out = await verifyAndRepair(inputOf(S138), repairSpy(null));
    const paras = splitParagraphs(out.body).map((p) => p.text);
    expect(paras[1]).not.toMatch(/\{\{MISSING: /);
    expect(paras[1]).toContain('Karol Bagh');
    expect(out.conflicts?.some((c) => c.keyA === 'presenting_branch')).toBe(true);
    expect(paras[2]).toMatch(/\{\{MISSING: /);
    expect(out.body).not.toMatch(/week following/);
    // "drawn on HDFC Bank, Karol Bagh" is true and stays
    expect(paras[0]).toContain('drawn on HDFC Bank, Karol Bagh');
    // the dropped facts cannot be put in the text: they are in the banner
    const labels = out.banner!.items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['Cheque Amount (Rs.)', 'Drawer / Noticee']));
  });

  it('magistrate: PS Pirbahore dropped is check 2; "long-standing resident" is check 4 and stripped', async () => {
    const vs = verifyDraft(inputOf(MAG));
    expect(vs.some((v) => v.check === 'dropped' && v.ledgerKey === 'police_station')).toBe(true);
    expect(vs.some((v) => v.check === 'banned' && v.bannedEntryId === 'permanent_resident')).toBe(
      true,
    );
    const out = await verifyAndRepair(inputOf(MAG), repairSpy(null));
    expect(out.body).not.toMatch(/long-standing resident/i);
    expect(out.banner!.items.some((i) => i.check === 'dropped')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC3: the pack allowlist
// ═════════════════════════════════════════════════════════════════════════════
describe('AC3: the pack allowlist', () => {
  const unsupportedOf = (fx: Fixture, body: string, packText?: string[]) =>
    verifyDraft({ ...inputOf(fx, body), ...(packText ? { packText } : {}) }).filter(
      (v) => v.check === 'unsupported',
    );

  it('standard prayer and court boilerplate from the bail pack do not trip check 1', () => {
    const body = [
      RB_CLEAN,
      "3. That it is most respectfully prayed that this Hon'ble Court may graciously be pleased to grant regular bail to the applicant on furnishing personal bond with surety to the satisfaction of this Hon'ble Court, on such terms and conditions as this Hon'ble Court may deem fit and proper in the interest of justice, and the applicant shall ever pray.",
      '4. That this application is made under Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023 before the learned Sessions Judge.',
    ].join('\n\n');
    expect(unsupportedOf(RB, body)).toEqual([]);
  });

  it('statutory text of the s138 pack (act name, 138, "15 days", registered post) does not trip check 1', () => {
    const body = [
      S138_CLEAN,
      '4. That you are called upon to pay the said amount within 15 days of receipt of this notice by Registered Post A.D., failing which a complaint under Section 138 of the Negotiable Instruments Act, 1881 will be filed before the competent court.',
    ].join('\n\n');
    expect(unsupportedOf(S138, body)).toEqual([]);
  });

  it('a period the pack does not state is flagged (30 days), a period the pack states is not (15 days)', () => {
    const ok = unsupportedOf(S138, `${S138_CLEAN}\n\n4. Pay within 15 days.`);
    expect(ok).toEqual([]);
    const bad = unsupportedOf(S138, `${S138_CLEAN}\n\n4. Pay within 30 days.`);
    expect(bad.map((v) => v.draftValue)).toEqual(['30 days']);
  });

  it('sample values in the pack text ARE flagged when they appear in a draft', () => {
    const packText = [
      'Name the payee (e.g., "Mohan Lal Sharma") as the person who received the cheque.',
      'Write the drawer as for example Gopal Verma of Indore.',
      'Give the firm, such as Acme Fabrics Pvt Ltd, in full.',
      'The sender is shown as [Anil Kapoor] in the template, or {Sunita Rao}.',
      'Use Registered Post A.D. for service.',
    ];
    for (const sample of [
      'Mohan Lal Sharma',
      'Gopal Verma',
      'Acme Fabrics',
      'Anil Kapoor',
      'Sunita Rao',
    ]) {
      const body = `${S138_CLEAN}\n\n4. That ${sample} stood surety for the debt.`;
      const vs = unsupportedOf(S138, body, packText);
      expect({
        sample,
        flagged: vs.some((v) => v.draftValue?.includes(sample.split(' ')[0])),
      }).toEqual({
        sample,
        flagged: true,
      });
    }
  });

  it('the same name written in the pack as plain static text (no sample markup) is allowed', () => {
    const packText = ['The notice is addressed to the Station House Officer, Cyber Crime Cell.'];
    const vs = unsupportedOf(
      S138,
      `${S138_CLEAN}\n\n4. That a copy goes to the Station House Officer, Cyber Crime Cell.`,
      packText,
    );
    expect(vs.filter((v) => v.entityType === 'name')).toEqual([]);
  });

  it('a name that is neither in the ledger nor in the pack is flagged', () => {
    const vs = unsupportedOf(S138, `${S138_CLEAN}\n\n4. That Vikram Seth stood surety.`);
    expect(vs.some((v) => v.entityType === 'name' && /Vikram/.test(v.draftValue ?? ''))).toBe(true);
  });

  it('the allowlist is built from the pack text given: a period only the pack states is allowed with it and flagged without it', () => {
    const body = `${S138_CLEAN}\n\n4. Pay within 21 days.`;
    expect(unsupportedOf(S138, body, ['The period for payment is 21 days from receipt.'])).toEqual(
      [],
    );
    expect(unsupportedOf(S138, body, []).map((v) => v.draftValue)).toEqual(['21 days']);
  });

  it('DESIGN (lead to confirm against the AC3 wording): a section named only in the pack text is flagged', () => {
    // The module header says courts, police stations and sections are checked
    // against the ledger and the skeleton only. Section 480 appears in the bail
    // pack's own prayer text, yet is flagged when the heading cites 483 alone.
    const vs = unsupportedOf(
      RB,
      `${RB_CLEAN}\n\n3. That this is made under Section 480 of the Bharatiya Nagarik Suraksha Sanhita, 2023.`,
    );
    expect(vs.map((v) => v.entityType)).toEqual(['section']);
    // and the one the skeleton states is not
    expect(
      unsupportedOf(
        RB,
        `${RB_CLEAN}\n\n3. That this is made under Section 483 of the Bharatiya Nagarik Suraksha Sanhita, 2023.`,
      ),
    ).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Check 3 and check 4 in detail
// ═════════════════════════════════════════════════════════════════════════════
describe('check 3: mutation / wrong fact', () => {
  it("a date that is the ledger's but bound to the wrong fact is flagged both ways", () => {
    const body = [
      '1. That the applicant Testpal Yadav has been in judicial custody since 22 September 2026 in FIR No. 901/2026 at Police Station Hazratganj under Section 318(4) BNS.',
      '2. That bail was rejected on 13 September 2026.',
    ].join('\n\n');
    const vs = verifyDraft(inputOf(RB, body)).filter((v) => v.check === 'mutation');
    expect(vs.map((v) => [v.ledgerKey, v.reason, v.draftValue]).sort()).toEqual([
      ['custody_since', 'wrong_fact', '22 September 2026'],
      ['earlier_order_date', 'wrong_fact', '13 September 2026'],
    ]);
  });

  it("a date that is nobody's, cued to a fact, is a mutation of that fact, not a nameless unsupported", () => {
    const body = RB_CLEAN.replace('since 13 September 2026', 'since 14 September 2026');
    const vs = verifyDraft(inputOf(RB, body));
    expect(
      vs.some(
        (v) => v.check === 'mutation' && v.ledgerKey === 'custody_since' && v.reason === 'differs',
      ),
    ).toBe(true);
  });

  it.each([
    ['remand 14 September 2026'],
    ['custody w.e.f. 14.09.2026'],
    ['on 14th September, 2026'],
  ])('T-453: a wrong date still flagged when the span carries a label (%s)', (labelled) => {
    const body = RB_CLEAN.replace('since 13 September 2026', `since ${labelled}`);
    expect(body).not.toBe(RB_CLEAN);
    const vs = verifyDraft(inputOf(RB, body));
    expect(vs.length).toBeGreaterThan(0);
    expect(
      vs.some(
        (v) => v.check === 'mutation' && v.ledgerKey === 'custody_since' && v.reason === 'differs',
      ),
    ).toBe(true);
  });

  it('a value given for an unresolved key is flagged, as a number and as a relative phrase', () => {
    const numeric = `${S138_CLEAN}\n\n4. That the cheque memo dated 20.09.2026 was received.`;
    const v1 = verifyDraft(inputOf(S138, numeric)).filter((v) => v.check === 'mutation');
    expect(v1.map((v) => [v.ledgerKey, v.reason, v.draftValue])).toEqual([
      ['dishonour_date', 'unresolved', '20.09.2026'],
    ]);
    const relative = `${S138_CLEAN}\n\n4. That the return memo was received a few days later.`;
    const v2 = verifyDraft(inputOf(S138, relative));
    expect(v2.some((v) => v.check === 'mutation' && v.ledgerKey === 'dishonour_date')).toBe(true);
  });

  it('a changed amount is a mutation of the amount fact (Rs 3,00,000 -> Rs 3,50,000), and the right one passes', () => {
    const bad = S138_CLEAN.replace('Rs 3,00,000', 'Rs 3,50,000');
    const vs = verifyDraft(inputOf(S138, bad));
    expect(vs.find((v) => v.check === 'mutation')).toMatchObject({
      ledgerKey: 'cheque_amount',
      reason: 'differs',
      draftValue: 'Rs 3,50,000',
    });
    // and the true one is also reported as dropped by nobody
    expect(vs.some((v) => v.check === 'dropped' && v.ledgerKey === 'cheque_amount')).toBe(true);
  });

  it('a changed police station is a mutation of the station fact', () => {
    const body = RB_CLEAN.replace('Police Station Hazratganj', 'Police Station Aliganj');
    const vs = verifyDraft(inputOf(RB, body));
    expect(vs.some((v) => v.check === 'mutation' && v.ledgerKey === 'police_station')).toBe(true);
  });

  it("a one-letter change to a person's name is a mutation of the name fact", () => {
    const body = S138_CLEAN.replace('Demo Traders', 'Demu Traders');
    const vs = verifyDraft(inputOf(S138, body));
    expect(vs.some((v) => v.check === 'mutation' && v.ledgerKey === 'respondent_name')).toBe(true);
  });

  it('the drawee branch in a "drawn on" clause is fine; in a "presented" clause it is wrong_fact', () => {
    const fine = verifyDraft(inputOf(S138, S138_CLEAN));
    expect(fine).toEqual([]);
    const bad = S138_CLEAN.replace(
      'presented the said cheque for encashment on 15.09.2026',
      'presented the said cheque for encashment on 15.09.2026 at HDFC Bank, Karol Bagh',
    );
    const vs = verifyDraft(inputOf(S138, bad));
    expect(vs.map((v) => [v.check, v.ledgerKey, v.reason])).toEqual([
      ['mutation', 'drawee_branch', 'wrong_fact'],
    ]);
  });
});

describe('check 4: banned phrases', () => {
  const facts = [
    ...(RB.ledger.facts as unknown[]),
    {
      id: 'f9',
      key: 'facts_narrative',
      label: 'Facts narrative',
      type: 'text',
      value: 'x',
      display: 'He has no criminal antecedents as per the FIR note.',
      raw_span: 'x',
      source: 'user',
      confidence: 0.9,
      required_in_draft: true,
    },
  ] as never[];
  const withNarrative = (body: string): VerifierInput => ({ ...inputOf(RB, body), facts });
  const HEAD =
    '1. That Testpal Yadav, in custody since 13 September 2026 (FIR No. 901/2026, PS Hazratganj):';

  it('a banned phrase inside a ledger display printed verbatim is not flagged', () => {
    const vs = verifyDraft(
      withNarrative(`${HEAD} He has no criminal antecedents as per the FIR note.`),
    );
    expect(vs.filter((v) => v.check === 'banned')).toEqual([]);
  });

  it('the same phrase NOT printed as a ledger display is flagged, even with other case and spacing', () => {
    for (const w of [
      'He has NO  Criminal   Antecedents.',
      'the applicant has no criminal antecedents.',
    ]) {
      const vs = verifyDraft(withNarrative(`${HEAD} ${w}`)).filter((v) => v.check === 'banned');
      expect({ w, id: vs.map((v) => v.bannedEntryId) }).toEqual({
        w,
        id: ['no_criminal_antecedents'],
      });
    }
  });

  it('is exact: a different wording is not a match (this is the mechanism, not a judge)', () => {
    const vs = verifyDraft(withNarrative(`${HEAD} The applicant has never been convicted.`));
    expect(vs.filter((v) => v.check === 'banned')).toEqual([]);
  });

  it('is body-only: the same phrase in the skeleton is not scanned', () => {
    const input = {
      ...inputOf(RB, RB_CLEAN),
      skeleton: [...RB.skeleton, 'The applicant is gainfully employed (system text).'],
    };
    expect(verifyDraft(input)).toEqual([]);
  });

  it('is lifted when the backing fact is in the ledger', () => {
    const occ = {
      id: 'f8',
      key: 'applicant_occupation',
      label: 'Occupation',
      type: 'text',
      value: 'Driver',
      display: 'Driver',
      raw_span: 'driver',
      source: 'user',
      confidence: 0.9,
      required_in_draft: false,
    };
    const input = {
      ...inputOf(RB, `${RB_CLEAN}\n\n3. That the applicant is gainfully employed.`),
      facts: [...(RB.ledger.facts as unknown[]), occ] as never[],
    };
    expect(
      verifyDraft(input).filter(
        (v) => v.check === 'banned' && v.bannedEntryId === 'gainfully_employed',
      ),
    ).toEqual([]);
  });

  it('strips the sentence and writes the placeholder in its place, leaving the sentences around it', async () => {
    const body = `${RB_CLEAN}\n\n3. That the applicant is in custody. He is gainfully employed. He is a first-time applicant.`;
    const out = await verifyAndRepair(inputOf(RB, body), null as never);
    const p3 = splitParagraphs(out.body)[2].text;
    expect(p3).toContain('That the applicant is in custody.');
    expect(p3).toContain('He is a first-time applicant.');
    expect(p3).toMatch(/\{\{MISSING: [^}]+\}\}/);
    expect(p3).not.toMatch(/gainfully/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC4: one targeted repair
// ═════════════════════════════════════════════════════════════════════════════
describe('AC4: the repair pass sends only the offending paragraphs, at most once', () => {
  const SENT = [
    'alphauniqsentinel',
    'bravouniqsentinel',
    'charlieuniqsentinel',
    'deltauniqsentinel',
  ];
  const body = [
    `1. That the applicant Testpal Yadav is in judicial custody since 13 September 2026 ${SENT[0]}.`,
    `2. That the applicant is gainfully employed ${SENT[1]}.`,
    `3. That FIR No. 901/2026 is registered at Police Station Hazratganj ${SENT[2]}.`,
    `4. That the applicant has cooperated with the police ${SENT[3]}.`,
  ].join('\n\n');

  it('sends [[P1]] and [[P3]] with their text and violations; never [[P0]], [[P2]] or the whole body', async () => {
    const repair = repairSpy(null);
    await verifyAndRepair(inputOf(RB, body), repair);
    expect(repair).toHaveBeenCalledTimes(1);
    const [system, user] = repair.mock.calls[0];
    expect(system).toBe(DRAFTER_FACT_REPAIR_SYSTEM_PROMPT);
    expect(user).toContain('[[P1]]');
    expect(user).toContain('[[P3]]');
    expect(user).not.toContain('[[P0]]');
    expect(user).not.toContain('[[P2]]');
    expect(user).toContain(SENT[1]);
    expect(user).toContain(SENT[3]);
    expect(user).not.toContain(SENT[0]);
    expect(user).not.toContain(SENT[2]);
    expect(user).not.toContain(body);
    // the specific violations travel with it
    expect(user).toContain('VIOLATIONS');
    expect(user).toMatch(/P1 \| banned/);
    expect(user).toMatch(/P3 \| banned/);
    expect(user).not.toMatch(/P0 \| /);
  });

  it('the prompt builder itself: paragraphs by marker, no other paragraph text', () => {
    const user = buildFactRepairUserPrompt({
      paragraphs: [{ index: 2, text: 'only this one' }],
      violations: [],
      facts: [{ key: 'k', label: 'L', type: 'text', display: 'D' }],
      banned: [],
    });
    expect(user).toContain('[[P2]]\nonly this one');
    expect(user).toContain('FACTS:');
    expect(user).not.toContain('[[P0]]');
  });

  it('a good repair replaces only the offending paragraphs; the rest are byte-identical', async () => {
    const reply = [
      '[[P1]]',
      `2. That the applicant has approached this Hon'ble Court ${SENT[1]}.`,
      '',
      '[[P3]]',
      `4. That the applicant is in judicial custody ${SENT[3]}.`,
    ].join('\n');
    const repair = repairSpy(reply);
    const out = await verifyAndRepair(inputOf(RB, body), repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(out.repairRan).toBe(true);
    expect(out.repairFixed).toBe(true);
    expect(out.banner).toBeNull();
    expect(out.afterRepair).toEqual([]);
    const before = splitParagraphs(body).map((p) => p.text);
    const after = splitParagraphs(out.body).map((p) => p.text);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[1]).not.toBe(before[1]);
    expect(out.body).not.toMatch(/gainfully|cooperated/i);
    expect(out.body).not.toContain('{{MISSING');
    // every initial record is resolved as repaired, and there are no after-repair records
    expect(out.records.every((r) => r.phase === 'initial' && r.resolution === 'repaired')).toBe(
      true,
    );
  });

  it('at most one repair, even if the second check still fails: the model is not asked again', async () => {
    const reply = [
      `[[P1]]`,
      `2. That the applicant is gainfully employed again ${SENT[1]}.`,
      '',
      '[[P3]]',
      `4. That the applicant has cooperated with the police ${SENT[3]}.`,
    ].join('\n');
    const repair = repairSpy(reply);
    const out = await verifyAndRepair(inputOf(RB, body), repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(out.repairFixed).toBe(false);
    expect(out.afterRepair!.length).toBeGreaterThan(0);
    expect(out.body).not.toMatch(/gainfully|cooperated with the police/i);
    expect(out.body).toMatch(/\{\{MISSING: /);
    expect(out.banner).not.toBeNull();
  });

  it('the repair is not run for a clean draft, and not at all when no repair call is given', async () => {
    const repair = repairSpy('x');
    await verifyAndRepair(inputOf(RB, RB_CLEAN), repair);
    expect(repair).not.toHaveBeenCalled();
    const out = await verifyAndRepair(inputOf(RB, body), undefined);
    expect(out.repairRan).toBe(false);
    expect(out.banner).not.toBeNull();
  });

  it.each([
    ['plain refusal', 'I am sorry, I cannot do that.'],
    ['wrong marker', '[[P0]]\nsomething'],
    ['a paragraph asked for is missing', '[[P1]]\n2. That the applicant is in custody.'],
    ['text before the first marker', 'Here you go:\n[[P1]]\n2. ok.\n\n[[P3]]\n4. ok.'],
    ['two paragraphs under one marker', '[[P1]]\n2. a.\n\n3. b.\n\n[[P3]]\n4. ok.'],
    ['the drafter trailer is returned', `[[P1]]\n2. a.\n\n[[P3]]\n4. b.\n${CLAUSES_MARKER}`],
    ['empty', ''],
  ])(
    'an unusable reply (%s) is ignored: the original draft goes on to placeholders',
    async (_n, reply) => {
      const out = await verifyAndRepair(inputOf(RB, body), repairSpy(reply));
      expect(out.afterRepair).toBeNull();
      expect(out.repairFixed).toBe(false);
      expect(out.body).not.toMatch(/gainfully|cooperated with the police/i);
      expect(out.banner).not.toBeNull();
    },
  );

  it('parseFactRepair returns the paragraphs by index, in order, or null', () => {
    expect(parseFactRepair('[[P1]]\na\n\n[[P3]]\nb', [1, 3])).toEqual(
      new Map(
        [
          [1, 'a'],
          [3, 'b'],
        ].map(([k, v]) => [k, v]) as never,
      ),
    );
    expect(parseFactRepair('[[P3]]\nb\n[[P1]]\na', [1, 3])).toBeNull();
    expect(parseFactRepair('[[P1]]\na', [1, 3])).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC5: placeholders and the banner
// ═════════════════════════════════════════════════════════════════════════════
describe('AC5: a draft that still fails is delivered with {{MISSING}} and a banner', () => {
  const oneBad = `${RB_CLEAN}\n\n3. That the applicant is gainfully employed.`;
  const twoBad = `${oneBad}\n\n4. That the applicant has cooperated with the police.`;

  it.each([
    ['repair returns null', null],
    ['repair is unparseable', 'cannot comply'],
    ['repair keeps the wrong value', '[[P2]]\n3. That the applicant is gainfully employed.'],
  ])('%s: placeholder visible, no wrong value, banner present', async (_n, reply) => {
    const out = await verifyAndRepair(inputOf(RB, oneBad), repairSpy(reply as string | null));
    expect(out.body).toMatch(/\{\{MISSING: [^}]+\}\}/);
    expect(out.body).not.toMatch(/gainfully employed/i);
    expect(out.banner).not.toBeNull();
    expect(out.passed).toBe(false);
  });

  it('1 item: "1 item needs"; the count is the number of items', async () => {
    const out = await verifyAndRepair(inputOf(RB, oneBad), repairSpy(null));
    expect(out.banner!.items).toHaveLength(1);
    expect(out.banner!.text).toBe(factCheckBannerText(1));
    expect(out.banner!.text).toMatch(/\b1 item needs\b/);
    expect(out.banner!.text).not.toMatch(/items/);
  });

  it('2 items: "2 items need"', async () => {
    const out = await verifyAndRepair(inputOf(RB, twoBad), repairSpy(null));
    expect(out.banner!.items).toHaveLength(2);
    expect(out.banner!.text).toMatch(/\b2 items need\b/);
    expect(out.banner!.text).not.toMatch(/\bneeds\b/);
  });

  it('the count agrees with the items for the real run-2 drafts (regular 4, s138 4, magistrate 2+)', async () => {
    for (const fx of [RB, S138, MAG]) {
      const out = await verifyAndRepair(inputOf(fx), repairSpy(null));
      const n = out.banner!.items.length;
      expect(n).toBeGreaterThan(0);
      expect(out.banner!.text).toBe(factCheckBannerText(n));
    }
    const rb = await verifyAndRepair(inputOf(RB), repairSpy(null));
    expect(rb.banner!.items).toHaveLength(4);
    expect(rb.banner!.text).toMatch(/\b4 items need\b/);
  });

  it('the banner carries the disclaimer, a label per item, a plain note, and no value', async () => {
    const out = await verifyAndRepair(inputOf(S138), repairSpy(null));
    expect(out.banner!.disclaimer).toBe(FACT_CHECK_DISCLAIMER);
    expect(FACT_CHECK_DISCLAIMER.length).toBeGreaterThan(20);
    expect(FACT_CHECK_DISCLAIMER).toMatch(/advocate is responsible/i);
    const json = JSON.stringify(out.banner);
    for (const secret of ['Karol Bagh', 'Demo Traders', '3,00,000', 'week following']) {
      expect(json).not.toContain(secret);
    }
    for (const i of out.banner!.items) {
      expect(i.label.length).toBeGreaterThan(0);
      expect(i.note.length).toBeGreaterThan(0);
      expect(i.note).not.toMatch(/error|invalid|illegal|wrong law/i);
    }
  });

  it('a repair that fixes everything gives no banner and no placeholder', async () => {
    const reply = "[[P2]]\n3. That the applicant has approached this Hon'ble Court.";
    const out = await verifyAndRepair(inputOf(RB, oneBad), repairSpy(reply));
    expect(out.banner).toBeNull();
    expect(out.body).not.toContain('{{MISSING');
    expect(out.passed).toBe(false); // it did fail the first time: that is recorded
    expect(out.repairFixed).toBe(true);
  });

  it('a repair that fixes one and leaves one: the banner counts only what is left', async () => {
    const reply =
      "[[P2]]\n3. That the applicant has approached this Hon'ble Court.\n\n[[P3]]\n4. That the applicant has cooperated with the police.";
    const out = await verifyAndRepair(inputOf(RB, twoBad), repairSpy(reply));
    expect(out.banner!.items).toHaveLength(1);
    expect(out.banner!.text).toBe(factCheckBannerText(1));
    expect(out.body).not.toMatch(/gainfully|cooperated with the police/i);
  });

  it('a placeholder replaces an unsupported value in place and leaves the rest of the sentence', async () => {
    const bad = `${RB_CLEAN}\n\n3. That the applicant paid Rs 7,50,000 to the complainant.`;
    const out = await verifyAndRepair(inputOf(RB, bad), repairSpy(null));
    expect(splitParagraphs(out.body)[2].text).toMatch(
      /^3\. That the applicant paid \{\{MISSING: [^}]+\}\} to the complainant\.$/,
    );
  });

  it('an unresolved value becomes a placeholder named for the fact; a held name is not blanked', async () => {
    // T-611 / Ajay ceee45cb: the drawee branch (held) is a P1 conflict now, not {{MISSING: Drawee Branch}}.
    const out = await verifyAndRepair(inputOf(S138), repairSpy(null));
    const p = splitParagraphs(out.body).map((x) => x.text);
    expect(p[1]).not.toContain('{{MISSING: Drawee Branch}}');
    expect(p[1]).toContain('Karol Bagh');
    expect(p[2]).toContain('{{MISSING: Date of Dishonour / Return Memo}}');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC6 / AC7: the fact-diff log and the placeholder rate
// ═════════════════════════════════════════════════════════════════════════════
describe('AC6 and AC7: the fact-diff log and the placeholder rate', () => {
  const U1 = new mongoose.Types.ObjectId().toString();
  const U2 = new mongoose.Types.ObjectId().toString();
  const D1 = new mongoose.Types.ObjectId().toString();
  const D2 = new mongoose.Types.ObjectId().toString();
  const L1 = new mongoose.Types.ObjectId().toString();
  const L2 = new mongoose.Types.ObjectId().toString();

  async function log(
    fx: Fixture,
    ids: { userId: string; documentId: string; ledgerId: string },
    runType: 'real' | 'fixture' = 'real',
    repair: string | null = null,
    runId = 'run-1',
  ): Promise<FactCheckOutcome> {
    const outcome = await verifyAndRepair(inputOf(fx), repairSpy(repair));
    const pack = loadRulePack(fx.pack)!;
    await writeFactCheckLog({
      outcome,
      runId,
      documentId: ids.documentId,
      userId: ids.userId,
      ledgerId: ids.ledgerId,
      rulePack: fx.pack,
      rulePackVersion: rulePackVersionOf(pack),
      runType,
      requiredFactCount: 7,
      deliveredText: `HEADER {{MISSING: a pre-existing blank}}\n\n${outcome.body}`,
    });
    return outcome;
  }
  const raw = (coll: string) => mongoose.connection.collection(coll).find({}).toArray();

  it('one FactDiff per violation per phase, with every field of the agreed format', async () => {
    // paragraphs 2 and 3 are the offending ones; the repair fixes the first and keeps the banned phrase in the second
    const reply = `[[P2]]\n3. That the applicant is in custody.\n\n[[P3]]\n4. That the applicant has family and social connections in Lucknow.`;
    const out = await log(RB, { userId: U1, documentId: D1, ledgerId: L1 }, 'real', reply);
    const rows = await FactDiff.find({}).lean();
    expect(rows).toHaveLength(out.records.length);
    expect(out.records.length).toBe(out.initial.length + (out.afterRepair?.length ?? 0));
    for (const r of rows) {
      expect(r).toMatchObject({
        runId: 'run-1',
        rulePack: 'bail_regular',
        rulePackVersion: rulePackVersionOf(loadRulePack('bail_regular')!),
        verifierVersion: VERIFIER_VERSION,
        repairPromptVersion: REPAIR_PROMPT_VERSION,
        runType: 'real',
      });
      expect(String(r.userId)).toBe(U1);
      expect(String(r.documentId)).toBe(D1);
      expect(String(r.ledgerId)).toBe(L1);
      expect(r.userRef).toBe(userRefOf(U1));
      expect(['unsupported', 'dropped', 'mutation', 'banned']).toContain(r.check);
      expect(['initial', 'after_repair']).toContain(r.phase);
      expect(['repaired', 'placeholdered', 'stripped', 'flagged']).toContain(r.resolution);
      expect(typeof r.label).toBe('string');
      expect(r.createdAt).toBeInstanceOf(Date);
    }
    // phases: every initial row, then the after-repair rows
    expect(rows.filter((r) => r.phase === 'initial')).toHaveLength(out.initial.length);
    expect(rows.filter((r) => r.phase === 'after_repair')).toHaveLength(out.afterRepair!.length);
    expect(out.afterRepair!.length).toBeGreaterThan(0);
    // the banned rows carry the banned id
    const bannedRows = rows.filter((r) => r.check === 'banned');
    expect(bannedRows.every((r) => typeof r.bannedEntryId === 'string')).toBe(true);
    // a violation that went away after the repair is "repaired" in its initial row
    expect(rows.some((r) => r.phase === 'initial' && r.resolution === 'repaired')).toBe(true);
    // one that is still there: stripped/placeholdered, in both phases
    expect(rows.some((r) => r.phase === 'after_repair' && r.resolution === 'stripped')).toBe(true);
  });

  it('resolutions without a repair: banned is stripped, mutation flagged or placeholdered, dropped flagged', async () => {
    await log(S138, { userId: U1, documentId: D1, ledgerId: L1 });
    const rows = await FactDiff.find({}).lean();
    expect(rows.every((r) => r.phase === 'initial')).toBe(true);
    const by = (check: string) => rows.filter((r) => r.check === check).map((r) => r.resolution);
    // T-611 / Ajay ceee45cb: the bank-role mutation (a held name) is a conflict, so it is 'flagged'
    // (the draft is withheld), not placeholdered; the unresolved dishonour date still is.
    expect(by('mutation')).toEqual(['flagged', 'placeholdered']);
    expect(by('dropped')).toEqual(['flagged', 'flagged']);
    await FactDiff.deleteMany({});
    await log(RB, { userId: U1, documentId: D1, ledgerId: L1 });
    expect((await FactDiff.find({}).lean()).every((r) => r.resolution === 'stripped')).toBe(true);
  });

  it('ledgerValue and draftValue are encrypted in the stored document, and decrypt to the values', async () => {
    await log(S138, { userId: U1, documentId: D1, ledgerId: L1 });
    const docs = await raw('factdiffs');
    const dump = JSON.stringify(docs);
    for (const plain of [
      'Karol Bagh',
      'week following',
      'Demo Traders',
      '3,00,000',
      'Date of Dishonour',
    ]) {
      // labels are in the clear by design (Date of Dishonour is a label); values are not
      if (plain === 'Date of Dishonour') continue;
      expect({ plain, in: dump.includes(plain) }).toEqual({ plain, in: false });
    }
    const branch = docs.find((d) => d.ledgerKey === 'drawee_branch')!;
    expect(branch.ledgerValue).toMatch(/^[^:]+:[^:]+:[^:]+$/);
    expect(decrypt(branch.ledgerValue)).toBe('Karol Bagh');
    expect(decrypt(branch.draftValue)).toBe('Karol Bagh');
    const memo = docs.find((d) => d.ledgerKey === 'dishonour_date')!;
    expect(decrypt(memo.draftValue)).toMatch(/week following the presentation/);
    // a dropped fact: the draft value is null, the ledger value is encrypted
    const dropped = docs.find((d) => d.ledgerKey === 'respondent_name')!;
    expect(dropped.draftValue).toBeNull();
    expect(decrypt(dropped.ledgerValue)).toBe('Demo Traders');
    // no paragraph text is stored
    expect(dump).not.toMatch(/That my client presented/);
  });

  it('the banned phrase is stored encrypted too', async () => {
    await log(RB, { userId: U1, documentId: D1, ledgerId: L1 });
    const docs = await raw('factdiffs');
    expect(JSON.stringify(docs)).not.toMatch(
      /has no criminal antecedents|gainfully employed|cooperated with the police|family and social connections/i,
    );
    const d = docs.find((x) => x.bannedEntryId === 'gainfully_employed')!;
    expect(decrypt(d.draftValue).toLowerCase()).toContain('gainfully employed');
  });

  it('userRef is a keyed hash: stable, not the id, different per user, and the raw row has no plain id in userRef', async () => {
    expect(userRefOf(U1)).toBe(userRefOf(U1));
    expect(userRefOf(U1)).not.toBe(userRefOf(U2));
    expect(userRefOf(U1)).not.toContain(U1);
    expect(userRefOf(U1)).toMatch(/^[0-9a-f]{24}$/);
    await log(RB, { userId: U1, documentId: D1, ledgerId: L1 });
    const [d] = await raw('factdiffs');
    expect(d.userRef).toBe(userRefOf(U1));
    expect(String(d.userRef)).not.toContain(U1);
  });

  it('indexes: rulePack+createdAt, userId, documentId, ledgerId, and a TTL of 90 days for runType real only', async () => {
    await FactDiff.init();
    const idx = await FactDiff.collection.indexes();
    const keys = idx.map((i) => Object.keys(i.key).join('+'));
    expect(keys).toEqual(
      expect.arrayContaining([
        'rulePack+createdAt',
        'userId',
        'documentId',
        'ledgerId',
        'createdAt',
      ]),
    );
    const ttl = idx.find((i) => i.expireAfterSeconds !== undefined)!;
    expect(ttl.key).toEqual({ createdAt: 1 });
    expect(ttl.expireAfterSeconds).toBe(90 * 24 * 60 * 60);
    expect(FACT_DIFF_TTL_SECONDS).toBe(7776000);
    expect(ttl.partialFilterExpression).toEqual({ runType: 'real' });
  });

  it('a fixture row is stored with runType fixture (outside the TTL filter); a real row with real', async () => {
    await log(S138, { userId: U1, documentId: D1, ledgerId: L1 }, 'fixture');
    await log(S138, { userId: U1, documentId: D2, ledgerId: L2 }, 'real');
    expect(await FactDiff.countDocuments({ runType: 'fixture' })).toBeGreaterThan(0);
    expect(await FactDiff.countDocuments({ runType: 'real' })).toBeGreaterThan(0);
    expect(await PlaceholderRate.countDocuments({ runType: 'fixture' })).toBe(1);
    expect(await PlaceholderRate.countDocuments({ runType: 'real' })).toBe(1);
  });

  it('deleteFactDiffsFor removes by userId, by documentId and by ledgerId, and only those', async () => {
    const mk = async () => {
      await FactDiff.deleteMany({});
      await log(S138, { userId: U1, documentId: D1, ledgerId: L1 });
      await log(S138, { userId: U2, documentId: D2, ledgerId: L2 });
      return FactDiff.countDocuments({});
    };
    const total = await mk();
    const per = total / 2;
    expect(per).toBeGreaterThan(0);

    expect(await deleteFactDiffsFor({ userId: U1 })).toBe(per);
    expect(await FactDiff.countDocuments({ userId: U1 })).toBe(0);
    expect(await FactDiff.countDocuments({ userId: U2 })).toBe(per);

    await mk();
    expect(await deleteFactDiffsFor({ documentId: D2 })).toBe(per);
    expect(await FactDiff.countDocuments({ documentId: D2 })).toBe(0);
    expect(await FactDiff.countDocuments({ documentId: D1 })).toBe(per);

    await mk();
    expect(await deleteFactDiffsFor({ ledgerId: L1 })).toBe(per);
    expect(await FactDiff.countDocuments({ ledgerId: L1 })).toBe(0);
    expect(await FactDiff.countDocuments({ ledgerId: L2 })).toBe(per);
  });

  it('deleteFactDiffsFor with an id that is not an id, or one that matches nothing, removes nothing', async () => {
    await log(S138, { userId: U1, documentId: D1, ledgerId: L1 });
    const n = await FactDiff.countDocuments({});
    expect(await deleteFactDiffsFor({ userId: 'not-an-id' })).toBe(0);
    expect(await deleteFactDiffsFor({ documentId: '' })).toBe(0);
    expect(await deleteFactDiffsFor({ ledgerId: new mongoose.Types.ObjectId().toString() })).toBe(
      0,
    );
    expect(await FactDiff.countDocuments({})).toBe(n);
  });

  it('AC7: a PlaceholderRate per draft, with counts and the pack, and no userId / documentId / values', async () => {
    const out = await log(
      S138,
      { userId: U1, documentId: D1, ledgerId: L1 },
      'real',
      null,
      'run-a',
    );
    await log(RB, { userId: U2, documentId: D2, ledgerId: L2 }, 'real', null, 'run-b');
    const rates = await raw('placeholderrates');
    expect(rates).toHaveLength(2);
    const r = rates.find((x) => x.rulePack === 'legal_notice_s138')!;
    expect(r).toMatchObject({
      rulePack: 'legal_notice_s138',
      runType: 'real',
      requiredFactCount: 7,
      verifierPlaceholderCount: out.placeholdersAdded,
      repairRan: true,
      repairFixed: false,
      phase: 'initial',
    });
    // header blank + what the verifier added
    expect(r.placeholderCount).toBe(out.placeholdersAdded + 1);
    expect(r.rulePackVersion).toBe(rulePackVersionOf(loadRulePack('legal_notice_s138')!));
    for (const doc of rates) {
      const keys = Object.keys(doc);
      expect(keys).not.toEqual(expect.arrayContaining(['userId']));
      expect(keys).not.toContain('documentId');
      expect(keys).not.toContain('userRef');
      expect(keys).not.toContain('ledgerId');
      expect(keys).not.toContain('runId');
    }
    const dump = JSON.stringify(rates);
    for (const s of [U1, U2, D1, D2, L1, L2, 'Karol Bagh', 'Demo', '3,00,000', 'Suresh']) {
      expect({ s, in: dump.includes(s) }).toEqual({ s, in: false });
    }
  });

  it('AC7: a clean draft writes one PlaceholderRate and no FactDiff', async () => {
    const outcome = await verifyAndRepair(inputOf(S138, S138_CLEAN), repairSpy(null));
    await writeFactCheckLog({
      outcome,
      runId: 'run-c',
      documentId: D1,
      userId: U1,
      ledgerId: L1,
      rulePack: 'legal_notice_s138',
      rulePackVersion: 'v',
      runType: 'real',
      requiredFactCount: 7,
      deliveredText: S138_CLEAN,
    });
    expect(await FactDiff.countDocuments({})).toBe(0);
    const rates = await PlaceholderRate.find({}).lean();
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({
      placeholderCount: 0,
      verifierPlaceholderCount: 0,
      repairRan: false,
    });
  });

  it('the ledgerId and documentId may be null (a draft with no saved ledger): the write still succeeds', async () => {
    const outcome = await verifyAndRepair(inputOf(S138), repairSpy(null));
    await writeFactCheckLog({
      outcome,
      runId: 'run-n',
      documentId: null,
      userId: U1,
      ledgerId: null,
      rulePack: 'legal_notice_s138',
      rulePackVersion: 'v',
      runType: 'real',
      requiredFactCount: 7,
      deliveredText: outcome.body,
    });
    expect(await FactDiff.countDocuments({ documentId: null, ledgerId: null })).toBe(
      outcome.records.length,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The weekly report (Ajay)
// ═════════════════════════════════════════════════════════════════════════════
describe('the weekly fact-diff report', () => {
  const U1 = new mongoose.Types.ObjectId().toString();
  const U2 = new mongoose.Types.ObjectId().toString();
  const D1 = new mongoose.Types.ObjectId().toString();
  const D2 = new mongoose.Types.ObjectId().toString();
  const L1 = new mongoose.Types.ObjectId().toString();
  const L2 = new mongoose.Types.ObjectId().toString();
  const from = new Date(Date.now() - 24 * 3600 * 1000);
  const to = new Date(Date.now() + 24 * 3600 * 1000);

  async function seed(
    fx: Fixture,
    userId: string,
    documentId: string,
    ledgerId: string,
    runType: 'real' | 'fixture' = 'real',
  ) {
    const outcome = await verifyAndRepair(inputOf(fx), repairSpy(null));
    await writeFactCheckLog({
      outcome,
      runId: `r-${documentId}`,
      documentId,
      userId,
      ledgerId,
      rulePack: fx.pack,
      rulePackVersion: 'v',
      runType,
      requiredFactCount: 8,
      deliveredText: outcome.body,
    });
  }

  it('built from real rows: no raw name, amount, date, case number, station, id or ledger id is in the output', async () => {
    await seed(S138, U1, D1, L1);
    await seed(MAG, U2, D2, L2);
    await seed(RB, U2, D2, L2);
    const md = buildWeeklyFactDiffReport(from, to, await loadWeeklyFactDiffData(from, to));
    for (const secret of [
      'Karol Bagh',
      'Demo Traders',
      'Suresh Gupta',
      '3,00,000',
      '300000',
      '15.09.2026',
      '15 September 2026',
      '01.09.2026',
      '1 September 2026',
      'Pirbahore',
      'Testmohan Prasad',
      'Testpal Yadav',
      'Hazratganj',
      '901/2026',
      'week following the presentation',
      U1,
      U2,
      D1,
      D2,
      L1,
      L2,
      userRefOf(U1),
      userRefOf(U2),
    ]) {
      expect({ secret, in: md.includes(secret) }).toEqual({ secret, in: false });
    }
    expect(md).not.toMatch(/userId|documentId|ledgerId/);
    // labels, keys, banned ids and the pack are in the clear
    for (const shown of [
      'legal_notice_s138',
      'bail_regular',
      'bail_before_magistrate',
      'drawee_branch',
      'dishonour_date',
      'Drawee Branch',
      'Cheque Amount (Rs.)',
      'no_criminal_antecedents',
      'permanent_resident',
    ]) {
      expect({ shown, in: md.includes(shown) }).toEqual({ shown, in: true });
    }
  });

  it('is by pack and check, with placeholder rate per draft and per required fact', async () => {
    await seed(S138, U1, D1, L1);
    const md = buildWeeklyFactDiffReport(from, to, await loadWeeklyFactDiffData(from, to));
    expect(md).toMatch(/\| legal_notice_s138 \| 0 \| 2 \| 2 \| 0 \| 4 \|/); // unsupported, dropped, mutation, banned, total
    expect(md).toMatch(/## Placeholder rate per rule pack/);
    // T-611 / Ajay ceee45cb: one of the two mutations is a conflict (not blanked), so 1 placeholder per draft.
    expect(md).toMatch(/\| legal_notice_s138 \| 1 \| 1\.00 \| 12\.5% \|/);
  });

  it('fixture runs are counted but never reported', async () => {
    await seed(S138, U1, D1, L1, 'fixture');
    const data = await loadWeeklyFactDiffData(from, to);
    expect(data.rows).toEqual([]);
    expect(data.rates).toEqual([]);
    expect(data.fixtureRows).toBeGreaterThan(0);
    const md = buildWeeklyFactDiffReport(from, to, data);
    expect(md).toMatch(/\d+ fixture rows/);
    expect(md).not.toContain('drawee_branch');
  });

  it('rows outside the window are left out', async () => {
    await seed(S138, U1, D1, L1);
    const md = buildWeeklyFactDiffReport(
      from,
      to,
      await loadWeeklyFactDiffData(new Date(0), new Date(1000)),
    );
    expect(md).not.toContain('drawee_branch');
  });

  it('groups by userRef, never by userId: two users, same difference, "users" is 2', () => {
    const row = (userRef: string) => ({
      rulePack: 'p',
      check: 'mutation',
      entityType: 'name',
      label: 'L',
      ledgerKey: 'k',
      bannedEntryId: null,
      userRef,
      resolution: 'placeholdered',
      phase: 'initial',
      diff: 'name: 2 tokens vs 2, edit distance 1',
    });
    const md = buildWeeklyFactDiffReport(from, to, {
      rows: [row('refA'), row('refB'), row('refB')],
      rates: [],
      previousRates: [],
      fixtureRows: 0,
    });
    expect(md).toMatch(
      /\| 1 \| p \| mutation \| name \| k \| L \| name: 2 tokens vs 2, edit distance 1 \| 3 \| 2 \|/,
    );
    expect(md).not.toMatch(/ref[AB]/);
  });

  it('describeDiff masks names, amounts, dates, case numbers and stations; shows sections and phrases', () => {
    const cases: Array<[string, string, string | null, string | null, string[], string[]]> = [
      [
        'name',
        'mutation',
        'Demo Traders',
        'Demu Traders',
        ['Demo', 'Demu', 'Traders'],
        ['edit distance 1'],
      ],
      [
        'police_station',
        'mutation',
        'Hazratganj',
        'Aliganj',
        ['Hazratganj', 'Aliganj'],
        ['police_station'],
      ],
      [
        'amount',
        'mutation',
        'Rs 3,00,000',
        'Rs 3,50,000',
        ['3,00,000', '3,50,000', '300000'],
        ['digits'],
      ],
      [
        'date',
        'mutation',
        '13 September 2026',
        '14 September 2026',
        ['13 September', '14 September', '2026'],
        ['day differs'],
      ],
      [
        'date',
        'mutation',
        null,
        'in the week following the presentation',
        ['week following'],
        ['date'],
      ],
      ['case_no', 'mutation', '901/2026', '902/2026', ['901', '902', '2026'], ['999/9999']],
      ['name', 'unsupported', null, 'Mukesh Agarwal', ['Mukesh', 'Agarwal'], ['tokens']],
      ['name', 'mutation', '9876543210', '9876543211', ['9876543210', '9876543211'], ['digits']],
      ['amount', 'dropped', 'Rs 3,00,000', null, ['3,00,000'], ['not in the draft']],
    ];
    for (const [type, check, l, d, hidden, shown] of cases) {
      const out = describeDiff(type, check, l, d);
      for (const h of hidden)
        expect({ type, h, in: out.includes(h) }).toEqual({ type, h, in: false });
      for (const s of shown)
        expect({ type, s, in: out.includes(s) }).toEqual({ type, s, in: true });
    }
    expect(describeDiff('section', 'unsupported', null, 'Section 480 BNSS')).toContain(
      'Section 480 BNSS',
    );
    expect(
      describeDiff('section', 'mutation', 'Section 318(4) BNS', 'Section 318(2) BNS'),
    ).toContain('318(4)');
    expect(describeDiff('phrase', 'banned', null, 'gainfully employed')).toContain(
      'gainfully employed',
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The route: end to end, switch off, AC8, PII
// ═════════════════════════════════════════════════════════════════════════════
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994390a1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const PACK = loadRulePack('bail_regular')!;
const CHECKLIST = buildChecklist(PACK);
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

const VALUES = [
  { key: 'applicant_name', value: 'Ram Kumar' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  { key: 'facts_narrative', value: 'The applicant was wrongly named in the FIR.' },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

// T-200: paragraph 1, where every clause is reported, carries each clause's cue words
const CUES =
  ' He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.';
const CLEAN = [
  `1. That the applicant Ram Kumar has approached this Hon'ble Court for regular bail.${CUES}`,
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
  '3. That the applicant is in judicial custody.',
].join('\n\n');
// one banned phrase
const BAD = [
  `1. That the applicant Ram Kumar is a law-abiding citizen.${CUES}`,
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
  '3. That the applicant is in judicial custody.',
].join('\n\n');
// two violations: the banned phrase and a section the ledger does not hold
const BAD2 = `${BAD}\n\n4. That the offence is under Section 318 of the Bharatiya Nyaya Sanhita, 2023.`;
const FIXED_P0 = `[[P0]]\n1. That the applicant Ram Kumar has approached this Hon'ble Court for regular bail.${CUES}`;

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}
const report = () => CLAUSE_IDS.map((id) => `${id}: 1`).join('\n');
const answer = (body: string) => `${body}\n\n${CLAUSES_MARKER}\n${report()}`;
function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 4000, 800));
}
function callOf(n: number): { system: unknown; user: string } {
  const p = mockMessagesStream.mock.calls[n][0] as SdkStreamParams;
  return { system: p.system as unknown, user: p.messages[0].content };
}
function event(text: string, name: string): Record<string, any> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  return blocks.length === 0 ? null : JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]);
}
const savedContent = async (res: request.Response) =>
  decrypt(
    (await LawieDocument.findById(event(res.text, 'done')!.docId as string).lean())!
      .generatedContent,
  );

function fact(key: string, display: string, extra: Record<string, unknown> = {}) {
  return {
    id: `f_${key}`,
    key,
    label: CHECKLIST.find((i) => i.key === key)?.label ?? key,
    type: 'text',
    value: display,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: true,
    ...extra,
  };
}
const baseFacts = () => [
  fact('applicant_name', 'Ram Kumar', { type: 'person_name' }),
  fact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
  fact('applicant_age', '32'),
  fact('address', '123 Main St, Patna', { type: 'place_name', value: 'x' }),
  fact('fir_number', '124/2026', { type: 'case_number' }),
  fact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
  fact('police_station', 'Kotwali', { type: 'police_station' }),
  fact('currently_in_custody', 'Judicial custody'),
  fact('facts_narrative', 'He was wrongly named in the FIR.'),
];
async function ledger(
  facts: Array<Record<string, unknown>>,
  runType: 'user' | 'fixture' = 'fixture',
) {
  const doc = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: 'bail_regular',
    runType,
    currentVersion: 1,
    versions: [{ version: 1, facts, unresolved: [], createdAt: new Date(), reason: 'extract' }],
  });
  return String(doc._id);
}
function post(ledgerId?: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: 'bail_regular',
      values: VALUES,
      court,
      ...(ledgerId ? { ledger_id: ledgerId } : {}),
      ...extra,
    });
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await Court.create({
    courtId: COURT_ID,
    name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    courtType: 'sessions',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('the route: the verifier sits between the Drafter and the advocate', () => {
  it('a clean draft: one model call, body untouched, no banner, a placeholder-rate row and no fact-diff row', async () => {
    const id = await ledger(baseFacts(), 'user');
    mockModel(answer(CLEAN));
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(event(res.text, 'done')!.factCheck).toEqual({ banner: null });
    const saved = await savedContent(res);
    for (const para of CLEAN.split('\n\n')) expect(saved).toContain(para);
    expect(await FactDiff.countDocuments({})).toBe(0);
    const rates = await PlaceholderRate.find({}).lean();
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({
      rulePack: 'bail_regular',
      runType: 'real',
      repairRan: false,
      verifierPlaceholderCount: 0,
    });
  });

  it('the unchecked body is never sent: with a banned phrase and a failed repair, the stream never carries it', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(BAD), 'I cannot do that.');
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/law-abiding/);
    expect(await savedContent(res)).not.toMatch(/law-abiding/);
  });

  it('one violation, the repair fails: placeholder in the saved document, "1 item needs" in the done event, disclaimer', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(BAD), 'Sorry, no.');
    const res = await post(id);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    const banner = event(res.text, 'done')!.factCheck.banner;
    expect(banner.text).toBe(factCheckBannerText(1));
    expect(banner.items).toHaveLength(1);
    expect(banner.disclaimer).toBe(FACT_CHECK_DISCLAIMER);
    const content = await savedContent(res);
    expect(content).toMatch(/\{\{MISSING: [^}]+\}\}/);
    expect(content).toContain('2. That FIR No. 124/2026 was registered at PS Kotwali.');
    // the draft that has a banner is not delivered as a clean one
    expect(event(res.text, 'done')!.startingDraftLabel).not.toBeNull();
  });

  it('two violations: "2 items need"', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(BAD2), 'no');
    const res = await post(id);
    const banner = event(res.text, 'done')!.factCheck.banner;
    expect(banner.items).toHaveLength(2);
    expect(banner.text).toBe(factCheckBannerText(2));
  });

  it('the repair call is one extra call, with the fact-repair prompt and only the offending paragraph', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(BAD), FIXED_P0);
    const res = await post(id, { described: 'SENTDESCxq92 my client' });
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    const { system, user } = callOf(1);
    expectCachedSystem(system, DRAFTER_FACT_REPAIR_SYSTEM_PROMPT);
    expect(user).toContain('[[P0]]');
    expect(user).not.toContain('[[P1]]');
    expect(user).not.toContain('[[P2]]');
    expect(user).not.toContain('FIR No. 124/2026 was registered');
    expect(user).not.toContain('SENTDESCxq92');
    // fixed: the document carries the repaired paragraph, no banner, no placeholder from the verifier
    expect(event(res.text, 'done')!.factCheck.banner).toBeNull();
    const content = await savedContent(res);
    expect(content).toContain(
      "1. That the applicant Ram Kumar has approached this Hon'ble Court for regular bail.",
    );
    expect(content).not.toMatch(/law-abiding/);
    // metered as fact_repair
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen!.llmCalls).toBe(2);
    expect(gen!.calls!.map((c) => c.sectionId)).toEqual(['body', 'fact_repair']);
    // the log: initial rows resolved as repaired
    const rows = await FactDiff.find({}).lean();
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      check: 'banned',
      bannedEntryId: 'good_character',
      phase: 'initial',
      resolution: 'repaired',
      runType: 'fixture',
    });
    const rate = await PlaceholderRate.findOne({}).lean();
    expect(rate).toMatchObject({ repairRan: true, repairFixed: true, verifierPlaceholderCount: 0 });
  });

  it('at most one repair per draft: a repair that still fails is not followed by a second', async () => {
    const id = await ledger(baseFacts());
    mockModel(
      answer(BAD),
      BAD.split('\n\n')
        .slice(0, 1)
        .map((p) => `[[P0]]\n${p}`)
        .join(''),
      'third answer: must never be asked for',
    );
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(event(res.text, 'done')!.factCheck.banner.items).toHaveLength(1);
    const rows = await FactDiff.find({}).lean();
    expect(rows.map((r) => r.phase).sort()).toEqual(['after_repair', 'initial']);
    expect(await savedContent(res)).not.toMatch(/law-abiding/);
  });

  it('the repair call itself failing never fails the draft: it is delivered with placeholders and a banner', async () => {
    const id = await ledger(baseFacts());
    mockMessagesStream.mockReset();
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answer(BAD), 4000, 800));
    mockMessagesStream.mockRejectedValueOnce(new Error('upstream down: Ram Kumar'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(event(res.text, 'done')!.factCheck.banner.items).toHaveLength(1);
    expect(await savedContent(res)).toMatch(/\{\{MISSING: /);
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/Ram Kumar|upstream down/);
  });

  it('a failure writing the fact-diff log never fails the draft and logs the error name only', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(BAD), 'no');
    jest
      .spyOn(FactDiff, 'insertMany')
      .mockRejectedValueOnce(new Error('boom: Ram Kumar law-abiding'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(event(res.text, 'done')).not.toBeNull();
    expect(res.text).not.toMatch(/boom/);
    const logged = JSON.stringify(err.mock.calls);
    expect(logged).toMatch(/fact-diff log write failed/);
    expect(logged).toContain('Error');
    expect(logged).not.toMatch(/boom|Ram Kumar|law-abiding/);
  });

  it('a real ledger writes runType real; a fixture ledger writes fixture', async () => {
    mockModel(answer(BAD), 'no', answer(BAD), 'no');
    await post(await ledger(baseFacts(), 'user'));
    await post(await ledger(baseFacts(), 'fixture'));
    expect((await FactDiff.find({}).lean()).map((r) => r.runType).sort()).toEqual([
      'fixture',
      'real',
    ]);
    expect((await PlaceholderRate.find({}).lean()).map((r) => r.runType).sort()).toEqual([
      'fixture',
      'real',
    ]);
  });

  it('one PlaceholderRate per draft and one FactDiff per violation per phase', async () => {
    mockModel(answer(BAD2), 'no', answer(CLEAN));
    await post(await ledger(baseFacts(), 'user'));
    await post(await ledger(baseFacts(), 'user'));
    expect(await PlaceholderRate.countDocuments({})).toBe(2);
    expect(await FactDiff.countDocuments({})).toBe(2);
  });
});

describe('AC8: the existing checks still run', () => {
  it('citation-check still strips a judgment the model names; the verifier does not undo it', async () => {
    const ARNESH = 'Arnesh Kumar v. State of Bihar (2014) 8 SCC 273';
    const id = await ledger(baseFacts());
    mockModel(answer(`${CLEAN}\n\n4. That, as held in ${ARNESH}, arrest is not routine.`));
    const res = await post(id);
    expect(res.status).toBe(200);
    const text = await savedContent(res);
    expect(text).not.toMatch(/Arnesh|State of Bihar \(2014\)|\bSCC\b/);
    expect(text).toContain('[Authority — add if relied upon]');
    // the strip happens first: the verifier is not asked to repair a judgment
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
  });

  it('the clause report trailer is still removed and not shown (post-processing unchanged)', async () => {
    const id = await ledger(baseFacts());
    mockModel(answer(CLEAN));
    const res = await post(id);
    expect(res.text).not.toContain(CLAUSES_MARKER);
    expect(await savedContent(res)).not.toContain(CLAUSES_MARKER);
  });

  it('the existing clause repair still runs, then the fact check on its result', async () => {
    const id = await ledger(baseFacts());
    mockModel(
      `${CLEAN}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((c, i) => `${c}: ${i === 0 ? 0 : 1}`).join('\n')}`,
      answer(CLEAN),
    );
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(systemText(callOf(1).system)).not.toBe(DRAFTER_FACT_REPAIR_SYSTEM_PROMPT);
    expect(event(res.text, 'done')!.factCheck).toEqual({ banner: null });
  });
});

describe('switch off: the verifier is not there', () => {
  async function switchOff() {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
  }

  it('no verifier, no repair call, no FactDiff, no PlaceholderRate, no factCheck in the done event; the draft is left as the model wrote it', async () => {
    await switchOff();
    const id = await ledger(baseFacts(), 'user');
    mockModel(answer(BAD2), 'must never be asked for');
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(event(res.text, 'done')).not.toHaveProperty('factCheck');
    expect(await FactDiff.countDocuments({})).toBe(0);
    expect(await PlaceholderRate.countDocuments({})).toBe(0);
    expect(await savedContent(res)).toContain('law-abiding citizen');
    expect(await savedContent(res)).not.toContain('{{MISSING: Section');
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen!.calls!.map((c) => c.sectionId)).not.toContain('fact_repair');
  });

  it('the prompt is byte-identical to the call with no ledger_id (system and user)', async () => {
    await switchOff();
    const id = await ledger(baseFacts());
    mockModel(answer(CLEAN), answer(CLEAN));
    await post();
    await post(id);
    expect(callOf(1).system).toEqual(callOf(0).system);
    expect(JSON.stringify(callOf(1).system)).toBe(JSON.stringify(callOf(0).system));
    expect(callOf(1).user).toBe(callOf(0).user);
  });

  it('with the switch on but no ledger_id: the old path, no verifier, no rows', async () => {
    mockModel(answer(BAD2), 'must never be asked for');
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(event(res.text, 'done')).not.toHaveProperty('factCheck');
    expect(await FactDiff.countDocuments({})).toBe(0);
    expect(await PlaceholderRate.countDocuments({})).toBe(0);
  });

  // T-637 / Arjun option B: with no persisted ledger the body is held until the gate decides,
  // so it is not streamed; it is delivered in template_sections.
  it('on the old path no text chunk streams; the body is delivered in template_sections', async () => {
    await switchOff();
    mockModel(answer(CLEAN));
    const res = await post();
    expect(res.text).not.toMatch(/data: \{"text":/);
    expect(JSON.stringify(event(res.text, 'template_sections'))).toContain('Ram Kumar');
  });
});

describe('PII: no fact value in console output, error responses or LlmAuxCall rows across a failing run', () => {
  const SENT = 'SENTDISPLAYxq95';
  // values a leak would show: ledger displays, the draft's wrong values, banned phrase
  const VALUES_THAT_MUST_NOT_LEAK = [
    SENT,
    'law-abiding',
    'Ram Kumar',
    'Kotwali',
    '124/2026',
    'Hari Kumar',
    'Section 318',
  ];

  const spyAll = () =>
    (['info', 'error', 'warn', 'log', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
  const leaked = (spies: jest.SpyInstance[]) => {
    const out = JSON.stringify(spies.map((s) => s.mock.calls));
    return VALUES_THAT_MUST_NOT_LEAK.filter((v) => out.includes(v));
  };

  const facts = () => [
    ...baseFacts().filter((f) => f.key !== 'address'),
    fact('address', `Plot ${SENT}, Patna`, { type: 'place_name' }),
  ];

  it('a failing run (violations, a failed repair and a failed log write) prints no value', async () => {
    const id = await ledger(facts(), 'user');
    const spies = spyAll();
    mockMessagesStream.mockReset();
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answer(BAD2), 4000, 800));
    mockMessagesStream.mockRejectedValueOnce(new Error(`api said: ${SENT} Ram Kumar law-abiding`));
    jest.spyOn(FactDiff, 'insertMany').mockRejectedValueOnce(new Error(`db said: ${SENT} Kotwali`));
    jest
      .spyOn(PlaceholderRate, 'create')
      .mockRejectedValueOnce(new Error('never reached') as never);
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(leaked(spies)).toEqual([]);
    // the SSE error path is not taken, and nothing in an error event carries a value
    expect(event(res.text, 'error')).toBeNull();
  });

  it('a failing run with an unparseable repair prints no value and writes no value to LlmAuxCall or Generation', async () => {
    const id = await ledger(facts(), 'user');
    const spies = spyAll();
    mockModel(answer(BAD2), 'refusal text mentioning Ram Kumar');
    const res = await post(id);
    expect(res.status).toBe(200);
    expect(leaked(spies)).toEqual([]);
    const aux = JSON.stringify(await LlmAuxCall.find({}).lean());
    for (const v of VALUES_THAT_MUST_NOT_LEAK)
      expect({ v, in: aux.includes(v) }).toEqual({ v, in: false });
    const gen = JSON.stringify(await Generation.find({}).lean());
    for (const v of VALUES_THAT_MUST_NOT_LEAK)
      expect({ v, in: gen.includes(v) }).toEqual({ v, in: false });
    // the fact-diff rows hold values only encrypted
    const raw = JSON.stringify(
      await mongoose.connection.collection('factdiffs').find({}).toArray(),
    );
    for (const v of ['law-abiding', 'Section 318'])
      expect({ v, in: raw.includes(v) }).toEqual({ v, in: false });
    const rates = JSON.stringify(
      await mongoose.connection.collection('placeholderrates').find({}).toArray(),
    );
    for (const v of VALUES_THAT_MUST_NOT_LEAK)
      expect({ v, in: rates.includes(v) }).toEqual({ v, in: false });
  });

  it('the repair prompt is built from FACTS only: no brief value, no description', async () => {
    const id = await ledger(facts(), 'user');
    mockModel(answer(BAD), FIXED_P0);
    await post(id, { described: 'DESCRIBEDxq77 the whole story' });
    const { user } = callOf(1);
    expect(user).not.toContain('DESCRIBEDxq77');
    expect(user).not.toContain('raw_span');
    expect(user).not.toMatch(/"value"/);
  });

  it('an error response (ledger of another user) carries no value and writes nothing', async () => {
    const other = new mongoose.Types.ObjectId().toString();
    const doc = await FactLedgerModel.create({
      userId: other,
      documentKind: 'bail_regular',
      runType: 'user',
      currentVersion: 1,
      versions: [
        { version: 1, facts: facts(), unresolved: [], createdAt: new Date(), reason: 'extract' },
      ],
    });
    const spies = spyAll();
    const res = await post(String(doc._id));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(SENT);
    expect(leaked(spies)).toEqual([]);
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(await FactDiff.countDocuments({})).toBe(0);
    expect(await PlaceholderRate.countDocuments({})).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Check 4: the future-auxiliary skip and the whole-word start (Ajay's cases)
// ═════════════════════════════════════════════════════════════════════════════
describe('check 4: undertakings are kept, past averments are stripped (empty ledger, bail_regular)', () => {
  const empty = (body: string): VerifierInput => ({
    body,
    facts: [],
    unresolved: [],
    lists: loadAvermentLists('bail_regular'),
    skeleton: [],
    packText: [],
  });
  const bannedIn = (sentence: string) =>
    verifyDraft(empty(`1. ${sentence}`)).filter((v) => v.check === 'banned');

  it.each([
    'jaanch mein sahyog kiya jayega',
    'police ka sahyog kiya jaayega',
    'poora sahyog diya jayega',
    'जांच में सहयोग किया जाएगा',
    'जांच में सहयोग किया जायेगा',
    'The applicant will cooperate with the investigation.',
  ])('KEPT: "%s"', async (s) => {
    expect(bannedIn(s)).toEqual([]);
    const out = await verifyAndRepair(empty(`1. ${s}`), repairSpy(null));
    expect(out.body).toBe(`1. ${s}`);
    expect(out.passed).toBe(true);
  });

  it.each([
    'Aavedak ne jaanch mein sahyog kiya.',
    'आवेदक ने जांच में सहयोग किया।',
    'jaanch mein sahyog kiya hai',
    'has cooperated with the police',
  ])('STRIPPED: "%s"', async (s) => {
    const vs = bannedIn(s);
    expect(vs.length).toBeGreaterThanOrEqual(1);
    const out = await verifyAndRepair(empty(`1. ${s}`), repairSpy(null));
    expect(out.body).toMatch(/\{\{MISSING: [^}]+\}\}/);
    expect(out.body).not.toMatch(/sahyog kiya|सहयोग किया|cooperated with the police/i);
  });

  it.each([
    'She had cooperated with the investigation',
    'The accused cooperated with the police',
    'The petitioner co-operated with the police',
    'police ke bulane par hazir hui',
    'jaanch mein sahyog kiya jaata hai',
    'jaanch mein sahyog kiya ja raha hai',
    'has cooperated with the investigation, will continue to do so',
  ])('STRIPPED (pin): "%s"', async (sentence) => {
    expect(bannedIn(sentence).length).toBeGreaterThanOrEqual(1);
    const out = await verifyAndRepair(empty(`1. ${sentence}`), repairSpy(null));
    expect(out.body).toMatch(/\{\{MISSING: [^}]+\}\}/);
    // the placeholder's own label may say "cooperated"; look at the text outside it
    expect(out.body.replace(/\{\{MISSING:[^}]*\}\}/g, '')).not.toMatch(
      /cooperated|co-operated|sahyog kiya|bulane par/i,
    );
  });

  it.each([
    'jaanch mein sahyog kiya jaana chahiye',
    'jaanch mein sahyog kiya jana chahiye',
    'जांच में सहयोग किया जाना चाहिए',
    'The applicant shall cooperate with the investigation',
    'is ready and willing to cooperate with the investigation',
  ])('KEPT (pin): "%s"', async (sentence) => {
    expect(bannedIn(sentence)).toEqual([]);
    const out = await verifyAndRepair(empty(`1. ${sentence}`), repairSpy(null));
    expect(out.body).toBe(`1. ${sentence}`);
  });

  it('KEPT: "suffering from a heart ailment since birth"', () => {
    expect(bannedIn('That the applicant is suffering from a heart ailment since birth.')).toEqual(
      [],
    );
  });

  it('KEPT: "has been residing at the address given in the cause title"', () => {
    expect(
      bannedIn('The applicant has been residing at the address given in the cause title.'),
    ).toEqual([]);
  });

  it('whole-word start: "she cooperated with the police" is stripped by its own match', () => {
    const vs = bannedIn('That she cooperated with the police.');
    expect(vs.length).toBeGreaterThanOrEqual(1);
    expect(vs.every((v) => !/^he\b/i.test(v.draftValue ?? ''))).toBe(true);
  });

  it('whole-word start: a word merely ending in "he" ("the cooperated ...") creates no "he ..." match', () => {
    const vs = bannedIn('That the cooperated with the police.');
    expect(vs.filter((v) => /^he\b/i.test(v.draftValue ?? ''))).toEqual([]);
  });
});

describe('T-373: this suite ran the legacy path', () => {
  it('the skeleton loader was consulted and returned null, so d1SkeletonFor gave null and the drafts above took the legacy text stream', () => {
    // If the loader mock were removed, bail packs would take D1 (messages.parse) and this stays 0 or the
    // tests above fail; either way the mock is not silently load-bearing.
    expect(mockSkeletonLookups.length).toBeGreaterThan(0);
  });
});
