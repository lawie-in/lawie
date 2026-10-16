/**
 * T-482 (Ajay 9ad6a8f1, 16 Oct 2026; legal content): the maintenance_bnss_144 court lists.
 * Family Court only where verified (Patna, Ranchi), offered alone there; every other Bihar and
 * Jharkhand district offers `Court of the Judicial Magistrate First Class, {district}`.
 *
 * A  /states, /types, /courts for the template, on the shipped seed rows
 * B  the `templates` mark: every other template's list is unchanged; by-id still works
 * C  seed-courts carries `templates`
 *
 * Real rows from the shipped list; no model, no network.
 */
import './setupEnv';
import './setupDb';
import { readFileSync } from 'fs';
import { join } from 'path';

import request from 'supertest';

import app from '../app';
import { Court } from '../models/Court.model';

/* eslint-disable @typescript-eslint/no-var-requires */
const ALL_ROWS: Array<Record<string, unknown>> =
  require('../config/courts/indian-courts.json').courts;
/* eslint-enable @typescript-eslint/no-var-requires */

const MAINT = 'maintenance_bnss_144';
const JMFC_PREFIX = 'Court of the Judicial Magistrate First Class, ';
const MARKED = ALL_ROWS.filter((r) => r.templates);
const MARKED_IDS = MARKED.map((r) => r.courtId as string);
const BIHAR_NEW = MARKED_IDS.filter((i) => i.startsWith('bihar_jmfc_')).sort();
const JHARKHAND_NEW = MARKED_IDS.filter((i) => i.startsWith('jharkhand_jmfc_')).sort();
const BAIL_PACKS = [
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'bail_cancellation',
];

interface CourtRow {
  courtId: string;
  name: string;
  courtType: string;
  [k: string]: unknown;
}
const ids = (courts: CourtRow[]) => courts.map((c) => c.courtId);

beforeEach(async () => {
  // Bypass Mongoose validators: courtType 'tribunal' is not in the model enum (the seed does the same).
  await Court.collection.insertMany(ALL_ROWS.map((r) => ({ ...r, isActive: true })) as never[]);
});

const get = (url: string) => request(app).get(url);
const list = async (q: string): Promise<CourtRow[]> => (await get(`/courts?${q}`)).body.courts;

describe('T-482 fixture: the 19 new rows', () => {
  it('10 Bihar and 9 Jharkhand JMFCs, marked for maintenance only, named per Ajay', () => {
    expect(MARKED).toHaveLength(19);
    expect(BIHAR_NEW).toHaveLength(10);
    expect(JHARKHAND_NEW).toHaveLength(9);
    for (const r of MARKED) {
      expect(r.templates).toEqual([MAINT]);
      expect(r.courtType).toBe('jmfc');
      expect(String(r.name).startsWith(JMFC_PREFIX)).toBe(true);
      expect(String(r.name).length).toBeGreaterThan(JMFC_PREFIX.length);
      expect(r.courtId).toMatch(/^(bihar|jharkhand)_jmfc_[a-z]+$/);
      expect(r.stateId).toBe(String(r.courtId).split('_')[0]);
      expect(r.isActive === undefined || r.isActive === true).toBe(true);
    }
  });

  it('Gaya is exactly `Court of the Judicial Magistrate First Class, Gaya`', () => {
    const gaya = ALL_ROWS.find((r) => r.courtId === 'bihar_jmfc_gaya')!;
    expect(gaya.name).toBe('Court of the Judicial Magistrate First Class, Gaya');
  });

  it('the Family Courts of the two states are Patna and Ranchi only', () => {
    const fc = ALL_ROWS.filter(
      (r) =>
        r.formattingRulesRef === 'family_court' &&
        ['bihar', 'jharkhand'].includes(String(r.stateId)),
    ).map((r) => r.courtId);
    expect(fc.sort()).toEqual(['family_court_patna', 'family_court_ranchi']);
  });
});

