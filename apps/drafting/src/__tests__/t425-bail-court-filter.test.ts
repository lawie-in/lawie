import './setupEnv';
import './setupDb';
import request from 'supertest';

import app from '../app';
import { Court } from '../models/Court.model';

// T-425 (Ajay 477fcaa, 03b3e6e, 69c8cbe, 1eb5e9e; legal content): the bail packs offer only
// the courts that can hear bail. Real rows from the shipped list; baselines are literals.
/* eslint-disable @typescript-eslint/no-var-requires */
const ALL_ROWS: Array<Record<string, unknown>> =
  require('../config/courts/indian-courts.json').courts;
/* eslint-enable @typescript-eslint/no-var-requires */

const BAIL_PACKS = [
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'bail_cancellation',
];
const MAGISTRATE_PACKS = BAIL_PACKS.filter((p) => p !== 'bail_anticipatory');

// One real row each. Types asserted by id so a wrong row fails loudly in the sanity test.
const KEEP = {
  sessions: 'bihar_sessions_patna',
  high_court: 'patna_hc',
  high_court_bench: 'karnataka_hc_dharwad_bench',
  district_court: 'bihar_district_patna', // formattingRulesRef ends in _district (sanity test)
  cjm: 'bihar_cjm_patna',
  jmfc: 'bihar_jmfc_patna',
};
const DROP = {
  consumer_commission: 'patna_dccdrc',
  ncdrc: 'ncdrc_delhi',
  supreme_court: 'supreme_court_india',
  nclt: 'nclt_mumbai',
  drt: 'drt_mumbai_1',
  civil_court: 'bihar_civil_patna',
  district_court_generic: 'mh_district_mumbai',
};

interface CourtRow {
  courtId: string;
  [k: string]: unknown;
}
const row = (id: string) => ALL_ROWS.find((r) => r.courtId === id) as Record<string, unknown>;
const ids = (courts: CourtRow[]) => courts.map((c) => c.courtId);
const TRIBUNAL_REFS = ['nclt', 'drt', 'ncdrc', 'itat', 'cat', 'labour_court', 'family_court'];

const isCriminalDistrict = (r: Record<string, unknown>) =>
  r.courtType === 'district_court' && /^[a-z]+_district$/.test(String(r.formattingRulesRef));
const superior = (r: Record<string, unknown>) =>
  ['sessions', 'high_court', 'high_court_bench'].includes(String(r.courtType)) ||
  isCriminalDistrict(r);
const magistrate = (r: Record<string, unknown>) => ['cjm', 'jmfc'].includes(String(r.courtType));

beforeEach(async () => {
  // Bypass Mongoose validators: courtType 'tribunal' is not in the model enum (the seed does the same).
  await Court.collection.insertMany(ALL_ROWS.map((r) => ({ ...r, isActive: true })) as never[]);
  await Court.collection.insertOne({
    ...row('bihar_sessions_patna'),
    courtId: 'inactive_sessions',
    isActive: false,
  } as never);
});

describe('T-425 fixture sanity (the rows used below are what the test says they are)', () => {
  it('KEEP and DROP rows have the expected type and ref', () => {
    expect(row(KEEP.sessions).courtType).toBe('sessions');
    expect(row(KEEP.high_court).courtType).toBe('high_court');
    expect(row(KEEP.high_court_bench).courtType).toBe('high_court_bench');
    expect(isCriminalDistrict(row(KEEP.district_court))).toBe(true);
    expect(row(KEEP.cjm).courtType).toBe('cjm');
    expect(row(KEEP.jmfc).courtType).toBe('jmfc');
    expect(row(DROP.consumer_commission).courtType).toBe('consumer_commission');
    expect(row(DROP.ncdrc).formattingRulesRef).toBe('ncdrc');
    expect(row(DROP.supreme_court).courtType).toBe('supreme_court');
    expect(row(DROP.nclt).courtType).toBe('tribunal');
    expect(row(DROP.drt).courtType).toBe('tribunal');
    expect(row(DROP.civil_court).courtType).toBe('civil_court');
    expect(row(DROP.district_court_generic)).toMatchObject({
      courtType: 'district_court',
      formattingRulesRef: 'district_court_generic',
    });
  });
});

