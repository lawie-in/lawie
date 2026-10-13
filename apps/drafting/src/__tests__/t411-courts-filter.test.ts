import './setupEnv';
import './setupDb';
import request from 'supertest';

import app from '../app';
import { Court } from '../models/Court.model';

// Real rows from the shipped court list (not git): the picker must behave on production data.
/* eslint-disable @typescript-eslint/no-var-requires */
const ALL_ROWS: Array<Record<string, unknown>> =
  require('../config/courts/indian-courts.json').courts;
/* eslint-enable @typescript-eslint/no-var-requires */

const SEED_IDS = [
  'patna_dccdrc',
  'gaya_dccdrc',
  'bihar_state_consumer_patna',
  'delhi_dccdrc',
  'dl_state_consumer_delhi',
  'ncdrc_delhi',
  'nclt_principal_delhi',
  'nclt_mumbai',
  'patna_hc',
  'bihar_sessions_patna',
  'delhi_hc',
  'delhi_saket',
];

const NCDRC = 'ncdrc_delhi';
const BIHAR_DISTRICT = ['gaya_dccdrc', 'patna_dccdrc'];
const ALL_CONSUMER = [
  ...[
    'bihar_state_consumer_patna',
    'delhi_dccdrc',
    'dl_state_consumer_delhi',
    'gaya_dccdrc',
    'patna_dccdrc',
    NCDRC,
  ],
].sort();

interface CourtRow {
  courtId: string;
  [k: string]: unknown;
}

async function seed() {
  const rows: Array<Record<string, unknown>> = SEED_IDS.map((id) => {
    const row = ALL_ROWS.find((r) => r.courtId === id);
    if (!row) throw new Error(`seed row ${id} missing from indian-courts.json`);
    return { ...row, isActive: true };
  });
  rows.push({
    ...(ALL_ROWS.find((r) => r.courtId === 'gaya_dccdrc') as Record<string, unknown>),
    courtId: 'inactive_consumer',
    name: 'Inactive Consumer Commission',
    isActive: false,
  });
  // Bypass Mongoose validators: courtType 'tribunal' is not in the model enum (the seed does the same).
  await Court.collection.insertMany(rows as never[]);
}

const ids = (courts: CourtRow[]) => courts.map((c) => c.courtId).sort();

