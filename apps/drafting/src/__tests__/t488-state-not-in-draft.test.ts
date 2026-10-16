/**
 * T-488 part A (Ajay, 971d2685): the State is not required in a s.138 notice.
 * It is still asked on the brief (the jurisdiction picker) and still required
 * there, but the ledger does not require the draft to print it, so the
 * verifier's "dropped fact" check stays quiet about it. Other packs keep their
 * own `state` (or other) facts required in the draft.
 *
 * AC-a  s138 checklist: state is required and notInDraft; the brief still asks it
 * AC-b  s138 ledger fact for state is required_in_draft:false (applyEdit, carryOver); others stay true
 * AC-c  another pack with a required `state` fact is unchanged
 * AC-d  verifyDraft raises no dropped finding for state; a control shows the check would fire
 * AC-e  dateKindOfFact
 *
 * No model call and no database.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { applyEdit, carryOver } from '../services/fact-ledger.service';
import { verifyDraft, type VerifierInput } from '../services/fact-verifier';
import {
  buildBrief,
  buildChecklist,
  dateKindOfFact,
  type ChecklistItem,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

const S138 = 'legal_notice_s138';
const REF_YEAR = 2026;

function checklistOf(packId: string): ChecklistItem[] {
  const p = loadRulePack(packId);
  if (!p) throw new Error(`no pack ${packId}`);
  return buildChecklist(p);
}

function packOf(packId: string): NonNullable<ReturnType<typeof loadRulePack>> {
  const p = loadRulePack(packId);
  if (!p) throw new Error(`no pack ${packId}`);
  return p;
}

function itemOf(packId: string, key: string): ChecklistItem {
  const item = checklistOf(packId).find((i) => i.key === key);
  if (!item) throw new Error(`no item ${key} in ${packId}`);
  return item;
}

/** One answer typed on the brief, through the public edit path (which builds the fact with makeFact). */
function factFromEdit(packId: string, key: string, text: string): LedgerFact {
  const { next } = applyEdit(
    { facts: [], unresolved: [] },
    itemOf(packId, key),
    { key, text },
    REF_YEAR,
  );
  const fact = next?.facts.find((f) => f.key === key);
  if (!fact) throw new Error(`no fact for ${key}`);
  return fact;
}

describe('T-488 AC-a: s138 checklist keeps state asked and required, but not in the draft', () => {
  it('state is required:true and notInDraft:true', () => {
    const state = itemOf(S138, 'state');
    expect(state.required).toBe(true);
    expect(state.notInDraft).toBe(true);
  });

  it('no other s138 item is marked notInDraft', () => {
    const marked = checklistOf(S138)
      .filter((i) => i.notInDraft)
      .map((i) => i.key);
    expect(marked).toEqual(['state']);
  });

  it('the brief still lists state as a required item', () => {
    const brief = buildBrief({
      kind: { id: S138, name: 'Legal notice s.138', court_document: false },
      checklist: checklistOf(S138),
      values: [],
    });
    const item = brief.items.find((i) => i.key === 'state');
    expect(item).toBeDefined();
    expect(item?.required).toBe(true);
  });
});

describe('T-488 AC-b: the s138 ledger fact for state is not required in the draft', () => {
  it('via makeFact (an edit): state false, other required facts true', () => {
    expect(factFromEdit(S138, 'state', 'Delhi').required_in_draft).toBe(false);
    expect(factFromEdit(S138, 'respondent_name', 'Demo Traders').required_in_draft).toBe(true);
    expect(factFromEdit(S138, 'cheque_date', '1 September 2026').required_in_draft).toBe(true);
  });

  it('via carryOver: state false even when the earlier ledger held it as required; others true', () => {
    const checklist = checklistOf(S138);
    const state: LedgerFact = { ...factFromEdit(S138, 'state', 'Delhi'), required_in_draft: true };
    const name: LedgerFact = {
      ...factFromEdit(S138, 'respondent_name', 'Demo Traders'),
      required_in_draft: false,
    };
    const out = carryOver(
      { facts: [], unresolved: [] },
      { facts: [state, name], unresolved: [] },
      checklist,
    );
    expect(out.facts.find((f) => f.key === 'state')?.required_in_draft).toBe(false);
    expect(out.facts.find((f) => f.key === 'respondent_name')?.required_in_draft).toBe(true);
  });
});

