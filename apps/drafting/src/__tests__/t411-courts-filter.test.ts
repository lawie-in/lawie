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
      '%s: suspension_of_sentence, unknown, duplicated and level-only match baseline',
      async (p) => {
        const sep = p.includes('?') ? '&' : '?';
        const base = await request(app).get(p);
        expect(base.status).toBe(200);
        const variants = [
          `${p}${sep}template=suspension_of_sentence`,
          `${p}${sep}template=suspension_of_sentence&level=national`,
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
      const withTemplate = await request(app).get('/courts?template=suspension_of_sentence');
      expect(withTemplate.body.courts.map((c: CourtRow) => c.courtId)).toEqual(returned);
      expect(Object.keys(withTemplate.body.courts[0]).sort()).toEqual(
        Object.keys(base.body.courts[0]).sort(),
      );
    });

    it('/types and /states match baseline for suspension_of_sentence, unknown and duplicated template', async () => {
      const baseTypes = await request(app).get('/courts/types?state=bihar');
      const baseStates = await request(app).get('/courts/states');
      for (const q of [
        'template=suspension_of_sentence',
        'template=zzz',
        'template=consumer_complaint&template=consumer_complaint',
      ]) {
        const t = await request(app).get(`/courts/types?state=bihar&${q}`);
        const s = await request(app).get(`/courts/states?${q}`);
        expect(t.body).toEqual(baseTypes.body);
        expect(s.body).toEqual(baseStates.body);
      }
      const noState = await request(app).get(
        '/courts/types?template=suspension_of_sentence&level=national',
      );
      expect(noState.status).toBe(400);
    });
  });

  // ── Operator / array payloads in the query string ───────────────────────────

  describe('non-string query payloads (NoSQL injection guard)', () => {
    const T = 'template=consumer_complaint';
    const LEVEL_ERROR = { error: 'level must be one of district|state|national' };

    it.each([
      'state[$ne]=x',
      'state[$eq]=bihar',
      'state[$in][]=bihar',
      'state[$regex]=^bihar',
      'state[]=bihar',
      'state[]=bihar&state[]=delhi',
    ])('/courts: %s is ignored, giving the consumer list unfiltered by state', async (q) => {
      const base = await request(app).get(`/courts?${T}`);
      const res = await request(app).get(`/courts?${T}&${q}`);
      expect(res.status).toBe(200);
      expect(ids(res.body.courts)).toEqual(ALL_CONSUMER);
      expect(res.body).toEqual(base.body);
    });

    it('/courts: an operator state with level=district stays within district commissions', async () => {
      const res = await request(app).get(`/courts?${T}&level=district&state[$ne]=x`);
      expect(res.status).toBe(200);
      expect(ids(res.body.courts)).toEqual(['delhi_dccdrc', ...BIHAR_DISTRICT].sort());
    });

    it('/courts: operator state never widens beyond consumer courts or reveals inactive ones', async () => {
      const res = await request(app).get(`/courts?${T}&state[$ne]=bihar`);
      const returned = ids(res.body.courts);
      expect(returned).not.toContain('inactive_consumer');
      expect(returned).not.toContain('patna_hc');
      expect(returned).not.toContain('nclt_mumbai');
    });

    it.each([
      'level[$in]=national',
      'level[$ne]=x',
      'level=district&level=state',
      'level[]=national',
    ])('/courts: %s returns 400 with the level error', async (q) => {
      const res = await request(app).get(`/courts?${T}&${q}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual(LEVEL_ERROR);
    });

    it.each(['level[$in]=national', 'level=district&level=state'])(
      '/courts/types and /courts/states: %s returns 400 with the level error',
      async (q) => {
        const t = await request(app).get(`/courts/types?state=bihar&${T}&${q}`);
        const s = await request(app).get(`/courts/states?${T}&${q}`);
        expect(t.status).toBe(400);
        expect(t.body).toEqual(LEVEL_ERROR);
        expect(s.status).toBe(400);
        expect(s.body).toEqual(LEVEL_ERROR);
      },
    );

    it.each([
      'template[$ne]=x',
      'template[]=consumer_complaint',
      'template[$in]=consumer_complaint',
    ])('/courts: %s returns the baseline (no-template) result', async (q) => {
      const base = await request(app).get('/courts');
      const res = await request(app).get(`/courts?${q}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(base.body);
      expect(ids(res.body.courts)).toContain('patna_hc');
    });

    it('/courts: an array template does not apply the level check either', async () => {
      const base = await request(app).get('/courts');
      const res = await request(app).get('/courts?template[]=consumer_complaint&level=bogus');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(base.body);
    });

    it('/courts/types: operator or array state is treated as missing (400), or ignored for national', async () => {
      for (const q of ['state[$ne]=x', 'state[]=bihar']) {
        const missing = await request(app).get(`/courts/types?${T}&${q}`);
        expect(missing.status).toBe(400);
        expect(missing.body).toEqual({ error: 'state query parameter is required' });
        const noTemplate = await request(app).get(`/courts/types?${q}`);
        expect(noTemplate.status).toBe(400);
        const national = await request(app).get(`/courts/types?${T}&level=national&${q}`);
        expect(national.status).toBe(200);
        expect(national.body.types).toEqual([{ id: 'tribunal', label: 'tribunal' }]);
      }
    });

    it('/courts/types and /courts/states: operator or array template returns the baseline', async () => {
      const baseTypes = await request(app).get('/courts/types?state=bihar');
      const baseStates = await request(app).get('/courts/states');
      for (const q of ['template[$ne]=x', 'template[]=consumer_complaint']) {
        const t = await request(app).get(`/courts/types?state=bihar&${q}`);
        const s = await request(app).get(`/courts/states?${q}`);
        expect(t.status).toBe(200);
        expect(t.body).toEqual(baseTypes.body);
        expect(s.status).toBe(200);
        expect(s.body).toEqual(baseStates.body);
      }
    });

    it('/courts/states ignores any state param in consumer mode', async () => {
      const base = await request(app).get(`/courts/states?${T}`);
      for (const q of ['state[$ne]=x', 'state[]=bihar']) {
        const res = await request(app).get(`/courts/states?${T}&${q}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(base.body);
      }
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
