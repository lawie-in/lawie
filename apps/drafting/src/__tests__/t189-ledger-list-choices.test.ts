/**
 * T-189 — the Fact Ledger covers list and choice fields.
 *
 * AC2 isLedgerItem accepts list and choices; every such item of the seeded
 * packs reaches the extraction lines; AC3 each list entry is its own fact with
 * its own verbatim span, an entry with none goes to unresolved; AC4 a choices
 * value is stored only when it is an allowed choice with a verbatim span;
 * AC5/AC6 bail_regular with and without the two fields, to the Drafter and to
 * the export; AC7 one entry without a span keeps the others; AC8 the server
 * ledger view and the skeleton brief carry every entry the way the Drafter
 * receives them; AC9 no prompt text changed.
 *
 * The model is the Anthropic SDK stub; every answer is a fixture.
 */
import './setupDb';
import { createHash } from 'crypto';

import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  AvermentCondition,
  conditionHolds,
  factEntriesByKey,
  factsByKey,
  loadAvermentLists,
  resolveAverments,
} from '../services/averments';
import {
  CLAUSES_MARKER,
  ledgerDrafterFacts,
  ledgerSkeletonBrief,
  packTexts,
} from '../services/brief-drafter';
import { DRAFTER_LEDGER_SYSTEM_PROMPT } from '../services/drafter.prompts';
import {
  LEDGER_DETAILS,
  applyEdit,
  carryOver,
  extractLines,
  isLedgerItem,
  isMultiItem,
  ledgerView,
  readExtraction,
} from '../services/fact-ledger.service';
import { VerifierInput, verifyAndRepair, verifyDraft } from '../services/fact-verifier';
import { Brief, ChecklistItem, buildChecklist } from '../services/intake-brief';
import { EXTRACT_SYSTEM_PROMPT, buildExtractUserPrompt } from '../services/intake.prompts';
import { normalise } from '../services/intake-text';
import { contentToHtml } from '../services/pdf-export.service';
import { listRulePackIds, loadRulePack } from '../services/rule-pack.service';
import { decrypt } from '../utils/encryption';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994391a1';
const INTAKE_MODEL = 'claude-haiku-4-5-20251001';
const DRAFT_MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const INTAKE_ID = '66666666-6666-4666-8666-666666666666';
const NOW_YEAR = 2026;

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

// ── the pack under test ─────────────────────────────────────────────────────
const PACK = loadRulePack('bail_regular')!;
const CHECKLIST = buildChecklist(PACK);
const item = (key: string): ChecklistItem => CHECKLIST.find((i) => i.key === key)!;
const SECTIONS = item('sections_charged');
const GROUNDS = item('grounds_for_bail');
const POLICE = item('police_station');
const G0 = GROUNDS.options[0];
const G2 = GROUNDS.options[2];

// The advocate's own words. Every span below is a substring of this.
const TEXT =
  'Mere client Ram Kumar ko FIR 124/2026 mein PS Kotwali ne pakda hai. ' +
  'Sections charged: 318(4) BNS, 319(2) BNS aur 61(2) BNS. ' +
  'Grounds: falsely implicated due to enmity, and no prior criminal record.';

const S1 = { key: 'sections_charged', span: '318(4) BNS', confidence: 0.99 };
const S2 = { key: 'sections_charged', span: '319(2) BNS', confidence: 0.99 };
const S3 = { key: 'sections_charged', span: '61(2) BNS', confidence: 0.99 };
const GA = {
  key: 'grounds_for_bail',
  span: 'falsely implicated due to enmity',
  option: G0,
  confidence: 0.95,
};
const GB = {
  key: 'grounds_for_bail',
  span: 'no prior criminal record',
  option: G2,
  confidence: 0.95,
};

const read = (facts: Array<Record<string, unknown>>, text = TEXT, checklist = CHECKLIST) =>
  readExtraction(checklist, text, { facts }, NOW_YEAR);

const entries = (r: ReturnType<typeof read>, key: string) => r.facts.filter((f) => f.key === key);

// A ledger fact built by hand.
function lf(key: string, display: string, extra: Record<string, unknown> = {}) {
  const it = CHECKLIST.find((i) => i.key === key);
  return {
    id: `id_${key}_${display}`,
    key,
    label: it?.label ?? key,
    type: it && it.kind === 'choices' ? 'enum' : 'text',
    value: display,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: true,
    ...extra,
  } as never;
}