describe('T-488 AC-c: other packs with a required state fact are unchanged', () => {
  it.each(['legal_notice_s80', 'rent_agreement', 'lease_deed'])(
    '%s: state stays required, has no notInDraft, and its fact is required_in_draft',
    (packId) => {
      const state = itemOf(packId, 'state');
      expect(state.required).toBe(true);
      expect(state.notInDraft).toBeUndefined();
      const text = state.kind === 'choice' ? state.options[0] : 'Delhi';
      expect(factFromEdit(packId, 'state', text).required_in_draft).toBe(true);
    },
  );

  it('carryOver keeps state required on another pack', () => {
    const checklist = checklistOf('legal_notice_s80');
    const earlier = {
      facts: [{ ...factFromEdit('legal_notice_s80', 'state', 'Delhi'), required_in_draft: false }],
      unresolved: [],
    };
    const out = carryOver({ facts: [], unresolved: [] }, earlier, checklist);
    expect(out.facts.find((f) => f.key === 'state')?.required_in_draft).toBe(true);
  });
});

describe('T-488 AC-d: the verifier raises no dropped finding for state on s138', () => {
  interface Fixture {
    pack: string;
    ledger: { facts: LedgerFact[]; unresolved: VerifierInput['unresolved'] };
    skeleton: string[];
  }
  const fx = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 't147d', 's138-notice.json'), 'utf8'),
  ) as Fixture;

  // Mentions the cheque, bank, amount and both dates; never says Delhi.
  const BODY = [
    '1. That you, Demo Traders, issued a cheque dated 01.09.2026 for Rs 3,00,000 drawn on HDFC Bank, Karol Bagh in favour of my client.',
    '2. That my client presented the said cheque for encashment on 15.09.2026.',
    '3. That the said cheque was returned unpaid.',
  ].join('\n\n');

  const inputWith = (facts: LedgerFact[]): VerifierInput => ({
    body: BODY,
    facts,
    unresolved: fx.ledger.unresolved,
    lists: loadAvermentLists(fx.pack),
    skeleton: fx.skeleton,
    packText: packTexts(packOf(fx.pack)),
    packId: fx.pack,
  });

  const droppedState = (facts: LedgerFact[]) =>
    verifyDraft(inputWith(facts)).filter((v) => v.check === 'dropped' && v.ledgerKey === 'state');

  it('state "Delhi" from the ledger, absent from the draft, is not reported as dropped', () => {
    const state = factFromEdit(S138, 'state', 'Delhi');
    expect(state.required_in_draft).toBe(false);
    expect(BODY).not.toMatch(/delhi/i);
    expect(fx.skeleton.join('\n')).not.toMatch(/delhi/i);
    expect(droppedState([...fx.ledger.facts, state])).toEqual([]);
  });

  it('control: the same fact marked required_in_draft would be reported as dropped', () => {
    const state = { ...factFromEdit(S138, 'state', 'Delhi'), required_in_draft: true };
    const dropped = droppedState([...fx.ledger.facts, state]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe('left_out');
  });

  it('a required s138 fact the draft leaves out is still reported as dropped', () => {
    const facts = [
      ...fx.ledger.facts,
      factFromEdit(S138, 'state', 'Delhi'),
      factFromEdit(S138, 'respondent_name', 'Zed Enterprises'),
    ];
    const dropped = verifyDraft(inputWith(facts)).filter((v) => v.check === 'dropped');
    expect(dropped.map((v) => v.ledgerKey)).toContain('respondent_name');
    expect(dropped.map((v) => v.ledgerKey)).not.toContain('state');
  });
});

describe('T-488 AC-e: dateKindOfFact', () => {
  it('cheque_date is the cheque kind', () => {
    expect(dateKindOfFact('cheque_date')).toBe('cheque');
  });

  it('presentation_date is the presentation kind', () => {
    expect(dateKindOfFact('presentation_date')).toBe('cheque_presented');
  });

  it('a fact with no date kind gives null', () => {
    expect(dateKindOfFact('state')).toBeNull();
    expect(dateKindOfFact('no_such_fact')).toBeNull();
    expect(dateKindOfFact('')).toBeNull();
  });
});
