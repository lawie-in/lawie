/**
 * T-611 — the fact verifier never blanks a value the ledger holds (Ajay's signed
 * policy P1-P4, handoff/legal/T-611-fact-checker-policy-signed.md).
 *
 * P1 a held value under another label: repair request naming both labels, then
 *    a conflict (never a blank).
 * P2 a date inside a user-given text fact counts as held (value only).
 * P3 amounts in words (Indian system) are read as the figure.
 * P4-F1 cheque_validity_date under its own label passes; under another, P1.
 * Regression inputs are Anushka's fictional matters (quality report 26 Oct 2026).
 *
 * Pure: no database, no model. The repair call is a spy.
 */
import type { LedgerFact } from '@lawie/shared';

import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import {
  amountFromWords,
  verifyAndRepair,
  verifyDraft,
  VerifierInput,
  VERIFIER_VERSION,
} from '../services/fact-verifier';
import { loadRulePack } from '../services/rule-pack.service';

function fact(
  key: string,
  label: string,
  type: string,
  value: unknown,
  display: string,
): LedgerFact {
  return {
    id: `f_${key}`,
    key,
    label,
    type,
    value,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: false,
  } as unknown as LedgerFact;
}

const L = {
  cheque_date: 'Cheque Date',
  presentation_date: 'Date of Presentation to Bank',
  memo_received_date: 'Date the return memo was received',
  validity: 'Last date of validity printed on the cheque, if any',
  cheque_amount: 'Cheque Amount (Rs.)',
};

function inputOf(packId: string, body: string, facts: LedgerFact[]): VerifierInput {
  return {
    body,
    facts,
    unresolved: [],
    lists: loadAvermentLists(packId),
    skeleton: [],
    packText: packTexts(loadRulePack(packId)!),
    packId,
  } as VerifierInput;
}

// Shree Ganesh Traders v Rakesh Mishra: cheque 004512 dated 1 Oct 2026, Rs 3,50,000,
// presented 15 Oct, memo received 20 Oct.
const S138_FACTS = [
  fact(
    'applicant_name',
    'Payee / Notice Sender',
    'person_name',
    'shreeganeshtraders',
    'Shree Ganesh Traders',
  ),
  fact('respondent_name', 'Drawer / Noticee', 'person_name', 'rakeshmishra', 'Rakesh Mishra'),
  fact('cheque_date', L.cheque_date, 'date', '2026-10-01', '1 October 2026'),
  fact('cheque_amount', L.cheque_amount, 'amount', 350000, 'Rs 3,50,000'),
  fact('presentation_date', L.presentation_date, 'date', '2026-10-15', '15 October 2026'),
  fact('memo_received_date', L.memo_received_date, 'date', '2026-10-20', '20 October 2026'),
];
const s138 = (body: string, extra: LedgerFact[] = []) =>
  inputOf('legal_notice_s138', body, [...S138_FACTS, ...extra]);

const repairSpy = (reply: string | null) =>
  jest.fn(async (_system: string, _user: string): Promise<string | null> => reply);

describe('T-611 verifier version', () => {
  it('is bumped for the changed policy', () => {
    expect(VERIFIER_VERSION).toBe('t611-1');
  });
});

describe('P1: a held value under the wrong label is never blanked', () => {
  const WRONG = '1. That my client issued a cheque dated 15 October 2026 in favour of the noticee.';

  it('the finding is a conflict naming both labels, with the held key as B', () => {
    const vs = verifyDraft(s138(WRONG)).filter((v) => v.entityType === 'date');
    expect(vs).toHaveLength(1);
    expect(vs[0].conflict).toMatchObject({
      kind: 'wrong_label',
      keyA: 'cheque_date',
      labelA: L.cheque_date,
      keyB: 'presentation_date',
      labelB: L.presentation_date,
    });
    expect(vs[0].what).toContain(L.cheque_date);
    expect(vs[0].what).toContain(L.presentation_date);
  });

  it('asks the one repair with both labels in the request, and a repair that fixes it leaves no conflict', async () => {
    const fixed =
      '1. That my client issued a cheque dated 1 October 2026 in favour of the noticee.';
    const repair = repairSpy(`[[P0]]\n${fixed}`);
    const out = await verifyAndRepair(s138(WRONG), repair);
    expect(repair).toHaveBeenCalledTimes(1);
    const prompt = repair.mock.calls[0].join('\n');
    expect(prompt).toContain(L.cheque_date);
    expect(prompt).toContain(L.presentation_date);
    expect(out.body).not.toMatch(/MISSING/);
    expect(out.conflicts ?? []).toEqual([]);
  });

  it('still conflicting after the one repair: reported as a conflict, body keeps the value, nothing blanked', async () => {
    const repair = repairSpy(null);
    const out = await verifyAndRepair(s138(WRONG), repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(out.body).toBe(WRONG);
    expect(out.body).not.toMatch(/MISSING/);
    expect(out.placeholdersAdded).toBe(0);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts![0]).toMatchObject({
      kind: 'wrong_label',
      keyA: 'cheque_date',
      keyB: 'presentation_date',
      labelB: L.presentation_date,
      value: expect.stringContaining('15 October 2026'),
    });
  });

  it('a repair that returns the same wrong text is still a conflict, not a blank', async () => {
    const repair = repairSpy(`[[P0]]\n${WRONG}`);
    const out = await verifyAndRepair(s138(WRONG), repair);
    expect(out.body).not.toMatch(/MISSING/);
    expect(out.conflicts).toHaveLength(1);
  });
});