// ═════════════════════════════════════════════════════════════════════════════
// AC2
// ═════════════════════════════════════════════════════════════════════════════
describe('T-189 AC2: isLedgerItem accepts list and choices; they reach the extraction lines', () => {
  it('isLedgerItem is true for list and choices; isMultiItem is true for exactly those two', () => {
    expect(SECTIONS.kind).toBe('list');
    expect(GROUNDS.kind).toBe('choices');
    expect(isLedgerItem(SECTIONS)).toBe(true);
    expect(isLedgerItem(GROUNDS)).toBe(true);
    expect(isMultiItem(SECTIONS)).toBe(true);
    expect(isMultiItem(GROUNDS)).toBe(true);
    expect(isMultiItem(POLICE)).toBe(false);
    expect(isMultiItem(item('facts_narrative'))).toBe(false);
  });

  it('every item kind of every pack is a ledger item', () => {
    for (const id of listRulePackIds()) {
      const pack = loadRulePack(id);
      if (!pack) continue;
      for (const i of buildChecklist(pack)) expect(isLedgerItem(i)).toBe(true);
    }
  });

  it.each(['bail_regular', 'bail_anticipatory'])(
    '%s: sections_charged (list) and grounds_for_bail (choices, with options) are on the extraction lines',
    (packId) => {
      const checklist = buildChecklist(loadRulePack(packId)!);
      const lines = extractLines(checklist);
      const sections = lines.find((l) => l.key === 'sections_charged');
      const grounds = lines.find((l) => l.key === 'grounds_for_bail');
      expect(sections).toBeDefined();
      expect(grounds).toBeDefined();
      expect(sections!.options).toEqual([]);
      const g = checklist.find((i) => i.key === 'grounds_for_bail')!;
      expect(g.kind).toBe('choices');
      expect(g.options.length).toBeGreaterThanOrEqual(2);
      expect(grounds!.options).toEqual(g.options);
      expect(grounds!.kind).toBe('choice');
      // and the prompt row for it carries the allowed values
      const user = buildExtractUserPrompt(lines, 'x');
      const row = user.split('\n').find((l) => l.startsWith('grounds_for_bail |'))!;
      expect(row).toContain(g.options[0].slice(0, 30));
      expect(user.split('\n').some((l) => l.startsWith('sections_charged |'))).toBe(true);
    },
  );

  it('every model-readable list or choices item of every pack is on its extraction lines', () => {
    let seen = 0;
    for (const id of listRulePackIds()) {
      const pack = loadRulePack(id);
      if (!pack) continue;
      const checklist = buildChecklist(pack);
      const lines = extractLines(checklist);
      for (const i of checklist.filter((x) => isMultiItem(x) && x.modelReadable)) {
        seen += 1;
        const line = lines.find((l) => l.key === i.key);
        expect(line).toBeDefined();
        expect(line!.options).toEqual(i.kind === 'choices' ? i.options : []);
      }
    }
    expect(seen).toBeGreaterThan(2);
  });

  it('the three seeded packs with no list or choices item have none (premise of the criterion)', () => {
    for (const id of ['legal_notice_s138', 'maintenance_bnss_144', 'default_bail']) {
      const checklist = buildChecklist(loadRulePack(id)!);
      expect(checklist.filter(isMultiItem)).toEqual([]);
    }
  });

  it('extracted entries become ledger facts: one per entry, typed, sourced user, required carried', () => {
    const r = read([S1, S2, GA, GB]);
    expect(r.unresolved).toEqual([]);
    expect(entries(r, 'sections_charged').map((f) => f.display)).toEqual([
      '318(4) BNS',
      '319(2) BNS',
    ]);
    const grounds = entries(r, 'grounds_for_bail');
    expect(grounds.map((f) => f.value)).toEqual([G0, G2]);
    for (const f of grounds) expect(f.type).toBe('enum');
    for (const f of r.facts) {
      expect(f.source).toBe('user');
      expect(f.required_in_draft).toBe(true);
      expect(f.label).toBe(item(f.key).label);
    }
    expect(new Set(r.facts.map((f) => f.id)).size).toBe(r.facts.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC3
// ═════════════════════════════════════════════════════════════════════════════
describe('T-189 AC3: each list entry has its own verbatim raw_span; one with none is unresolved', () => {
  it('every stored raw_span is a substring of the advocate’s words, one per entry', () => {
    const r = read([S1, S2, S3]);
    const spans = entries(r, 'sections_charged').map((f) => f.raw_span);
    expect(spans).toEqual(['318(4) BNS', '319(2) BNS', '61(2) BNS']);
    for (const s of spans) expect(TEXT).toContain(s);
  });

  it('a span the model re-spaced is stored as the text has it (verbatim)', () => {
    const text = 'Sections: 318(4)   BNS and 319(2) BNS.';
    const r = read([{ key: 'sections_charged', span: '318(4) BNS', confidence: 0.99 }], text);
    expect(entries(r, 'sections_charged')[0].raw_span).toBe('318(4)   BNS');
    expect(text).toContain(entries(r, 'sections_charged')[0].raw_span);
  });

  it('an invented span is not a fact: unresolved, no_verbatim_span, no words stored', () => {
    const r = read([S1, { key: 'sections_charged', span: 'Section 420 IPC', confidence: 0.99 }]);
    expect(entries(r, 'sections_charged')).toHaveLength(1);
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0]).toMatchObject({
      key: 'sections_charged',
      reason: 'no_verbatim_span',
      raw_span: '',
      detail: LEDGER_DETAILS.no_verbatim_span,
      label: SECTIONS.label,
    });
    expect(JSON.stringify(r)).not.toContain('420');
  });

  it('a missing, blank or oversized span is the same: unresolved once per key, not a fact', () => {
    const r = read([
      S1,
      { key: 'sections_charged', confidence: 0.9 },
      { key: 'sections_charged', span: '   ', confidence: 0.9 },
      { key: 'sections_charged', span: 'x'.repeat(7000), confidence: 0.9 },
      { key: 'sections_charged', span: 'not in the text', confidence: 0.9 },
    ]);
    expect(entries(r, 'sections_charged')).toHaveLength(1);
    expect(r.unresolved.filter((u) => u.key === 'sections_charged')).toHaveLength(1);
    expect(r.unresolved[0].reason).toBe('no_verbatim_span');
  });

  it('every span stored, in facts or unresolved, is verbatim in the text or empty', () => {
    const r = read([
      S1,
      { key: 'grounds_for_bail', span: 'invented words', option: G0, confidence: 0.9 },
      { ...GB, option: 'nope' },
    ]);
    expect(r.unresolved.length).toBeGreaterThan(0);
    for (const x of [...r.facts, ...r.unresolved]) {
      expect(x.raw_span === '' || TEXT.includes(x.raw_span)).toBe(true);
    }
  });

  it('other kinds are unchanged: an invented span is dropped and counted, never unresolved', () => {
    const r = read([
      { key: 'police_station', span: 'PS Nowhere', confidence: 0.99 },
      { key: 'police_station', confidence: 0.99 },
      { key: 'not_a_key', span: 'PS Kotwali', confidence: 0.99 },
    ]);
    expect(r.facts).toEqual([]);
    expect(r.unresolved).toEqual([]);
    expect(r.dropped.map((d) => d.reason).sort()).toEqual([
      'no_span',
      'not_on_list',
      'span_not_found',
    ]);
  });

  it('a list or choices entry is not counted among the dropped (it is accounted for in unresolved)', () => {
    const r = read([{ key: 'sections_charged', span: 'invented', confidence: 0.9 }]);
    expect(r.dropped).toEqual([]);
    expect(r.unresolved).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC4
// ═════════════════════════════════════════════════════════════════════════════
describe('T-189 AC4: a choices value is stored only when it is an allowed choice with a verbatim span', () => {
  it('an allowed choice with a verbatim span is stored as the canonical option', () => {
    const r = read([GA]);
    expect(entries(r, 'grounds_for_bail')).toHaveLength(1);
    expect(entries(r, 'grounds_for_bail')[0]).toMatchObject({
      value: G0,
      display: G0,
      raw_span: 'falsely implicated due to enmity',
    });
  });

  it('an option that differs only in case or spacing is stored as the allowed text', () => {
    const r = read([{ ...GA, option: `  ${G0.toUpperCase()}  ` }]);
    expect(entries(r, 'grounds_for_bail')[0].value).toBe(G0);
  });

  it('with no option given, a span that is itself an allowed choice is stored', () => {
    const text = `Grounds: ${G2}.`;
    const r = read([{ key: 'grounds_for_bail', span: G2, confidence: 0.99 }], text);
    expect(entries(r, 'grounds_for_bail')[0].value).toBe(G2);
    expect(entries(r, 'grounds_for_bail')[0].raw_span).toBe(G2);
  });

  it('a value outside the allowed choices is unresolved (not_an_option), with the span, and not a fact', () => {
    const r = read([GA, { ...GB, option: 'Because he is a good man' }]);
    expect(entries(r, 'grounds_for_bail').map((f) => f.value)).toEqual([G0]);
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0]).toMatchObject({
      key: 'grounds_for_bail',
      reason: 'not_an_option',
      raw_span: 'no prior criminal record',
      detail: LEDGER_DETAILS.not_an_option,
    });
  });

  it('an option with no span in the text is not stored, even when it is an allowed choice', () => {
    const r = read([
      { key: 'grounds_for_bail', span: 'he is innocent', option: G0, confidence: 0.99 },
    ]);
    expect(r.facts).toEqual([]);
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0].reason).toBe('no_verbatim_span');
  });

  it('a choice below the confidence floor is unresolved, the others stay', () => {
    const r = read([GA, { ...GB, confidence: 0.05 }]);
    expect(entries(r, 'grounds_for_bail').map((f) => f.value)).toEqual([G0]);
    expect(r.unresolved.map((u) => [u.key, u.reason])).toEqual([
      ['grounds_for_bail', 'low_confidence'],
    ]);
  });

  it('applyEdit: every picked choice must be allowed; a bad one saves nothing and keeps the old entries', () => {
    const state = { facts: [lf('grounds_for_bail', G0, { value: G0 })], unresolved: [] };
    const out = applyEdit(
      state as never,
      GROUNDS,
      { key: 'grounds_for_bail', text: [G2, 'Made up ground'] },
      NOW_YEAR,
    );
    expect(out.next).toBeNull();
    expect(out.result).toMatchObject({ status: 'unreadable', reason: 'not_an_option' });
  });

  it('applyEdit: all-valid picks are saved as asked facts, one per pick, canonical text', () => {
    const out = applyEdit(
      { facts: [], unresolved: [] } as never,
      GROUNDS,
      { key: 'grounds_for_bail', text: [G0.toLowerCase(), G2] },
      NOW_YEAR,
    );
    expect(out.result).toEqual({
      key: 'grounds_for_bail',
      status: 'saved',
      display: `${G0}, ${G2}`,
    });
    const facts = out.next!.facts.filter((f) => f.key === 'grounds_for_bail');
    expect(facts.map((f) => f.value)).toEqual([G0, G2]);
    expect(facts.every((f) => f.source === 'asked' && f.type === 'enum')).toBe(true);
    expect(out.reason).toBe('answer');
  });

  it('applyEdit: an answer from the questions step that is not an allowed choice stays outstanding (unresolved)', () => {
    const out = applyEdit(
      { facts: [], unresolved: [] } as never,
      GROUNDS,
      { key: 'grounds_for_bail', text: ['nonsense'], fromQuestion: true },
      NOW_YEAR,
    );
    expect(out.result).toMatchObject({ status: 'unreadable', reason: 'not_an_option' });
    expect(out.next!.facts).toEqual([]);
    expect(out.next!.unresolved).toHaveLength(1);
    expect(out.next!.unresolved[0]).toMatchObject({
      key: 'grounds_for_bail',
      reason: 'not_an_option',
      raw_span: 'nonsense',
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC7 and its neighbours
// ═════════════════════════════════════════════════════════════════════════════
describe('T-189 AC7: a list where one entry has no span keeps the entries that have one', () => {
  it('keeps the two with spans and puts the third in unresolved with its reason', () => {
    const r = read([
      S1,
      { key: 'sections_charged', span: 'Section 999 of nothing', confidence: 0.99 },
      S2,
    ]);
    expect(entries(r, 'sections_charged').map((f) => f.raw_span)).toEqual([
      '318(4) BNS',
      '319(2) BNS',
    ]);
    expect(r.unresolved.map((u) => [u.key, u.reason])).toEqual([
      ['sections_charged', 'no_verbatim_span'],
    ]);
  });

  it('the entries that were located are unaffected by where the bad one sits', () => {
    for (const order of [
      [0, 1, 2],
      [1, 0, 2],
      [1, 2, 0],
    ]) {
      const all = [S1, { key: 'sections_charged', span: 'nothing here', confidence: 0.9 }, S2];
      const r = read(order.map((i) => all[i]));
      expect(
        entries(r, 'sections_charged')
          .map((f) => f.display)
          .sort(),
      ).toEqual(['318(4) BNS', '319(2) BNS']);
      expect(r.unresolved).toHaveLength(1);
    }
  });

  it('only the bad entry: no fact for the key, one unresolved', () => {
    const r = read([{ key: 'sections_charged', span: 'nothing here', confidence: 0.9 }]);
    expect(r.facts).toEqual([]);
    expect(r.unresolved).toHaveLength(1);
  });
});

describe('T-189: several values are not a conflict; repeats are kept once; single values unchanged', () => {
  it('two different sections are two facts, never conflicting_values', () => {
    const r = read([S1, S2]);
    expect(entries(r, 'sections_charged')).toHaveLength(2);
    expect(r.unresolved).toEqual([]);
  });

  it('the same section given twice is one fact, at the higher confidence', () => {
    const text = 'Charged under 318(4) BNS. Again, 318(4) BNS.';
    const r = read(
      [
        { key: 'sections_charged', span: '318(4) BNS', confidence: 0.9 },
        { key: 'sections_charged', span: '318(4) BNS', confidence: 0.95 },
      ],
      text,
    );
    const e = entries(r, 'sections_charged');
    expect(e).toHaveLength(1);
    expect(e[0].confidence).toBe(0.95);
  });

  it('the same choice stated in two places is one fact', () => {
    const text = 'Falsely implicated due to enmity. He says: enmity, falsely implicated.';
    const r = read(
      [
        {
          key: 'grounds_for_bail',
          span: 'Falsely implicated due to enmity',
          option: G0,
          confidence: 0.9,
        },
        { key: 'grounds_for_bail', span: 'falsely implicated', option: G0, confidence: 0.9 },
      ],
      text,
    );
    expect(entries(r, 'grounds_for_bail')).toHaveLength(1);
  });

  it('an item that holds one value still conflicts on two different values (police_station)', () => {
    const text = 'PS Kotwali, nahi, PS Gandhi Maidan.';
    const r = read(
      [
        { key: 'police_station', span: 'PS Kotwali', confidence: 0.99 },
        { key: 'police_station', span: 'PS Gandhi Maidan', confidence: 0.99 },
      ],
      text,
    );
    expect(r.facts).toEqual([]);
    expect(r.unresolved.map((u) => u.reason)).toEqual(['conflicting_values']);
  });

  it('a single-value item reads as before next to list entries', () => {
    const r = read([{ key: 'police_station', span: 'PS Kotwali', confidence: 0.99 }, S1, S2]);
    expect(entries(r, 'police_station')).toHaveLength(1);
    expect(entries(r, 'police_station')[0].display).toBe('PS Kotwali');
    expect(entries(r, 'sections_charged')).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC8: answers, edits, the view, the Drafter and the brief
// ═════════════════════════════════════════════════════════════════════════════
describe('T-189 AC8: an edit of a list replaces every entry of the key', () => {
  const start = () => ({
    facts: [
      lf('police_station', 'PS Kotwali', { type: 'police_station' }),
      lf('sections_charged', '318(4) BNS'),
      lf('sections_charged', '319(2) BNS'),
    ],
    unresolved: [],
  });

  it('new entries replace all the old ones; other facts are untouched; reason edit', () => {
    const out = applyEdit(
      start() as never,
      SECTIONS,
      { key: 'sections_charged', text: ['103 BNS', '61(2) BNS'] },
      NOW_YEAR,
    );
    expect(out.reason).toBe('edit');
    expect(out.result).toEqual({
      key: 'sections_charged',
      status: 'saved',
      display: '103 BNS, 61(2) BNS',
    });
    const next = out.next!;
    expect(next.facts.filter((f) => f.key === 'sections_charged').map((f) => f.raw_span)).toEqual([
      '103 BNS',
      '61(2) BNS',
    ]);
    expect(
      next.facts.filter((f) => f.key === 'sections_charged').every((f) => f.source === 'asked'),
    ).toBe(true);
    expect(next.facts.find((f) => f.key === 'police_station')!.display).toBe('PS Kotwali');
    expect(next.facts).toHaveLength(3);
  });

  it('an empty array clears every entry of the key', () => {
    const out = applyEdit(
      start() as never,
      SECTIONS,
      { key: 'sections_charged', text: [] },
      NOW_YEAR,
    );
    expect(out.result).toEqual({ key: 'sections_charged', status: 'saved', display: null });
    expect(out.next!.facts.map((f) => f.key)).toEqual(['police_station']);
  });

  it('blank entries count as empty; an empty string clears too', () => {
    for (const text of [['', '  '], '']) {
      const out = applyEdit(
        start() as never,
        SECTIONS,
        { key: 'sections_charged', text },
        NOW_YEAR,
      );
      expect(out.next!.facts.map((f) => f.key)).toEqual(['police_station']);
    }
  });

  it('clearing an empty key changes nothing', () => {
    const out = applyEdit(
      { facts: [], unresolved: [] } as never,
      SECTIONS,
      { key: 'sections_charged', text: [] },
      NOW_YEAR,
    );
    expect(out.next).toBeNull();
  });

  it('a plain string for a list is one entry', () => {
    const out = applyEdit(
      { facts: [], unresolved: [] } as never,
      SECTIONS,
      { key: 'sections_charged', text: '103 BNS' },
      NOW_YEAR,
    );
    expect(out.next!.facts.map((f) => f.display)).toEqual(['103 BNS']);
  });

  it('the same entry twice is kept once', () => {
    const out = applyEdit(
      { facts: [], unresolved: [] } as never,
      SECTIONS,
      { key: 'sections_charged', text: ['103 BNS', '103 BNS'] },
      NOW_YEAR,
    );
    expect(out.next!.facts).toHaveLength(1);
  });

  it('the same entries again writes nothing', () => {
    const asked = {
      facts: [
        lf('sections_charged', '103 BNS', { source: 'asked' }),
        lf('sections_charged', '61(2) BNS', { source: 'asked' }),
      ],
      unresolved: [],
    };
    const out = applyEdit(
      asked as never,
      SECTIONS,
      { key: 'sections_charged', text: ['103 BNS', '61(2) BNS'] },
      NOW_YEAR,
    );
    expect(out.next).toBeNull();
    expect(out.result.status).toBe('saved');
  });

  it('an answer resolves an unresolved key: unresolved is removed, reason answer', () => {
    const state = {
      facts: [],
      unresolved: [
        {
          id: 'u',
          key: 'sections_charged',
          label: 'x',
          type: 'text',
          raw_span: '',
          source: 'user',
          reason: 'no_verbatim_span',
          detail: 'd',
        },
      ],
    };
    const out = applyEdit(
      state as never,
      SECTIONS,
      { key: 'sections_charged', text: ['103 BNS'] },
      NOW_YEAR,
    );
    expect(out.reason).toBe('answer');
    expect(out.next!.unresolved).toEqual([]);
    expect(out.next!.facts.map((f) => f.display)).toEqual(['103 BNS']);
  });

  it('an array for an item that holds one value is skipped', () => {
    const out = applyEdit(
      start() as never,
      POLICE,
      { key: 'police_station', text: ['A', 'B'] },
      NOW_YEAR,
    );
    expect(out.result).toEqual({ key: 'police_station', status: 'skipped' });
    expect(out.next).toBeNull();
  });

  it('a string for an item that holds one value is edited as before', () => {
    const out = applyEdit(
      start() as never,
      POLICE,
      { key: 'police_station', text: 'Gandhi Maidan' },
      NOW_YEAR,
    );
    expect(out.result.status).toBe('saved');
    expect(out.next!.facts.find((f) => f.key === 'police_station')!.raw_span).toBe('Gandhi Maidan');
    expect(out.next!.facts.filter((f) => f.key === 'sections_charged')).toHaveLength(2);
  });

  it('carryOver on a change of document keeps every asked entry of a key', () => {
    const earlier = {
      facts: [
        lf('sections_charged', '103 BNS', { source: 'asked' }),
        lf('sections_charged', '61(2) BNS', { source: 'asked' }),
      ],
      unresolved: [],
    };
    const fresh = { facts: [lf('sections_charged', '318(4) BNS')], unresolved: [] };
    const out = carryOver(fresh as never, earlier as never, CHECKLIST);
    expect(out.facts.map((f) => f.display)).toEqual(['103 BNS', '61(2) BNS']);
  });
});

describe('T-189 AC8: the server ledger view carries every entry', () => {
  const version = (n: number, reason: string, facts: unknown[], unresolved: unknown[] = []) => ({
    version: n,
    facts,
    unresolved,
    createdAt: new Date(),
    reason,
  });
  const doc = (versions: unknown[]) =>
    ({ id: 'L1', runType: 'user', documentKind: 'bail_regular', versions }) as never;

  it('has every entry, in order, and fields for list and choices keys', () => {
    const v = ledgerView(
      doc([
        version(1, 'extract', [
          lf('sections_charged', '318(4) BNS'),
          lf('sections_charged', '319(2) BNS'),
          lf('grounds_for_bail', G0, { value: G0 }),
        ]),
      ]),
      CHECKLIST,
    );
    expect(v.facts.filter((f) => f.key === 'sections_charged').map((f) => f.display)).toEqual([
      '318(4) BNS',
      '319(2) BNS',
    ]);
    expect(v.facts.filter((f) => f.key === 'grounds_for_bail')).toHaveLength(1);
    expect(v.fields.sections_charged).toBe('text');
    expect(v.fields.grounds_for_bail).toBe('enum');
    expect(Object.keys(v.fields)).toEqual(
      expect.arrayContaining(['sections_charged', 'grounds_for_bail', 'police_station']),
    );
  });

  it('an edit of a list gives each new entry the earlier entries, comma-joined, as previous_display', () => {
    const v = ledgerView(
      doc([
        version(1, 'extract', [
          lf('sections_charged', '318(4) BNS'),
          lf('sections_charged', '319(2) BNS'),
        ]),
        version(2, 'edit', [
          lf('sections_charged', '103 BNS', { source: 'asked' }),
          lf('sections_charged', '61(2) BNS', { source: 'asked' }),
        ]),
      ]),
      CHECKLIST,
    );
    const e = v.facts.filter((f) => f.key === 'sections_charged');
    expect(e).toHaveLength(2);
    for (const f of e) expect(f.previous_display).toBe('318(4) BNS, 319(2) BNS');
  });

  it('no previous_display when the entries did not change, or the change was an answer', () => {
    const same = ledgerView(
      doc([
        version(1, 'extract', [
          lf('sections_charged', '318(4) BNS'),
          lf('sections_charged', '319(2) BNS'),
          lf('police_station', 'PS A'),
        ]),
        version(2, 'edit', [
          lf('sections_charged', '318(4) BNS'),
          lf('sections_charged', '319(2) BNS'),
          lf('police_station', 'PS B'),
        ]),
      ]),
      CHECKLIST,
    );
    expect(
      same.facts
        .filter((f) => f.key === 'sections_charged')
        .every((f) => f.previous_display === undefined),
    ).toBe(true);
    expect(same.facts.find((f) => f.key === 'police_station')!.previous_display).toBe('PS A');

    const answer = ledgerView(
      doc([
        version(1, 'extract', [lf('sections_charged', '318(4) BNS')]),
        version(2, 'answer', [lf('sections_charged', '103 BNS', { source: 'asked' })]),
      ]),
      CHECKLIST,
    );
    expect(answer.facts[0].previous_display).toBeUndefined();
  });

  it('carries the unresolved entry of a list with its reason', () => {
    const u = {
      id: 'u1',
      key: 'sections_charged',
      label: 'Sections charged',
      type: 'text',
      raw_span: '',
      source: 'user',
      reason: 'no_verbatim_span',
      detail: LEDGER_DETAILS.no_verbatim_span,
    };
    const v = ledgerView(
      doc([version(1, 'extract', [lf('sections_charged', '318(4) BNS')], [u])]),
      CHECKLIST,
    );
    expect(v.unresolved).toEqual([u]);
  });
});

describe('T-189 AC8: the skeleton brief shows the entries the way the Drafter receives them', () => {
  const brief = (): Brief =>
    ({
      kind: { id: 'bail_regular', name: 'Regular bail', court_document: true },
      court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
      items: CHECKLIST.filter((i) =>
        ['police_station', 'sections_charged', 'grounds_for_bail', 'applicant_name'].includes(
          i.key,
        ),
      ).map((i) => ({
        ...i,
        value: i.kind === 'list' || i.kind === 'choices' ? ['brief value'] : 'brief value',
        source: 'user',
        please_check: false,
      })),
      loose_dates: [],
      unplaced: [],
      still_unknown: [],
      can_confirm: true,
      confirm_blockers: [],
      confirm_message: null,
    }) as never;
  const held = [
    lf('sections_charged', ' 318(4) BNS '),
    lf('sections_charged', '319(2) BNS'),
    lf('grounds_for_bail', G0, { value: G0 }),
    lf('grounds_for_bail', G2, { value: G2 }),
    lf('police_station', 'PS Kotwali', { type: 'police_station' }),
  ] as never[];
  const by = (b: Brief, k: string) => b.items.find((i) => i.key === k)!;

  it('a list or choices item takes an array of every entry; a single item takes its one display', () => {
    const out = ledgerSkeletonBrief(brief(), held);
    expect(by(out, 'sections_charged').value).toEqual(['318(4) BNS', '319(2) BNS']);
    expect(by(out, 'grounds_for_bail').value).toEqual([G0, G2]);
    expect(by(out, 'police_station').value).toBe('PS Kotwali');
    expect(by(out, 'applicant_name').value).toBeNull();
    expect(by(out, 'applicant_name').placeholder).toBe(
      `{{MISSING: ${item('applicant_name').label}}}`,
    );
    expect(JSON.stringify(out)).not.toContain('brief value');
  });

  it('one entry still gives an array for a list; a held single-entry list is not a bare string', () => {
    const out = ledgerSkeletonBrief(brief(), [lf('sections_charged', '103 BNS')]);
    expect(by(out, 'sections_charged').value).toEqual(['103 BNS']);
  });

  it('an unheld list or choices item is empty with {{MISSING: label}}', () => {
    const out = ledgerSkeletonBrief(brief(), []);
    expect(by(out, 'sections_charged').value).toBeNull();
    expect(by(out, 'sections_charged').placeholder).toBe(`{{MISSING: ${SECTIONS.label}}}`);
    expect(by(out, 'grounds_for_bail').placeholder).toBe(`{{MISSING: ${GROUNDS.label}}}`);
  });

  it('the Drafter gets one fact per entry, same key, same order, same text as the brief shows', () => {
    const facts = ledgerDrafterFacts(held as never, CHECKLIST, 'COURT', true);
    const out = ledgerSkeletonBrief(brief(), held);
    for (const key of ['sections_charged', 'grounds_for_bail']) {
      const sent = facts.facts.filter((f) => f.key === key).map((f) => f.display);
      expect(sent).toEqual(by(out, key).value);
      expect(sent.length).toBe(2);
    }
    expect(facts.facts.filter((f) => f.key === 'police_station')).toHaveLength(1);
    for (const row of facts.facts)
      expect(Object.keys(row).sort()).toEqual(['display', 'key', 'label', 'type']);
    expect(facts.missing.find((m) => m.key === 'sections_charged')).toBeUndefined();
    expect(facts.missing.find((m) => m.key === 'grounds_for_bail')).toBeUndefined();
  });

  it('a key with facts is held (not missing); a key with none is missing with its placeholder', () => {
    const out = ledgerDrafterFacts(
      [lf('sections_charged', '103 BNS')] as never,
      CHECKLIST,
      null,
      false,
    );
    expect(out.missing.find((m) => m.key === 'sections_charged')).toBeUndefined();
    expect(out.missing.find((m) => m.key === 'grounds_for_bail')!.write).toBe(
      `{{MISSING: ${GROUNDS.label}}}`,
    );
  });
});

describe('T-189: averments and the verifier read a key with several entries', () => {
  it('factEntriesByKey keeps every entry; blank displays are skipped', () => {
    const m = factEntriesByKey([
      lf('sections_charged', 'A'),
      lf('sections_charged', 'B'),
      lf('sections_charged', '  '),
      lf('police_station', 'P'),
    ] as never);
    expect(m.get('sections_charged')!.map((f) => f.display)).toEqual(['A', 'B']);
    expect(m.get('police_station')).toHaveLength(1);
  });

  it('factsByKey is as on develop_staging: one fact per key, the last entry wins, blanks skipped', () => {
    const one = lf('police_station', 'P');
    expect(factsByKey([one]).get('police_station')).toBe(one);
    const last = lf('sections_charged', '319(2) BNS');
    const m = factsByKey([
      lf('sections_charged', '318(4) BNS'),
      last,
      lf('sections_charged', '   '),
    ]);
    expect(m.get('sections_charged')).toBe(last);
    expect(m.get('sections_charged')!.display).toBe('319(2) BNS');
    expect(factsByKey([lf('sections_charged', ' ')]).has('sections_charged')).toBe(false);
  });

  it('factEntriesByKey: trims only, no de-dup, no merge, ledger order, holds no key without a non-empty entry', () => {
    const m = factEntriesByKey([
      lf('sections_charged', ' B '),
      lf('police_station', 'P'),
      lf('sections_charged', 'A'),
      lf('sections_charged', 'B'),
      lf('grounds_for_bail', '\t\n '),
      lf('grounds_for_bail', ''),
    ] as never);
    expect(m.get('sections_charged')!.map((f) => f.display.trim())).toEqual(['B', 'A', 'B']);
    expect([...m.keys()]).toEqual(['sections_charged', 'police_station']);
    expect(m.has('grounds_for_bail')).toBe(false);
  });

  it('unresolved items never reach factEntriesByKey, the Drafter facts or the skeleton array', () => {
    const out = ledgerDrafterFacts(
      [lf('sections_charged', '103 BNS')] as never,
      CHECKLIST,
      null,
      false,
    );
    expect(JSON.stringify(out.facts)).not.toContain('Section 420');
    const u = { key: 'sections_charged', raw_span: '', reason: 'no_verbatim_span' };
    expect(factEntriesByKey([u] as never).has('sections_charged')).toBe(false);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// T-228 folded in: the verifier and averment unlocking read every entry (Ajay's R1 to R5)
// ═════════════════════════════════════════════════════════════════════════════
function sec(section: string, act: string) {
  return lf('sections_charged', `${section} ${act}`, {
    type: 'section_ref',
    value: { act, section },
  });
}
const B318 = sec('318(4)', 'BNS');
const B319 = sec('319(2)', 'BNS');
// What the route actually stores: sections_charged entries are type text (ledger.fields.sections_charged).
const T318 = lf('sections_charged', '318(4) BNS');
const T319 = lf('sections_charged', '319(2) BNS');

function verifierInput(facts: unknown[], body: string): VerifierInput {
  return {
    body,
    facts: facts as never,
    unresolved: [],
    lists: loadAvermentLists('bail_regular'),
    skeleton: [],
    packText: packTexts(PACK),
  };
}
const repairSpy = (reply: string | null) =>
  jest.fn(async (_system: string, _user: string): Promise<string | null> => reply);

describe('R5 verifier: each entry of a list is checked on its own', () => {
  it.each([
    ['text entries, as the route stores them', [T318, T319]],
    ['section_ref entries', [B318, B319]],
  ])('R5-1: entries 318(4) BNS and 319(2) BNS (%s), draft cites both: no violation, no repair call, no {{MISSING}}', async (_n, facts) => {
    const body = '1. That the applicant is charged under Section 318(4) BNS and Section 319(2) BNS.';
    expect(verifyDraft(verifierInput(facts, body))).toEqual([]);
    const repair = repairSpy('should never be used');
    const out = await verifyAndRepair(verifierInput(facts, body), repair);
    expect(repair).not.toHaveBeenCalled();
    expect(out.passed).toBe(true);
    expect(out.repairRan).toBe(false);
    expect(out.initial).toEqual([]);
    expect(out.banner).toBeNull();
    expect(out.body).toBe(body);
    expect(out.body).not.toContain('{{MISSING');
  });

  it('R5-1 (two paragraphs, one entry each): still no violation and no repair call', async () => {
    const body =
      '1. That the applicant is charged under Section 318(4) BNS.\n\n2. That the applicant is also charged under Section 319(2) BNS.';
    const repair = repairSpy('x');
    const out = await verifyAndRepair(verifierInput([T318, T319], body), repair);
    expect(out.initial).toEqual([]);
    expect(repair).not.toHaveBeenCalled();
    expect(out.body).toBe(body);
  });

  it.each([
    ['text entries', [T318, T319]],
    ['section_ref entries', [B318, B319]],
  ])('R5-2: draft cites only 319(2) BNS (%s): exactly one dropped violation, for 318(4) BNS', (_n, facts) => {
    const body = '1. That the applicant is charged under Section 319(2) BNS.';
    const vs = verifyDraft(verifierInput(facts, body));
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({
      check: 'dropped',
      reason: 'left_out',
      ledgerKey: 'sections_charged',
      ledgerValue: '318(4) BNS',
      draftValue: null,
    });
    expect(JSON.stringify(vs)).not.toContain('319(2)');
    expect(vs[0].ledgerValue).not.toContain(',');
  });

  it('R5-2 (the repair): runs once, one fact line per entry, never joined; an unfixed draft ends with the entry left out and flagged', async () => {
    const body = '1. That the applicant is charged under Section 319(2) BNS.';
    const repair = repairSpy(null);
    const out = await verifyAndRepair(verifierInput([T318, T319], body), repair);
    expect(repair).toHaveBeenCalledTimes(1);
    const user = repair.mock.calls[0][1];
    const factsPart = user.slice(user.indexOf('FACTS:'), user.indexOf('BANNED ASSERTIONS'));
    const sent = (JSON.parse(factsPart.slice('FACTS:'.length)) as Array<{ key: string; display: string }>)
      .filter((f) => f.key === 'sections_charged')
      .map((f) => f.display);
    expect(sent).toEqual(['318(4) BNS', '319(2) BNS']);
    // Ajay (11 Oct 2026): today's shape, {key, label, type, display}, one line per entry, no raw_span
    const lines = JSON.parse(factsPart.slice('FACTS:'.length)) as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(Object.keys(l).sort()).toEqual(['display', 'key', 'label', 'type']);
    expect(factsPart).not.toContain('raw_span');
    expect(user).not.toMatch(/318\(4\) BNS(,| and) 319\(2\) BNS/);
    expect(out.initial).toHaveLength(1);
    expect(out.initial[0].check).toBe('dropped');
  });

  it('R5-3: draft cites 318(4) IPC: the 318(4) BNS entry is not present (dropped) - entries as the route stores them (text)', () => {
    const body =
      '1. That the applicant is charged under Section 318(4) IPC and Section 319(2) BNS.';
    const vs = verifyDraft(verifierInput([T318, T319], body));
    const dropped = vs.filter((v) => v.check === 'dropped');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].ledgerValue).toBe('318(4) BNS');
    expect(dropped.map((v) => v.ledgerValue)).not.toContain('319(2) BNS');
  });

  it('R5-3 FINDING, follow-up T-231 (section-aware matching), current behaviour and not asserted as desired: for a section_ref entry the unchanged present() also matches on the section number alone, so 318(4) IPC satisfies a section_ref 318(4) BNS entry', () => {
    // present() is unchanged by this ticket. The route never stores sections_charged as section_ref
    // (fields.sections_charged is "text"), so AC5 is not affected; a section_ref fact elsewhere is.
    const body =
      '1. That the applicant is charged under Section 318(4) IPC and Section 319(2) BNS.';
    const vs = verifyDraft(verifierInput([B318, B319], body));
    expect(vs.filter((v) => v.check === 'dropped')).toEqual([]);
  });

  it('R5 (not in facts): a section the advocate did not give is still unsupported (318(3) BNS)', () => {
    const body =
      '1. That the applicant is charged under Section 318(4) BNS and Section 319(2) BNS and Section 318(3) BNS.';
    const vs = verifyDraft(verifierInput([B318, B319], body));
    expect(vs.some((v) => v.check === 'dropped')).toBe(false);
    const bad = vs.filter((v) => v.check === 'unsupported');
    expect(bad.length).toBeGreaterThan(0);
    expect(JSON.stringify(bad)).toContain('318(3)');
    expect(JSON.stringify(bad)).not.toContain('"draftValue":"319(2)');
  });

  it('R5 (not in facts, replaced): the unsupported one becomes a placeholder; the two given stay', async () => {
    const body =
      '1. That the applicant is charged under Section 318(4) BNS and Section 319(2) BNS and Section 318(3) BNS.';
    const out = await verifyAndRepair(verifierInput([B318, B319], body), repairSpy(null));
    expect(out.body).toContain('{{MISSING');
    expect(out.body).toContain('318(4) BNS');
    expect(out.body).toContain('319(2) BNS');
    expect(out.body).not.toContain('318(3)');
  });

  it('R5 (text list, whole phrase each): every ground present passes; one left out is its own dropped violation', () => {
    // an enum entry is never checked as left out by present(); a text entry is, as a whole phrase
    const g = (d: string) => lf('grounds_for_bail', d, { type: 'text' });
    const facts = [g('falsely implicated due to enmity'), g('no prior criminal record')];
    const both =
      '1. That the applicant is falsely implicated due to enmity.\n\n2. That he has no prior criminal record.';
    expect(verifyDraft(verifierInput(facts, both))).toEqual([]);
    const one = '1. That the applicant is falsely implicated due to enmity.';
    const vs = verifyDraft(verifierInput(facts, one));
    expect(vs.map((v) => [v.check, v.ledgerValue])).toEqual([
      ['dropped', 'no prior criminal record'],
    ]);
  });

  it('R5-5: single-value keys, the verifier gives what it gave: one section, present passes, absent is one dropped', async () => {
    const present = '1. That the applicant is charged under Section 318(4) BNS.';
    expect(verifyDraft(verifierInput([B318], present))).toEqual([]);
    const absent = '1. That the applicant seeks regular bail.';
    const vs = verifyDraft(verifierInput([B318], absent));
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ check: 'dropped', ledgerValue: '318(4) BNS' });
    const wrong = '1. That the applicant is charged under Section 319(2) BNS.';
    const w = verifyDraft(verifierInput([B318], wrong));
    expect(w.map((v) => v.check).sort()).toEqual(['dropped', 'unsupported']);
    const repair = repairSpy(null);
    await verifyAndRepair(verifierInput([B318], absent), repair);
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it('R5-5: single-value keys of other types: police station, name, date', () => {
    const facts = [
      lf('police_station', 'Kotwali', { type: 'police_station', value: 'kotwali' }),
      lf('applicant_name', 'Ram Kumar', { type: 'person_name', value: 'ramkumar' }),
    ];
    const ok =
      '1. That the applicant Ram Kumar was taken to Police Station Kotwali.';
    expect(verifyDraft(verifierInput(facts, ok))).toEqual([]);
    const bad = '1. That the applicant Ram Kumar was taken to Police Station Hazratganj.';
    const vs = verifyDraft(verifierInput(facts, bad));
    expect(vs.length).toBeGreaterThan(0);
    expect(vs.some((v) => v.check === 'dropped' && v.ledgerKey === 'police_station')).toBe(true);
  });

  it('R2: the repair input is one fact line per held entry; an unresolved entry never reaches it or the sources', async () => {
    const unresolved = [
      { key: 'sections_charged', raw_span: 'Section 420 IPC', reason: 'no_verbatim_span' },
    ];
    const body = '1. That the applicant is charged under Section 319(2) BNS and Section 420 IPC.';
    const input = { ...verifierInput([B318, B319], body), unresolved: unresolved as never };
    const vs = verifyDraft(input);
    expect(JSON.stringify(vs)).not.toContain('"ledgerValue":"Section 420');
    const repair = repairSpy(null);
    await verifyAndRepair(input, repair);
    expect(repair).toHaveBeenCalledTimes(1);
    const user = repair.mock.calls[0][1];
    const factsPart = user.slice(user.indexOf('FACTS:'), user.indexOf('BANNED ASSERTIONS'));
    expect(factsPart).toContain('318(4) BNS');
    expect(factsPart).toContain('319(2) BNS');
    expect(factsPart).not.toContain('420');
  });

  it('T3: no entry carries a joined raw_span anywhere: the violations name entries, not a join', () => {
    const body = '1. That the applicant is charged under Section 61(2) BNS.';
    const vs = verifyDraft(verifierInput([B318, B319], body));
    const dropped = vs.filter((v) => v.check === 'dropped').map((v) => v.ledgerValue);
    expect(dropped.sort()).toEqual(['318(4) BNS', '319(2) BNS']);
    for (const v of vs) expect(String(v.ledgerValue)).not.toMatch(/,|\band\b/);
  });

  describe("Ajay condition (2.1): joined citation 'Sections 318(4) and 319(2) BNS'", () => {
    const textual = [lf('sections_charged', '318(4) BNS'), lf('sections_charged', '319(2) BNS')];
    const CITATION = 'Sections 318(4) and 319(2) BNS';
    const body = `1. That the applicant is charged under ${CITATION}.`;

    it('exactly one dropped violation, for 318(4) BNS and none for 319(2) BNS', () => {
      const vs = verifyDraft(verifierInput(textual, body));
      expect(vs).toHaveLength(1);
      expect(vs[0]).toMatchObject({ check: 'dropped', ledgerValue: '318(4) BNS' });
      expect(vs.map((v) => v.ledgerValue)).not.toContain('319(2) BNS');
    });

    it.each([
      ['a repair that fails (null)', () => repairSpy(null)],
      [
        'a repair that echoes the paragraph unchanged',
        () => repairSpy('[[P0]]\n' + body),
      ],
    ])(
      'with %s: at most one repair call, no placeholder inserted, the citation text untouched, flagged not blanked',
      async (_n, makeRepair) => {
        const repair = makeRepair();
        const out = await verifyAndRepair(verifierInput(textual, body), repair);
        expect(repair.mock.calls.length).toBeLessThanOrEqual(1);
        expect(out.body).toContain(CITATION);
        expect(out.body).toBe(body);
        expect(out.body).not.toContain('{{MISSING');
        expect(out.body).not.toContain('[To be confirmed');
        expect(out.initial.filter((v) => v.check === 'dropped').map((v) => v.ledgerValue)).toEqual([
          '318(4) BNS',
        ]);
        expect(out.records.every((r) => r.resolution !== 'placeholdered')).toBe(true);
        expect(out.records.every((r) => r.resolution !== 'stripped')).toBe(true);
      },
    );
  });
});

// Reference: conditionHolds exactly as on develop_staging (one fact per key), copied here.
function refFolded(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return normalise(v).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return '';
}
function refHolds(
  c: AvermentCondition | null,
  facts: ReadonlyMap<string, { value: unknown; display: string }>,
): boolean {
  if (c === null) return false;
  if ('all_of' in c) return c.all_of.every((x) => refHolds(x, facts));
  const fact = facts.get(c.key);
  if (!fact) return false;
  const seen = new Set([refFolded(fact.value), refFolded(fact.display)].filter((s) => s !== ''));
  if (c.present === true) return seen.size > 0;
  if (c.equals !== undefined) {
    const wanted = (Array.isArray(c.equals) ? c.equals : [c.equals]).map(refFolded);
    return wanted.some((w) => seen.has(w));
  }
  if (c.not_in !== undefined) {
    if (seen.size === 0) return false;
    return !c.not_in.map(refFolded).some((w) => seen.has(w));
  }
  return false;
}

type KeyCond = Exclude<AvermentCondition, { all_of: unknown }>;

describe('R3 and R5: averment unlocking over every entry of a key', () => {
  const E = (...displays: string[]) => displays.map((d) => lf('sections_charged', d));
  const M = (key: string, entries: unknown[]) => new Map([[key, entries]]) as never;

  it('R5-4: equals is met by the second entry of a list (and by the first, and not by none)', () => {
    const c: AvermentCondition = { key: 'sections_charged', equals: '319(2) BNS' };
    expect(conditionHolds(c, M('sections_charged', E('318(4) BNS', '319(2) BNS')))).toBe(true);
    expect(conditionHolds(c, M('sections_charged', E('319(2) BNS', '318(4) BNS')))).toBe(true);
    expect(conditionHolds(c, M('sections_charged', E('318(4) BNS', '61(2) BNS')))).toBe(false);
    const many: AvermentCondition = { key: 'sections_charged', equals: ['x', '61(2) BNS'] };
    expect(conditionHolds(many, M('sections_charged', E('318(4) BNS', '61(2) BNS')))).toBe(true);
  });

  it('R5-4: not_in fails when any one entry is in the set, wherever it sits; passes when none is', () => {
    const c: AvermentCondition = { key: 'sections_charged', not_in: ['103 BNS'] };
    expect(conditionHolds(c, M('sections_charged', E('318(4) BNS', '103 BNS')))).toBe(false);
    expect(conditionHolds(c, M('sections_charged', E('103 BNS', '318(4) BNS')))).toBe(false);
    expect(conditionHolds(c, M('sections_charged', E('103 BNS')))).toBe(false);
    expect(conditionHolds(c, M('sections_charged', E('318(4) BNS', '319(2) BNS')))).toBe(true);
    expect(conditionHolds(c, M('sections_charged', E('318(4) BNS')))).toBe(true);
  });

  it('R3: present needs one non-empty entry; a missing key, an empty list, or only blank entries never unlock', () => {
    const present: AvermentCondition = { key: 'sections_charged', present: true };
    const equals: AvermentCondition = { key: 'sections_charged', equals: 'x' };
    const notIn: AvermentCondition = { key: 'sections_charged', not_in: ['x'] };
    const blank = { ...(lf('sections_charged', '') as object), value: '' };
    expect(conditionHolds(present, M('sections_charged', [blank, E('A')[0]]))).toBe(true);
    expect(conditionHolds(present, M('sections_charged', E('A', 'B')))).toBe(true);
    for (const c of [present, equals, notIn]) {
      expect(conditionHolds(c, new Map())).toBe(false);
      expect(conditionHolds(c, M('sections_charged', []))).toBe(false);
      expect(conditionHolds(c, M('police_station', E('A')))).toBe(false);
    }
    expect(conditionHolds(present, M('sections_charged', [blank]))).toBe(false);
    expect(conditionHolds(notIn, M('sections_charged', [blank]))).toBe(false);
    expect(conditionHolds(null, M('sections_charged', E('A')))).toBe(false);
    // factEntriesByKey never holds an empty array
    expect(factEntriesByKey([lf('sections_charged', ' ')] as never).has('sections_charged')).toBe(
      false,
    );
  });

  it('R3: all_of applies to each child under its own row', () => {
    const c: AvermentCondition = {
      all_of: [
        { key: 'sections_charged', equals: '319(2) BNS' },
        { key: 'sections_charged', not_in: ['103 BNS'] },
        { key: 'police_station', present: true },
      ],
    };
    const station = [lf('police_station', 'Kotwali')];
    const map = (sections: string[], extra: unknown[] = station) =>
      factEntriesByKey([...E(...sections), ...extra] as never);
    expect(conditionHolds(c, map(['318(4) BNS', '319(2) BNS']))).toBe(true);
    expect(conditionHolds(c, map(['318(4) BNS', '319(2) BNS', '103 BNS']))).toBe(false);
    expect(conditionHolds(c, map(['318(4) BNS']))).toBe(false);
    expect(conditionHolds(c, map(['318(4) BNS', '319(2) BNS'], []))).toBe(false);
  });

  it('R5-5: single-value keys give the same result as develop_staging, for every condition in every seeded pack', () => {
    const ids = listRulePackIds();
    expect(ids.length).toBeGreaterThanOrEqual(5);
    const conds: KeyCond[] = [];
    const collect = (c: AvermentCondition | null) => {
      if (c === null) return;
      if ('all_of' in c) c.all_of.forEach(collect);
      else conds.push(c);
    };
    for (const id of ids) {
      const l = loadAvermentLists(id);
      for (const b of l.banned) collect(b.unlocked_by);
      for (const a of l.allowed) collect(a.requires);
    }
    expect(conds.length).toBeGreaterThan(0);
    let compared = 0;
    for (const c of conds) {
      const wanted: string[] = [
        ...(c.equals === undefined ? [] : Array.isArray(c.equals) ? c.equals : [c.equals]),
        ...(c.not_in ?? []),
        'zzz unrelated',
        '',
      ].map(String);
      for (const v of wanted) {
        const f = lf(c.key, v, { value: v });
        const single = new Map([[c.key, [f]]]);
        const expected = refHolds(c, new Map([[c.key, f as never]]));
        expect(conditionHolds(c, single as never)).toBe(expected);
        compared++;
      }
      expect(conditionHolds(c, new Map())).toBe(false);
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('R5-5: resolveAverments on single-value ledgers equals its result through the one-fact-per-key reading', () => {
    for (const id of listRulePackIds()) {
      const lists = loadAvermentLists(id);
      const keys = new Set<string>();
      const collect = (c: AvermentCondition | null) => {
        if (c === null) return;
        if ('all_of' in c) c.all_of.forEach(collect);
        else keys.add(c.key);
      };
      for (const b of lists.banned) collect(b.unlocked_by);
      for (const a of lists.allowed) collect(a.requires);
      const ledgers: unknown[][] = [[], [...keys].map((k) => lf(k, 'Something'))];
      for (const k of keys) ledgers.push([lf(k, 'Something')]);
      for (const ledger of ledgers) {
        const out = resolveAverments(lists, ledger as never);
        const byKey = factsByKey(ledger as never);
        const stillBanned = new Set(
          lists.banned.filter((b) => !refHolds(b.unlocked_by, byKey)).map((b) => b.id),
        );
        const allowedIds = lists.allowed
          .filter((a) => !stillBanned.has(a.id) && refHolds(a.requires, byKey))
          .map((a) => a.id);
        expect(out.banned.map((b) => b.id)).toEqual(
          lists.banned.filter((b) => stillBanned.has(b.id)).map((b) => b.id),
        );
        // an allowed entry that names a fact the ledger lacks is dropped in both; only subset check
        for (const a of out.allowed) expect(allowedIds).toContain(a.id);
      }
    }
  });

  it('T2: resolveAverments sees every entry of a list key (a later entry unlocks), single keys unchanged', () => {
    const synthetic = {
      banned: [
        {
          id: 'b1',
          kind: 'averment' as const,
          phrases: ['p1'],
          unlocked_by: { key: 'sections_charged', equals: '319(2) BNS' } as AvermentCondition,
        },
        {
          id: 'b2',
          kind: 'averment' as const,
          phrases: ['p2'],
          unlocked_by: { key: 'sections_charged', not_in: ['103 BNS'] } as AvermentCondition,
        },
      ],
      allowed: [],
    };
    const both = resolveAverments(synthetic as never, E('318(4) BNS', '319(2) BNS') as never);
    expect(both.banned.map((b) => b.id)).toEqual([]);
    const withBar = resolveAverments(
      synthetic as never,
      E('318(4) BNS', '319(2) BNS', '103 BNS') as never,
    );
    expect(withBar.banned.map((b) => b.id)).toEqual(['b2']);
    const none = resolveAverments(synthetic as never, [] as never);
    expect(none.banned.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('blocker trigger: no averment of the 5 seeded packs interpolates or conditions on a list or choices key', () => {
    const multiKeys = new Set(
      listRulePackIds().flatMap((id) =>
        buildChecklist(loadRulePack(id)!)
          .filter((i) => isMultiItem(i))
          .map((i) => i.key),
      ),
    );
    expect(multiKeys.size).toBeGreaterThan(0);
    for (const id of listRulePackIds()) {
      const l = loadAvermentLists(id);
      const used: string[] = [];
      const collect = (c: AvermentCondition | null) => {
        if (c === null) return;
        if ('all_of' in c) c.all_of.forEach(collect);
        else used.push(c.key);
      };
      for (const b of l.banned) collect(b.unlocked_by);
      for (const a of l.allowed) {
        collect(a.requires);
        for (const m of a.averment.matchAll(/\{\{([a-z0-9_.]+)\}\}/g)) used.push(m[1]);
      }
      for (const k of used) expect(multiKeys.has(k)).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC9
// ═════════════════════════════════════════════════════════════════════════════
describe('T-189 AC9: no prompt text changed', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');

  // These hashes pin the wording Ajay signed. Change them only with his signed diff.
  it('the extraction system prompt is unchanged', () => {
    expect(sha(EXTRACT_SYSTEM_PROMPT)).toBe(
      'c052d071b9a866609626d6439e78ba364981d83e9517bf3e4b694a91f82e142f',
    );
  });
  it('the ledger Drafter system prompt is unchanged', () => {
    expect(sha(DRAFTER_LEDGER_SYSTEM_PROMPT)).toBe(
      '299e8a93dbcbb4926eb43af131f7525e2e32061d3540d94ca34876428d3ac34c',
    );
  });
  it('the extraction user prompt template is unchanged', () => {
    expect(
      buildExtractUserPrompt(
        [
          { key: 'a', what: 'A thing', kind: 'text', options: [] },
          { key: 'b', what: 'B | thing', kind: 'choice', options: ['x', 'y'] },
        ],
        'DESC',
      ),
    ).toBe(
      'FACT LIST (key | what it is | kind | allowed values, if any):\n' +
        'a | A thing | text\n' +
        'b | B / thing | choice | x; y\n\n' +
        'DESCRIPTION:\n<description>\nDESC\n</description>',
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC5, AC6 end to end
// ═════════════════════════════════════════════════════════════════════════════
const MATCH_BAIL = JSON.stringify({
  template_id: 'bail_regular',
  confidence: 'high',
  alternatives: [],
  is_legal_drafting: true,
  is_court_document: true,
  label: 'regular bail',
  category: 'other',
});
const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

function queue(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
}
function callOf(n: number): { system: string; user: string } {
  const p = mockMessagesStream.mock.calls[n][0] as SdkStreamParams;
  return { system: p.system, user: p.messages[0].content };
}
function event(text: string, name: string): Record<string, unknown> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}
interface PromptFacts {
  court: string | null;
  facts: Array<{ key: string; label: string; type: string; display: string }>;
  missing: Array<{ key: string; label: string; write: string }>;
}
function factsOf(prompt: string): PromptFacts {
  const from = prompt.indexOf('FACTS:\n');
  const to = prompt.indexOf('\n\nCLAUSES');
  expect(from).toBeGreaterThan(-1);
  return JSON.parse(prompt.slice(from + 'FACTS:\n'.length, to)) as PromptFacts;
}
function describeBail(description: string) {
  return request(app)
    .post('/intake/brief')
    .set(headers())
    .send({ description, intake_id: INTAKE_ID });
}
function generate(ledgerId: string) {
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: 'bail_regular',
      values: [{ key: 'applicant_name', value: 'Ram Kumar' }],
      court,
      ledger_id: ledgerId,
    });
}
const BODY_FIRST =
  "1. That the applicant Ram Kumar has approached this Hon'ble Court for regular bail.";
function drafterAnswer(body: string): string {
  const ids = PACK.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  return `${body}\n\n${CLAUSES_MARKER}\n${ids}`;
}

describe('T-189 AC5 and AC6: bail_regular, from the description to the Drafter input', () => {
  beforeEach(async () => {
    _clearAppSettingsCache();
    await redis.flushall();
    await AppSetting.create({ key: 'ai.intake_model', value: INTAKE_MODEL });
    await AppSetting.create({ key: 'ai.drafting_model', value: DRAFT_MODEL });
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
    for (const m of [INTAKE_MODEL, DRAFT_MODEL]) {
      await AppSetting.create({
        key: `ai.rates.${m}`,
        value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
      });
    }
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
    await User.create({
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

  it('AC5 end to end: given in the description, the delivered draft carries both sections and both grounds, with no placeholder, no repair and no banner', async () => {
    // the applicant's name is in the ledger too, so the one name the draft states is a given one
    const NAME = { key: 'applicant_name', span: 'Ram Kumar', confidence: 0.99 };
    const extraction = JSON.stringify({ facts: [NAME, S1, S2, GA, GB] });
    const SECTIONS_PARA = 'That the applicant is charged under 318(4) BNS and 319(2) BNS.';
    const GROUNDS_PARA = `That bail is sought on these grounds: ${G0}; ${G2}.`;
    queue(
      MATCH_BAIL,
      EMPTY_READ,
      extraction,
      drafterAnswer(`${BODY_FIRST}\n\n2. ${SECTIONS_PARA}\n\n3. ${GROUNDS_PARA}`),
    );
    const res = await describeBail(TEXT);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    // the extraction call was sent both lines, with the options for the choices line
    const extractCall = callOf(2);
    expect(extractCall.user).toMatch(/^sections_charged \|/m);
    expect(extractCall.user).toMatch(/^grounds_for_bail \|.*\|.*\|.*;/m);

    const ledger = res.body.ledger;
    const ofKey = (k: string) => ledger.facts.filter((f: { key: string }) => f.key === k);
    expect(ofKey('sections_charged').map((f: { raw_span: string }) => f.raw_span)).toEqual([
      '318(4) BNS',
      '319(2) BNS',
    ]);
    expect(ofKey('grounds_for_bail').map((f: { value: string }) => f.value)).toEqual([G0, G2]);
    for (const f of [...ofKey('sections_charged'), ...ofKey('grounds_for_bail')])
      expect(TEXT).toContain(f.raw_span);
    expect(ledger.fields.sections_charged).toBe('text');
    expect(ledger.fields.grounds_for_bail).toBe('enum');

    const gen = await generate(ledger.ledger_id as string);
    expect(gen.status).toBe(200);
    // the Drafter's input: every entry, neither key missing
    const { user } = callOf(3);
    const f = factsOf(user);
    expect(f.facts.filter((x) => x.key === 'sections_charged').map((x) => x.display)).toEqual([
      '318(4) BNS',
      '319(2) BNS',
    ]);
    expect(f.facts.filter((x) => x.key === 'grounds_for_bail').map((x) => x.display)).toEqual([
      G0,
      G2,
    ]);
    expect(f.missing.map((m) => m.key)).not.toContain('sections_charged');
    expect(f.missing.map((m) => m.key)).not.toContain('grounds_for_bail');
    expect(user).not.toContain(`{{MISSING: ${SECTIONS.label}}}`);
    expect(user).not.toContain(`{{MISSING: ${GROUNDS.label}}}`);

    // The delivered draft: the verifier saw every entry, so it asked for no repair.
    expect(event(gen.text, 'error')).toBeNull();
    expect(gen.text).not.toContain('event: repair');
    expect(mockMessagesStream).toHaveBeenCalledTimes(4); // match, read, extract, Drafter: no fact repair
    const done = event(gen.text, 'done')!;
    expect(done).toBeTruthy();
    expect(done.factCheck).toEqual({ banner: null });
    const doc = await LawieDocument.findById(done.docId as string).lean();
    const saved = decrypt(doc!.generatedContent);
    expect(saved).toContain('318(4) BNS and 319(2) BNS');
    expect(saved).toContain(G0);
    expect(saved).toContain(G2);
    // neither of the two labels is a blank in the delivered draft (other parts of the template keep theirs)
    for (const label of [SECTIONS.label, GROUNDS.label]) {
      expect(saved).not.toContain(`{{MISSING: ${label}}}`);
      expect(saved).not.toContain(`[To be confirmed: ${label}]`);
    }
    // and the export prints them, with no visible blank
    const html = contentToHtml(saved, false);
    expect(html).toContain('318(4) BNS and 319(2) BNS');
    expect(html).not.toContain(`[To be confirmed: ${SECTIONS.label}]`);
    expect(html).not.toContain(`[To be confirmed: ${GROUNDS.label}]`);
  });

  it('AC6: with neither given, both are missing, as today, and print as [To be confirmed: label]', async () => {
    const desc = 'Mere client Ram Kumar ko FIR 124/2026 mein PS Kotwali ne pakda hai.';
    const sectionsBlank = `{{MISSING: ${SECTIONS.label}}}`;
    const groundsBlank = `{{MISSING: ${GROUNDS.label}}}`;
    queue(
      MATCH_BAIL,
      EMPTY_READ,
      JSON.stringify({ facts: [{ key: 'police_station', span: 'PS Kotwali', confidence: 0.99 }] }),
      drafterAnswer(
        `${BODY_FIRST}\n\n2. That the applicant is charged under ${sectionsBlank}.\n\n3. That the grounds are ${groundsBlank}.`,
      ),
    );
    const res = await describeBail(desc);
    expect(res.status).toBe(200);
    expect(res.body.ledger.facts.map((f: { key: string }) => f.key)).not.toContain(
      'sections_charged',
    );
    expect(res.body.ledger.facts.map((f: { key: string }) => f.key)).not.toContain(
      'grounds_for_bail',
    );
    expect(res.body.ledger.unresolved).toEqual([]);

    const gen = await generate(res.body.ledger.ledger_id as string);
    expect(gen.status).toBe(200);
    const f = factsOf(callOf(3).user);
    expect(
      f.facts.filter((x) => x.key === 'sections_charged' || x.key === 'grounds_for_bail'),
    ).toEqual([]);
    expect(f.missing.find((m) => m.key === 'sections_charged')!.write).toBe(sectionsBlank);
    expect(f.missing.find((m) => m.key === 'grounds_for_bail')!.write).toBe(groundsBlank);

    // the export prints each as the visible blank
    const html = contentToHtml(
      `2. Charged under ${sectionsBlank}.\n\n3. Grounds ${groundsBlank}.`,
      false,
    );
    expect(html).toContain(`[To be confirmed: ${SECTIONS.label}]`);
    expect(html).toContain(`[To be confirmed: ${GROUNDS.label}]`);
    expect(html).not.toContain('MISSING');
  });

  it('AC7 over HTTP: one entry with no span is unresolved, the rest are in the ledger and reach the Drafter', async () => {
    queue(
      MATCH_BAIL,
      EMPTY_READ,
      JSON.stringify({
        facts: [S1, { key: 'sections_charged', span: 'Section 420 IPC', confidence: 0.99 }, S2],
      }),
      drafterAnswer(BODY_FIRST),
    );
    const res = await describeBail(TEXT);
    const ledger = res.body.ledger;
    expect(
      ledger.facts
        .filter((f: { key: string }) => f.key === 'sections_charged')
        .map((f: { raw_span: string }) => f.raw_span),
    ).toEqual(['318(4) BNS', '319(2) BNS']);
    expect(
      ledger.unresolved.map((u: { key: string; reason: string }) => [u.key, u.reason]),
    ).toEqual([['sections_charged', 'no_verbatim_span']]);
    expect(JSON.stringify(ledger)).not.toContain('420');
    const stored = await FactLedgerModel.findById(ledger.ledger_id).lean();
    expect(JSON.stringify(stored!.versions)).not.toContain('420');

    await generate(ledger.ledger_id as string);
    const f = factsOf(callOf(3).user);
    expect(f.facts.filter((x) => x.key === 'sections_charged').map((x) => x.display)).toEqual([
      '318(4) BNS',
      '319(2) BNS',
    ]);
  });

  it('AC8 over HTTP: the route accepts an array for ledger_edits[].text; the edit replaces all entries; an empty array clears', async () => {
    queue(MATCH_BAIL, EMPTY_READ, JSON.stringify({ facts: [S1, S2, GA] }));
    const first = await describeBail(TEXT);
    const id = first.body.ledger.ledger_id as string;
    const update = (edits: unknown[]) =>
      request(app)
        .post('/intake/brief/update')
        .set(headers())
        .send({ kind: 'bail_regular', ledger_id: id, ledger_edits: edits });

    const a = await update([{ key: 'sections_charged', text: ['103 BNS', '61(2) BNS'] }]);
    expect(a.status).toBe(200);
    expect(a.body.ledger_results).toEqual([
      { key: 'sections_charged', status: 'saved', display: '103 BNS, 61(2) BNS' },
    ]);
    const entriesNow = a.body.ledger.facts.filter(
      (f: { key: string }) => f.key === 'sections_charged',
    );
    expect(entriesNow.map((f: { raw_span: string }) => f.raw_span)).toEqual([
      '103 BNS',
      '61(2) BNS',
    ]);
    for (const f of entriesNow) {
      expect(f.source).toBe('asked');
      expect(f.previous_display).toBe('318(4) BNS, 319(2) BNS');
    }
    expect(
      a.body.ledger.facts.filter((f: { key: string }) => f.key === 'grounds_for_bail'),
    ).toHaveLength(1);
    expect(a.body.ledger.version).toBe(2);

    const bad = await update([{ key: 'grounds_for_bail', text: [G2, 'Not a ground'] }]);
    expect(bad.status).toBe(200);
    expect(bad.body.ledger_results[0]).toMatchObject({
      status: 'unreadable',
      reason: 'not_an_option',
    });
    expect(bad.body.ledger.version).toBe(2);
    expect(
      bad.body.ledger.facts.find((f: { key: string }) => f.key === 'grounds_for_bail').value,
    ).toBe(G0);

    const cleared = await update([{ key: 'sections_charged', text: [] }]);
    expect(cleared.status).toBe(200);
    expect(
      cleared.body.ledger.facts.some((f: { key: string }) => f.key === 'sections_charged'),
    ).toBe(false);
    expect(cleared.body.ledger.version).toBe(3);
  });

  it('the route still takes a string, and refuses a bad shape (a number, a number in an array, more than 30 entries)', async () => {
    queue(MATCH_BAIL, EMPTY_READ, JSON.stringify({ facts: [S1] }));
    const first = await describeBail(TEXT);
    const id = first.body.ledger.ledger_id as string;
    const send = (text: unknown) =>
      request(app)
        .post('/intake/brief/update')
        .set(headers())
        .send({
          kind: 'bail_regular',
          ledger_id: id,
          ledger_edits: [{ key: 'police_station', text }],
        });
    expect((await send('Gandhi Maidan')).status).toBe(200);
    expect((await send(5)).status).toBe(400);
    expect((await send(Array.from({ length: 31 }, (_, i) => String(i)))).status).toBe(400);
    expect((await send([5])).status).toBe(400);
    expect((await send(Array.from({ length: 30 }, (_, i) => String(i)))).status).toBe(200);
  });

  it('the route caps one list entry at 500 characters and a list at 3000 in all', async () => {
    queue(MATCH_BAIL, EMPTY_READ, JSON.stringify({ facts: [S1] }));
    const first = await describeBail(TEXT);
    const id = first.body.ledger.ledger_id as string;
    const send = (text: unknown) =>
      request(app)
        .post('/intake/brief/update')
        .set(headers())
        .send({
          kind: 'bail_regular',
          ledger_id: id,
          ledger_edits: [{ key: 'sections_charged', text }],
        });
    expect((await send(['a'.repeat(501)])).status).toBe(400);
    expect((await send(['a'.repeat(500)])).status).toBe(200);
    // 6 x 500 = 3000: at the total cap; one more character is over it
    expect((await send(Array.from({ length: 6 }, () => 'b'.repeat(500)))).status).toBe(200);
    expect((await send([...Array.from({ length: 6 }, () => 'b'.repeat(500)), 'c'])).status).toBe(
      400,
    );
    // a single string keeps its own, larger, cap
    expect((await send('d'.repeat(6000))).status).toBe(200);
    expect((await send('d'.repeat(6001))).status).toBe(400);
  });
});
