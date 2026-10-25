/**
 * T-383 - BNS 61(2) (the target of IPC 120B) resolves to row 61, criminal conspiracy,
 * instead of "not an offence" (legal content path; Ajay checks the result).
 *
 * Row 61's variants are keyed 61(2)(a) and 61(2)(b), one level below 61(2). Only the
 * target itself is checked for variants below it, so 61(2)(c), 61(1) and 61(3) stay not an
 * offence. Expected values come from the signed table or from Ajay's literal texts.
 *
 * Also pins the T-371 reviewer's display-form fix (AC4): a not-found bail-check row carries
 * `display` ("400", "IPC 236", "21 of another Act"), never the raw token ("400-BNS").
 */
import './setupEnv';
import './setupDb';

import fs from 'fs';
import path from 'path';

import request from 'supertest';

jest.mock('../config/redis', () => {
  const redis = new Proxy(
    {},
    {
      get: (_t, prop) =>
        typeof prop === 'symbol' || prop === 'then' || prop === 'on' || prop === 'status'
          ? undefined
          : () => Promise.resolve(null),
    },
  );
  return { __esModule: true, default: redis, disconnectRedis: async () => undefined };
});

// T-375 test setup only: the bail checker and timeline tools are off by default, so this
// suite turns their switches on. No assertion below is changed.
jest.mock('../services/app-settings.service', () => {
  const actual = jest.requireActual('../services/app-settings.service');
  return {
    ...actual,
    getAppSetting: (key: string) =>
      key === 'feature.tool_bail_checker' || key === 'feature.tool_timeline'
        ? Promise.resolve('on')
        : actual.getAppSetting(key),
  };
});

import app from '../app';
import { primeToolSwitches } from '../services/feature-switches';
import { checkBailEligibility, readBailInputs } from '../services/bail-check.service';
import { resolveOffence } from '../services/bns-offence-resolver';
import { calculateTimeline } from '../services/timeline.service';

const SIGNED_CAVEAT =
  'The BNSS First Schedule does not classify this section in one simple line. Check it for your case before relying on this result.';
const NOT_AN_OFFENCE = 'This section does not create an offence. Check the Gazette.';
const DEPENDS_187 = 'Depends on the offence. Check BNSS section 187.';

interface Row {
  title: string;
  variants?: Record<string, unknown>;
}
const OFFENCES = (
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'bns-offences.json'), 'utf-8'),
  ) as { offences: Record<string, Row> }
).offences;

beforeAll(async () => {
  await primeToolSwitches();
});

describe('T-383 AC1: resolveOffence', () => {
  it('61(2) is the parent row 61, criminal conspiracy, with no period', () => {
    const r = resolveOffence('61(2)');
    expect(r.kind).toBe('parent');
    expect(r.key).toBe('61');
    expect(r.title).toBe('Criminal conspiracy');
    expect(r.title).toBe(OFFENCES['61'].title);
    expect(r.maxYears).toBeNull();
    expect(r.courtMaxYears).toBeNull();
    expect(r.triableBy).toBeNull();
    expect(r.note).not.toBe(NOT_AN_OFFENCE);
  });

  it.each(['61(2)(a)', '61(2)(b)'])('%s stays a variant of row 61', (t) => {
    const r = resolveOffence(t);
    expect(r.kind).toBe('variant');
    expect(r.key).toBe(t);
  });

  it.each(['61(1)', '61(3)', '61(2)(c)'])('%s stays not an offence', (t) => {
    const r = resolveOffence(t);
    expect(r.kind).toBe('not_an_offence');
    expect(r.key).toBeNull();
    expect(r.note).toBe(NOT_AN_OFFENCE);
  });

  it.each(['316(1)', '308(1)'])('%s (rule 3) is unchanged: not an offence', (t) => {
    expect(resolveOffence(t).kind).toBe('not_an_offence');
  });

  it('regression sweep: of every ROW(1)..ROW(5) on a row with variants, only 61(2) is new', () => {
    const parents: string[] = [];
    for (const [key, row] of Object.entries(OFFENCES)) {
      if (!row.variants) continue;
      const vkeys = Object.keys(row.variants);
      for (let n = 1; n <= 5; n += 1) {
        const target = `${key}(${n})`;
        if (OFFENCES[target] || vkeys.includes(target)) continue; // exact key or variant
        const below = vkeys.some((v) => v.startsWith(`${target}(`));
        const r = resolveOffence(target);
        if (below) {
          parents.push(target);
          expect(r.kind).toBe('parent');
        } else if (vkeys.includes(key)) {
          continue;
        } else {
          expect(`${target}:${r.kind}`).toBe(`${target}:not_an_offence`);
        }
      }
    }
    expect(parents).toEqual(['61(2)']);
  });
});

