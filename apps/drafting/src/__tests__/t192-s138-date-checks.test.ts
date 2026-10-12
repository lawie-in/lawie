/**
 * T-192 — code computes the s.138 NI Act date checks (LEGAL CONTENT).
 *
 * The logic, the labels and the lines are Ajay's, signed in
 * handoff/legal/T-192-s138-date-checks-signed.md (Addendum 1) and his later
 * rulings: neutral display in FACTS, an unresolved input counts as missing,
 * and the date line uses the date the notice is sent (the date FORMAT is split
 * off to a follow-up and is NOT pinned here).
 *
 * AC1 pins against the signed md, read at test time
 * AC2 inputs are ledger facts with source user/asked only
 * AC3 code computes both checks; the Drafter prompt carries no result line
 * AC4 the Drafter's FACTS show a neutral result (the brief view is T-337)
 * AC5 an entry unlocks only when its check passes
 * AC6 a missing input keeps the entry banned
 * AC7 per check: a day inside, the last day, a day outside; each missing input
 * AC8 golden snapshots: this file touches none (see the full-suite run)
 *
 * The model is the Anthropic SDK stub; every answer is a fixture.
 */
import './setupDb';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { AVERMENTS_DIR, loadAvermentLists, resolveAverments } from '../services/averments';
import { CLAUSES_MARKER, packTexts } from '../services/brief-drafter';
import { openVersion } from '../services/fact-ledger.service';
import { verifyDraft } from '../services/fact-verifier';
import { listRulePackIds, loadRulePack } from '../services/rule-pack.service';
import {
  S138_BLANK,
  S138_COMPUTED_DISPLAYS,
  S138_COMPUTED_KEYS,
  S138_INPUT_KEYS,
  S138_INPUT_LABELS,
  S138_LINE_TEXTS,
  addCalendarMonths,
  addDays,
  s138DateChecks,
  withS138DateChecks,
} from '../services/s138-date-checks';
import {
  clearConfigCache,
  buildPlaceholderContext,
  loadTemplateConfig,
  replacePlaceholders,
} from '../services/template-engine.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