// Ajay 656332c9 (1) and (2): labels, headings and nomenclature of the 19 records.
const HQ_SEATS: Record<string, string> = {
  bihar_jmfc_chhapra: 'Saran at Chhapra',
  bihar_jmfc_hajipur: 'Vaishali at Hajipur',
  jharkhand_jmfc_daltonganj: 'Palamu at Daltonganj',
  jharkhand_jmfc_chaibasa: 'West Singhbhum at Chaibasa',
  jharkhand_jmfc_jamshedpur: 'East Singhbhum at Jamshedpur',
};
const NOMENCLATURE = '[To be confirmed: case type and number as styled in this court]';

describe('T-482 names, headings and nomenclature (Ajay 656332c9)', () => {
  it.each(MARKED_IDS)('%s', (id) => {
    const r = ALL_ROWS.find((x) => x.courtId === id)!;
    const place = HQ_SEATS[id] ?? String(r.city);
    expect(r.name).toBe(`${JMFC_PREFIX}${place}`);
    expect(r.designation).toBe(
      `IN THE COURT OF JUDICIAL MAGISTRATE FIRST CLASS, ${place.toUpperCase()}`,
    );
    expect(r.caseNomenclature).toBe(NOMENCLATURE);
  });

  it('exactly five HQ-seat names carry "X at Y"; the other 14 are the city alone', () => {
    const withAt = MARKED.filter((r) => / at /.test(String(r.name))).map((r) => r.courtId);
    expect(withAt.sort()).toEqual(Object.keys(HQ_SEATS).sort());
  });

  it('the old seats keep their rows (bihar_jmfc_patna, jharkhand_jmfc_ranchi untouched, not marked)', () => {
    for (const id of ['bihar_jmfc_patna', 'jharkhand_jmfc_ranchi']) {
      expect(ALL_ROWS.find((r) => r.courtId === id)!.templates).toBeUndefined();
    }
  });

  it('the Chhapra and Hajipur seats are offered under their signed labels via the route', async () => {
    const names = (await list(`state=bihar&type=jmfc&template=${MAINT}`)).map((c) => c.name);
    expect(names).toContain(`${JMFC_PREFIX}Saran at Chhapra`);
    expect(names).toContain(`${JMFC_PREFIX}Vaishali at Hajipur`);
    expect(names).toContain(`${JMFC_PREFIX}Gaya`);
  });
});

