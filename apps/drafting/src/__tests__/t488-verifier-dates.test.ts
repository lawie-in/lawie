/**
 * T-488 — the verifier judges a date only against the field its own label names
 * (Ajay 971d2685 + b37ed330). Unlabelled date equal to a ledger date passes; an
 * unlabelled date matching no ledger date is blanked; an explicit label with the
 * wrong value fails; a two-cue sentence passes if any cued key holds the date.
 *
 * Ledger: the t147d s.138 fixture with dishonour 18 Sep (held), memo received
 * 20 Sep, cheque 1 Sep, presentation 15 Sep.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { FactViolation, verifyDraft, VerifierInput } from '../services/fact-verifier';
import { loadRulePack } from '../services/rule-pack.service';

interface LedgerFactLike {
  id: string;
  key: string;
  label: string;
  type: string;
  value: string;
  display: string;
  raw_span: string;
  source: string;
  confidence: number;
  required_in_draft: boolean;
}
interface Fx {
  pack: string;
  ledger: { facts: LedgerFactLike[]; unresolved: { key: string }[] };
  skeleton: string[];
}
const load = (name: string): Fx =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 't147d', `${name}.json`), 'utf8')) as Fx;

const S138 = load('s138-notice');
const RB = load('regular-bail');

const dateFact = (id: string, key: string, label: string, value: string, display: string) => ({
  id,
  key,
  label,
  type: 'date',
  value,
  display,
  raw_span: display,
  source: 'user',
  confidence: 0.99,
  required_in_draft: false,
});

function inputOf(fx: Fx, body: string, extraFacts: LedgerFactLike[] = [], dropUnresolved = false) {
  return {
    body,
    facts: [...fx.ledger.facts, ...extraFacts] as never[],
    unresolved: (dropUnresolved
      ? fx.ledger.unresolved.filter((u) => u.key !== 'dishonour_date')
      : fx.ledger.unresolved) as never[],
    lists: loadAvermentLists(fx.pack),
    skeleton: fx.skeleton,
    packText: packTexts(
      loadRulePack(fx.pack) ??
        (() => {
          throw new Error(`no pack ${fx.pack}`);
        })(),
    ),
    packId: fx.pack,
  } as VerifierInput;
}

const EXTRA = [
  dateFact(
    'f8',
    'dishonour_date',
    'Date of Dishonour / Return Memo',
    '2026-09-18',
    '18 September 2026',
  ),
  dateFact(
    'f9',
    'memo_received_date',
    'Date Return Memo Received',
    '2026-09-20',
    '20 September 2026',
  ),
] as LedgerFactLike[];

const dateViolations = (body: string): FactViolation[] =>
  verifyDraft(inputOf(S138, body, EXTRA, true)).filter(
    (v) => v.entityType === 'date' && v.check !== 'dropped',
  );

const passes = (body: string) => expect(dateViolations(body)).toEqual([]);
const failsWith = (body: string, check: string, reason: string, ledgerKey: string | null) => {
  const vs = dateViolations(body);
  expect(vs).toHaveLength(1);
  expect({ check: vs[0].check, reason: vs[0].reason, ledgerKey: vs[0].ledgerKey }).toEqual({
    check,
    reason,
    ledgerKey,
  });
};

describe('T-488 date verifier: a date is judged against its own label', () => {
  describe('presentation (the run-69 bug)', () => {
    it('"deposited the said cheque ... on 15 September 2026" passes', () => {
      passes('1. That my client deposited the said cheque for encashment on 15 September 2026.');
    });
    it('"The cheque dated 1 Sep ... was deposited ... on 15 Sep" passes', () => {
      passes(
        '1. The cheque dated 1 September 2026 was deposited by my client on 15 September 2026.',
      );
    });
    it('same sentence with 18 Sep is wrong_fact presentation_date', () => {
      failsWith(
        '1. The cheque dated 1 September 2026 was deposited by my client on 18 September 2026.',
        'mutation',
        'wrong_fact',
        'presentation_date',
      );
    });
    it('"presented the said cheque on 1 Sep" is wrong_fact presentation_date', () => {
      failsWith(
        '1. That my client presented the said cheque on 1 September 2026.',
        'mutation',
        'wrong_fact',
        'presentation_date',
      );
    });
  });

  describe('memo received', () => {
    it('"return memo was received ... on 20 Sep" passes', () => {
      passes('1. That the return memo was received by my client on 20 September 2026.');
    });
    it('with 18 Sep is wrong_fact memo_received_date', () => {
      failsWith(
        '1. That the return memo was received by my client on 18 September 2026.',
        'mutation',
        'wrong_fact',
        'memo_received_date',
      );
    });
    it('"received it on 18 Sep" (received alone, no cue) passes', () => {
      passes('1. That my client received it on 18 September 2026.');
    });
  });

  describe('dishonour', () => {
    it('"returned unpaid vide memo dated 18 Sep" passes', () => {
      passes('1. That the said cheque was returned unpaid vide memo dated 18 September 2026.');
    });
    it('with 15 Sep is wrong_fact dishonour_date', () => {
      failsWith(
        '1. That the said cheque was returned unpaid vide memo dated 15 September 2026.',
        'mutation',
        'wrong_fact',
        'dishonour_date',
      );
    });
    it('"presented and returned unpaid on 1 Sep" (1 Sep is the cheque date) is wrong_fact on the nearest, dishonour_date', () => {
      failsWith(
        '1. That the said cheque was presented and returned unpaid on 1 September 2026.',
        'mutation',
        'wrong_fact',
        'dishonour_date',
      );
    });
    it('"presented and dishonoured on 15 Sep" passes (presentation holds 15 Sep)', () => {
      passes('1. That the said cheque was presented and dishonoured on 15 September 2026.');
    });
    it('"presented and returned on 18 Sep" passes (dishonour holds 18 Sep)', () => {
      passes('1. That the said cheque was presented and returned on 18 September 2026.');
    });
  });

  describe('cheque date and unlabelled dates', () => {
    it('"cheque dated 15 Sep" is wrong_fact cheque_date', () => {
      failsWith(
        '1. That you issued a cheque dated 15 September 2026 in favour of my client.',
        'mutation',
        'wrong_fact',
        'cheque_date',
      );
    });
    it('an unlabelled 18 Sep (a ledger date) passes', () => {
      passes('1. That the matter stood thus on 18 September 2026.');
    });
    it('an unlabelled 19 Sep (no ledger date) is unsupported / not_in_facts', () => {
      failsWith(
        '1. That the matter stood thus on 19 September 2026.',
        'unsupported',
        'not_in_facts',
        null,
      );
    });
  });

  describe('a non-s.138 pack', () => {
    it('a single-label wrong date still fails (unchanged)', () => {
      const body =
        '1. That the applicant has been in judicial custody since 14 September 2026 in connection with the FIR.';
      const vs = verifyDraft(inputOf(RB, body)).filter(
        (v) => v.entityType === 'date' && v.check !== 'dropped',
      );
      expect(vs).toHaveLength(1);
      expect(vs[0].check).toBe('mutation');
      expect(vs[0].reason).toBe('differs');
      expect(vs[0].ledgerKey).toBe('custody_since');
    });
  });
});
