/**
 * T-611 round 2 (Ajay ceee45cb): the bank-role check is a P1 conflict for a held
 * name; a non-held date or amount under a held label is a `mismatch` conflict
 * with the signed question `The draft gives <value> for the <label>, but your
 * facts give <held value>. Which is right?`; the withhold log carries no value.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type { Response } from 'express';
import type { LedgerFact } from '@lawie/shared';

import { withholdDraft } from '../services/ai.service';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { UsageMeter } from '../services/llm-usage';
import {
  amountFromWords,
  verifyAndRepair,
  verifyDraft,
  VerifierInput,
} from '../services/fact-verifier';
import { loadRulePack } from '../services/rule-pack.service';

const fx = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 't147d', 's138-notice.json'), 'utf8'),
) as {
  pack: string;
  ledger: { facts: LedgerFact[]; unresolved: never[] };
  skeleton: string[];
  body: string;
};

const inputOf = (body: string, unresolved = false): VerifierInput =>
  ({
    body,
    facts: fx.ledger.facts,
    unresolved: unresolved ? fx.ledger.unresolved : [],
    lists: loadAvermentLists(fx.pack),
    skeleton: fx.skeleton,
    packText: packTexts(loadRulePack(fx.pack)!),
    packId: fx.pack,
  }) as VerifierInput;

function fakeRes() {
  const writes: string[] = [];
  const res = {
    headersSent: false,
    setHeader: jest.fn(),
    write: jest.fn((s: string) => (writes.push(s), true)),
    end: jest.fn(),
  };
  return { res: res as unknown as Response, writes };
}
const reasonOf = (writes: string[]) => {
  const b = writes
    .join('')
    .split('\n\n')
    .find((x) => x.startsWith('event: error\n'))!;
  return JSON.parse(b.split('\ndata: ')[1]) as Record<string, any>;
};

describe('bank role: a held name is a P1 conflict, never blanked', () => {
  const body =
    '1. That the cheque was drawn on HDFC Bank, Karol Bagh.\n\n2. That my client presented the said cheque for encashment on 15.09.2026 at HDFC Bank, Karol Bagh.';

  it('the finding names the presenting role as A and the held drawee branch as B', () => {
    const vs = verifyDraft(inputOf(body)).filter((v) => v.conflict?.keyA === 'presenting_branch');
    expect(vs).toHaveLength(1);
    expect(vs[0].conflict).toMatchObject({
      kind: 'wrong_label',
      keyA: 'presenting_branch',
      labelA: 'bank or branch where the cheque was presented',
      keyB: 'drawee_branch',
    });
  });

  it('after one failed repair it is a conflict and the name stays in the text', async () => {
    const repair = jest.fn(async () => null);
    const out = await verifyAndRepair(inputOf(body), repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(out.body).toContain(
      'presented the said cheque for encashment on 15.09.2026 at HDFC Bank, Karol Bagh',
    );
    expect(out.body).not.toContain('{{MISSING: Drawee Branch}}');
    expect(out.conflicts?.map((c) => c.keyA)).toContain('presenting_branch');
  });

  it('the signed P1 question carries both labels', async () => {
    const out = await verifyAndRepair(inputOf(body), async () => null);
    const c = out.conflicts!.find((x) => x.keyA === 'presenting_branch')!;
    const { res, writes } = fakeRes();
    withholdDraft(
      res,
      'r',
      fx.pack,
      { code: 'fact_conflict', conflict: c },
      new UsageMeter().totals(),
    );
    expect(reasonOf(writes).reason).toBe(
      `The draft gives ${c.value} as the bank or branch where the cheque was presented, but your facts give it as the ${c.labelB}. Which is right?`,
    );
  });
});

describe('mismatch: a value that is not held, under a held label', () => {
  it('date: signed question with the held value', async () => {
    const out = await verifyAndRepair(
      inputOf('1. That you issued a cheque dated 5 September 2026 in favour of my client.'),
      async () => null,
    );
    expect(out.body).not.toMatch(/MISSING/);
    const c = out.conflicts!.find((x) => x.keyA === 'cheque_date')!;
    expect(c.kind).toBe('mismatch');
    expect(c.heldValue).toBe('1 September 2026');
    const { res, writes } = fakeRes();
    const err = withholdDraft(
      res,
      'r',
      fx.pack,
      { code: 'fact_conflict', conflict: c },
      new UsageMeter().totals(),
    );
    expect(err.code).toBe('fact_conflict');
    expect(reasonOf(writes)).toMatchObject({
      code: 'fact_conflict',
      reason: `The draft gives ${c.value} for the Cheque Date, but your facts give 1 September 2026. Which is right?`,
    });
    expect(c.value).toContain('5 September 2026');
  });

  it('amount: signed question with the held value', async () => {
    const out = await verifyAndRepair(
      inputOf('1. That the cheque amount is Rs 4,00,000 as stated in the cheque.'),
      async () => null,
    );
    expect(out.body).not.toMatch(/MISSING/);
    const c = out.conflicts!.find((x) => x.keyA === 'cheque_amount')!;
    expect(c.kind).toBe('mismatch');
    expect(c.heldValue).toBe('Rs 3,00,000');
    const { res, writes } = fakeRes();
    withholdDraft(
      res,
      'r',
      fx.pack,
      { code: 'fact_conflict', conflict: c },
      new UsageMeter().totals(),
    );
    expect(reasonOf(writes).reason).toBe(
      `The draft gives ${c.value} for the Cheque Amount (Rs.), but your facts give Rs 3,00,000. Which is right?`,
    );
    expect(c.value).toContain('4,00,000');
  });
});

describe('paise', () => {
  it('"Fifteen Thousand and Fifty Paise" is read as 15,000.50', () => {
    expect(amountFromWords('Rupees Fifteen Thousand and Fifty Paise only')).toBe(15000.5);
  });
});

describe('the withhold log line carries no value', () => {
  it('logs pack id, code and keys only', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const spies = (['info', 'log', 'warn', 'error'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    try {
      const { res } = fakeRes();
      withholdDraft(
        res,
        'run-9',
        fx.pack,
        {
          code: 'fact_conflict',
          conflict: {
            kind: 'mismatch',
            keyA: 'cheque_date',
            labelA: 'Cheque Date',
            keyB: null,
            labelB: null,
            value: '5 September 2026',
            heldValue: '1 September 2026',
          },
        },
        new UsageMeter().totals(),
      );
      const logged = spies
        .flatMap((s) => s.mock.calls)
        .map((c) => c.map(String).join(' '))
        .join('\n');
      expect(logged).toContain(
        `[drafting] draft withheld (run=run-9, kind=${fx.pack}, rule=P3, code=fact_conflict, keys=cheque_date)`,
      );
      expect(logged).not.toContain('September 2026');
      expect(logged).not.toContain('Which is right');
    } finally {
      process.env.NODE_ENV = prev;
      spies.forEach((s) => s.mockRestore());
    }
  });
});