describe('T-425 bail packs: GET /courts?template=<pack>', () => {
  describe.each(BAIL_PACKS)('%s', (pack) => {
    let body: CourtRow[];
    beforeEach(async () => {
      const res = await request(app).get(`/courts?template=${pack}`);
      expect(res.status).toBe(200);
      body = res.body.courts;
    });

    it('offers sessions, high_court, high_court_bench and a criminal-side district court', () => {
      const got = ids(body);
      expect(got).toEqual(
        expect.arrayContaining([
          KEEP.sessions,
          KEEP.high_court,
          KEEP.high_court_bench,
          KEEP.district_court,
        ]),
      );
    });

    it('has no Consumer Commission, NCDRC, Supreme Court, tribunal, civil_court or generic district court (AC2, AC5, AC6)', () => {
      const got = ids(body);
      for (const id of Object.values(DROP)) expect(got).not.toContain(id);
      const types = new Set(body.map((c) => c.courtType));
      for (const t of ['consumer_commission', 'supreme_court', 'tribunal', 'civil_court']) {
        expect(types.has(t)).toBe(false);
      }
      for (const c of body) {
        expect(TRIBUNAL_REFS).not.toContain(c.formattingRulesRef);
        expect(c.formattingRulesRef).not.toBe('district_court_generic');
      }
    });

    it('matches the allow-list exactly on the shipped data', () => {
      const allowed = ALL_ROWS.filter(
        (r) => superior(r) || (pack !== 'bail_anticipatory' && magistrate(r)),
      ).map((r) => r.courtId as string);
      expect(ids(body).sort()).toEqual(allowed.sort());
    });

    it('never returns an inactive court', () => {
      expect(ids(body)).not.toContain('inactive_sessions');
    });
  });

  it.each(MAGISTRATE_PACKS)('%s: cjm and jmfc are present (AC6)', async (pack) => {
    const res = await request(app).get(`/courts?template=${pack}`);
    expect(ids(res.body.courts)).toEqual(expect.arrayContaining([KEEP.cjm, KEEP.jmfc]));
  });

  it('bail_anticipatory: no cjm and no jmfc (AC1)', async () => {
    const res = await request(app).get('/courts?template=bail_anticipatory');
    expect(ids(res.body.courts)).not.toContain(KEEP.cjm);
    expect(ids(res.body.courts)).not.toContain(KEEP.jmfc);
    expect(
      res.body.courts.some((c: CourtRow) => ['cjm', 'jmfc'].includes(c.courtType as string)),
    ).toBe(false);
  });

  it('counts on the shipped list (a change to the allow-list or the data shows up here)', async () => {
    const five = await request(app).get('/courts?template=bail_regular');
    const anti = await request(app).get('/courts?template=bail_anticipatory');
    const tally = (cs: CourtRow[]) => {
      const t: Record<string, number> = {};
      for (const c of cs) t[c.courtType as string] = (t[c.courtType as string] ?? 0) + 1;
      return t;
    };
    expect(five.body.courts).toHaveLength(1439);
    expect(tally(five.body.courts)).toEqual({
      cjm: 97,
      district_court: 619,
      high_court: 36,
      high_court_bench: 6,
      jmfc: 2,
      sessions: 679,
    });
    expect(anti.body.courts).toHaveLength(1340);
    expect(tally(anti.body.courts)).toEqual({
      district_court: 619,
      high_court: 36,
      high_court_bench: 6,
      sessions: 679,
    });
  });
});

describe('T-425 state and type narrowing inside the bail scope', () => {
  it.each(BAIL_PACKS)('%s: state=bihar returns only Bihar courts in scope', async (pack) => {
    const res = await request(app).get(`/courts?template=${pack}&state=bihar`);
    expect(res.status).toBe(200);
    const got = ids(res.body.courts);
    expect(got).toEqual(
      expect.arrayContaining([KEEP.sessions, KEEP.high_court, KEEP.district_court]),
    );
    expect(got).not.toContain(DROP.civil_court); // bihar civil court is in Bihar but out of scope
    expect(got).not.toContain(DROP.consumer_commission);
    expect(got).not.toContain('delhi_saket');
    for (const c of res.body.courts) expect(c.stateId).toBe('bihar');
  });

  it('state + type=sessions returns only that state sessions courts', async () => {
    const res = await request(app).get('/courts?template=bail_regular&state=bihar&type=sessions');
    const expected = ALL_ROWS.filter((r) => r.stateId === 'bihar' && r.courtType === 'sessions')
      .map((r) => r.courtId as string)
      .sort();
    expect(ids(res.body.courts).sort()).toEqual(expected);
  });

  it('a type outside the scope gives an empty list, not the out-of-scope courts', async () => {
    for (const type of ['civil_court', 'consumer_commission', 'tribunal', 'supreme_court']) {
      const res = await request(app).get(`/courts?template=bail_regular&state=bihar&type=${type}`);
      expect(res.status).toBe(200);
      expect(res.body.courts).toEqual([]);
    }
  });

  it('cjm is empty for bail_anticipatory but present for bail_regular', async () => {
    const a = await request(app).get('/courts?template=bail_anticipatory&state=bihar&type=cjm');
    const r = await request(app).get('/courts?template=bail_regular&state=bihar&type=cjm');
    expect(a.body.courts).toEqual([]);
    expect(ids(r.body.courts)).toEqual([KEEP.cjm]);
  });

  it('type=district_court never returns a generic (civil-side) district court', async () => {
    const res = await request(app).get(
      '/courts?template=bail_regular&state=maharashtra&type=district_court',
    );
    expect(ids(res.body.courts)).not.toContain(DROP.district_court_generic);
    for (const c of res.body.courts) expect(c.formattingRulesRef).toBeUndefined();
  });

  it('operator payloads in state/type do not widen the scope', async () => {
    for (const q of ['state[$ne]=x', 'type[$ne]=sessions', 'type[$in][]=tribunal']) {
      const res = await request(app).get(`/courts?template=bail_regular&${q}`);
      expect(res.status).toBe(200);
      expect(ids(res.body.courts)).not.toContain(DROP.nclt);
      expect(ids(res.body.courts)).not.toContain(DROP.civil_court);
      expect(ids(res.body.courts)).not.toContain(DROP.ncdrc);
    }
  });
});