describe('T-482 A: GET /courts/* with template=maintenance_bnss_144', () => {
  it('/states offers every state', async () => {
    const res = await get(`/courts/states?template=${MAINT}`);
    const all = await get('/courts/states');
    expect(res.body.states).toEqual(all.body.states);
    expect(res.body.states.map((s: { id: string }) => s.id)).toEqual(
      expect.arrayContaining(['bihar', 'jharkhand', 'goa']),
    );
  });

  it('Bihar types: Family Court and Judicial Magistrate First Class, nothing else', async () => {
    const res = await get(`/courts/types?state=bihar&template=${MAINT}`);
    expect(res.status).toBe(200);
    expect(res.body.types.map((t: { label: string }) => t.label)).toEqual([
      'Family Court',
      'Judicial Magistrate First Class',
    ]);
    expect(res.body.types.map((t: { id: string }) => t.id).sort()).toEqual([
      'family_court',
      'jmfc',
    ]);
  });

  it('Jharkhand types: the same two', async () => {
    const res = await get(`/courts/types?state=jharkhand&template=${MAINT}`);
    expect(res.body.types.map((t: { id: string }) => t.id).sort()).toEqual([
      'family_court',
      'jmfc',
    ]);
  });

  it('Bihar family_court: family_court_patna only', async () => {
    const courts = await list(`state=bihar&type=family_court&template=${MAINT}`);
    expect(ids(courts)).toEqual(['family_court_patna']);
    // the record keeps its stored courtType; formattingRulesRef is not returned
    expect(courts[0].courtType).toBe('tribunal');
    expect(courts[0]).not.toHaveProperty('formattingRulesRef');
  });

  it('Bihar jmfc: the 10 new JMFCs, and NOT bihar_jmfc_patna (Patna has a Family Court)', async () => {
    const courts = await list(`state=bihar&type=jmfc&template=${MAINT}`);
    expect(ids(courts).sort()).toEqual(BIHAR_NEW);
    expect(ids(courts)).not.toContain('bihar_jmfc_patna');
  });

  it('Gaya: the JMFC name is exact and there is no Family Court for Gaya', async () => {
    const courts = await list(`state=bihar&template=${MAINT}`);
    const gaya = courts.filter((c) => /gaya/i.test(c.name));
    expect(gaya.map((c) => c.name)).toEqual(['Court of the Judicial Magistrate First Class, Gaya']);
    expect(courts.filter((c) => c.courtType === 'tribunal').map((c) => c.courtId)).toEqual([
      'family_court_patna',
    ]);
  });

  it('Bihar without a type: Family Court Patna plus the 10 JMFCs, no CJM, Sessions, District', async () => {
    const courts = await list(`state=bihar&template=${MAINT}`);
    expect(ids(courts).sort()).toEqual(['family_court_patna', ...BIHAR_NEW].sort());
  });

  it('Jharkhand family_court: family_court_ranchi only; jmfc: the 9 new, not jharkhand_jmfc_ranchi', async () => {
    expect(ids(await list(`state=jharkhand&type=family_court&template=${MAINT}`))).toEqual([
      'family_court_ranchi',
    ]);
    const jmfc = await list(`state=jharkhand&type=jmfc&template=${MAINT}`);
    expect(ids(jmfc).sort()).toEqual(JHARKHAND_NEW);
    expect(ids(jmfc)).not.toContain('jharkhand_jmfc_ranchi');
  });

  it('every offered JMFC name is `Court of the Judicial Magistrate First Class, <district>`', async () => {
    for (const state of ['bihar', 'jharkhand']) {
      for (const c of await list(`state=${state}&type=jmfc&template=${MAINT}`)) {
        expect(c.name.startsWith(JMFC_PREFIX)).toBe(true);
      }
    }
  });

  it('level is a 400 for this template, on all three routes', async () => {
    for (const url of [
      `/courts?template=${MAINT}&level=state`,
      `/courts/types?state=bihar&template=${MAINT}&level=state`,
      `/courts/states?template=${MAINT}&level=state`,
    ]) {
      expect((await get(url)).status).toBe(400);
    }
  });

  it('a fallback state (goa, no Family Court and no JMFC) gets its previous unscoped list', async () => {
    expect(ids(await list(`state=goa&template=${MAINT}`)).sort()).toEqual(
      ids(await list('state=goa')).sort(),
    );
    expect((await list('state=goa')).length).toBeGreaterThan(0);
    const scoped = await get(`/courts/types?state=goa&template=${MAINT}`);
    const plain = await get('/courts/types?state=goa');
    expect(scoped.body.types).toEqual(plain.body.types);
    // and a type filter in the fallback state is the stored courtType
    expect(ids(await list(`state=goa&type=cjm&template=${MAINT}`))).toEqual(['ga_cjm_panaji']);
  });

  it('every state with a Family Court record offers it; Delhi offers its Family Courts', async () => {
    const delhi = await list(`state=delhi&type=family_court&template=${MAINT}`);
    expect(ids(delhi).sort()).toEqual(
      ALL_ROWS.filter((r) => r.stateId === 'delhi' && r.formattingRulesRef === 'family_court')
        .map((r) => r.courtId as string)
        .sort(),
    );
  });

  it('an inactive Family Court is not offered', async () => {
    await Court.collection.updateOne(
      { courtId: 'family_court_patna' },
      { $set: { isActive: false } },
    );
    expect(ids(await list(`state=bihar&type=family_court&template=${MAINT}`))).toEqual([]);
  });
});