describe('T-411 template-scoped court picker (server)', () => {
  beforeEach(seed);

  // ── AC1 + AC3: consumer_complaint by level ──────────────────────────────────

  describe('GET /courts?template=consumer_complaint', () => {
    it("district + state returns only that state's District Commissions", async () => {
      const res = await request(app).get(
        '/courts?template=consumer_complaint&level=district&state=bihar',
      );
      expect(res.status).toBe(200);
      expect(ids(res.body.courts)).toEqual(BIHAR_DISTRICT);
    });

    it("state + state returns only that state's State Commission", async () => {
      const res = await request(app).get(
        '/courts?template=consumer_complaint&level=state&state=delhi',
      );
      expect(res.status).toBe(200);
      expect(ids(res.body.courts)).toEqual(['dl_state_consumer_delhi']);
    });

    it('national returns NCDRC only, without needing a state (AC3)', async () => {
      const res = await request(app).get('/courts?template=consumer_complaint&level=national');
      expect(res.status).toBe(200);
      expect(ids(res.body.courts)).toEqual([NCDRC]);
      expect(res.body.courts[0].courtType).toBe('tribunal');
      expect(res.body.courts[0].stateId).toBe('india');
    });

    it('national ignores a stale state left over from an earlier pick', async () => {
      const res = await request(app).get(
        '/courts?template=consumer_complaint&level=national&state=bihar&type=consumer_commission',
      );
      expect(res.status).toBe(200);
      expect(ids(res.body.courts)).toEqual([NCDRC]);
    });

    it('no level returns all Commissions plus NCDRC, nothing else', async () => {
      const res = await request(app).get('/courts?template=consumer_complaint');
      expect(res.status).toBe(200);
      expect(ids(res.body.courts)).toEqual(ALL_CONSUMER);
      const returned = ids(res.body.courts);
      for (const other of [
        'nclt_principal_delhi',
        'nclt_mumbai',
        'patna_hc',
        'delhi_hc',
        'bihar_sessions_patna',
        'delhi_saket',
        'inactive_consumer',
      ]) {
        expect(returned).not.toContain(other);
      }
    });

    it("no level with a state narrows to that state's Commissions", async () => {
      const res = await request(app).get('/courts?template=consumer_complaint&state=delhi');
      expect(ids(res.body.courts)).toEqual(['delhi_dccdrc', 'dl_state_consumer_delhi']);
    });

    it('ignores `type` in consumer mode', async () => {
      const base = await request(app).get('/courts?template=consumer_complaint');
      for (const type of ['high_court', 'sessions', 'tribunal', 'bogus']) {
        const res = await request(app).get(`/courts?template=consumer_complaint&type=${type}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(base.body);
      }
    });

    it('returns courts sorted by name', async () => {
      const res = await request(app).get('/courts?template=consumer_complaint');
      const names = res.body.courts.map((c: { name: string }) => c.name);
      expect(names).toEqual([...names].sort());
    });

    it('returns 400 for a bad level', async () => {
      const res = await request(app).get('/courts?template=consumer_complaint&level=tehsil');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'level must be one of district|state|national' });
    });

    it('returns 400 for a bad level on /types and /states too', async () => {
      const t = await request(app).get(
        '/courts/types?state=bihar&template=consumer_complaint&level=nope',
      );
      const s = await request(app).get('/courts/states?template=consumer_complaint&level=nope');
      expect(t.status).toBe(400);
      expect(s.status).toBe(400);
    });
  });

  // ── /types and /states in consumer mode ─────────────────────────────────────

  describe('GET /courts/types in consumer mode', () => {
    it('level=national gives the tribunal type without a state', async () => {
      const res = await request(app).get(
        '/courts/types?template=consumer_complaint&level=national',
      );
      expect(res.status).toBe(200);
      expect(res.body.types).toEqual([{ id: 'tribunal', label: 'tribunal' }]);
    });

    it('a state with district level gives only consumer_commission', async () => {
      const res = await request(app).get(
        '/courts/types?state=bihar&template=consumer_complaint&level=district',
      );
      expect(res.body.types).toEqual([{ id: 'consumer_commission', label: 'consumer_commission' }]);
    });

    it('does not leak high_court or sessions for a state', async () => {
      const res = await request(app).get('/courts/types?state=bihar&template=consumer_complaint');
      const typeIds = res.body.types.map((t: { id: string }) => t.id);
      expect(typeIds).toEqual(['consumer_commission']);
    });

    it('still 400s with no state and no national level', async () => {
      const a = await request(app).get('/courts/types?template=consumer_complaint');
      const b = await request(app).get('/courts/types?template=consumer_complaint&level=state');
      expect(a.status).toBe(400);
      expect(b.status).toBe(400);
    });
  });

  describe('GET /courts/states in consumer mode', () => {
    it('lists only states that have a Commission (plus India for NCDRC), none for HC/sessions only', async () => {
      const res = await request(app).get('/courts/states?template=consumer_complaint');
      const stateIds = res.body.states.map((s: { id: string }) => s.id).sort();
      expect(stateIds).toEqual(['bihar', 'delhi', 'india']);
    });

    it('level=state returns only states with a State Commission', async () => {
      await Court.collection.deleteMany({ courtId: 'bihar_state_consumer_patna' });
      const res = await request(app).get('/courts/states?template=consumer_complaint&level=state');
      expect(res.body.states.map((s: { id: string }) => s.id)).toEqual(['delhi']);
    });

    it('level=district returns the states with District Commissions', async () => {
      const res = await request(app).get(
        '/courts/states?template=consumer_complaint&level=district',
      );
      expect(res.body.states.map((s: { id: string }) => s.id).sort()).toEqual(['bihar', 'delhi']);
    });

    it('level=national returns India only', async () => {
      const res = await request(app).get(
        '/courts/states?template=consumer_complaint&level=national',
      );
      expect(res.body.states).toEqual([{ id: 'india', name: 'India' }]);
    });
  });

  // ── AC2 / AC4: everything else is unchanged ─────────────────────────────────

  describe('templates that do not narrow the list', () => {
    const paths = ['/courts', '/courts?state=bihar', '/courts?state=bihar&type=sessions'];

    it.each(paths)(
      '%s: bail_regular, unknown, duplicated and level-only match baseline',
      async (p) => {
        const sep = p.includes('?') ? '&' : '?';
        const base = await request(app).get(p);
        expect(base.status).toBe(200);
        const variants = [
          `${p}${sep}template=bail_regular`,
          `${p}${sep}template=bail_regular&level=national`,
          `${p}${sep}template=no_such_template`,
          `${p}${sep}template=consumer_complaint&template=consumer_complaint`,
          `${p}${sep}template=`,
          `${p}${sep}level=national`,
        ];
        for (const v of variants) {
          const res = await request(app).get(v);
          expect(res.status).toBe(200);
          expect(res.body).toEqual(base.body);
        }
      },
    );

    it('baseline still contains the non-consumer courts and keeps field set and order', async () => {
      const base = await request(app).get('/courts');
      const returned = base.body.courts.map((c: CourtRow) => c.courtId);
      expect(returned).toEqual(expect.arrayContaining(['patna_hc', 'delhi_saket', 'nclt_mumbai']));
      expect(returned).not.toContain('inactive_consumer');
      const withTemplate = await request(app).get('/courts?template=bail_regular');
      expect(withTemplate.body.courts.map((c: CourtRow) => c.courtId)).toEqual(returned);
      expect(Object.keys(withTemplate.body.courts[0]).sort()).toEqual(
        Object.keys(base.body.courts[0]).sort(),
      );
    });

    it('/types and /states match baseline for bail_regular, unknown and duplicated template', async () => {
      const baseTypes = await request(app).get('/courts/types?state=bihar');
      const baseStates = await request(app).get('/courts/states');
      for (const q of [
        'template=bail_regular',
        'template=zzz',
        'template=consumer_complaint&template=consumer_complaint',
      ]) {
        const t = await request(app).get(`/courts/types?state=bihar&${q}`);
        const s = await request(app).get(`/courts/states?${q}`);
        expect(t.body).toEqual(baseTypes.body);
        expect(s.body).toEqual(baseStates.body);
      }
      const noState = await request(app).get('/courts/types?template=bail_regular&level=national');
      expect(noState.status).toBe(400);
    });
  });

  // ── AC4: no auto-select, no leak ────────────────────────────────────────────

  describe('response hygiene', () => {
    const urls = [
      '/courts?template=consumer_complaint',
      '/courts?template=consumer_complaint&level=national',
      '/courts?template=consumer_complaint&level=district&state=bihar',
      '/courts?template=consumer_complaint&level=state&state=delhi',
      '/courts?template=bail_regular',
      '/courts',
      '/courts/types?state=bihar&template=consumer_complaint',
      '/courts/states?template=consumer_complaint',
    ];

    it.each(urls)('%s: no formattingRulesRef and no default/selected field', async (u) => {
      const res = await request(app).get(u);
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('formattingRulesRef');
      expect(text).not.toMatch(/"(default|selected|isDefault|preselect\w*|autoSelect\w*)"/i);
      expect(Object.keys(res.body)).toHaveLength(1);
    });

    it('a single-result level does not add a default marker', async () => {
      const res = await request(app).get('/courts?template=consumer_complaint&level=national');
      expect(res.body.courts).toHaveLength(1);
      expect(Object.keys(res.body)).toEqual(['courts']);
      expect(Object.keys(res.body.courts[0]).sort()).toEqual(
        [
          '_id',
          'caseNomenclature',
          'city',
          'courtId',
          'courtType',
          'designation',
          'name',
          'state',
          'stateId',
          'supportedLanguages',
        ].sort(),
      );
    });
  });
});