describe('T-425 level is not accepted for bail packs', () => {
  const paths = ['/courts', '/courts/types?state=bihar', '/courts/states'];
  it.each(BAIL_PACKS.flatMap((p) => paths.map((u) => [p, u])))(
    '%s %s: non-empty level is a 400',
    async (pack, path) => {
      const sep = path.includes('?') ? '&' : '?';
      for (const level of ['district', 'national', 'x']) {
        const res = await request(app).get(`${path}${sep}template=${pack}&level=${level}`);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: `level is not accepted for template ${pack}` });
      }
    },
  );

  it('an empty level= is ignored', async () => {
    const plain = await request(app).get('/courts?template=bail_regular');
    const empty = await request(app).get('/courts?template=bail_regular&level=');
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual(plain.body);
  });
});

describe('T-425 /courts/types and /courts/states are scoped', () => {
  it.each(BAIL_PACKS)('%s: /types?state=bihar', async (pack) => {
    const res = await request(app).get(`/courts/types?state=bihar&template=${pack}`);
    expect(res.status).toBe(200);
    const typeIds = res.body.types.map((t: { id: string }) => t.id).sort();
    expect(typeIds).toEqual(
      pack === 'bail_anticipatory'
        ? ['district_court', 'high_court', 'sessions']
        : ['cjm', 'district_court', 'high_court', 'jmfc', 'sessions'],
    );
  });

  it('/types labels high_court_bench as High Court Bench', async () => {
    const res = await request(app).get('/courts/types?state=karnataka&template=bail_regular');
    expect(res.body.types).toContainEqual({ id: 'high_court_bench', label: 'High Court Bench' });
  });

  it('/types for a state with only out-of-scope courts is empty', async () => {
    const res = await request(app).get('/courts/types?state=india&template=bail_regular');
    expect(res.status).toBe(200);
    expect(res.body.types).toEqual([]);
  });

  it('/types still needs a state', async () => {
    const res = await request(app).get('/courts/types?template=bail_regular');
    expect(res.status).toBe(400);
  });

  it.each(BAIL_PACKS)('%s: /states lists only states with an in-scope court', async (pack) => {
    const res = await request(app).get(`/courts/states?template=${pack}`);
    expect(res.status).toBe(200);
    const got = res.body.states.map((s: { id: string }) => s.id).sort();
    const expected = Array.from(
      new Set(
        ALL_ROWS.filter((r) => superior(r) || (pack !== 'bail_anticipatory' && magistrate(r))).map(
          (r) => r.stateId as string,
        ),
      ),
    ).sort();
    expect(got).toEqual(expected);
    expect(got).not.toContain('india'); // only the Supreme Court / NCDRC live there
  });
});

describe('T-425 other templates are not changed', () => {
  it('suspension_of_sentence is not a bail pack: unfiltered, level ignored', async () => {
    const base = await request(app).get('/courts');
    for (const q of [
      'template=suspension_of_sentence',
      'template=suspension_of_sentence&level=x',
    ]) {
      const res = await request(app).get(`/courts?${q}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(base.body);
    }
    expect(ids(base.body.courts)).toEqual(
      expect.arrayContaining([DROP.nclt, DROP.civil_court, DROP.supreme_court]),
    );
    const types = await request(app).get('/courts/types?state=bihar');
    const typesS = await request(app).get(
      '/courts/types?state=bihar&template=suspension_of_sentence',
    );
    expect(typesS.body).toEqual(types.body);
    const states = await request(app).get('/courts/states');
    const statesS = await request(app).get('/courts/states?template=suspension_of_sentence');
    expect(statesS.body).toEqual(states.body);
  });

  it('a bail-like id that is not exact is not scoped (no prefix matching)', async () => {
    const base = await request(app).get('/courts');
    const res = await request(app).get('/courts?template=bail_regular_v2');
    expect(res.body).toEqual(base.body);
  });

  it('consumer_complaint: level still works, type still ignored, and bail is not mixed in', async () => {
    const nat = await request(app).get('/courts?template=consumer_complaint&level=national');
    expect(ids(nat.body.courts)).toEqual([DROP.ncdrc]);
    const dist = await request(app).get(
      '/courts?template=consumer_complaint&level=district&state=bihar&type=sessions',
    );
    expect(ids(dist.body.courts).sort()).toEqual([
      'bhagalpur_dccdrc',
      'gaya_dccdrc',
      'muzaffarpur_dccdrc',
      'patna_dccdrc',
    ]);
    expect(ids(dist.body.courts)).not.toContain(KEEP.sessions);
    const bad = await request(app).get('/courts?template=consumer_complaint&level=bogus');
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'level must be one of district|state|national' });
  });
});
