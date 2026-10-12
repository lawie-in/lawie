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
 * Tests named "PART 2 WILL PLACE" pin what the code does today on a cue
 * collision: the date is dropped, never put on the wrong fact. Part 2
 * (pack-scoped kind check, longest-cue precedence) is expected to flip them.
 *
 * No model call, no database. The model's answer is stubbed as spans.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import { readExtraction } from '../services/fact-ledger.service';
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
  facts: string[];
}
const MEANINGS_REL = 'apps/drafting/src/config/intake/date-meanings.json';
const MEANINGS = JSON.parse(readFileSync(join(REPO_ROOT, MEANINGS_REL), 'utf-8')) as {
  kinds: Kind[];
};
const kindById = (id: string): Kind => {
  const k = MEANINGS.kinds.find((x) => x.id === id);
  if (!k) throw new Error(`no kind ${id}`);
  return k;
};

/** The file as it stood before T-342 part 1 (commit 487b91a), or null if git cannot give it. */
function fileBeforeT342(): { kinds: Kind[] } | null {
  try {
    const out = execFileSync('git', ['-C', REPO_ROOT, 'show', `487b91a:${MEANINGS_REL}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out) as { kinds: Kind[] };
  } catch {
    return null;
  }
}

// ── the checklist and the reading path ──────────────────────────────────────

function checklistOf(id: string): ChecklistItem[] {
  const p = loadRulePack(id);
  if (!p) throw new Error(`no pack ${id}`);
  return buildChecklist(p);
}
const S138 = checklistOf(PACK);
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

  it('no kind that existed before was changed (compared with commit 487b91a)', () => {
    const before = fileBeforeT342();
    // If the history is not there (a shallow clone) the pinned list below still runs.
    if (before) {
      for (const old of before.kinds) expect(kindById(old.id)).toEqual(old);
      expect(MEANINGS.kinds.map((k) => k.id)).toEqual([
        ...before.kinds
          .slice(0, before.kinds.findIndex((k) => k.id === 'dishonour') + 1)
          .map((k) => k.id),
        'memo_received',
        'notice_sent',
        'cheque_validity',
        ...before.kinds
          .slice(before.kinds.findIndex((k) => k.id === 'dishonour') + 1)
          .map((k) => k.id),
      ]);
    }
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
    expect(dateKindsIn(words)).toContain('memo_received');
    expect(carriesDateKind(words, 'memo_received')).toBe(true);
  });

  it.each([
    'received on 5 March 2026',
    'We received it on 5 March 2026.',
    'Received on 5 March 2026 by the client.',
    'got it on 5 March 2026',
    'the bank letter was received on 5 March 2026',
  ])('a bare "%s" never maps to memo_received', (words) => {
    expect(dateKindsIn(words)).not.toContain('memo_received');
    expect(carriesDateKind(words, 'memo_received')).toBe(false);
  });

  it.each([
    'The cheque was dishonoured on 3 March 2026.',
    'dishonoured on 3 March 2026',
    'The cheque was returned unpaid on 3 March 2026.',
    'returned unpaid on 3 March 2026',
    'cheque bounced and dishonoured on 3 March 2026',
  ])('"%s" maps to dishonour, never memo_received', (words) => {
    expect(dateKindsIn(words)).toContain('dishonour');
    expect(dateKindsIn(words)).not.toContain('memo_received');
    const stated = statedDates(words);
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
    expect(dateKindsIn(words)).toContain('cheque_validity');
  });

  it.each([
    'valid till 10 April 2026',
    'The agreement is valid till 10 April 2026.',
    'The licence is valid until 10 April 2026.',
    'validity 10 April 2026',
  ])('"%s" without a cheque word is not cheque_validity', (words) => {
    expect(dateKindsIn(words)).not.toContain('cheque_validity');
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
    const kinds = dateKindsIn(words);
    expect(kinds).not.toContain('memo_received');
    expect(kinds).not.toContain('notice_sent');
    const code = datesReadByCode(S138, words, new Map());
    expect(code.has('memo_received_date')).toBe(false);
    expect(code.has('notice_sent_date')).toBe(false);
  });

  it('a notice that is sent carries notice_sent, and that is not memo_received', () => {
    for (const words of ['The notice was sent on 3 April 2026.', 'notice bheja 3 April 2026 ko']) {
      expect(dateKindsIn(words)).toContain('notice_sent');
      expect(dateKindsIn(words)).not.toContain('memo_received');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Fail-safe today: where code sees a collision, the date is not placed
// ═════════════════════════════════════════════════════════════════════════════
describe('T-342 fail-safe today: a cue collision drops the date, it never goes to the wrong fact', () => {
  const MEMO = 'I received the return memo on 5 March 2026.';
  const VALID = 'The cheque is valid till 10 April 2026.';
  const SENT = 'The notice was sent on 3 April 2026.';

  // The model's entry is checked first; the code path then adds nothing.
  const modelEntry = (key: string, value: string, quote: string) => ({ id: key, value, quote });

  it('PART 2 WILL PLACE: "received the return memo on X" collides with dishonour and served, so code places nothing', () => {
    expect(dateKindsIn(MEMO)).toEqual(
      expect.arrayContaining(['memo_received', 'dishonour', 'served']),
    );
    expect(statedDates(MEMO)).toEqual([
      expect.objectContaining({ value: '2026-03-05', kind: null }),
    ]);
    const placed = datesReadByCode(S138, MEMO, new Map());
    expect([...placed.keys()]).toEqual([]);
  });

  it('PART 2 WILL PLACE: "valid till X" in a cheque sentence collides with end, so code places nothing', () => {
    expect(dateKindsIn(VALID)).toEqual(expect.arrayContaining(['cheque_validity', 'end']));
    expect(statedDates(VALID)).toEqual([
      expect.objectContaining({ value: '2026-04-10', kind: null }),
    ]);
    expect([...datesReadByCode(S138, VALID, new Map()).keys()]).toEqual([]);
  });

  it('PART 2 WILL PLACE: "the notice was sent on X" collides with notice, so code places nothing', () => {
    expect(dateKindsIn(SENT)).toEqual(expect.arrayContaining(['notice_sent', 'notice']));
    expect(statedDates(SENT)).toEqual([
      expect.objectContaining({ value: '2026-04-03', kind: null }),
    ]);
    expect([...datesReadByCode(S138, SENT, new Map()).keys()]).toEqual([]);
  });

  it("PART 2 WILL PLACE: the model's memo entry is dropped (two meanings with dishonour); no fact gets the date", () => {
    const r = readPath(MEMO, [modelEntry('memo_received_date', '2026-03-05', MEMO)]);
    expect(r.kept.has('memo_received_date')).toBe(false);
    expect(r.dropped).toEqual([expect.objectContaining({ key: 'memo_received_date' })]);
    // and the date is not on any other fact either
    for (const v of [...r.kept.values(), ...r.byCode.values()])
      expect(v.value).not.toBe('2026-03-05');
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