describe('T-488 regression (s.138, Shree Ganesh Traders v Rakesh Mishra)', () => {
  it('"presented ... on 15 October 2026" is not blanked as Cheque Date', async () => {
    const body = [
      '1. That my client, Shree Ganesh Traders, presented the said cheque for encashment to the bank on 15 October 2026.',
      '2. That the return memo was received by my client on 20 October 2026.',
      '3. That the cheque dated 1 October 2026 for Rs 3,50,000 was issued by Rakesh Mishra.',
    ].join('\n\n');
    expect(verifyDraft(s138(body))).toEqual([]);
    const repair = repairSpy(null);
    const out = await verifyAndRepair(s138(body), repair);
    expect(out.body).toBe(body);
    expect(out.body).not.toMatch(/MISSING/);
    expect(repair).not.toHaveBeenCalled();
    expect(out.conflicts ?? []).toEqual([]);
  });

  it('cheque dated para and presented para do not contradict: cheque date stays 1 October', async () => {
    const body =
      '1. That the cheque dated 1 October 2026 was deposited by my client on 15 October 2026.';
    const out = await verifyAndRepair(s138(body), repairSpy(null));
    expect(out.body).toBe(body);
  });
});

describe('P2: a date inside a user-given text fact is held (value only)', () => {
  // Sunita Devi v Manoj Kumar Singh: the sale deed date is only in the subject-matter text.
  const O39 = [
    fact('plaintiff_name', 'Plaintiff/Applicant name', 'person_name', 'sunitadevi', 'Sunita Devi'),
    fact(
      'defendant_name',
      'Defendant/Non-Applicant name',
      'person_name',
      'manojkumarsingh',
      'Manoj Kumar Singh',
    ),
    fact(
      'subject_matter',
      'Subject-matter of suit (property/right/obligation)',
      'text',
      'House at Kankarbagh purchased by the plaintiff under a registered sale deed dated 12 March 2019',
      'House at Kankarbagh purchased by the plaintiff under a registered sale deed dated 12 March 2019',
    ),
  ];
  const o39 = (body: string, extra: LedgerFact[] = []) =>
    inputOf('temporary_injunction_o39', body, [...O39, ...extra]);
  const dateFindings = (i: VerifierInput) =>
    verifyDraft(i).filter((v) => v.entityType === 'date' && v.check !== 'dropped');

  it('the sale deed date, unlabelled, passes: not unsupported, not blanked', async () => {
    const body =
      '1. That the plaintiff holds title to the suit property by a sale deed of 12 March 2019.';
    expect(dateFindings(o39(body))).toEqual([]);
    const out = await verifyAndRepair(o39(body), repairSpy(null));
    expect(out.body).not.toMatch(/MISSING/);
  });

  it("the date under the text fact's own role (sale deed dated) passes", () => {
    const body =
      '1. That the plaintiff purchased the suit house under a registered sale deed dated 12 March 2019.';
    expect(dateFindings(o39(body))).toEqual([]);
  });

  it('the same date under another role label goes to P1 with the text fact as label B', async () => {
    const notice = fact(
      'notice_date',
      'Date of legal notice',
      'date',
      '2026-09-02',
      '2 September 2026',
    );
    const body =
      '1. That the plaintiff issued a legal notice dated 12 March 2019 to the defendant.';
    const vs = dateFindings(o39(body, [notice]));
    expect(vs).toHaveLength(1);
    expect(vs[0].conflict).toMatchObject({
      kind: 'wrong_label',
      keyA: 'notice_date',
      keyB: 'subject_matter',
      labelB: 'Subject-matter of suit (property/right/obligation)',
    });
    const out = await verifyAndRepair(o39(body, [notice]), repairSpy(null));
    expect(out.body).not.toMatch(/MISSING/);
    expect(out.conflicts).toHaveLength(1);
  });

  it('a date that is in no fact stays a blank', async () => {
    const body = '1. That the plaintiff was dispossessed on 14 June 2021.';
    const vs = dateFindings(o39(body));
    expect(vs).toHaveLength(1);
    expect(vs[0].check).toBe('unsupported');
    expect(vs[0].conflict).toBeUndefined();
    const out = await verifyAndRepair(o39(body), repairSpy(null));
    expect(out.body).toMatch(/\{\{MISSING:/);
    expect(out.conflicts ?? []).toEqual([]);
  });
});

describe('P3: amounts in words are read as the figure', () => {
  it('amountFromWords reads the Indian system and both paise forms', () => {
    expect(amountFromWords('Rupees Three Lakh Fifty Thousand only')).toBe(350000);
    expect(amountFromWords('Rupees One Crore Twenty Five Lakh only')).toBe(12500000);
    expect(amountFromWords('Rupees Fifteen Thousand and Fifty Paise only')).toBe(15000.5);
    expect(amountFromWords('Rupees Fifteen Thousand and Paise Fifty only')).toBe(15000.5);
    expect(amountFromWords('fifty thousand rupees')).toBe(50000);
    expect(amountFromWords('Rupees Two Lakh Forty Thousand only')).toBe(240000);
  });

  it('amountFromWords rejects what is not one amount', () => {
    expect(amountFromWords('Rahul Sharma')).toBeNull();
    expect(amountFromWords('Twenty Eleven')).toBeNull();
  });

  it('"Rupees Three Lakh Fifty Thousand only" against held 3,50,000 passes and is not read as names', () => {
    const body =
      '1. That the noticee issued a cheque for Rs 3,50,000 (Rupees Three Lakh Fifty Thousand only) in favour of my client.';
    expect(verifyDraft(s138(body))).toEqual([]);
    const only = '1. That the cheque amount is Rupees Three Lakh Fifty Thousand only.';
    expect(verifyDraft(s138(only))).toEqual([]);
  });

  it('crore and paise amounts pass against the held figure', () => {
    const crore = [fact('cheque_amount', L.cheque_amount, 'amount', 12500000, 'Rs 1,25,00,000')];
    const iCrore = inputOf(
      'legal_notice_s138',
      '1. That the cheque amount is Rupees One Crore Twenty Five Lakh only.',
      crore,
    );
    expect(verifyDraft(iCrore)).toEqual([]);
  });

  const PAISE = [fact('cheque_amount', L.cheque_amount, 'amount', 15000.5, 'Rs 15,000.50')];
  it.each([
    'Rupees Fifteen Thousand and Fifty Paise only',
    'Rupees Fifteen Thousand and Paise Fifty only',
  ])('paise form "%s" passes against the held 15,000.50', (w) => {
    const i = inputOf('legal_notice_s138', `1. That the cheque amount is ${w}.`, PAISE);
    expect(verifyDraft(i)).toEqual([]);
  });

  it('a words amount that differs from the held figure is a mismatch conflict, never blanked', async () => {
    const body = '1. That the cheque amount is Rupees Three Lakh only.';
    const vs = verifyDraft(s138(body)).filter((v) => v.entityType === 'amount');
    expect(vs).toHaveLength(1);
    expect(vs[0].conflict).toMatchObject({ kind: 'mismatch', keyA: 'cheque_amount' });
    const out = await verifyAndRepair(s138(body), repairSpy(null));
    expect(out.body).not.toMatch(/MISSING/);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts![0].kind).toBe('mismatch');
  });
});

describe('P4-F1: cheque_validity_date', () => {
  const validity = fact(
    'cheque_validity_date',
    L.validity,
    'date',
    '2027-01-31',
    '31 January 2027',
  );

  it('held as cheque_validity_date under its own label passes', () => {
    const body =
      '1. That the last date of validity printed on the cheque, 31 January 2027, had not expired when it was presented.';
    expect(verifyDraft(s138(body, [validity])).filter((v) => v.check !== 'dropped')).toEqual([]);
  });

  it('the same date under "presented on" is a P1 conflict with keyB cheque_validity_date', async () => {
    const body = '1. That my client presented the said cheque to the bank on 31 January 2027.';
    const vs = verifyDraft(s138(body, [validity])).filter((v) => v.entityType === 'date');
    expect(vs).toHaveLength(1);
    expect(vs[0].conflict).toMatchObject({
      kind: 'wrong_label',
      keyA: 'presentation_date',
      keyB: 'cheque_validity_date',
      labelB: L.validity,
    });
    const out = await verifyAndRepair(s138(body, [validity]), repairSpy(null));
    expect(out.body).not.toMatch(/MISSING/);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts![0].keyB).toBe('cheque_validity_date');
  });
});
