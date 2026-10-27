/**
 * T-611 P6 (signed) and P1 — the delivery gate's pieces, without a database:
 * the deterministic fill, the held-blank count, the one model repair, and the
 * withheld-draft event with the signed strings. The value a P1 question shows
 * goes to the advocate only: no log call may carry it.
 */
import type { Response } from 'express';
import type { LedgerFact } from '@lawie/shared';

import {
  factConflictLine,
  factNeededLine,
  GenerationFailedError,
  withholdDraft,
} from '../services/ai.service';
import { UsageMeter } from '../services/llm-usage';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import {
  fillHeldBlanks,
  heldBlanksIn,
  repairHeldBlanks,
  VerifierInput,
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
    id: `f_${key}_${display}`,
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

const WORDS = 'Rupees Three Lakh Fifty Thousand only';
const FACTS = [
  fact('cheque_amount', 'Cheque Amount (Rs.)', 'amount', 350000, 'Rs 3,50,000'),
  fact('amount_in_words', 'Amount in Words', 'text', WORDS, WORDS),
  fact('cheque_date', 'Cheque Date', 'date', '2026-10-01', '1 October 2026'),
];

describe('fillHeldBlanks (P6 deterministic fill)', () => {
  it('fills a blank whose label names a held fact, by label or by key in words', () => {
    const r = fillHeldBlanks(
      'for {{MISSING: Amount in Words}} and {{MISSING: amount in words}}.',
      FACTS,
    );
    expect(r.text).toBe(`for ${WORDS} and ${WORDS}.`);
    expect(r.filled).toHaveLength(2);
    expect(r.left).toEqual([]);
  });

  it('fills the cheque date blank from the held date', () => {
    const r = fillHeldBlanks('dated {{MISSING: Cheque Date}}.', FACTS);
    expect(r.text).toBe('dated 1 October 2026.');
  });

  it('leaves a blank for a fact the ledger does not hold, and a generic label never matches', () => {
    const body = 'on {{MISSING: date}} and {{MISSING: Drawer Address}}.';
    const r = fillHeldBlanks(body, FACTS);
    expect(r.text).toBe(body);
    expect(r.filled).toEqual([]);
    expect(r.left).toEqual([]);
  });

  it('a held fact with two entries is left for the repair, not guessed', () => {
    const two = [
      ...FACTS,
      fact('cheque_date', 'Cheque Date', 'date', '2026-10-02', '2 October 2026'),
    ];
    const r = fillHeldBlanks('dated {{MISSING: Cheque Date}}.', two);
    expect(r.text).toBe('dated {{MISSING: Cheque Date}}.');
    expect(r.left).toEqual([{ key: 'cheque_date', label: 'Cheque Date' }]);
  });
});

describe('heldBlanksIn', () => {
  it('counts held blanks only, and spends one allowance per blank the check itself put in', () => {
    const t = 'a {{MISSING: Cheque Date}} b {{MISSING: Cheque Date}} c {{MISSING: Drawer Address}}';
    expect(heldBlanksIn(t, FACTS)).toHaveLength(2);
    expect(heldBlanksIn(t, FACTS, ['Cheque Date'])).toHaveLength(1);
    expect(heldBlanksIn(t, FACTS, ['Cheque Date', 'Cheque Date'])).toHaveLength(0);
    expect(heldBlanksIn('x {{MISSING: Drawer Address}}', FACTS)).toEqual([]);
  });
});

describe('repairHeldBlanks (P6 one model repair)', () => {
  const body = [
    '1. That the noticee issued a cheque for Rs 3,50,000.',
    '2. That the sum is {{MISSING: Cheque Date}} in words.',
  ].join('\n\n');
  const input = (b: string): VerifierInput =>
    ({
      body: b,
      facts: FACTS,
      unresolved: [],
      lists: loadAvermentLists('legal_notice_s138'),
      skeleton: [],
      packText: packTexts(loadRulePack('legal_notice_s138')!),
      packId: 'legal_notice_s138',
    }) as VerifierInput;

  it('keeps a repair that fills the blank with the held value', async () => {
    const repair = jest.fn(async () => '[[P1]]\n2. That the cheque is dated 1 October 2026.');
    const out = await repairHeldBlanks(input(body), repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(out).toContain('1 October 2026');
    expect(out).not.toMatch(/MISSING/);
  });

  it('a failed repair (null) leaves the body unchanged', async () => {
    expect(await repairHeldBlanks(input(body), async () => null)).toBe(body);
  });

  it('a repair that introduces a value the ledger does not give is refused', async () => {
    const out = await repairHeldBlanks(
      input(body),
      async () => '[[P1]]\n2. That the cheque is dated 9 November 2026.',
    );
    expect(out).toBe(body);
  });

  it('makes no model call when the body has no held blank', async () => {
    const repair = jest.fn(async () => null);
    const plain = '1. That all is well.';
    expect(await repairHeldBlanks(input(plain), repair)).toBe(plain);
    expect(repair).not.toHaveBeenCalled();
  });
});

describe('signed strings', () => {
  it('P6 line, byte for byte', () => {
    expect(factNeededLine('Cheque Date')).toBe(
      'One detail is needed before the draft: Cheque Date.',
    );
  });
  it('P1 line, byte for byte', () => {
    expect(factConflictLine('15 October 2026', 'Cheque Date', 'Date of Presentation to Bank')).toBe(
      'The draft gives 15 October 2026 as the Cheque Date, but your facts give it as the Date of Presentation to Bank. Which is right?',
    );
  });
});

describe('withholdDraft', () => {
  function fakeRes() {
    const writes: string[] = [];
    const res = {
      headersSent: false,
      setHeader: jest.fn(),
      write: jest.fn((s: string) => {
        writes.push(s);
        return true;
      }),
      end: jest.fn(),
    };
    return { res: res as unknown as Response, writes, raw: res };
  }
  const usage = (() => {
    const m = new UsageMeter();
    return m.totals();
  })();
  const payloadOf = (writes: string[]) => {
    const block = writes
      .join('')
      .split('\n\n')
      .find((b) => b.startsWith('event: error\n'))!;
    return JSON.parse(block.split('\ndata: ')[1]) as Record<string, unknown>;
  };

  it('P1: sends an error event with the signed question and returns a GenerationFailedError carrying the usage', () => {
    const { res, writes, raw } = fakeRes();
    const err = withholdDraft(
      res,
      'run-1',
      'legal_notice_s138',
      {
        code: 'fact_conflict',
        conflict: {
          kind: 'wrong_label',
          keyA: 'cheque_date',
          labelA: 'Cheque Date',
          keyB: 'presentation_date',
          labelB: 'Date of Presentation to Bank',
          value: '15 October 2026',
          heldValue: null,
        } as never,
      },
      usage,
    );
    expect(err).toBeInstanceOf(GenerationFailedError);
    expect(err.code).toBe('fact_conflict');
    expect(err.usage).toEqual(usage);
    const p = payloadOf(writes);
    expect(p).toMatchObject({
      code: 'fact_conflict',
      error: 'fact_conflict',
      retryable: false,
      runId: 'run-1',
      key: 'cheque_date',
      reason:
        'The draft gives 15 October 2026 as the Cheque Date, but your facts give it as the Date of Presentation to Bank. Which is right?',
      conflict: {
        keyA: 'cheque_date',
        keyB: 'presentation_date',
        labelA: 'Cheque Date',
        labelB: 'Date of Presentation to Bank',
      },
    });
    // The route ends the response after the row exists; the gate does not end it or send done.
    expect(raw.end).not.toHaveBeenCalled();
    expect(writes.join('')).not.toContain('event: done');
  });

  it('P6: sends the signed one-detail line with code fact_needed', () => {
    const { res, writes } = fakeRes();
    const err = withholdDraft(
      res,
      'run-2',
      'legal_notice_s138',
      { code: 'fact_needed', blank: { key: 'cheque_date', label: 'Cheque Date' } },
      usage,
    );
    expect(err.code).toBe('fact_needed');
    expect(payloadOf(writes)).toMatchObject({
      code: 'fact_needed',
      error: 'fact_needed',
      retryable: false,
      key: 'cheque_date',
      label: 'Cheque Date',
      reason: 'One detail is needed before the draft: Cheque Date.',
    });
  });

  it('logs ids, keys and the code only: the value and the question never reach a log call', () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // the log line is skipped under test
    const spies = (['info', 'log', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    try {
      const { res } = fakeRes();
      const err = withholdDraft(
        res,
        'run-3',
        'legal_notice_s138',
        {
          code: 'fact_conflict',
          conflict: {
            kind: 'wrong_label',
            keyA: 'cheque_date',
            labelA: 'Cheque Date',
            keyB: 'presentation_date',
            labelB: 'Date of Presentation to Bank',
            value: '15 October 2026',
            heldValue: null,
          } as never,
        },
        usage,
      );
      const logged = spies
        .flatMap((s) => s.mock.calls)
        .map((c) => c.map(String).join(' '))
        .join('\n');
      expect(logged).toContain('fact_conflict');
      expect(logged).not.toContain('15 October 2026');
      expect(logged).not.toContain('Which is right');
      expect(err.message).not.toContain('15 October 2026');
    } finally {
      process.env.NODE_ENV = prevEnv;
      spies.forEach((s) => s.mockRestore());
    }
  });
});

describe('generic-looking labels (police station): the pack label or the key in words matches a held key', () => {
  const PS = [
    fact('police_station', 'Police Station', 'police_station', 'Kotwali', 'Kotwali'),
    fact('cheque_date', 'Cheque Date', 'date', '2026-10-01', '1 October 2026'),
  ];

  it('(a) {{MISSING: Police Station}} with police_station held is filled (bail_regular label)', () => {
    const r = fillHeldBlanks('produced by PS {{MISSING: Police Station}} today', PS);
    expect(r.text).toBe('produced by PS Kotwali today');
    expect(r.filled).toEqual([{ key: 'police_station', label: 'Police Station' }]);
  });

  it('(d) "Police station" with a lower-case s matches too, and so does the key in words', () => {
    expect(fillHeldBlanks('PS {{MISSING: Police station}}', PS).text).toBe('PS Kotwali');
    expect(fillHeldBlanks('PS {{MISSING: police station}}', PS).text).toBe('PS Kotwali');
  });

  it('(b) the same label listed in ownBlankLabels is not counted', () => {
    const t = 'PS {{MISSING: Police Station}}';
    expect(heldBlanksIn(t, PS)).toEqual([{ key: 'police_station', label: 'Police Station' }]);
    expect(heldBlanksIn(t, PS, ['Police Station'])).toEqual([]);
    expect(heldBlanksIn(t, PS, ['police station'])).toEqual([]);
  });

  it('(c) a bare {{MISSING: date}} with no held fact labelled Date stays unmatched', () => {
    const t = 'on {{MISSING: date}}';
    const r = fillHeldBlanks(t, PS);
    expect(r.text).toBe(t);
    expect(r.filled).toEqual([]);
    expect(r.left).toEqual([]);
    expect(heldBlanksIn(t, PS)).toEqual([]);
  });

  it('a held police station with two entries is left for the repair, not guessed', () => {
    const two = [
      ...PS,
      fact('police_station', 'Police Station', 'police_station', 'Sadar', 'Sadar'),
    ];
    const r = fillHeldBlanks('PS {{MISSING: Police Station}}', two);
    expect(r.text).toBe('PS {{MISSING: Police Station}}');
    expect(r.left).toEqual([{ key: 'police_station', label: 'Police Station' }]);
  });
});
