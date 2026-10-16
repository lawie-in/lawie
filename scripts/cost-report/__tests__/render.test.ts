import { buildReport } from '../lib/aggregate';
import { renderText } from '../lib/render';
import { toAuxRow, toGenerationRow } from '../lib/rows';
import { aux, gen, RATES, U1, WIN } from './fixtures';

const SECRETS = [
  'Ravi Kumar',
  'ravi@example.com',
  '+91 98765 43210',
  'secret brief text',
  '12 MG Road, Pune',
];

function report(extra = false) {
  let g: any = gen({ documentId: 'd1', intakeId: 'i1', costUsd: null, costStatus: 'rate_missing' });
  let a: any = aux({ intakeId: 'i1' });
  let p: any = aux({ purpose: 'preflight', userId: U1 });
  if (extra) {
    // Raw docs as the DB could return them if a projection ever leaked text.
    const rawGen = {
      _id: 'g-raw',
      documentId: 'd1',
      intakeId: 'i1',
      userId: U1,
      aiModel: 'claude-x',
      costUsd: 0.1,
      costStatus: 'priced',
      inputTokens: 10,
      outputTokens: 5,
      createdAt: new Date('2026-10-15T05:00:00Z'),
      name: 'Ravi Kumar',
      email: 'ravi@example.com',
      phone: '+91 98765 43210',
      briefText: 'secret brief text',
      address: '12 MG Road, Pune',
    };
    g = toGenerationRow(rawGen);
    a = toAuxRow({
      ...rawGen,
      _id: 'a-raw',
      purpose: 'intake_extract',
      prompt: 'secret brief text',
      name: 'Ravi Kumar',
    });
    p = toAuxRow({ ...rawGen, _id: 'p-raw', purpose: 'preflight', email: 'ravi@example.com' });
  }
  return buildReport({
    windows: [{ window: WIN, generations: [g], aux: [a, p] }],
    rates: RATES,
    usdInr: 85,
    usdInrFallback: false,
    includeFixtures: false,
    userFilter: null,
  });
}

describe('render', () => {
  it('shows ids, numbers, model, docType, USD and INR', () => {
    const t = renderText(report());
    expect(t).toMatch(/documentId=d1 intakeId=i1/);
    expect(t).toMatch(/docType=bail class=-/);
    expect(t).toMatch(/models=claude-x/);
    expect(t).toMatch(/\$\d+\.\d{4} Rs \d+\.\d{2}/);
    expect(t).toMatch(/in=\d+ out=\d+ cacheW=\d+ cacheR=\d+/);
    expect(t).toMatch(/grand total/);
  });

  it('labels cost sources', () => {
    expect(renderText(report())).toMatch(/\[computed\]/); // body re-priced
    expect(renderText(report())).toMatch(/\[recorded\]/); // intake
    const unpriced = buildReport({
      windows: [
        {
          window: WIN,
          generations: [
            gen({ documentId: 'd', aiModel: 'nope', costUsd: null, costStatus: 'rate_missing' }),
          ],
          aux: [],
        },
      ],
      rates: RATES,
      usdInr: 85,
      usdInrFallback: true,
      includeFixtures: false,
      userFilter: null,
    });
    const t = renderText(unpriced);
    expect(t).toMatch(/\[unpriced\]/);
    expect(t).toMatch(/unpriced=1/);
    expect(t).toMatch(/usd_inr=85 \(fallback\)/);
  });

  it('labels mixed', () => {
    const r = buildReport({
      windows: [
        {
          window: WIN,
          generations: [
            gen({ documentId: 'd' }),
            gen({ documentId: 'd', costUsd: null, costStatus: 'rate_missing' }),
          ],
          aux: [],
        },
      ],
      rates: RATES,
      usdInr: 85,
      usdInrFallback: false,
      includeFixtures: false,
      userFilter: null,
    });
    expect(renderText(r)).toMatch(/\[mixed\]/);
  });

  it('text and JSON never contain names, contact details or brief text', () => {
    const r = report(true);
    const text = renderText(r);
    const json = JSON.stringify(r, null, 2);
    for (const s of SECRETS) {
      expect(text).not.toContain(s);
      expect(json).not.toContain(s);
    }
    for (const k of ['briefText', 'email', 'phone', 'prompt', '"name"']) {
      expect(json).not.toContain(k);
    }
  });

  it('prints unattributed preflight', () => {
    const r = buildReport({
      windows: [{ window: WIN, generations: [], aux: [aux({ purpose: 'preflight' })] }],
      rates: RATES,
      usdInr: 85,
      usdInrFallback: false,
      includeFixtures: false,
      userFilter: U1,
    });
    const t = renderText(r);
    expect(t).toMatch(/unattributed preflight: userId=/);
    expect(t).toMatch(new RegExp(`user=${U1}`));
  });
});