describe('T-482 B: the `templates` mark hides the 19 from every other list', () => {
  it('an unscoped list: nothing marked, and the rest is the raw seed minus the 19', async () => {
    const all = await list('');
    expect(ids(all).sort()).toEqual(
      ALL_ROWS.filter((r) => !r.templates)
        .map((r) => r.courtId as string)
        .sort(),
    );
    for (const id of MARKED_IDS) expect(ids(all)).not.toContain(id);
  });

  it('unscoped type=jmfc is unchanged: bihar_jmfc_patna and jharkhand_jmfc_ranchi only', async () => {
    expect(ids(await list('type=jmfc')).sort()).toEqual([
      'bihar_jmfc_patna',
      'jharkhand_jmfc_ranchi',
    ]);
    expect(ids(await list('state=bihar&type=jmfc'))).toEqual(['bihar_jmfc_patna']);
    expect(ids(await list('state=jharkhand&type=jmfc'))).toEqual(['jharkhand_jmfc_ranchi']);
  });

  it('GET /courts/types?state=bihar unscoped is unchanged (no family_court type)', async () => {
    const res = await get('/courts/types?state=bihar');
    expect(res.body.types.map((t: { id: string }) => t.id)).not.toContain('family_court');
  });

  it.each(BAIL_PACKS)(
    '%s: none of the 19, and the list is the allow-list as before',
    async (pack) => {
      const courts = await list(`template=${pack}`);
      for (const id of MARKED_IDS) expect(ids(courts)).not.toContain(id);
      const isCriminalDistrict = (r: Record<string, unknown>) =>
        r.courtType === 'district_court' && /^[a-z]+_district$/.test(String(r.formattingRulesRef));
      const expected = ALL_ROWS.filter(
        (r) =>
          !r.templates &&
          (['sessions', 'high_court', 'high_court_bench'].includes(String(r.courtType)) ||
            isCriminalDistrict(r) ||
            (pack !== 'bail_anticipatory' && ['cjm', 'jmfc'].includes(String(r.courtType)))),
      ).map((r) => r.courtId as string);
      expect(ids(courts).sort()).toEqual(expected.sort());
      // bail's Bihar types are as they were: no Family Court
      const types = await get(`/courts/types?state=bihar&template=${pack}`);
      expect(types.body.types.map((t: { id: string }) => t.id)).not.toContain('family_court');
    },
  );

  it('consumer_complaint: none of the 19', async () => {
    for (const level of ['state', 'district', 'national']) {
      const courts = await list(`template=consumer_complaint&level=${level}`);
      for (const id of MARKED_IDS) expect(ids(courts)).not.toContain(id);
    }
    const all = await list('template=consumer_complaint');
    for (const id of MARKED_IDS) expect(ids(all)).not.toContain(id);
  });

  it('a template that is not in the filter map sees none of the 19', async () => {
    for (const t of ['plaint_recovery', 'legal_notice_s138', 'no_such_template']) {
      const courts = await list(`template=${t}`);
      for (const id of MARKED_IDS) expect(ids(courts)).not.toContain(id);
    }
  });

  it('GET /courts/:courtId works for a new id (by-id lookup unchanged)', async () => {
    const res = await get('/courts/bihar_jmfc_gaya');
    expect(res.status).toBe(200);
    expect(res.body.court.name).toBe('Court of the Judicial Magistrate First Class, Gaya');
    expect(res.body.court.templates).toEqual([MAINT]);
  });

  it('/states unscoped is the same set of states as before', async () => {
    const res = await get('/courts/states');
    const expected = new Set(ALL_ROWS.map((r) => r.stateId as string));
    expect(new Set(res.body.states.map((s: { id: string }) => s.id))).toEqual(expected);
  });
});

describe('T-482 C: the model and the seed script carry `templates`', () => {
  it('Court schema has an optional `templates` string array with no default', () => {
    const path = Court.schema.path('templates');
    expect(path).toBeDefined();
    const doc = new Court({ courtId: 'x' });
    expect(doc.templates).toBeUndefined();
  });

  it('seed-courts.ts passes the field through (it spreads the seed row; its row type has it)', () => {
    const src = readFileSync(join(__dirname, '..', 'scripts', 'seed-courts.ts'), 'utf8');
    expect(src).toMatch(/templates\?: string\[\]/);
    // the seed writes the row as it is; it does not pick a fixed field list
    expect(src).not.toMatch(/pick\(|\bomit\(/);
  });
});