jest.setTimeout(30_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const PACK = 'legal_notice_s138';
// Ajay's later ruling 1, verbatim.
const NEUTRAL_A = 'Presented in time: yes (checked by Lawie from the dates given)';
const NEUTRAL_B = 'Notice in time: yes (checked by Lawie from the dates given)';

// ── the signed md ───────────────────────────────────────────────────────────

const SIGNED_PATH = join(__dirname, '../../../../handoff/legal/T-192-s138-date-checks-signed.md');
const MD_AVAILABLE = existsSync(SIGNED_PATH);
const MD = MD_AVAILABLE ? readFileSync(SIGNED_PATH, 'utf-8') : '';

/** The first backtick-quoted run in a table cell. */
function firstCode(cell: string): string | null {
  const m = /`([^`]+)`/.exec(cell);
  return m ? m[1] : null;
}
function rows(): string[][] {
  return MD.split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) =>
      l
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    );
}

// ── fact builders ───────────────────────────────────────────────────────────

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** `2026-01-10` -> `10 January 2026` (written out here, not taken from the module). */
function human(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function dateFact(key: string, iso: string, extra: Record<string, unknown> = {}): LedgerFact {
  return {
    id: `f_${key}_${iso}`,
    key,
    label: key,
    type: 'date',
    value: iso,
    display: human(iso),
    raw_span: human(iso),
    source: 'user',
    confidence: 0.99,
    required_in_draft: true,
    ...extra,
  } as LedgerFact;
}
const K = S138_INPUT_KEYS;
interface Dates {
  L1?: string;
  L2?: string;
  L3?: string;
  L4?: string;
  L5?: string;
}
function facts(d: Dates, extra: Record<string, unknown> = {}): LedgerFact[] {
  const out: LedgerFact[] = [];
  for (const k of ['L1', 'L2', 'L3', 'L4', 'L5'] as const) {
    const v = d[k];
    if (v) out.push(dateFact(K[k], v, extra));
  }
  return out;
}
const A = (d: Dates, unresolved: string[] = []) => s138DateChecks(facts(d), PACK, unresolved).a;
const B = (d: Dates, unresolved: string[] = []) => s138DateChecks(facts(d), PACK, unresolved).b;
const blank = (label: string) => S138_BLANK.replace('{label}', label);

// ═════════════════════════════════════════════════════════════════════════════
// AC1: pinned against the signed md
// ═════════════════════════════════════════════════════════════════════════════
describe('T-192 AC1: the module and the averment file match the signed md', () => {
  it('the signed md exists (the pins below read it at test time)', () => {
    expect(MD_AVAILABLE).toBe(true);
    expect(MD).toContain('Signed: Ajay (CLO)');
  });

  it('the five input labels L1 to L5 are the exact labels of the Inputs table', () => {
    const found: Record<string, string> = {};
    for (const r of rows()) {
      // the Addendum has a second table row that starts with L5; the Inputs table comes first
      if (/^L[1-5]$/.test(r[0]) && !(r[0] in found)) found[r[0]] = firstCode(r[1]) ?? '';
    }
    expect(found).toEqual({
      L1: 'Date on the cheque',
      L2: 'Last date of validity printed on the cheque, if any',
      L3: 'Date the cheque was presented to the bank',
      L4: 'Date the return memo was received',
      L5: 'Date the notice is sent',
    });
    expect(S138_INPUT_LABELS).toEqual(found);
  });

  it("the keys of the five inputs; L1 and L3 are the pack's existing fields", () => {
    expect(S138_INPUT_KEYS).toEqual({
      L1: 'cheque_date',
      L2: 'cheque_validity_date',
      L3: 'presentation_date',
      L4: 'memo_received_date',
      L5: 'notice_sent_date',
    });
  });

  it('all nine result lines A1-A4 and B1-B5 equal S138_LINE_TEXTS, character for character', () => {
    const found: Record<string, string> = {};
    for (const r of rows()) {
      if (/^[AB][1-5]$/.test(r[0]) && r.length >= 3) found[r[0]] = firstCode(r[2]) ?? '';
    }
    expect(Object.keys(found).sort()).toEqual(
      ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5'].sort(),
    );
    expect(S138_LINE_TEXTS).toEqual(found);
  });

  it('the visible blank is "[To be confirmed: {label}]"', () => {
    expect(S138_BLANK).toBe('[To be confirmed: {label}]');
    expect(MD).toContain('`[To be confirmed: {label}]`');
  });

  it('Addendum 1: the two twin texts in the averments file are the signed texts, dates as {{key}}', () => {
    const twin: Record<string, string> = {};
    for (const r of rows()) {
      const m = /^`(presented_within_validity|notice_within_thirty_days)` twin text/.exec(r[0]);
      if (m) twin[m[1]] = firstCode(r[1]) ?? '';
    }
    expect(Object.keys(twin).sort()).toEqual([
      'notice_within_thirty_days',
      'presented_within_validity',
    ]);
    const toKeys = (t: string) =>
      t
        .replace(/\{L1\}/g, '{{cheque_date}}')
        .replace(/\{L3\}/g, '{{presentation_date}}')
        .replace(/\{L4\}/g, '{{memo_received_date}}');
    const lists = loadAvermentLists(PACK);
    for (const id of ['presented_within_validity', 'notice_within_thirty_days']) {
      const entries = lists.allowed.filter((a) => a.id === id);
      expect(entries).toHaveLength(1);
      expect(entries[0].averment).toBe(toKeys(twin[id]));
    }
  });

  it('the two banned entries are unlocked by the computed keys, and by nothing else that is computed', () => {
    const lists = loadAvermentLists(PACK);
    const keysOf = (id: string) =>
      JSON.stringify(lists.banned.find((b) => b.id === id)!.unlocked_by);
    expect(keysOf('presented_within_validity')).toContain(S138_COMPUTED_KEYS.a);
    expect(keysOf('presented_within_validity')).not.toContain(S138_COMPUTED_KEYS.b);
    expect(keysOf('notice_within_thirty_days')).toContain(S138_COMPUTED_KEYS.b);
    expect(keysOf('notice_within_thirty_days')).not.toContain(S138_COMPUTED_KEYS.a);
  });

  it('the pack declares the three new fields with the exact labels (rules and template)', () => {
    const want = [
      ['cheque_validity_date', 'Last date of validity printed on the cheque, if any'],
      ['memo_received_date', 'Date the return memo was received'],
      ['notice_sent_date', 'Date the notice is sent'],
    ];
    const read = (p: string) => JSON.parse(readFileSync(join(__dirname, p), 'utf-8'));
    const files = [
      read('../config/document-rules/legal_notice_s138.json').form_schema,
      read('../../../../docs/templates/legal_notice_s138.json').form_schema,
    ];
    for (const schema of files) {
      const fields = (schema.steps as Array<{ fields: Array<Record<string, unknown>> }>).flatMap(
        (s) => s.fields,
      );
      for (const [id, label] of want) {
        const f = fields.find((x) => x.field_id === id);
        expect(f).toBeDefined();
        expect(f!.label).toBe(label);
        expect(f!.type).toBe('date');
        expect(f!.required).toBe(false);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC7, check (a): presented within validity
// ═════════════════════════════════════════════════════════════════════════════
describe('T-192 AC7 check (a): presented within validity', () => {
  it('date helpers: month-end clamps, leap year, year rollover, +30 days', () => {
    expect(addCalendarMonths('2026-01-10', 3)).toBe('2026-04-10');
    expect(addCalendarMonths('2025-11-30', 3)).toBe('2026-02-28');
    expect(addCalendarMonths('2023-11-30', 3)).toBe('2024-02-29');
    expect(addCalendarMonths('2026-01-31', 3)).toBe('2026-04-30');
    expect(addCalendarMonths('2025-12-31', 3)).toBe('2026-03-31');
    expect(addDays('2026-03-05', 30)).toBe('2026-04-04');
    expect(addDays('2024-02-10', 30)).toBe('2024-03-11');
    expect(addDays('2025-12-20', 30)).toBe('2026-01-19');
  });

  it('L1 10 Jan 2026: validity ends 10 Apr; 9 Apr inside (A1)', () => {
    const r = A({ L1: '2026-01-10', L3: '2026-04-09' });
    expect(r.line).toBe('A1');
    expect(r.end).toBe('2026-04-10');
    expect(r.missing).toEqual([]);
    expect(r.text).toBe(
      'Presented in time: the cheque dated 10 January 2026 was presented on 9 April 2026, within its validity, which ended on 10 April 2026.',
    );
  });

  it('10 Apr is the last day (A1)', () => {
    const r = A({ L1: '2026-01-10', L3: '2026-04-10' });
    expect(r.line).toBe('A1');
    expect(r.text).toContain('was presented on 10 April 2026');
  });

  it('11 Apr is outside (A2)', () => {
    const r = A({ L1: '2026-01-10', L3: '2026-04-11' });
    expect(r.line).toBe('A2');
    expect(r.end).toBe('2026-04-10');
    expect(r.text).toBe(
      'Not presented in time: the cheque dated 10 January 2026 was presented on 11 April 2026, after its validity ended on 10 April 2026. Check the dates before sending the notice.',
    );
  });

  it('presented on the date of the cheque itself passes (L1 <= L3)', () => {
    expect(A({ L1: '2026-01-10', L3: '2026-01-10' }).line).toBe('A1');
  });

  it('30 Nov 2025 (non-leap): last day is 28 Feb 2026', () => {
    expect(A({ L1: '2025-11-30', L3: '2026-02-27' }).line).toBe('A1');
    const last = A({ L1: '2025-11-30', L3: '2026-02-28' });
    expect(last.line).toBe('A1');
    expect(last.end).toBe('2026-02-28');
    expect(A({ L1: '2025-11-30', L3: '2026-03-01' }).line).toBe('A2');
  });

  it('30 Nov 2023 (leap year): last day is 29 Feb 2024', () => {
    expect(A({ L1: '2023-11-30', L3: '2024-02-28' }).line).toBe('A1');
    const last = A({ L1: '2023-11-30', L3: '2024-02-29' });
    expect(last.line).toBe('A1');
    expect(last.end).toBe('2024-02-29');
    expect(A({ L1: '2023-11-30', L3: '2024-03-01' }).line).toBe('A2');
  });

  it('31 Jan 2026: last day is 30 Apr 2026', () => {
    expect(A({ L1: '2026-01-31', L3: '2026-04-29' }).line).toBe('A1');
    expect(A({ L1: '2026-01-31', L3: '2026-04-30' }).line).toBe('A1');
    expect(A({ L1: '2026-01-31', L3: '2026-05-01' }).line).toBe('A2');
  });

  it('L2 earlier than three months is used (inside, last day, outside)', () => {
    const base = { L1: '2026-01-10', L2: '2026-03-15' };
    expect(A({ ...base, L3: '2026-03-14' }).line).toBe('A1');
    const last = A({ ...base, L3: '2026-03-15' });
    expect(last.line).toBe('A1');
    expect(last.end).toBe('2026-03-15');
    const out = A({ ...base, L3: '2026-03-16' });
    expect(out.line).toBe('A2');
    expect(out.text).toContain('after its validity ended on 15 March 2026');
  });

  it('L2 later than three months is ignored', () => {
    const r = A({ L1: '2026-01-10', L2: '2026-06-01', L3: '2026-04-11' });
    expect(r.line).toBe('A2');
    expect(r.end).toBe('2026-04-10');
    expect(A({ L1: '2026-01-10', L2: '2026-06-01', L3: '2026-04-10' }).line).toBe('A1');
  });

  it('L3 before L1 gives A3', () => {
    const r = A({ L1: '2026-01-10', L3: '2026-01-09' });
    expect(r.line).toBe('A3');
    expect(r.text).toBe(
      'Check the dates: the cheque was presented on 9 January 2026, before the date on the cheque, 10 January 2026.',
    );
  });

  it('L1 missing gives A4 with the L1 blank only', () => {
    const r = A({ L3: '2026-04-09' });
    expect(r.line).toBe('A4');
    expect(r.missing).toEqual(['L1']);
    expect(r.end).toBeNull();
    expect(r.text.startsWith(S138_LINE_TEXTS.A4)).toBe(true);
    expect(r.text).toContain(blank('Date on the cheque'));
    expect(r.text).not.toContain(blank('Date the cheque was presented to the bank'));
  });

  it('L3 missing gives A4 with the L3 blank only', () => {
    const r = A({ L1: '2026-01-10' });
    expect(r.line).toBe('A4');
    expect(r.missing).toEqual(['L3']);
    expect(r.text.startsWith(S138_LINE_TEXTS.A4)).toBe(true);
    expect(r.text).toContain(blank('Date the cheque was presented to the bank'));
    expect(r.text).not.toContain(blank('Date on the cheque'));
  });

  it('both missing gives A4 with both blanks, L1 first', () => {
    const r = A({});
    expect(r.line).toBe('A4');
    expect(r.missing).toEqual(['L1', 'L3']);
    const i1 = r.text.indexOf(blank('Date on the cheque'));
    const i3 = r.text.indexOf(blank('Date the cheque was presented to the bank'));
    expect(i1).toBeGreaterThan(-1);
    expect(i3).toBeGreaterThan(i1);
  });

  it('L2 unresolved gives A4 with the L2 blank and no fallback to 3 months, even when L2 is on the ledger', () => {
    // Same dates would pass on the 3-month rule.
    const d = { L1: '2026-01-10', L3: '2026-04-09' };
    expect(A(d).line).toBe('A1');
    for (const withL2 of [false, true]) {
      const r = A(withL2 ? { ...d, L2: '2026-03-15' } : d, ['cheque_validity_date']);
      expect(r.line).toBe('A4');
      expect(r.missing).toEqual(['L2']);
      expect(r.end).toBeNull();
      expect(r.text).toContain(
        '[To be confirmed: Last date of validity printed on the cheque, if any]',
      );
    }
  });

  it('two conflicting L2 facts give A4 with the L2 blank', () => {
    const fs = [
      ...facts({ L1: '2026-01-10', L3: '2026-04-09' }),
      dateFact(K.L2, '2026-03-15', { id: 'x1' }),
      dateFact(K.L2, '2026-03-20', { id: 'x2' }),
    ];
    const r = s138DateChecks(fs, PACK).a;
    expect(r.line).toBe('A4');
    expect(r.missing).toEqual(['L2']);
    expect(r.text).toContain(blank('Last date of validity printed on the cheque, if any'));
  });

  it('L2 truly absent gives the three-month result, and is not a missing input', () => {
    const r = A({ L1: '2026-01-10', L3: '2026-04-09' });
    expect(r.line).toBe('A1');
    expect(r.missing).toEqual([]);
    expect(r.text).not.toContain('[To be confirmed');
  });

  it('L1 and L2 both unresolved and L3 missing: all three blanks, in order', () => {
    const r = A({ L1: '2026-01-10' }, ['cheque_validity_date', 'cheque_date']);
    expect(r.line).toBe('A4');
    expect(r.missing).toEqual(['L1', 'L2', 'L3']);
  });

  it('an unresolved L1 or L3 counts as missing even when a value is on the ledger', () => {
    const d = { L1: '2026-01-10', L3: '2026-04-09' };
    expect(A(d, ['cheque_date']).missing).toEqual(['L1']);
    expect(A(d, ['presentation_date']).missing).toEqual(['L3']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC7, check (b): notice within thirty days
// ═════════════════════════════════════════════════════════════════════════════
describe('T-192 AC7 check (b): notice within thirty days', () => {
  it('L4 5 Mar 2026: last day 4 Apr; 3 Apr inside (B1)', () => {
    const r = B({ L4: '2026-03-05', L5: '2026-04-03' });
    expect(r.line).toBe('B1');
    expect(r.end).toBe('2026-04-04');
    expect(r.missing).toEqual([]);
    expect(r.text).toBe(
      'Notice in time: the return memo was received on 5 March 2026 and the notice is sent on 3 April 2026, within 30 days (last day 4 April 2026).',
    );
  });

  it('4 Apr is the last day (B1)', () => {
    const r = B({ L4: '2026-03-05', L5: '2026-04-04' });
    expect(r.line).toBe('B1');
    expect(r.text).toContain('the notice is sent on 4 April 2026');
  });

  it('5 Apr is outside (B2)', () => {
    const r = B({ L4: '2026-03-05', L5: '2026-04-05' });
    expect(r.line).toBe('B2');
    expect(r.text).toBe(
      'Notice not in time: the notice is sent on 5 April 2026, after 4 April 2026, the last of the 30 days from receipt of the return memo on 5 March 2026. Check the dates before sending.',
    );
  });

  it('sent on the day the memo was received passes (L4 <= L5)', () => {
    expect(B({ L4: '2026-03-05', L5: '2026-03-05' }).line).toBe('B1');
  });

  it('thirty days run across a leap February', () => {
    expect(B({ L4: '2024-02-10', L5: '2024-03-11' }).line).toBe('B1');
    expect(B({ L4: '2024-02-10', L5: '2024-03-12' }).line).toBe('B2');
  });

  it('L5 before L4 gives B3', () => {
    const r = B({ L4: '2026-03-05', L5: '2026-03-04' });
    expect(r.line).toBe('B3');
    expect(r.text).toBe(
      'Check the dates: the notice is sent on 4 March 2026, before the return memo was received on 5 March 2026.',
    );
  });

  it('only L5 missing gives B4 with the last day, L4, and the L5 blank', () => {
    const r = B({ L4: '2026-03-05' });
    expect(r.line).toBe('B4');
    expect(r.missing).toEqual(['L5']);
    expect(r.end).toBe('2026-04-04');
    expect(r.text).toContain(
      'Send the notice on or before 4 April 2026 (30 days from receipt of the return memo on 5 March 2026).',
    );
    expect(r.text).toContain('[To be confirmed: Date the notice is sent]');
  });

  it('L4 missing gives B5 with the L4 blank', () => {
    const r = B({ L5: '2026-04-03' });
    expect(r.line).toBe('B5');
    expect(r.missing).toEqual(['L4']);
    expect(r.end).toBeNull();
    expect(r.text.startsWith(S138_LINE_TEXTS.B5)).toBe(true);
    expect(r.text).toContain(blank('Date the return memo was received'));
    expect(r.text).not.toContain(blank('Date the notice is sent'));
  });

  it('both missing gives B5 with both blanks, L4 first', () => {
    const r = B({});
    expect(r.line).toBe('B5');
    expect(r.missing).toEqual(['L4', 'L5']);
    expect(r.text.indexOf(blank('Date the return memo was received'))).toBeGreaterThan(-1);
    expect(r.text.indexOf(blank('Date the notice is sent'))).toBeGreaterThan(
      r.text.indexOf(blank('Date the return memo was received')),
    );
  });

  it('an unresolved input counts as missing', () => {
    const d = { L4: '2026-03-05', L5: '2026-04-03' };
    expect(B(d).line).toBe('B1');
    const noL4 = B(d, ['memo_received_date']);
    expect(noL4.line).toBe('B5');
    expect(noL4.missing).toEqual(['L4']);
    const noL5 = B(d, ['notice_sent_date']);
    expect(noL5.line).toBe('B4');
    expect(noL5.missing).toEqual(['L5']);
  });

  it('a value that is not a real date counts as missing', () => {
    const fs = [dateFact(K.L4, '2026-02-30'), dateFact(K.L5, '2026-04-03')];
    expect(s138DateChecks(fs, PACK).b.line).toBe('B5');
  });

  it('the two checks do not depend on each other', () => {
    const r = s138DateChecks(
      facts({ L1: '2026-01-10', L3: '2026-04-11', L4: '2026-03-05', L5: '2026-04-04' }),
      PACK,
    );
    expect(r.a.line).toBe('A2');
    expect(r.b.line).toBe('B1');
    expect(r.computedFacts.map((f) => f.key)).toEqual([S138_COMPUTED_KEYS.b]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC2 and the convention: provenance, computed facts
// ═════════════════════════════════════════════════════════════════════════════
describe('T-192 AC2: inputs are user/asked ledger facts only; computed facts are per request', () => {
  const ALL = { L1: '2026-01-10', L3: '2026-04-09', L4: '2026-03-05', L5: '2026-04-03' };

  it('a source "asked" fact counts as an input as well as "user"', () => {
    const fs = facts(ALL).map((f) => ({ ...f, source: 'asked' }) as LedgerFact);
    const r = s138DateChecks(fs, PACK);
    expect(r.a.line).toBe('A1');
    expect(r.b.line).toBe('B1');
  });

  it.each(['computed', 'model', 'assistant', 'inferred'])(
    'a fact of source %s under an input key is not an input',
    (source) => {
      const fs = facts(ALL, { source });
      const r = s138DateChecks(fs, PACK);
      expect(r.a.line).toBe('A4');
      expect(r.a.missing).toEqual(['L1', 'L3']);
      expect(r.b.line).toBe('B5');
      expect(r.b.missing).toEqual(['L4', 'L5']);
      expect(r.computedFacts).toEqual([]);
    },
  );

  it('one model-sourced input among user inputs is ignored: only that input is missing', () => {
    const fs = facts(ALL).map((f) =>
      f.key === K.L3 ? ({ ...f, source: 'model' } as unknown as LedgerFact) : f,
    );
    const r = s138DateChecks(fs, PACK);
    expect(r.a.line).toBe('A4');
    expect(r.a.missing).toEqual(['L3']);
    expect(r.b.line).toBe('B1');
  });

  it('a model fact next to a user fact for the same key cannot change the date', () => {
    const fs = [
      ...facts({ L1: '2026-01-10', L3: '2026-04-11' }),
      dateFact(K.L3, '2026-04-09', { id: 'm', source: 'model' }),
    ];
    expect(s138DateChecks(fs, PACK).a.line).toBe('A2');
  });

  it('computedFacts holds only passes, with the neutral displays, source computed, required_in_draft false', () => {
    const both = s138DateChecks(facts(ALL), PACK).computedFacts;
    expect(both).toHaveLength(2);
    const a = both.find((f) => f.key === 's138_presented_within_validity')!;
    const b = both.find((f) => f.key === 's138_notice_within_thirty_days')!;
    expect(a.display).toBe(NEUTRAL_A);
    expect(b.display).toBe(NEUTRAL_B);
    expect(S138_COMPUTED_DISPLAYS.a).toBe(NEUTRAL_A);
    expect(S138_COMPUTED_DISPLAYS.b).toBe(NEUTRAL_B);
    for (const f of both) {
      expect(f.source).toBe('computed');
      expect(f.required_in_draft).toBe(false);
      expect(f.value).toBe(true);
      expect(f.type).toBe('boolean');
    }
    // the neutral displays carry no date and no A1/B1 words
    for (const f of both) {
      expect(f.display).not.toMatch(/\d/);
      expect(f.display).not.toContain('within its validity');
      expect(f.display).not.toContain('within 30 days');
    }
  });

  it('computedFacts is empty on a fail, a wrong order, and a missing input', () => {
    const cases: Dates[] = [
      { L1: '2026-01-10', L3: '2026-04-11', L4: '2026-03-05', L5: '2026-04-05' }, // A2, B2
      { L1: '2026-01-10', L3: '2026-01-09', L4: '2026-03-05', L5: '2026-03-04' }, // A3, B3
      { L1: '2026-01-10', L4: '2026-03-05' }, // A4, B4
      { L3: '2026-04-09', L5: '2026-04-03' }, // A4, B5
      {},
    ];
    for (const c of cases) expect(s138DateChecks(facts(c), PACK).computedFacts).toEqual([]);
  });

  it('only the check that passes yields its fact', () => {
    const onlyA = s138DateChecks(facts({ ...ALL, L5: '2026-04-05' }), PACK).computedFacts;
    expect(onlyA.map((f) => f.key)).toEqual(['s138_presented_within_validity']);
    const onlyB = s138DateChecks(facts({ ...ALL, L3: '2026-04-11' }), PACK).computedFacts;
    expect(onlyB.map((f) => f.key)).toEqual(['s138_notice_within_thirty_days']);
  });

  it('for any other pack no computed fact is returned', () => {
    expect(s138DateChecks(facts(ALL), 'bail_regular').computedFacts).toEqual([]);
  });

  it('withS138DateChecks: a stored computed fact is dropped, then recomputed from the inputs', () => {
    const stale: LedgerFact[] = [
      {
        ...dateFact('s138_presented_within_validity', '2026-01-01'),
        type: 'boolean',
        value: true,
        display: 'STALE',
        source: 'computed',
      } as unknown as LedgerFact,
      {
        ...dateFact('s138_notice_within_thirty_days', '2026-01-01'),
        display: 'FORGED',
      } as LedgerFact, // user-sourced forgery under a computed key
      { ...dateFact('some_other_key', '2026-01-01'), source: 'computed' } as LedgerFact,
    ];
    // inputs fail (A2, B2): nothing may be recomputed
    const failing = withS138DateChecks(
      [
        ...facts({ L1: '2026-01-10', L3: '2026-04-11', L4: '2026-03-05', L5: '2026-04-05' }),
        ...stale,
      ],
      PACK,
    );
    expect(failing.some((f) => f.source === 'computed')).toBe(false);
    expect(failing.some((f) => f.key.startsWith('s138_'))).toBe(false);
    expect(failing.some((f) => f.key === 'some_other_key')).toBe(false);
    // inputs pass: the facts are the fresh ones, once each
    const passing = withS138DateChecks([...facts(ALL), ...stale], PACK);
    const keys = passing
      .filter((f) => f.key.startsWith('s138_'))
      .map((f) => f.key)
      .sort();
    expect(keys).toEqual(['s138_notice_within_thirty_days', 's138_presented_within_validity']);
    expect(passing.map((f) => f.display)).not.toContain('STALE');
    expect(passing.map((f) => f.display)).not.toContain('FORGED');
    expect(passing.filter((f) => f.source === 'computed')).toHaveLength(2);
    // the user's own input facts are kept
    for (const k of Object.values(K)) {
      if (k === K.L2) continue;
      expect(passing.some((f) => f.key === k && f.source === 'user')).toBe(true);
    }
  });

  it('withS138DateChecks passes the unresolved keys through, and does not change its input', () => {
    const input = facts({ L1: '2026-01-10', L3: '2026-04-09' });
    const before = JSON.stringify(input);
    expect(withS138DateChecks(input, PACK).map((f) => f.key)).toContain(
      's138_presented_within_validity',
    );
    expect(
      withS138DateChecks(input, PACK, ['cheque_validity_date']).map((f) => f.key),
    ).not.toContain('s138_presented_within_validity');
    expect(
      withS138DateChecks(input, PACK, ['cheque_date']).some((f) => f.source === 'computed'),
    ).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('withS138DateChecks leaves every other pack untouched', () => {
    const input = [
      ...facts(ALL),
      dateFact('s138_presented_within_validity', '2026-01-01', { source: 'computed' }),
    ];
    for (const id of listRulePackIds().filter((p) => p !== PACK)) {
      expect(withS138DateChecks(input, id, ['cheque_date'])).toEqual(input);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC5, AC6: the entries unlock only on a pass
// ═════════════════════════════════════════════════════════════════════════════
describe('T-192 AC5/AC6: each entry unlocks only when its check passes', () => {
  const lists = loadAvermentLists(PACK);
  const resolve = (d: Dates, unresolved: string[] = []) =>
    resolveAverments(lists, withS138DateChecks(facts(d), PACK, unresolved));
  const allowedIds = (r: ReturnType<typeof resolve>) => r.allowed.map((a) => a.id);
  const bannedIds = (r: ReturnType<typeof resolve>) => r.banned.map((b) => b.id);
  const PRES = 'presented_within_validity';
  const NOTICE = 'notice_within_thirty_days';

  it('with no dates both entries are banned and neither twin is offered (default)', () => {
    const r = resolve({});
    expect(bannedIds(r)).toEqual(expect.arrayContaining([PRES, NOTICE]));
    expect(allowedIds(r)).not.toContain(PRES);
    expect(allowedIds(r)).not.toContain(NOTICE);
  });

  it('presented_within_validity: inside and last day unlock it, with the twin text and dates filled by code', () => {
    for (const l3 of ['2026-04-09', '2026-04-10']) {
      const r = resolve({ L1: '2026-01-10', L3: l3 });
      expect(bannedIds(r)).not.toContain(PRES);
      const twin = r.allowed.find((a) => a.id === PRES)!;
      expect(twin.text).toBe(
        `The said cheque dated 10 January 2026 was presented for payment on ${human(l3)}, within the period of its validity.`,
      );
      // the notice entry is separate: no L4/L5 given, still banned
      expect(bannedIds(r)).toContain(NOTICE);
    }
  });

  it('presented_within_validity: outside, before the cheque date, or a missing input keeps it banned', () => {
    const cases: Dates[] = [
      { L1: '2026-01-10', L3: '2026-04-11' },
      { L1: '2026-01-10', L3: '2026-01-09' },
      { L1: '2026-01-10' },
      { L3: '2026-04-09' },
    ];
    for (const c of cases) {
      const r = resolve(c);
      expect(bannedIds(r)).toContain(PRES);
      expect(allowedIds(r)).not.toContain(PRES);
    }
  });

  it('presented_within_validity: an unresolved L2 keeps it banned even though three months would pass', () => {
    const d = { L1: '2026-01-10', L3: '2026-04-09' };
    expect(allowedIds(resolve(d))).toContain(PRES);
    const r = resolve(d, ['cheque_validity_date']);
    expect(bannedIds(r)).toContain(PRES);
    expect(allowedIds(r)).not.toContain(PRES);
  });

  it('notice_within_thirty_days: inside and last day unlock it, with the twin text and the memo date filled', () => {
    for (const l5 of ['2026-04-03', '2026-04-04']) {
      const r = resolve({ L4: '2026-03-05', L5: l5 });
      expect(bannedIds(r)).not.toContain(NOTICE);
      const twin = r.allowed.find((a) => a.id === NOTICE)!;
      expect(twin.text).toBe(
        'This notice is issued within thirty days of the receipt, on 5 March 2026, of the information from the bank regarding the return of the said cheque unpaid.',
      );
      expect(bannedIds(r)).toContain(PRES);
    }
  });

  it('notice_within_thirty_days: outside, before receipt, or a missing input keeps it banned', () => {
    const cases: Dates[] = [
      { L4: '2026-03-05', L5: '2026-04-05' },
      { L4: '2026-03-05', L5: '2026-03-04' },
      { L4: '2026-03-05' }, // B4
      { L5: '2026-04-03' }, // B5
    ];
    for (const c of cases) {
      const r = resolve(c);
      expect(bannedIds(r)).toContain(NOTICE);
      expect(allowedIds(r)).not.toContain(NOTICE);
    }
    const unresolved = resolve({ L4: '2026-03-05', L5: '2026-04-03' }, ['memo_received_date']);
    expect(bannedIds(unresolved)).toContain(NOTICE);
  });

  it('both pass: both twins are offered and neither is banned', () => {
    const r = resolve({ L1: '2026-01-10', L3: '2026-04-09', L4: '2026-03-05', L5: '2026-04-03' });
    expect(allowedIds(r)).toEqual(expect.arrayContaining([PRES, NOTICE]));
    expect(bannedIds(r)).not.toContain(PRES);
    expect(bannedIds(r)).not.toContain(NOTICE);
  });

  it('a model-sourced date cannot unlock: the entries stay banned', () => {
    const fs = facts(
      { L1: '2026-01-10', L3: '2026-04-09', L4: '2026-03-05', L5: '2026-04-03' },
      { source: 'model' },
    );
    const r = resolveAverments(lists, withS138DateChecks(fs, PACK));
    expect(r.banned.map((b) => b.id)).toEqual(expect.arrayContaining([PRES, NOTICE]));
    expect(r.allowed.map((a) => a.id)).not.toContain(PRES);
    expect(r.allowed.map((a) => a.id)).not.toContain(NOTICE);
  });

  it('a stored computed "true" with failing dates does not unlock (dropped and recomputed)', () => {
    const forged = ['s138_presented_within_validity', 's138_notice_within_thirty_days'].map(
      (key) =>
        ({
          id: key,
          key,
          label: key,
          type: 'boolean',
          value: true,
          display: 'yes',
          raw_span: '',
          source: 'computed',
          confidence: 1,
          required_in_draft: false,
        }) as LedgerFact,
    );
    const fs = [...facts({ L1: '2026-01-10', L3: '2026-04-11' }), ...forged];
    const r = resolveAverments(lists, withS138DateChecks(fs, PACK));
    expect(r.banned.map((b) => b.id)).toEqual(expect.arrayContaining([PRES, NOTICE]));
  });

  it('other packs: no averment file but legal_notice_s138 names the computed keys, and the s138 ids are never offered', () => {
    const ids = readFileListing();
    for (const id of ids.filter((f) => f !== `${PACK}.json`)) {
      expect(readFileSync(join(AVERMENTS_DIR, id), 'utf-8')).not.toContain('s138_');
    }
    for (const pack of listRulePackIds().filter((p) => p !== PACK)) {
      let l;
      try {
        l = loadAvermentLists(pack);
      } catch {
        continue;
      }
      const fs = withS138DateChecks(
        facts({ L1: '2026-01-10', L3: '2026-04-09', L4: '2026-03-05', L5: '2026-04-03' }),
        pack,
      );
      expect(fs.some((f) => f.source === 'computed')).toBe(false);
      const r = resolveAverments(l, fs);
      expect(r.allowed.map((a) => a.id)).not.toContain(PRES);
      expect(r.allowed.map((a) => a.id)).not.toContain(NOTICE);
    }
  });
});

function readFileListing(): string[] {
  return readdirSync(AVERMENTS_DIR).filter((f) => f.endsWith('.json'));
}

// ═════════════════════════════════════════════════════════════════════════════
// Date line: the notice header
// ═════════════════════════════════════════════════════════════════════════════
describe('T-192 date line: L5 when given, today when missing (format not pinned)', () => {
  beforeEach(() => clearConfigCache());

  function headerOf(formData: Record<string, unknown>): string {
    const config = loadTemplateConfig(PACK)!;
    const header = config.document_structure.sections.find((s) => s.section_id === 'header')!;
    const ctx = buildPlaceholderContext(config, {
      applicant_name: 'Ram Kumar',
      respondent_name: 'Shyam Lal',
      ...formData,
    });
    return replacePlaceholders((header as { template: string }).template, ctx);
  }
  const dateLine = (h: string) => h.split('\n').find((l) => l.startsWith('Date:'))!;
  /** Today's date in the digits and month names a line could show, in any common format. */
  function todayForms(): string[] {
    const now = new Date();
    const y = String(now.getFullYear());
    const m = now.getMonth();
    const d = now.getDate();
    const p = (n: number) => String(n).padStart(2, '0');
    return [
      `${p(d)} ${MONTHS[m]} ${y}`,
      `${d} ${MONTHS[m]} ${y}`,
      `${p(d)}.${p(m + 1)}.${y}`,
      `${y}-${p(m + 1)}-${p(d)}`,
    ];
  }
  const holdsToday = (line: string) => todayForms().some((t) => line.includes(t));

  it('the header template prints the notice date, not the plain current date', () => {
    const config = loadTemplateConfig(PACK)!;
    const header = config.document_structure.sections.find((s) => s.section_id === 'header') as {
      template: string;
    };
    expect(header.template).toContain('Date: {notice_date}');
  });

  it('with notice_sent_date given the line has that date (day, month and year), and not today', () => {
    const line = dateLine(headerOf({ notice_sent_date: '2026-04-03' }));
    expect(line).toMatch(/\b0?3\b/);
    expect(line).toMatch(/(April|\.04\.|-04-|\/04\/)/);
    expect(line).toContain('2026');
    expect(line).not.toContain('{');
    expect(line).not.toContain('_____');
    expect(line).not.toContain('MISSING');
    expect(line).not.toContain('To be confirmed');
    // 2026-10-12 is the date of writing; the point is that the given date wins
    const isSameAsToday = holdsToday(line);
    expect(isSameAsToday).toBe(false);
  });

  it.each([
    ['not given', {}],
    ['empty', { notice_sent_date: '' }],
    ['the visible blank', { notice_sent_date: '[To be confirmed: date the notice is sent]' }],
    ['the ledger blank', { notice_sent_date: '{{MISSING: Date the notice is sent}}' }],
  ])("with notice_sent_date %s the line has today's date", (_n, form) => {
    const line = dateLine(headerOf(form as Record<string, unknown>));
    expect(holdsToday(line)).toBe(true);
    expect(line).not.toContain('{');
    expect(line).not.toContain('_____');
    expect(line).not.toContain('MISSING');
    expect(line).not.toContain('To be confirmed');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Route: the Drafter's FACTS
// ═════════════════════════════════════════════════════════════════════════════
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994392a1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

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
const CLAUSE_IDS = loadRulePack(PACK)!.mandatoryClauses.map((c) => c.id);
const BODY =
  '1. That the sender is a payee of the cheque in question. The cheque was returned unpaid and demand is made of the drawer for the amount due.';
function drafterAnswer(): string {
  return `${BODY}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((id) => `${id}: 1`).join('\n')}`;
}
function callOf(n: number): { system: string; user: string } {
  const p = mockMessagesStream.mock.calls[n][0] as SdkStreamParams;
  return { system: p.system, user: p.messages[0].content };
}
interface PromptFacts {
  facts: Array<{ key: string; label: string; type: string; display: string }>;
  missing: Array<{ key: string; label: string; write: string }>;
}
function factsOf(prompt: string): PromptFacts {
  const from = prompt.indexOf('FACTS:\n');
  const to = prompt.indexOf('\n\nCLAUSES');
  expect(from).toBeGreaterThan(-1);
  return JSON.parse(prompt.slice(from + 'FACTS:\n'.length, to)) as PromptFacts;
}
function sectionOf(prompt: string, from: string, to: string): string {
  const a = prompt.indexOf(from);
  const b = prompt.indexOf(to);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return prompt.slice(a, b);
}

async function storeLedger(
  dates: Dates,
  opts: { unresolved?: string[]; extra?: LedgerFact[] } = {},
): Promise<string> {
  const unresolved = (opts.unresolved ?? []).map((key) => ({
    id: `u_${key}`,
    key,
    label: key,
    type: 'date',
    raw_span: 'x',
    source: 'user',
    reason: 'conflicting_values',
    detail: 'two dates given',
  }));
  const doc = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: PACK,
    runType: 'fixture',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        facts: [
          {
            id: 'f_applicant',
            key: 'applicant_name',
            label: 'Payee / Notice Sender',
            type: 'person_name',
            value: 'Ram Kumar',
            display: 'Ram Kumar',
            raw_span: 'Ram Kumar',
            source: 'user',
            confidence: 0.99,
            required_in_draft: true,
          },
          ...facts(dates),
          ...(opts.extra ?? []),
        ],
        unresolved,
        createdAt: new Date(),
        reason: 'extract',
      },
    ],
  });
  return String(doc._id);
}

function generate(ledgerId: string) {
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: PACK,
      values: [{ key: 'applicant_name', value: 'Ram Kumar' }],
      court,
      ledger_id: ledgerId,
    });
}

describe("T-192 AC3/AC4 route: the Drafter's FACTS carry the computed result only on a pass", () => {
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
    await User.create({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  async function run(ledgerId: string) {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(drafterAnswer(), 4000, 800));
    const res = await generate(ledgerId);
    expect(res.status).toBe(200);
    return callOf(0).user;
  }
  const PASS = { L1: '2026-01-10', L3: '2026-04-10', L4: '2026-03-05', L5: '2026-04-04' };

  it('both checks pass: FACTS carry both computed facts with the neutral displays, and the twins are offered', async () => {
    const user = await run(await storeLedger(PASS));
    const f = factsOf(user);
    const a = f.facts.filter((x) => x.key === 's138_presented_within_validity');
    const b = f.facts.filter((x) => x.key === 's138_notice_within_thirty_days');
    expect(a.map((x) => x.display)).toEqual([NEUTRAL_A]);
    expect(b.map((x) => x.display)).toEqual([NEUTRAL_B]);
    // a computed fact is not a missing fact
    expect(f.missing.map((m) => m.key)).not.toContain('s138_presented_within_validity');
    expect(f.missing.map((m) => m.key)).not.toContain('s138_notice_within_thirty_days');
    // the signed twins are allowed, with the dates the code filled
    const allowed = sectionOf(user, 'AVERMENTS ALLOWED', 'BANNED ASSERTIONS');
    expect(allowed).toContain(
      'The said cheque dated 10 January 2026 was presented for payment on 10 April 2026, within the period of its validity.',
    );
    expect(allowed).toContain(
      'This notice is issued within thirty days of the receipt, on 5 March 2026, of the information from the bank regarding the return of the said cheque unpaid.',
    );
    const banned = sectionOf(user, 'BANNED ASSERTIONS', '\n\nTARGET:');
    expect(banned).not.toMatch(/^- presented_within_validity \|/m);
    expect(banned).not.toMatch(/^- notice_within_thirty_days \|/m);
  });

  it('AC3: the Drafter prompt has no A1/B1 result text and no end-of-period date; the model is not asked to compute', async () => {
    const user = await run(await storeLedger(PASS));
    for (const frag of [
      'Presented in time: the cheque dated',
      'within its validity, which ended on',
      'ended on',
      'within 30 days (last day',
      'last day 4 April 2026',
      'Notice in time: the return memo',
      'Not presented in time',
      'Notice not in time',
      'Presentation in time not checked',
      'Notice in time not checked',
      '10 April 2026, within its validity',
    ]) {
      expect(user).not.toContain(frag);
    }
    // the end of the period (11 Apr / 4 Apr) is not in the prompt as a computed date
    expect(user).not.toContain('Send the notice on or before');
    expect(user).toContain(NEUTRAL_A);
    expect(user).toContain(NEUTRAL_B);
  });

  it('only presented passes: only its computed fact is in FACTS; the notice entry stays banned', async () => {
    const user = await run(await storeLedger({ ...PASS, L5: '2026-04-05' }));
    const keys = factsOf(user).facts.map((x) => x.key);
    expect(keys).toContain('s138_presented_within_validity');
    expect(keys).not.toContain('s138_notice_within_thirty_days');
    const banned = sectionOf(user, 'BANNED ASSERTIONS', '\n\nTARGET:');
    expect(banned).toMatch(/^- notice_within_thirty_days \|/m);
    expect(banned).not.toMatch(/^- presented_within_validity \|/m);
    expect(user).not.toContain(NEUTRAL_B);
  });

  it('both fail: no computed fact in FACTS, both entries banned, no twin offered', async () => {
    const user = await run(await storeLedger({ ...PASS, L3: '2026-04-11', L5: '2026-04-05' }));
    const keys = factsOf(user).facts.map((x) => x.key);
    expect(keys.some((k) => k.startsWith('s138_'))).toBe(false);
    expect(user).not.toContain('checked by Lawie');
    const banned = sectionOf(user, 'BANNED ASSERTIONS', '\n\nTARGET:');
    expect(banned).toMatch(/^- presented_within_validity \|/m);
    expect(banned).toMatch(/^- notice_within_thirty_days \|/m);
    const allowed = sectionOf(user, 'AVERMENTS ALLOWED', 'BANNED ASSERTIONS');
    expect(allowed).not.toContain('within the period of its validity');
    expect(allowed).not.toContain('issued within thirty days');
  });

  it('inputs missing: no computed fact, both entries banned', async () => {
    const user = await run(await storeLedger({ L1: '2026-01-10', L4: '2026-03-05' }));
    expect(factsOf(user).facts.some((x) => x.key.startsWith('s138_'))).toBe(false);
    const banned = sectionOf(user, 'BANNED ASSERTIONS', '\n\nTARGET:');
    expect(banned).toMatch(/^- presented_within_validity \|/m);
    expect(banned).toMatch(/^- notice_within_thirty_days \|/m);
  });

  it("the ledger's unresolved keys are passed through: an unresolved L2 withholds the pass", async () => {
    const dates = {
      L1: '2026-01-10',
      L2: '2026-04-30',
      L3: '2026-04-09',
      L4: '2026-03-05',
      L5: '2026-04-03',
    };
    // control: with no unresolved item the same dates pass
    const control = await run(await storeLedger(dates));
    expect(factsOf(control).facts.map((x) => x.key)).toContain('s138_presented_within_validity');

    mockMessagesStream.mockReset();
    const user = await run(await storeLedger(dates, { unresolved: ['cheque_validity_date'] }));
    const keys = factsOf(user).facts.map((x) => x.key);
    expect(keys).not.toContain('s138_presented_within_validity');
    // the other check does not depend on L2
    expect(keys).toContain('s138_notice_within_thirty_days');
    expect(sectionOf(user, 'BANNED ASSERTIONS', '\n\nTARGET:')).toMatch(
      /^- presented_within_validity \|/m,
    );
  });

  it('an unresolved L4 withholds the notice pass', async () => {
    const user = await run(await storeLedger(PASS, { unresolved: ['memo_received_date'] }));
    const keys = factsOf(user).facts.map((x) => x.key);
    expect(keys).not.toContain('s138_notice_within_thirty_days');
    expect(keys).toContain('s138_presented_within_validity');
  });

  it('a computed fact already stored in the ledger is not trusted: failing dates, stored "true", still banned', async () => {
    const stored = {
      id: 'f_forged',
      key: 's138_presented_within_validity',
      label: 'x',
      type: 'boolean',
      value: true,
      display: 'FORGEDSTORED',
      raw_span: '',
      source: 'computed',
      confidence: 1,
      required_in_draft: false,
    } as LedgerFact;
    const user = await run(
      await storeLedger({ L1: '2026-01-10', L3: '2026-04-11' }, { extra: [stored] }),
    );
    expect(user).not.toContain('FORGEDSTORED');
    expect(sectionOf(user, 'BANNED ASSERTIONS', '\n\nTARGET:')).toMatch(
      /^- presented_within_validity \|/m,
    );
  });

  it('nothing computed is persisted: the ledger still has one version, and no collection holds a computed row', async () => {
    const id = await storeLedger(PASS);
    await run(id);
    const stored = await FactLedgerModel.findById(id).lean();
    expect(stored!.currentVersion).toBe(1);
    expect(stored!.versions).toHaveLength(1);
    const state = openVersion(stored!.versions[0]);
    expect(state.facts.some((f) => f.source === 'computed')).toBe(false);
    expect(state.facts.some((f) => f.key.startsWith('s138_'))).toBe(false);
    expect(await FactLedgerModel.countDocuments({})).toBe(1);

    const db = mongoose.connection.db!;
    for (const c of await db.collections()) {
      const text = JSON.stringify(await c.find({}).toArray());
      expect(text).not.toMatch(/"source":\s*"computed"/);
      expect(text).not.toContain('s138_presented_within_validity');
      expect(text).not.toContain('s138_notice_within_thirty_days');
      expect(text).not.toContain('checked by Lawie');
    }
  });

  it("a second request recomputes: changing a date in the ledger changes the next request's FACTS", async () => {
    const id = await storeLedger(PASS);
    const first = await run(id);
    expect(factsOf(first).facts.map((x) => x.key)).toContain('s138_notice_within_thirty_days');
    mockMessagesStream.mockReset();
    // a new version moves the notice date out of time
    const doc = await FactLedgerModel.findById(id);
    const moved = openVersion(doc!.versions[0]).facts.map((f) =>
      f.key === K.L5 ? { ...f, value: '2026-04-05', display: '5 April 2026' } : f,
    );
    await FactLedgerModel.updateOne(
      { _id: id },
      {
        $set: { currentVersion: 2 },
        $push: {
          versions: {
            version: 2,
            facts: moved,
            unresolved: [],
            createdAt: new Date(),
            reason: 'edit',
          },
        },
      },
    );
    const second = await run(id);
    expect(factsOf(second).facts.map((x) => x.key)).not.toContain('s138_notice_within_thirty_days');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Rounds 3-4: leaf order and labels; the blank the verifier shows; return_memo_received_on
// ═════════════════════════════════════════════════════════════════════════════
describe('T-192 rounds 3-4: unlock leaves, their order and their labels', () => {
  const lists = loadAvermentLists(PACK);
  interface Leaf {
    key?: string;
    label?: string;
    present?: boolean;
    equals?: unknown;
    all_of?: Leaf[];
  }
  const leavesOf = (c: Leaf | null): Leaf[] =>
    c === null ? [] : c.all_of ? c.all_of.flatMap(leavesOf) : [c];
  const LABEL = S138_INPUT_LABELS;
  const COMPUTED_LABEL = {
    a: 'Presented in time (worked out from your dates)',
    b: 'Notice in time (worked out from your dates)',
  };
  const EXPECT = {
    presented_within_validity: [
      ['cheque_date', LABEL.L1],
      ['presentation_date', LABEL.L3],
      ['s138_presented_within_validity', COMPUTED_LABEL.a],
    ],
    notice_within_thirty_days: [
      ['memo_received_date', LABEL.L4],
      ['notice_sent_date', LABEL.L5],
      ['s138_notice_within_thirty_days', COMPUTED_LABEL.b],
    ],
  } as const;

  it.each(Object.keys(EXPECT) as Array<keyof typeof EXPECT>)(
    '%s: the banned unlock and the twin requires have the same leaves, inputs first, the computed leaf last, labels as signed',
    (id) => {
      const banned = lists.banned.find((b) => b.id === id)!;
      const twin = lists.allowed.find((a) => a.id === id)!;
      for (const cond of [banned.unlocked_by, twin.requires] as Leaf[]) {
        const leaves = leavesOf(cond);
        expect(leaves.map((l) => [l.key, l.label])).toEqual(EXPECT[id]);
        // inputs are presence leaves, the last leaf is the computed "equals true"
        expect(leaves.slice(0, -1).every((l) => l.present === true)).toBe(true);
        expect(leaves[leaves.length - 1].equals).toBe(true);
      }
    },
  );

  it('the input labels in the leaves are the md labels (S138_INPUT_LABELS, pinned to the md above)', () => {
    const inputLabels = Object.values(EXPECT)
      .flat()
      .filter(([k]) => !k.startsWith('s138_'))
      .map(([, l]) => l);
    for (const l of inputLabels) expect(Object.values(S138_INPUT_LABELS)).toContain(l);
    expect(MD).toContain('`Date the notice is sent`');
  });

  it('the notice unlock requires L5 (notice_sent_date) as well as L4', () => {
    const keys = leavesOf(
      lists.banned.find((b) => b.id === 'notice_within_thirty_days')!.unlocked_by as Leaf,
    ).map((l) => l.key);
    expect(keys).toContain('notice_sent_date');
    expect(keys).toContain('memo_received_date');
  });
});

describe('T-192 rounds 3-4: the blank the verifier shows is the first failing leaf', () => {
  const lists = loadAvermentLists(PACK);
  const rulePack = loadRulePack(PACK)!;
  const PRES_BODY = '1. That the cheque was presented within its validity.';
  const NOTICE_BODY = '1. That this notice is within time.';

  /** The label of the banned-strip violation for one entry, through the real verifier. */
  function blankFor(
    id: string,
    body: string,
    d: Dates,
    unresolved: string[] = [],
  ): string | undefined {
    const ledgerFacts = withS138DateChecks(facts(d), PACK, unresolved);
    const out = verifyDraft({
      body,
      facts: ledgerFacts,
      unresolved: [],
      lists,
      skeleton: [],
      packText: packTexts(rulePack),
    });
    return out.find((v) => v.check === 'banned' && v.bannedEntryId === id)?.label;
  }
  const OK_A = { L1: '2026-01-10', L3: '2026-04-09' };
  const OK_B = { L4: '2026-03-05', L5: '2026-04-03' };

  it.each([
    ['L5 missing', { L4: '2026-03-05' }, 'Date the notice is sent'],
    ['L4 missing (L5 given)', { L5: '2026-04-03' }, 'Date the return memo was received'],
    ['L4 and L5 missing', {}, 'Date the return memo was received'],
    [
      'all present, check fails (after the 30 days)',
      { L4: '2026-03-05', L5: '2026-04-05' },
      'Notice in time (worked out from your dates)',
    ],
    [
      'all present, L5 before L4',
      { L4: '2026-03-05', L5: '2026-03-04' },
      'Notice in time (worked out from your dates)',
    ],
  ])('notice, %s: the blank is "%s"', (_n, d, label) => {
    expect(blankFor('notice_within_thirty_days', NOTICE_BODY, d as Dates)).toBe(label);
  });

  it.each([
    ['L1 missing', { L3: '2026-04-09' }, 'Date on the cheque'],
    ['L3 missing', { L1: '2026-01-10' }, 'Date the cheque was presented to the bank'],
    ['L1 and L3 missing', {}, 'Date on the cheque'],
    [
      'all present, check fails (after validity)',
      { L1: '2026-01-10', L3: '2026-04-11' },
      'Presented in time (worked out from your dates)',
    ],
    [
      'all present, L3 before L1',
      { L1: '2026-01-10', L3: '2026-01-09' },
      'Presented in time (worked out from your dates)',
    ],
  ])('presented, %s: the blank is "%s"', (_n, d, label) => {
    expect(blankFor('presented_within_validity', PRES_BODY, d as Dates)).toBe(label);
  });

  it('an unresolved L2 withholds the pass: the blank is the computed leaf (the L2 blank is in the brief line, not here)', () => {
    expect(
      blankFor('presented_within_validity', PRES_BODY, { ...OK_A, L2: '2026-04-30' }, [
        'cheque_validity_date',
      ]),
    ).toBe('Presented in time (worked out from your dates)');
  });

  it('when the checks pass, the verifier strips nothing for either entry', () => {
    expect(blankFor('presented_within_validity', PRES_BODY, OK_A)).toBeUndefined();
    expect(blankFor('notice_within_thirty_days', NOTICE_BODY, OK_B)).toBeUndefined();
  });

  it('the same labels come from the banned entry in resolveAverments when the verifier is not used', () => {
    const r = resolveAverments(lists, withS138DateChecks(facts({ L4: '2026-03-05' }), PACK));
    expect(r.banned.map((b) => b.id)).toContain('notice_within_thirty_days');
  });
});

describe('T-192 rounds 3-4: return_memo_received_on (T-147c) follows memo_received_date', () => {
  const lists = loadAvermentLists(PACK);
  const ID = 'return_memo_received_on';

  it('unlocks when L4 is given, with the text filled from the ledger', () => {
    const r = resolveAverments(lists, withS138DateChecks(facts({ L4: '2026-03-05' }), PACK));
    expect(r.banned.map((b) => b.id)).not.toContain(ID);
    expect(r.allowed.find((a) => a.id === ID)!.text).toBe(
      'the payee received the return memo on 5 March 2026',
    );
  });

  it('stays banned, and is not offered, when L4 is missing', () => {
    const r = resolveAverments(lists, withS138DateChecks(facts({ L1: '2026-01-10' }), PACK));
    expect(r.banned.map((b) => b.id)).toContain(ID);
    expect(r.allowed.map((a) => a.id)).not.toContain(ID);
  });

  it('the verifier strips the claim without L4 (blank: the L4 label) and leaves it with L4', () => {
    const body = '1. That the payee received the return memo on 5 March 2026.';
    const run = (d: Dates) =>
      verifyDraft({
        body,
        facts: withS138DateChecks(facts(d), PACK),
        unresolved: [],
        lists,
        skeleton: [],
        packText: packTexts(loadRulePack(PACK)!),
      }).filter((v) => v.bannedEntryId === ID);
    const without = run({ L1: '2026-01-10' });
    expect(without).toHaveLength(1);
    expect(without[0].label).toBe('Date the return memo was received');
    expect(run({ L4: '2026-03-05' })).toEqual([]);
  });
});