describe('T-383 AC2: bail checker', () => {
  it.each(['BNS 61(2)', '120B IPC'])('"%s" gives the conspiracy row with the caveat', async (q) => {
    const { sections } = await checkBailEligibility(readBailInputs(q));
    expect(sections).toHaveLength(1);
    const s = sections[0];
    expect(s.found).toBe(true);
    expect(s.bnsSection).toBe('61(2)');
    expect(s.offence?.resolvedKey).toBe('61');
    expect(s.offence?.title).toBe('Criminal conspiracy');
    expect(s.offence?.caveat).toBe(SIGNED_CAVEAT);
    expect(s.display).toBeUndefined();
  });

  it('GET /sections/bail-check?sections=BNS 61(2) shows the row', async () => {
    const res = await request(app).get('/sections/bail-check?sections=BNS 61(2)');
    expect(res.status).toBe(200);
    const s = res.body.sections[0];
    expect(s.found).toBe(true);
    expect(s.offence.resolvedKey).toBe('61');
    expect(s.offence.title).toBe('Criminal conspiracy');
    expect(s.offence.caveat).toBe(SIGNED_CAVEAT);
    expect(s).not.toHaveProperty('display');
  });

  it('GET /sections/bail-check?sections=120B IPC gives the same row', async () => {
    const a = await request(app).get('/sections/bail-check?sections=BNS 61(2)');
    const b = await request(app).get('/sections/bail-check?sections=120B IPC');
    expect(b.body.sections[0].found).toBe(true);
    expect(b.body.sections[0].offence).toEqual(a.body.sections[0].offence);
  });
});

describe('T-383 AC2: converter', () => {
  it('GET /sections/map?q=120B IPC maps to 61(2), Criminal conspiracy, with the caveat', async () => {
    const res = await request(app).get('/sections/map?q=120B IPC');
    expect(res.status).toBe(200);
    expect(res.body.result.found).toBe(true);
    expect(res.body.result.new_section).toBe('61(2)');
    expect(res.body.result.new_title).toBe('Criminal conspiracy');
    expect(res.body.result.caveat).toBe(SIGNED_CAVEAT);
  });

  it('POST /sections/convert "120B IPC" is converted, labelled 61(2), with the caveat', async () => {
    const res = await request(app).post('/sections/convert').send({ text: '120B IPC' });
    expect(res.status).toBe(200);
    expect(res.body.converted).toBe('Section 61(2) BNS (formerly 120B IPC)');
    expect(res.body.references).toHaveLength(1);
    const ref = res.body.references[0];
    expect(ref.converted).toBe(true);
    expect(ref.new_section).toBe('61(2)');
    expect(ref.caveat).toBe(SIGNED_CAVEAT);
    expect(JSON.stringify(ref).split(SIGNED_CAVEAT).length - 1).toBe(1);
  });
});

describe('T-383 timeline side effect', () => {
  it('61(2) has no period: listed without a period, with the BNSS 187 note', () => {
    const r = calculateTimeline({ arrestDate: '2026-03-01', sections: ['61(2)'] });
    expect(r.sectionsWithoutPeriod).toEqual(['61(2)']);
    expect(r.sectionNotes?.['61(2)']).toBe(`Section 61(2): ${DEPENDS_187}`);
    expect(r.periodNote).toBe(DEPENDS_187);
    expect(r.judicialCustodyDays).toBeNull();
    expect(r.defaultBailDate).toBeNull();
    expect(JSON.stringify(r)).not.toContain('left out of this period');
  });
});

describe('T-383 AC4: display on not-found rows only', () => {
  it.each([
    ['BNS 400', '400-BNS', '400'],
    ['236 IPC', '236-IPC', 'IPC 236'],
    ['21 of Arms Act', '21 of another Act', '21 of another Act'],
  ])('"%s" is not found, input %s, display %s', async (q, input, display) => {
    const { sections } = await checkBailEligibility(readBailInputs(q));
    expect(sections[0].found).toBe(false);
    expect(sections[0].input).toBe(input);
    expect(sections[0].display).toBe(display);
  });

  it('over HTTP, display is on the not-found row and absent on the found one', async () => {
    const res = await request(app).get('/sections/bail-check?sections=BNS 400, BNS 103');
    expect(res.body.sections[0].display).toBe('400');
    expect(res.body.sections[1].found).toBe(true);
    expect(res.body.sections[1]).not.toHaveProperty('display');
  });
});
