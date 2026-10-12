/**
 * T-342 part 1 - the intake learns the three s.138 dates T-192 reads (LEGAL CONTENT).
 *
 * The labels are Ajay's L2, L4, L5, signed in
 * handoff/legal/T-192-s138-date-checks-signed.md and read at test time. His
 * rulings on the cues (T-342 handoff):
 *  - "received the return memo on X" is L4. A bare "received on X" is ambiguous
 *    and stays unread. "dishonoured on X" / "returned unpaid on X" is the
 *    dishonour date, never L4.
 *  - "valid till X" is L2 only in a cheque context. Otherwise it stays unread.
 *  - ask_when_empty on L4 and L5, with his L1-L5 labels as the question text.
 *    L2 is not asked.
 *  - Option B: new kinds with his labels. Dropping a date on a cue collision is
 *    fail-safe.
 *
 * AC1 the JSON has the three kinds with Ajay's wording        (pins, checklist)
 * AC2 a description that mentions the dates fills them and
 *     T-192's checks run on them                              (reading rules, end to end)
 * AC3 both checks run end to end from a description           (end to end)
 *
 * Part 2 (pack-scoped kind check, longest-cue precedence) places a date when one
 * kind's cue holds every other cue in the clause. Any collision it does not
 * settle is still dropped, never put on the wrong fact (section 4 and 7).
 *
 * No model call, no database. The model's answer is stubbed as spans.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import { overlayBrief, readExtraction } from '../services/fact-ledger.service';
import {
  Brief,
  ChecklistItem,
  GivenValue,
  buildBrief,
  buildChecklist,
  buildQuestions,
  carriesDateKind,
  checkRead,
  datesReadByCode,
  dateKindsIn,
  statedDates,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { S138_INPUT_KEYS, s138DateChecks, withS138DateChecks } from '../services/s138-date-checks';

const PACK = 'legal_notice_s138';
const NOW_YEAR = 2026;

// ── the signed md ───────────────────────────────────────────────────────────

const REPO_ROOT = join(__dirname, '../../../..');
const SIGNED_PATH = join(REPO_ROOT, 'handoff/legal/T-192-s138-date-checks-signed.md');
const MD = existsSync(SIGNED_PATH) ? readFileSync(SIGNED_PATH, 'utf-8') : '';

/** The signed label of L1..L5, from the Inputs table (the first row for each). */
function signedLabel(l: string): string {
  const row = MD.split('\n').find((line) => line.startsWith(`| ${l} |`));
  const m = row ? /`([^`]+)`/.exec(row.split('|')[2] ?? '') : null;
  if (!m) throw new Error(`no signed label for ${l}`);
  return m[1];
}

// ── the date-meanings file ──────────────────────────────────────────────────

interface Kind {
  id: string;
  label: string;
  subject: string[];
  tie?: string[];
  pack_only?: boolean;
  not_with?: string[];
  facts: string[];
}
const MEANINGS_REL = 'apps/drafting/src/config/intake/date-meanings.json';
const MEANINGS = JSON.parse(readFileSync(join(REPO_ROOT, MEANINGS_REL), 'utf-8')) as {
  _meta: Record<string, unknown>;
  kinds: Kind[];
  [other: string]: unknown;
};
const kindById = (id: string): Kind => {
  const k = MEANINGS.kinds.find((x) => x.id === id);
  if (!k) throw new Error(`no kind ${id}`);
  return k;
};

/**
 * The file as it stood before T-342 (commit 487b91a), committed as a fixture so the
 * comparison runs in CI, where the checkout has no git history.
 */
const BEFORE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/date-meanings.pre-t342.json'), 'utf-8'),
) as { _meta: Record<string, unknown>; kinds: Kind[]; [other: string]: unknown };

// ── the checklist and the reading path ──────────────────────────────────────

function checklistOf(id: string): ChecklistItem[] {
  const p = loadRulePack(id);
  if (!p) throw new Error(`no pack ${id}`);
  return buildChecklist(p);
}
const S138 = checklistOf(PACK);
/** The kinds of the s.138 checklist's date facts: the scope the s.138 pack reads with. */
const S138_KINDS: ReadonlySet<string> = new Set(
  S138.map((i) => i.dateKind).filter((k): k is string => !!k),
);
const item = (key: string): ChecklistItem => {
  const i = S138.find((x) => x.key === key);
  if (!i) throw new Error(`no item ${key}`);
  return i;
};

/** The path /intake/brief takes for dates, minus the model: check the model's entries, then dates by code. */
function readPath(description: string, entries: unknown[]) {
  const r = checkRead(S138, description, { outcome: 'read', read: entries });
  const byCode = datesReadByCode(S138, description, r.values);
  return { kept: r.values, dropped: r.dropped, byCode };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Pins
// ═════════════════════════════════════════════════════════════════════════════
describe("T-342 AC1: the three new kinds, pinned to Ajay's signed wording", () => {
  it('the signed md is there (the pins below read it at test time)', () => {
    expect(MD).toContain('Signed: Ajay (CLO)');
  });

  it.each([
    ['cheque_validity', 'L2', 'cheque_validity_date'],
    ['memo_received', 'L4', 'memo_received_date'],
    ['notice_sent', 'L5', 'notice_sent_date'],
  ])('kind %s has the signed %s label and links the fact %s', (id, l, fact) => {
    const k = kindById(id);
    expect(k.label).toBe(signedLabel(l));
    expect(k.facts).toEqual([fact]);
    expect(S138_INPUT_KEYS[l as 'L2' | 'L4' | 'L5']).toBe(fact);
  });

  it('the labels are the exact strings Ajay signed', () => {
    expect(signedLabel('L2')).toBe('Last date of validity printed on the cheque, if any');
    expect(signedLabel('L4')).toBe('Date the return memo was received');
    expect(signedLabel('L5')).toBe('Date the notice is sent');
    expect(kindById('cheque_validity').label).toBe(
      'Last date of validity printed on the cheque, if any',
    );
    expect(kindById('memo_received').label).toBe('Date the return memo was received');
    expect(kindById('notice_sent').label).toBe('Date the notice is sent');
  });

  it('cheque_validity needs a cheque word as well as a validity cue (Ajay: only in a cheque context)', () => {
    const k = kindById('cheque_validity');
    expect(k.tie && k.tie.length > 0).toBe(true);
    expect(k.tie).toEqual(expect.arrayContaining(['cheque']));
    expect(k.subject).toEqual(expect.arrayContaining(['valid till']));
  });

  it('every memo_received cue names the memo (none is a bare "received")', () => {
    for (const cue of kindById('memo_received').subject) {
      expect(cue.toLowerCase()).toMatch(/memo|मेमो/);
    }
  });

  it('every notice_sent cue names the notice and the sending', () => {
    for (const cue of kindById('notice_sent').subject) {
      expect(cue.toLowerCase()).toMatch(/notice|notis|नोटिस/);
    }
  });

  it('no fact is linked from two kinds', () => {
    const seen = new Map<string, string>();
    for (const k of MEANINGS.kinds)
      for (const f of k.facts) {
        expect(seen.has(f) ? `${f} twice` : 'ok').toBe('ok');
        seen.set(f, k.id);
      }
  });

  it('no kind that existed before was changed (compared with the committed pre-T-342 fixture)', () => {
    expect(BEFORE.kinds.length).toBeGreaterThan(20);
    for (const old of BEFORE.kinds) expect(kindById(old.id)).toStrictEqual(old);
    const beforeIds = BEFORE.kinds.map((k) => k.id);
    const at = beforeIds.indexOf('dishonour') + 1;
    expect(MEANINGS.kinds.map((k) => k.id)).toEqual([
      ...beforeIds.slice(0, at),
      'memo_received',
      'notice_sent',
      'cheque_validity',
      ...beforeIds.slice(at),
    ]);
  });

  it('nothing else in the file moved: the other sections and the _meta are as before, bar the _meta.keys note', () => {
    for (const key of Object.keys(BEFORE)) {
      if (key === 'kinds' || key === '_meta') continue;
      expect(MEANINGS[key]).toStrictEqual(BEFORE[key]);
    }
    expect(Object.keys(MEANINGS).sort()).toEqual(Object.keys(BEFORE).sort());
    const { signed, last_updated, keys, ...metaNow } = MEANINGS._meta;
    const { signed: s0, last_updated: l0, ...metaBefore } = BEFORE._meta;
    expect([typeof signed, typeof last_updated, typeof s0, typeof l0]).toEqual(
      Array(4).fill('string'),
    );
    expect(typeof keys).toBe('string');
    expect(metaNow).toStrictEqual(metaBefore);
  });

  it('the three new kinds are pack_only, so no other pack and no unscoped reader sees them; no old kind is pack_only', () => {
    for (const id of ['memo_received', 'notice_sent', 'cheque_validity'])
      expect(kindById(id).pack_only).toBe(true);
    for (const old of BEFORE.kinds) expect(kindById(old.id).pack_only).toBeUndefined();
  });

  it('memo_received carries not_with "dated" (Ajay: the memo\'s own date is not the date it was received)', () => {
    expect(kindById('memo_received').not_with).toEqual(['dated']);
    expect(kindById('notice_sent').not_with).toBeUndefined();
    expect(kindById('cheque_validity').not_with).toBeUndefined();
  });

  it('pinned: the s.138 and notice kinds already there keep their facts', () => {
    expect(kindById('cheque').facts).toEqual(['cheque_date']);
    expect(kindById('cheque_presented').facts).toEqual(['presentation_date']);
    expect(kindById('dishonour').facts).toEqual(['dishonour_date']);
    expect(kindById('notice').facts).toEqual(['legal_notice_date', 's8_demand_notice_date']);
    expect(kindById('served').facts).toEqual([
      'service_of_order_date',
      'summons_service_date',
      'certified_copy_received_date',
    ]);
    expect(kindById('end').facts).toContain('notice_expiry_date');
  });

  it('the other packs: none of the new facts is on any other kind, so no other pack reads them', () => {
    for (const k of MEANINGS.kinds) {
      if (['memo_received', 'notice_sent', 'cheque_validity'].includes(k.id)) continue;
      expect(k.facts).not.toEqual(expect.arrayContaining(['memo_received_date']));
      expect(k.facts).not.toContain('notice_sent_date');
      expect(k.facts).not.toContain('cheque_validity_date');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. The checklist
// ═════════════════════════════════════════════════════════════════════════════
describe('T-342 AC1/AC2: the legal_notice_s138 checklist', () => {
  it.each([
    ['cheque_validity_date', 'cheque_validity'],
    ['memo_received_date', 'memo_received'],
    ['notice_sent_date', 'notice_sent'],
  ])('%s is model readable with the date kind %s', (key, kind) => {
    const i = item(key);
    expect(i.kind).toBe('date');
    expect(i.modelReadable).toBe(true);
    expect(i.dateKind).toBe(kind);
  });

  it('the cheque, presented and dishonour dates are as they were', () => {
    expect(item('cheque_date')).toMatchObject({
      kind: 'date',
      dateKind: 'cheque',
      modelReadable: true,
      required: true,
    });
    expect(item('presentation_date')).toMatchObject({
      kind: 'date',
      dateKind: 'cheque_presented',
      modelReadable: true,
      required: true,
    });
    expect(item('dishonour_date')).toMatchObject({
      kind: 'date',
      dateKind: 'dishonour',
      modelReadable: true,
      required: true,
    });
  });

  it('L1 and L3 are required; L2, L4 and L5 are not', () => {
    expect(item('cheque_date').required).toBe(true);
    expect(item('presentation_date').required).toBe(true);
    for (const k of ['cheque_validity_date', 'memo_received_date', 'notice_sent_date'])
      expect(item(k).required).toBe(false);
  });

  it('keys are flat (no dots, no group prefix)', () => {
    for (const i of S138) expect(i.key).toMatch(/^[a-z0-9_]+$/);
    for (const k of ['cheque_validity_date', 'memo_received_date', 'notice_sent_date'])
      expect(S138.filter((i) => i.key === k)).toHaveLength(1);
  });

  it('ask_when_empty with the signed label as the question on L4 and L5, and not on L2', () => {
    expect(item('memo_received_date')).toMatchObject({
      askWhenEmpty: true,
      question: signedLabel('L4'),
    });
    expect(item('notice_sent_date')).toMatchObject({
      askWhenEmpty: true,
      question: signedLabel('L5'),
    });
    expect(item('cheque_validity_date').askWhenEmpty).not.toBe(true);
    expect(item('cheque_validity_date').question).toBeUndefined();
  });

  it('the pack twin in docs/templates carries the same questions and flags', () => {
    const pick = (file: string) => {
      const schema = JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf-8')).form_schema as {
        steps: Array<{ fields: Array<Record<string, unknown>> }>;
      };
      const fields = schema.steps.flatMap((s) => s.fields);
      return Object.fromEntries(
        ['cheque_validity_date', 'memo_received_date', 'notice_sent_date'].map((id) => {
          const f = fields.find((x) => x.field_id === id)!;
          return [id, { question: f.question, ask: f.ask_when_empty, required: f.required }];
        }),
      );
    };
    const rules = pick('apps/drafting/src/config/document-rules/legal_notice_s138.json');
    const twin = pick('docs/templates/legal_notice_s138.json');
    expect(twin).toEqual(rules);
    expect(rules.memo_received_date).toEqual({
      question: signedLabel('L4'),
      ask: true,
      required: false,
    });
    expect(rules.notice_sent_date).toEqual({
      question: signedLabel('L5'),
      ask: true,
      required: false,
    });
    expect(rules.cheque_validity_date.question).toBeUndefined();
    expect(rules.cheque_validity_date.ask).not.toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Ajay's reading rules
// ═════════════════════════════════════════════════════════════════════════════
describe("T-342 AC2: Ajay's reading rules (cues on the words)", () => {
  it.each([
    'I received the return memo on 5 March 2026.',
    'We received the return memo on 5 March 2026 from the bank.',
    'The cheque return memo was received on 5 March 2026.',
    'The memo received on 5 March 2026 says insufficient funds.',
    'Receipt of the return memo on 5 March 2026.',
    'मेमो प्राप्त हुआ 5 March 2026 को',
    'memo mila 5 March 2026 ko',
  ])('"%s" carries memo_received', (words) => {
    expect(dateKindsIn(words, S138_KINDS)).toContain('memo_received');
    expect(carriesDateKind(words, 'memo_received')).toBe(true);
    // pack_only: with no scope the kind is not seen
    expect(dateKindsIn(words)).not.toContain('memo_received');
  });

  it.each([
    'received on 5 March 2026',
    'We received it on 5 March 2026.',
    'Received on 5 March 2026 by the client.',
    'got it on 5 March 2026',
    'the bank letter was received on 5 March 2026',
  ])('a bare "%s" never maps to memo_received', (words) => {
    expect(dateKindsIn(words, S138_KINDS)).not.toContain('memo_received');
    expect(carriesDateKind(words, 'memo_received')).toBe(false);
  });

  it.each([
    'The cheque was dishonoured on 3 March 2026.',
    'dishonoured on 3 March 2026',
    'The cheque was returned unpaid on 3 March 2026.',
    'returned unpaid on 3 March 2026',
    'cheque bounced and dishonoured on 3 March 2026',
  ])('"%s" maps to dishonour, never memo_received', (words) => {
    expect(dateKindsIn(words, S138_KINDS)).toContain('dishonour');
    expect(dateKindsIn(words, S138_KINDS)).not.toContain('memo_received');
    const stated = statedDates(words, S138_KINDS);
    expect(stated).toHaveLength(1);
    expect(stated[0].kind).toBe('dishonour');
  });

  it.each([
    'The cheque is valid till 10 April 2026.',
    'cheque valid until 10 April 2026',
    'The cheque is valid up to 10 April 2026.',
    'the cheque validity is 10 April 2026',
    'चेक की वैधता 10 April 2026',
    'chek ki vaidhta 10 April 2026',
  ])('"%s" includes cheque_validity (cheque context)', (words) => {
    expect(dateKindsIn(words, S138_KINDS)).toContain('cheque_validity');
    expect(dateKindsIn(words)).not.toContain('cheque_validity');
  });

  it.each([
    'valid till 10 April 2026',
    'The agreement is valid till 10 April 2026.',
    'The licence is valid until 10 April 2026.',
    'validity 10 April 2026',
  ])('"%s" without a cheque word is not cheque_validity', (words) => {
    expect(dateKindsIn(words, S138_KINDS)).not.toContain('cheque_validity');
    expect(carriesDateKind(words, 'cheque_validity')).toBe(false);
    // and no fact on the s.138 checklist gets it from code
    expect(datesReadByCode(S138, words, new Map()).has('cheque_validity_date')).toBe(false);
  });

  it.each([
    'The notice was served on 5 April 2026.',
    'notice served on 5 April 2026',
    'The legal notice was received by the drawer on 5 April 2026.',
    'Notice delivered on 5 April 2026.',
  ])('"%s" never yields L4 or L5', (words) => {
    const kinds = dateKindsIn(words, S138_KINDS);
    expect(kinds).not.toContain('memo_received');
    expect(kinds).not.toContain('notice_sent');
    const code = datesReadByCode(S138, words, new Map());
    expect(code.has('memo_received_date')).toBe(false);
    expect(code.has('notice_sent_date')).toBe(false);
  });

  it('a notice that is sent carries notice_sent, and that is not memo_received', () => {
    for (const words of ['The notice was sent on 3 April 2026.', 'notice bheja 3 April 2026 ko']) {
      expect(dateKindsIn(words, S138_KINDS)).toContain('notice_sent');
      expect(dateKindsIn(words, S138_KINDS)).not.toContain('memo_received');
      expect(dateKindsIn(words)).not.toContain('notice_sent');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Longest cue wins on the pack; every other collision still drops the date
// ═════════════════════════════════════════════════════════════════════════════
describe('T-342 part 2: the longer cue is placed; a collision it does not settle is not placed', () => {
  const MEMO = 'I received the return memo on 5 March 2026.';
  const VALID = 'The cheque is valid till 10 April 2026.';
  const SENT = 'The notice was sent on 3 April 2026.';

  // The model's entry is checked first; the code path then adds nothing.
  const modelEntry = (key: string, value: string, quote: string) => ({ id: key, value, quote });

  it('"received the return memo on X" is placed on memo_received (longest cue beats dishonour and served)', () => {
    // On the s.138 scope the collision is there; the longest cue settles it.
    expect(dateKindsIn(MEMO, S138_KINDS)).toEqual(
      expect.arrayContaining(['memo_received', 'dishonour', 'served']),
    );
    // With no scope the reader is as before T-342: the same words give dishonour and served only.
    expect(dateKindsIn(MEMO)).toEqual(['dishonour', 'served']);
    expect(statedDates(MEMO)).toEqual([
      expect.objectContaining({ value: '2026-03-05', kind: null }),
    ]);
    const placed = datesReadByCode(S138, MEMO, new Map());
    expect([...placed.keys()]).toEqual(['memo_received_date']);
    expect(placed.get('memo_received_date')?.value).toBe('2026-03-05');
  });

  it('"valid till X" in a cheque sentence is placed on cheque_validity (beats end)', () => {
    expect(dateKindsIn(VALID, S138_KINDS)).toEqual(
      expect.arrayContaining(['cheque_validity', 'end']),
    );
    expect(dateKindsIn(VALID)).toEqual(['end']);
    const placed = datesReadByCode(S138, VALID, new Map());
    expect([...placed.keys()]).toEqual(['cheque_validity_date']);
    expect(placed.get('cheque_validity_date')?.value).toBe('2026-04-10');
  });

  it('"the notice was sent on X" is placed on notice_sent (beats notice)', () => {
    expect(dateKindsIn(SENT, S138_KINDS)).toEqual(
      expect.arrayContaining(['notice_sent', 'notice']),
    );
    expect(dateKindsIn(SENT)).toEqual(['notice']);
    const placed = datesReadByCode(S138, SENT, new Map());
    expect([...placed.keys()]).toEqual(['notice_sent_date']);
    expect(placed.get('notice_sent_date')?.value).toBe('2026-04-03');
  });

  it("the model's memo entry is kept (L4 wins the quote), and the date is on L4 only", () => {
    const r = readPath(MEMO, [modelEntry('memo_received_date', '2026-03-05', MEMO)]);
    expect(r.dropped).toEqual([]);
    expect(r.kept.get('memo_received_date')?.value).toBe('2026-03-05');
    // the code path adds nothing on top: the date is placed once
    expect(r.byCode.size).toBe(0);
    const holders = [...r.kept, ...r.byCode].filter(([, v]) => v.value === '2026-03-05');
    expect(holders.map(([k]) => k)).toEqual(['memo_received_date']);
  });

  it("the model's notice_sent and cheque_validity entries are kept today (the quote carries the cue and the tie)", () => {
    const r = readPath(`${VALID} ${SENT}`, [
      modelEntry('cheque_validity_date', '2026-04-10', VALID),
      modelEntry('notice_sent_date', '2026-04-03', SENT),
    ]);
    expect(r.dropped).toEqual([]);
    expect(r.kept.get('cheque_validity_date')?.value).toBe('2026-04-10');
    expect(r.kept.get('notice_sent_date')?.value).toBe('2026-04-03');
  });

  it('a model entry that puts the memo date under the dishonour fact is not accepted for a "received the return memo" quote', () => {
    const r = readPath(MEMO, [modelEntry('dishonour_date', '2026-03-05', MEMO)]);
    expect(r.kept.has('dishonour_date')).toBe(false);
  });

  it('a model entry that puts a "valid till" date, with no cheque word, under L2 is not accepted', () => {
    const words = 'The licence is valid till 10 April 2026.';
    const r = readPath(words, [modelEntry('cheque_validity_date', '2026-04-10', words)]);
    expect(r.kept.has('cheque_validity_date')).toBe(false);
  });

  it('a bare "received on X" is not placed by code or accepted from the model under L4', () => {
    const words = 'I received it on 5 March 2026.';
    const r = readPath(words, [modelEntry('memo_received_date', '2026-03-05', words)]);
    expect(r.kept.has('memo_received_date')).toBe(false);
    expect(r.byCode.has('memo_received_date')).toBe(false);
  });

  it('"dishonoured on X" and "returned unpaid on X" are placed on the dishonour fact by code, not on L4', () => {
    for (const words of [
      'The cheque was dishonoured on 3 March 2026.',
      'The cheque was returned unpaid on 3 March 2026.',
    ]) {
      const placed = datesReadByCode(S138, words, new Map());
      expect(placed.get('dishonour_date')?.value).toBe('2026-03-03');
      expect(placed.has('memo_received_date')).toBe(false);
    }
  });

  it('"memo mila X ko" alone is placed on L4 by code', () => {
    const placed = datesReadByCode(S138, 'memo mila 12 March 2026 ko', new Map());
    expect(placed.get('memo_received_date')?.value).toBe('2026-03-12');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. End to end: description -> spans -> T-192's checks
// ═════════════════════════════════════════════════════════════════════════════
describe("T-342 AC2/AC3: from a description to T-192's checks", () => {
  const span = (key: string, s: string) => ({ key, span: s, confidence: 0.95 });

  /** The ledger facts the extraction yields for the given description and model spans. */
  function ledgerOf(text: string, spans: Array<ReturnType<typeof span>>): LedgerFact[] {
    const r = readExtraction(S138, text, { facts: spans }, NOW_YEAR);
    expect(r.dropped).toEqual([]);
    expect(r.unresolved).toEqual([]);
    return r.facts;
  }

  const ON_TIME =
    'The cheque is dated 10 January 2026 and was presented to the bank on 9 April 2026. ' +
    'The bank returned it unpaid on 11 April 2026. ' +
    'My client received the return memo on 5 March 2026. ' +
    'The notice was sent on 3 April 2026.';
  const ON_TIME_SPANS = [
    span('cheque_date', '10 January 2026'),
    span('presentation_date', '9 April 2026'),
    span('dishonour_date', '11 April 2026'),
    span('memo_received_date', '5 March 2026'),
    span('notice_sent_date', '3 April 2026'),
  ];

  it('the three new dates are filled from a description, under the right keys, as user facts', () => {
    const facts = ledgerOf(ON_TIME, ON_TIME_SPANS);
    const by = (k: string) => facts.find((f) => f.key === k);
    expect(by('memo_received_date')).toMatchObject({
      value: '2026-03-05',
      source: 'user',
      label: signedLabel('L4'),
    });
    expect(by('notice_sent_date')).toMatchObject({
      value: '2026-04-03',
      source: 'user',
      label: signedLabel('L5'),
    });
  });

  it('cheque_validity_date is filled when the description gives it', () => {
    const text =
      'The cheque dated 10 January 2026 is valid till 10 March 2026. Presented on 9 March 2026.';
    const facts = ledgerOf(text, [
      span('cheque_date', '10 January 2026'),
      span('cheque_validity_date', '10 March 2026'),
      span('presentation_date', '9 March 2026'),
    ]);
    expect(facts.find((f) => f.key === 'cheque_validity_date')).toMatchObject({
      value: '2026-03-10',
      label: signedLabel('L2'),
    });
    // L2 is earlier than three months, so it is the validity end (A1: 9 Mar <= 10 Mar)
    const a = s138DateChecks(facts, PACK).a;
    expect(a.line).toBe('A1');
    expect(a.end).toBe('2026-03-10');
  });

  it('AC3: both checks pass from the description (A1 and B1) and give two computed facts', () => {
    const facts = ledgerOf(ON_TIME, ON_TIME_SPANS);
    const r = s138DateChecks(facts, PACK);
    expect(r.a.line).toBe('A1');
    expect(r.a.missing).toEqual([]);
    expect(r.b.line).toBe('B1');
    expect(r.b.missing).toEqual([]);
    expect(r.b.end).toBe('2026-04-04');
    expect(r.computedFacts.map((f) => f.key).sort()).toEqual([
      's138_notice_within_thirty_days',
      's138_presented_within_validity',
    ]);
  });

  it('AC3: the same facts through withS138DateChecks add both computed facts', () => {
    const facts = ledgerOf(ON_TIME, ON_TIME_SPANS);
    const out = withS138DateChecks(facts, PACK);
    expect(
      out
        .filter((f) => f.source === 'computed')
        .map((f) => f.key)
        .sort(),
    ).toEqual(['s138_notice_within_thirty_days', 's138_presented_within_validity']);
    // the user's facts are kept
    expect(out.filter((f) => f.source === 'user')).toHaveLength(facts.length);
  });

  it('AC3: a late notice gives B2 and no computed notice fact', () => {
    const text =
      'The cheque is dated 10 January 2026 and was presented on 9 April 2026. ' +
      'My client received the return memo on 5 March 2026. The notice was sent on 5 April 2026.';
    const facts = ledgerOf(text, [
      span('cheque_date', '10 January 2026'),
      span('presentation_date', '9 April 2026'),
      span('memo_received_date', '5 March 2026'),
      span('notice_sent_date', '5 April 2026'),
    ]);
    const r = s138DateChecks(facts, PACK);
    expect(r.b.line).toBe('B2');
    expect(r.a.line).toBe('A1');
    expect(r.computedFacts.map((f) => f.key)).toEqual(['s138_presented_within_validity']);
    const out = withS138DateChecks(facts, PACK);
    expect(out.map((f) => f.key)).not.toContain('s138_notice_within_thirty_days');
  });

  it('a notice sent before the memo was received gives B3', () => {
    const text = 'Return memo received on 5 March 2026. The notice was sent on 1 March 2026.';
    const facts = ledgerOf(text, [
      span('memo_received_date', '5 March 2026'),
      span('notice_sent_date', '1 March 2026'),
    ]);
    expect(s138DateChecks(facts, PACK).b.line).toBe('B3');
  });

  it('without L4 and L5 in the description the notice check is not run: B5, no computed fact', () => {
    const text = 'The cheque is dated 10 January 2026 and was presented on 9 April 2026.';
    const facts = ledgerOf(text, [
      span('cheque_date', '10 January 2026'),
      span('presentation_date', '9 April 2026'),
    ]);
    const r = s138DateChecks(facts, PACK);
    expect(r.b.line).toBe('B5');
    expect(r.b.missing).toEqual(['L4', 'L5']);
    expect(r.a.line).toBe('A1');
  });

  it('a span that is not in the description is not a fact (no invented L4)', () => {
    const r = readExtraction(
      S138,
      'The cheque is dated 10 January 2026.',
      { facts: [span('memo_received_date', '5 March 2026')] },
      NOW_YEAR,
    );
    expect(r.facts.find((f) => f.key === 'memo_received_date')).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Questions
// ═════════════════════════════════════════════════════════════════════════════
describe('T-342: L4 and L5 are asked when empty, with the signed labels; L2 never', () => {
  const kind = { id: PACK, name: 'Legal Notice s138', court_document: false };

  /** Values for every required fact, so only the optional questions are left. */
  const REQUIRED_VALUES: Record<string, string> = {
    respondent_type: 'Individual',
    cheque_date: '2026-01-10',
    presentation_date: '2026-04-09',
    dishonour_date: '2026-04-11',
    cheque_amount: '50000',
  };
  function given(extraKeys: Record<string, string> = {}): GivenValue[] {
    const values: Record<string, string> = {};
    for (const i of S138.filter((x) => x.required)) values[i.key] = REQUIRED_VALUES[i.key] ?? 'x';
    return Object.entries({ ...values, ...extraKeys }).map(([key, value]) => ({
      key,
      value,
      quote: value,
      source: 'user' as const,
    }));
  }
  function asked(extra: Record<string, string> = {}) {
    const brief: Brief = buildBrief({
      kind,
      checklist: S138,
      values: given(extra),
      description: 'x',
    });
    return buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: S138 });
  }

  it("asks L4 and L5 with Ajay's labels as the question text when they are empty", () => {
    const qs = asked();
    const l4 = qs.find((q) => q.key === 'memo_received_date');
    const l5 = qs.find((q) => q.key === 'notice_sent_date');
    expect(l4).toMatchObject({ question: signedLabel('L4'), source: 'pack' });
    expect(l5).toMatchObject({ question: signedLabel('L5'), source: 'pack' });
  });

  it('never asks L2', () => {
    expect(asked().map((q) => q.key)).not.toContain('cheque_validity_date');
    expect(asked({ memo_received_date: '2026-03-05' }).map((q) => q.key)).not.toContain(
      'cheque_validity_date',
    );
  });

  it('asks nothing about L4 when it is given, nor about L5 when it is given', () => {
    const noL4 = asked({ memo_received_date: '2026-03-05' }).map((q) => q.key);
    expect(noL4).not.toContain('memo_received_date');
    expect(noL4).toContain('notice_sent_date');
    const noL5 = asked({ notice_sent_date: '2026-04-03' }).map((q) => q.key);
    expect(noL5).not.toContain('notice_sent_date');
    expect(noL5).toContain('memo_received_date');
    const none = asked({ memo_received_date: '2026-03-05', notice_sent_date: '2026-04-03' });
    expect(none.map((q) => q.key)).toEqual([]);
  });

  it('asks the required facts first: a missing required fact comes before L4 and L5', () => {
    const brief = buildBrief({
      kind,
      checklist: S138,
      values: given().filter((v) => v.key !== 'cheque_date'),
      description: 'x',
    });
    const keys = buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: S138 }).map(
      (q) => q.key,
    );
    expect(keys).toContain('cheque_date');
    expect(keys.indexOf('cheque_date')).toBeLessThan(keys.indexOf('memo_received_date'));
    expect(keys.indexOf('cheque_date')).toBeLessThan(keys.indexOf('notice_sent_date'));
  });

  it('other packs are not asked these questions', () => {
    for (const id of ['bail_regular']) {
      const cl = checklistOf(id);
      expect(cl.some((i) => i.key === 'memo_received_date')).toBe(false);
      expect(cl.some((i) => i.key === 'notice_sent_date')).toBe(false);
      expect(cl.some((i) => i.key === 'cheque_validity_date')).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Part 2: what must still NOT be placed (Ajay's rules, fail-safe)
// ═════════════════════════════════════════════════════════════════════════════
describe('T-342 part 2: sentences placed nowhere on the s.138 pack', () => {
  const placedKeys = (text: string) => [...datesReadByCode(S138, text, new Map()).keys()];

  it.each([
    ['a bare "received on X" (Ajay: ambiguous, stays unread)', 'Received on 12 March 2026.'],
    ['"the notice served on X" (could falsely pass B1)', 'The notice served on 2 April 2026.'],
    ['"notice was served on X" (could falsely pass B1)', 'Notice was served on 2 April 2026.'],
    ['"valid till X" with no cheque word', 'The lease is valid till 9 April 2026.'],
    [
      '"the notice sent to him was served on X": "served" is a cue of its own',
      'The notice sent to him was served on 5 April 2026.',
    ],
    ['"received the bail order on X"', 'He received the bail order on 5 April 2026.'],
    ['"the bank received the cheque on X"', 'The bank received the cheque on 5 April 2026.'],
    [
      'memo received but "notice served" in the same clause',
      'Received the return memo, notice served on 5 April 2026.',
    ],
  ])('%s is placed nowhere', (_why, text) => {
    expect(placedKeys(text)).toEqual([]);
    const stated = statedDates(
      text,
      new Set(S138.map((i) => i.dateKind).filter(Boolean) as string[]),
    );
    for (const d of stated) {
      expect(['memo_received', 'notice_sent', 'cheque_validity']).not.toContain(d.kind);
    }
  });

  it.each([
    'The notice served on 2 April 2026.',
    'Notice was served on 2 April 2026.',
    'The notice sent to him was served on 5 April 2026.',
    'Received the return memo, notice served on 5 April 2026.',
    'The legal notice was received by the drawer on 5 April 2026.',
  ])('"%s" never yields L4 or L5, by code or through a model quote', (text) => {
    const code = datesReadByCode(S138, text, new Map());
    expect(code.has('memo_received_date')).toBe(false);
    expect(code.has('notice_sent_date')).toBe(false);
    const value = /\d{1,2} April 2026/.exec(text)?.[0];
    const iso =
      value === '2 April 2026' ? '2026-04-02' : value === '5 April 2026' ? '2026-04-05' : '';
    for (const key of ['memo_received_date', 'notice_sent_date']) {
      const r = readPath(text, [{ id: key, value: iso, quote: text }]);
      // notice_sent / memo_received are not accepted on a "served" quote (Ajay), on the model path too
      const kept = r.kept.get(key);
      expect(kept).toBeUndefined();
    }
  });

  it('"dishonoured on X" and "returned unpaid on X" are the dishonour date, never L4', () => {
    for (const text of [
      'The cheque was dishonoured on 3 March 2026.',
      'The cheque was returned unpaid on 3 March 2026.',
      'Dishonoured on 3 March 2026.',
    ]) {
      const placed = datesReadByCode(S138, text, new Map());
      expect([...placed.keys()]).toEqual(['dishonour_date']);
      expect(placed.get('dishonour_date')?.value).toBe('2026-03-03');
    }
  });

  it.each([
    'The memo was received on 12 March 2026.',
    'The return memo was received on 12 March 2026.',
    'The return memo is received on 12 March 2026.',
    'Return memo received on 12 March 2026.',
  ])('"%s" places L4 and only L4', (text) => {
    const placed = datesReadByCode(S138, text, new Map());
    expect([...placed.keys()]).toEqual(['memo_received_date']);
    expect(placed.get('memo_received_date')?.value).toBe('2026-03-12');
  });

  it('dishonour, returned-unpaid and a bare "received on" are unchanged by the new memo cues', () => {
    for (const text of [
      'The cheque was dishonoured on 12 March 2026.',
      'The cheque was returned unpaid on 12 March 2026.',
    ]) {
      expect([...datesReadByCode(S138, text, new Map()).keys()]).toEqual(['dishonour_date']);
    }
    expect(placedKeys('Received on 12 March 2026.')).toEqual([]);
    expect(placedKeys('It was received on 12 March 2026.')).toEqual([]);
  });

  it('"valid till X" with a cheque word is L2 and only L2', () => {
    const placed = datesReadByCode(S138, 'The cheque is valid till 10 April 2026.', new Map());
    expect([...placed.keys()]).toEqual(['cheque_validity_date']);
  });
});

describe('T-342 part 2: reading with no scope is exactly as before T-342', () => {
  // Hard-coded from the reader at commit 487b91a (before T-342), run on each sentence:
  // [sentence, dateKindsIn(sentence), the kind statedDates gives its one date].
  // The values are NOT computed from the current reader, so this cannot go circular.
  const BEFORE_TABLE: Array<[string, string[], string | null]> = [
    ['The accused was arrested on 5 March 2026.', ['arrest'], 'arrest'],
    ['The FIR was registered on 2 March 2026.', ['fir', 'registration'], null],
    ['He received the bail order on 5 March 2026.', ['order', 'served'], null],
    ['The chargesheet was filed on 9 April 2026.', ['chargesheet', 'filing'], null],
    ['The notice was served on 5 April 2026.', ['notice', 'served'], null],
    ['The application was dismissed on 7 May 2026.', ['order'], 'order'],
    ['The defect came to notice on 3 March 2026.', ['notice', 'known'], null],
    ['The cheque is valid till 10 April 2026.', ['end'], 'end'],
    ['The licence is valid till 10 April 2026.', ['end'], 'end'],
    ['I received the return memo on 5 March 2026.', ['dishonour', 'served'], null],
    ['The notice was sent on 3 April 2026.', ['notice'], 'notice'],
    ['The legal notice was sent on 3 April 2026.', ['notice'], 'notice'],
    ['The cheque was dishonoured on 3 March 2026.', ['dishonour'], 'dishonour'],
    ['Received on 12 March 2026.', ['served'], 'served'],
    ['Memo received on 12 March 2026.', ['served'], 'served'],
    ['The demand notice was sent on 3 April 2026.', ['notice', 'demand'], null],
    ['The notice sent to him was served on 5 April 2026.', ['notice', 'served'], null],
    ['The return memo was received on 12 March 2026.', ['dishonour', 'served'], null],
    ['We received the dishonour memo on 12 March 2026.', ['dishonour', 'served'], null],
    ['We received the dishonour memo dated 7 March 2026.', ['dishonour', 'served'], null],
    ['The dishonour memo dated 7 March 2026.', ['dishonour'], 'dishonour'],
    ['The cheque was returned unpaid on 3 March 2026.', ['dishonour'], 'dishonour'],
    ['The legal notice dated 3 April 2026.', ['notice'], 'notice'],
    ['The cheque validity is up to 9 April 2026.', [], null],
    ['Receipt of the return memo on 5 March 2026.', ['dishonour', 'served'], null],
    ['It came to notice on 12 March 2026.', ['notice', 'known'], null],
    ['The loan was disbursed on 4 January 2026.', [], null],
  ];

  it.each(BEFORE_TABLE)(
    '"%s": dateKindsIn gives %j and statedDates gives kind %s',
    (text, kinds, kind) => {
      expect(dateKindsIn(text)).toEqual(kinds);
      const stated = statedDates(text);
      expect(stated).toHaveLength(1);
      expect(stated[0].kind).toBe(kind);
    },
  );

  it('unscoped, "The legal notice was sent on X" is kind notice and "Memo received on X" is kind served (the pre-T-342 reading)', () => {
    expect(statedDates('The legal notice was sent on 3 April 2026.')[0].kind).toBe('notice');
    expect(statedDates('Memo received on 12 March 2026.')[0].kind).toBe('served');
    expect(statedDates('The cheque is valid till 10 April 2026.')[0].kind).toBe('end');
  });

  it('no unscoped reading ever gives one of the three new kinds, for any cue in the file', () => {
    const NEW = ['memo_received', 'notice_sent', 'cheque_validity'];
    for (const id of NEW) {
      const k = kindById(id);
      for (const cue of k.subject) {
        const text = `The ${cue} ${k.tie ? k.tie[0] : ''} on 12 March 2026.`;
        expect(dateKindsIn(text)).not.toEqual(expect.arrayContaining([id]));
        expect(statedDates(text).map((d) => d.kind)).not.toEqual(expect.arrayContaining([id]));
      }
    }
  });

  it('the scope of another pack does not bring the new kinds in', () => {
    const bail = new Set(['arrest', 'fir', 'order', 'served', 'notice']);
    expect(dateKindsIn('I received the return memo on 5 March 2026.', bail)).toEqual([
      'dishonour',
      'served',
    ]);
    expect(dateKindsIn('The notice was sent on 3 April 2026.', bail)).toEqual(['notice']);
  });

  it('a multi-date clause is still unread, with or without a scope', () => {
    const text = 'The cheque dated 10 January 2026 was presented on 9 April 2026.';
    expect(statedDates(text).every((d) => d.kind === null)).toBe(true);
    expect(
      statedDates(text, new Set(['cheque', 'cheque_presented'])).every((d) => d.kind === null),
    ).toBe(true);
  });
});

describe('T-342 part 2: the packs that share a kind read as they did before (reviewer round 1)', () => {
  // Pinned from the reader at 487b91a.
  const placed = (pack: string, text: string) =>
    Object.fromEntries(
      [...datesReadByCode(checklistOf(pack), text, new Map())].map(([k, v]) => [k, v.value]),
    );

  it.each([
    'The legal notice was sent on 3 April 2026.',
    'The notice was sent on 3 April 2026.',
    'The legal notice dated 3 April 2026.',
  ])('plaint_recovery: "%s" places legal_notice_date = 3 April', (text) => {
    expect(placed('plaint_recovery', text)).toEqual({ legal_notice_date: '2026-04-03' });
  });

  it.each([
    'The legal notice was sent on 3 April 2026.',
    'The notice was sent on 3 April 2026.',
    'The legal notice dated 3 April 2026.',
  ])('ibc_application: "%s" places s8_demand_notice_date = 3 April', (text) => {
    expect(placed('ibc_application', text)).toEqual({ s8_demand_notice_date: '2026-04-03' });
  });

  it('ibc_application: "The demand notice was sent on X" is ambiguous at 487b91a (notice and demand), so still nothing', () => {
    expect(placed('ibc_application', 'The demand notice was sent on 3 April 2026.')).toEqual({});
    expect(placed('plaint_recovery', 'The demand notice was sent on 3 April 2026.')).toEqual({});
  });

  it('the s.138 pack itself places that sentence on the new L5 fact, and not on the notice fact', () => {
    expect(placed(PACK, 'The legal notice was sent on 3 April 2026.')).toEqual({
      notice_sent_date: '2026-04-03',
    });
  });

  it('the model path on plaint_recovery: a "notice was sent" quote is kept for legal_notice_date as before', () => {
    const cl = checklistOf('plaint_recovery');
    const text = 'The legal notice was sent on 3 April 2026.';
    const r = checkRead(cl, text, {
      outcome: 'read',
      read: [{ id: 'legal_notice_date', value: '2026-04-03', quote: text }],
    });
    expect(r.dropped).toEqual([]);
    expect(r.values.get('legal_notice_date')?.value).toBe('2026-04-03');
  });
});

describe("T-342 part 2: Ajay's dishonour-memo rulings on the s.138 pack", () => {
  const placed = (text: string) =>
    Object.fromEntries([...datesReadByCode(S138, text, new Map())].map(([k, v]) => [k, v.value]));

  it('"We received the dishonour memo on X" is L4 (received governs the date)', () => {
    expect(placed('We received the dishonour memo on 12 March 2026.')).toEqual({
      memo_received_date: '2026-03-12',
    });
  });

  it('"We received the dishonour memo dated X" is nothing (that is the memo\'s own date)', () => {
    expect(placed('We received the dishonour memo dated 7 March 2026.')).toEqual({});
  });

  it('"The dishonour memo dated X" is the dishonour date, as before', () => {
    expect(placed('The dishonour memo dated 7 March 2026.')).toEqual({
      dishonour_date: '2026-03-07',
    });
  });

  it('"We received the return memo dated X" is also nothing (not_with "dated")', () => {
    expect(placed('We received the return memo dated 7 March 2026.')).toEqual({});
  });

  it('"The legal notice was sent on X" is L5', () => {
    expect(placed('The legal notice was sent on 3 April 2026.')).toEqual({
      notice_sent_date: '2026-04-03',
    });
  });

  it('"The notice sent to him was served on X" is nothing, by code', () => {
    expect(placed('The notice sent to him was served on 5 April 2026.')).toEqual({});
  });

  it('the model path: a notice_sent quote "The notice sent to him was served on X" is dropped', () => {
    const quote = 'The notice sent to him was served on 5 April 2026.';
    const r = checkRead(S138, quote, {
      outcome: 'read',
      read: [{ id: 'notice_sent_date', value: '2026-04-05', quote }],
    });
    expect(r.values.has('notice_sent_date')).toBe(false);
    expect(r.dropped.map((d) => d.key)).toContain('notice_sent_date');
  });

  it('the model path: "We received the dishonour memo dated X" under L4 is dropped; "... on X" is kept', () => {
    const dated = 'We received the dishonour memo dated 7 March 2026.';
    const a = checkRead(S138, dated, {
      outcome: 'read',
      read: [{ id: 'memo_received_date', value: '2026-03-07', quote: dated }],
    });
    expect(a.values.has('memo_received_date')).toBe(false);
    const on = 'We received the dishonour memo on 12 March 2026.';
    const b = checkRead(S138, on, {
      outcome: 'read',
      read: [{ id: 'memo_received_date', value: '2026-03-12', quote: on }],
    });
    expect(b.values.get('memo_received_date')?.value).toBe('2026-03-12');
  });
});

describe('T-342 part 2: other packs read as before', () => {
  const readKeys = (pack: string, text: string) => {
    const cl = checklistOf(pack);
    return [...datesReadByCode(cl, text, new Map())].map(([k, v]) => [k, v.value]);
  };

  it.each(['bail_regular', 'default_bail'])(
    '%s reads arrest and nothing else from these sentences',
    (pack) => {
      expect(readKeys(pack, 'The accused was arrested on 5 March 2026.')).toEqual([
        ['arrest_date', '2026-03-05'],
      ]);
      for (const text of [
        'The FIR was registered on 2 March 2026.',
        'He received the bail order on 5 March 2026.',
        'The chargesheet was filed on 9 April 2026.',
        'The notice was served on 5 April 2026.',
        'The application was dismissed on 7 May 2026.',
        'The cheque is valid till 10 April 2026.',
        'I received the return memo on 5 March 2026.',
      ]) {
        expect(readKeys(pack, text)).toEqual([]);
      }
    },
  );

  it.each(['bail_regular', 'default_bail'])(
    '%s: the scope changes nothing for any sentence above',
    (pack) => {
      const kinds = new Set(
        checklistOf(pack)
          .map((i) => i.dateKind)
          .filter((k): k is string => !!k),
      );
      for (const text of [
        'The accused was arrested on 5 March 2026.',
        'The FIR was registered on 2 March 2026.',
        'He received the bail order on 5 March 2026.',
        'The notice was served on 5 April 2026.',
        'The application was dismissed on 7 May 2026.',
        'The cheque is valid till 10 April 2026.',
      ]) {
        // (Not "received the return memo": scoped, it reads memo_received, which no bail
        // fact takes, so datesReadByCode places nothing either way; see the test above.)
        expect(statedDates(text, kinds)).toEqual(statedDates(text));
      }
    },
  );

  it('intended side effect: "came to notice on X" now places date_first_noticed on consumer_deficiency', () => {
    for (const text of [
      'Came to notice on 3 March 2026.',
      'The defect came to notice on 3 March 2026.',
    ]) {
      expect(readKeys('legal_notice_consumer_deficiency', text)).toEqual([
        ['particulars.date_first_noticed', '2026-03-03'],
      ]);
      // unchanged elsewhere: the s.138 and bail packs do not take it
      expect(readKeys(PACK, text)).toEqual([]);
      expect(readKeys('bail_regular', text)).toEqual([]);
    }
  });

  it('the s.138 memo and validity sentences place nothing on another pack', () => {
    for (const text of [
      'I received the return memo on 5 March 2026.',
      'The cheque is valid till 10 April 2026.',
      'The notice was sent on 3 April 2026.',
    ]) {
      expect(readKeys('bail_regular', text)).toEqual([]);
      expect(readKeys('legal_notice_consumer_deficiency', text)).toEqual([]);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. End to end, code path only: description -> datesReadByCode -> brief -> facts -> T-192
// ═════════════════════════════════════════════════════════════════════════════
describe('T-342 part 2 AC2/AC3: from a description, no model spans, to A1 and B1', () => {
  const kind = { id: PACK, name: 'Legal Notice s138', court_document: false };
  const DESCRIPTION =
    'Cheque dated 10 January 2026. The cheque is valid till 10 April 2026. ' +
    'Presented to the bank on 9 April 2026. The cheque was returned unpaid on 11 April 2026. ' +
    'My client received the return memo on 12 April 2026. The notice was sent on 13 April 2026.';

  /** The brief path with an empty model answer, then the advocate's confirmation laid over the ledger. */
  function viaBrief(description: string) {
    const read = checkRead(S138, description, { outcome: 'read', read: [] });
    const byCode = datesReadByCode(S138, description, read.values);
    const brief = buildBrief({
      kind,
      checklist: S138,
      values: [...byCode].map(([key, v]) => ({
        key,
        value: v.value,
        quote: v.quote,
        source: 'description' as const,
      })),
      description,
    });
    // The advocate confirms what was read (source 'user'), as T-335's overlay takes it.
    const confirmed = brief.items.map((i) => ({ ...i, source: 'user' as const }));
    const { state } = overlayBrief(
      { facts: [], unresolved: [] },
      { items: confirmed },
      S138,
      NOW_YEAR,
    );
    return { byCode, brief, facts: state.facts };
  }

  it('code places all six dates under the right keys', () => {
    const { byCode } = viaBrief(DESCRIPTION);
    expect(Object.fromEntries([...byCode].map(([k, v]) => [k, v.value]))).toEqual({
      cheque_date: '2026-01-10',
      cheque_validity_date: '2026-04-10',
      presentation_date: '2026-04-09',
      dishonour_date: '2026-04-11',
      memo_received_date: '2026-04-12',
      notice_sent_date: '2026-04-13',
    });
  });

  it('the brief holds them and the ledger facts give A1 and B1, and both computed facts', () => {
    const { brief, facts } = viaBrief(DESCRIPTION);
    for (const key of ['memo_received_date', 'notice_sent_date', 'cheque_validity_date']) {
      expect(brief.items.find((i) => i.key === key)).toMatchObject({ source: 'description' });
      expect(facts.find((f) => f.key === key)).toBeDefined();
    }
    const r = s138DateChecks(facts, PACK);
    expect(r.a.line).toBe('A1');
    expect(r.a.missing).toEqual([]);
    expect(r.a.end).toBe('2026-04-10');
    expect(r.b.line).toBe('B1');
    expect(r.b.missing).toEqual([]);
    expect(r.b.end).toBe('2026-05-12');
    expect(r.computedFacts.map((f) => f.key).sort()).toEqual([
      's138_notice_within_thirty_days',
      's138_presented_within_validity',
    ]);
    expect(
      withS138DateChecks(facts, PACK)
        .filter((f) => f.source === 'computed')
        .map((f) => f.key)
        .sort(),
    ).toEqual(['s138_notice_within_thirty_days', 's138_presented_within_validity']);
  });

  it('a notice served on a date (not sent) does not make B1: L5 stays empty, B4', () => {
    const text =
      'Cheque dated 10 January 2026. Presented to the bank on 9 April 2026. ' +
      'My client received the return memo on 12 April 2026. The notice served on 13 April 2026.';
    const { byCode, facts } = viaBrief(text);
    expect(byCode.has('notice_sent_date')).toBe(false);
    const r = s138DateChecks(facts, PACK);
    expect(r.b.line).toBe('B4'); // L4 known, L5 not: "send the notice on or before"
    expect(r.b.missing).toEqual(['L5']);
    expect(r.computedFacts.map((f) => f.key)).toEqual(['s138_presented_within_validity']);
  });

  it('a bare "received on X" does not make L4: B5, no notice fact', () => {
    const text =
      'Cheque dated 10 January 2026. Presented to the bank on 9 April 2026. ' +
      'Received on 12 April 2026. The notice was sent on 13 April 2026.';
    const { byCode, facts } = viaBrief(text);
    expect(byCode.has('memo_received_date')).toBe(false);
    const r = s138DateChecks(facts, PACK);
    expect(r.b.line).toBe('B5');
    expect(r.b.missing).toEqual(['L4']);
  });

  it('a late notice read from the description gives B2 and no notice fact', () => {
    const text =
      'Cheque dated 10 January 2026. Presented to the bank on 9 April 2026. ' +
      'My client received the return memo on 12 March 2026. The notice was sent on 13 April 2026.';
    const { facts } = viaBrief(text);
    const r = s138DateChecks(facts, PACK);
    expect(r.b.line).toBe('B2');
    expect(r.computedFacts.map((f) => f.key)).toEqual(['s138_presented_within_validity']);
  });

  it('checkRead keeps the model quotes for all six (memo_received is no longer dropped)', () => {
    const entries = [
      { id: 'cheque_date', value: '2026-01-10', quote: 'Cheque dated 10 January 2026' },
      {
        id: 'cheque_validity_date',
        value: '2026-04-10',
        quote: 'The cheque is valid till 10 April 2026',
      },
      {
        id: 'presentation_date',
        value: '2026-04-09',
        quote: 'Presented to the bank on 9 April 2026',
      },
      {
        id: 'dishonour_date',
        value: '2026-04-11',
        quote: 'The cheque was returned unpaid on 11 April 2026',
      },
      {
        id: 'memo_received_date',
        value: '2026-04-12',
        quote: 'My client received the return memo on 12 April 2026',
      },
      {
        id: 'notice_sent_date',
        value: '2026-04-13',
        quote: 'The notice was sent on 13 April 2026',
      },
    ];
    const r = checkRead(S138, DESCRIPTION, { outcome: 'read', read: entries });
    expect(r.dropped).toEqual([]);
    expect([...r.values.keys()].sort()).toEqual(entries.map((e) => e.id).sort());
    // and the code adds nothing on top
    expect(datesReadByCode(S138, DESCRIPTION, r.values).size).toBe(0);
  });

  it('the readExtraction path of part 1 still gives A1 and B1 for the same description', () => {
    const span = (key: string, s: string) => ({ key, span: s, confidence: 0.95 });
    const r = readExtraction(
      S138,
      DESCRIPTION,
      {
        facts: [
          span('cheque_date', '10 January 2026'),
          span('cheque_validity_date', '10 April 2026'),
          span('presentation_date', '9 April 2026'),
          span('dishonour_date', '11 April 2026'),
          span('memo_received_date', '12 April 2026'),
          span('notice_sent_date', '13 April 2026'),
        ],
      },
      NOW_YEAR,
    );
    expect(r.dropped).toEqual([]);
    const c = s138DateChecks(r.facts, PACK);
    expect(c.a.line).toBe('A1');
    expect(c.b.line).toBe('B1');
  });
});
