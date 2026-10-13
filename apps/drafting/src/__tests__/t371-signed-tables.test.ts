/**
 * T-371 (ADR-025 D2) - the legal tables are served from the signed files in memory.
 *
 * Legal content: Ajay's signed texts are the source. The constants below are written out
 * as literals from handoff/legal/T-371-verify-caveat-signed.md, T-361 Addendum 1 and T-360,
 * and compared with the exported constants byte for byte.
 *
 * No Mongo and no Redis here: the SectionMapping model is spied to throw on any read, and
 * the Redis client records any command. Neither may be touched on the read path (AC2).
 */
import './setupEnv';
// Mongo is connected only for preflight (it reads other collections). SectionMapping is
// spied to throw, so the section tables are proven off Mongo.
import './setupDb';

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import request from 'supertest';

// Redis is recorded, never used. Any command on the read path fails AC2.
const redisCalls: string[] = [];
jest.mock('../config/redis', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, prop) => {
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'on' || prop === 'status') {
        return undefined;
      }
      return (...args: unknown[]) => {
        redisCalls.push(`${String(prop)}(${args.join(',')})`);
        return Promise.resolve(null);
      };
    },
  };
  const redis = new Proxy({}, handler);
  return { __esModule: true, default: redis, disconnectRedis: async () => undefined };
});

import app from '../app';
import { CONVERT_MAX_CHARS } from '../routes/sections.routes';
import { SectionMapping } from '../models/SectionMapping.model';
import { checkBailEligibility, readBailInputs } from '../services/bail-check.service';
import {
  ATTRIBUTE_DEPENDS,
  BNS_LAST_SECTION,
  BNS_OFFENCE_KEYS,
  getOffenceRow,
  MOST_SERIOUS_CANNOT_BE_DETERMINED,
  NOT_AN_OFFENCE,
  NOT_VERIFIED,
  resolveOffence,
  showsVerifyCaveat,
  VERIFY_CAVEAT,
} from '../services/bns-offence-resolver';
import { preflightCheck } from '../services/preflight.service';
import {
  ADD_THE_CODE,
  convertOldReferencesInText,
  convertReferencesForTool,
  getSectionDetail,
  mapNewForTool,
  mapOldForTool,
  mapQueryForTool,
  readToolSections,
} from '../services/sections.service';
import { SIGNED_TABLE_FILES } from '../services/signed-tables';

// ── Ajay's texts, as literals from the signed files ──────────────────────────

const SIGNED_NOT_VERIFIED = 'Not verified — check the Gazette';
const SIGNED_CAVEAT =
  'The BNSS First Schedule does not classify this section in one simple line. Check it for your case before relying on this result.';
const SIGNED_ATTRIBUTE_DEPENDS =
  'Depends on the sub-section or the offence — see the BNSS First Schedule.';
const SIGNED_MOST_SERIOUS =
  'The most serious offence cannot be worked out from these sections. Check the BNSS First Schedule.';
const SIGNED_ADD_THE_CODE =
  'Enter a section number and its code, for example IPC 302 or BNS 103(1).';
const SIGNED_NOT_AN_OFFENCE = 'This section does not create an offence. Check the Gazette.';

const CONFIG = path.join(__dirname, '..', 'config');
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(CONFIG, f), 'utf-8'));

const offences = readJson('bns-offences.json').offences as Record<
  string,
  { verify?: string; max_years: number | null }
>;
const VERIFY_KEYS = Object.keys(offences).filter((k) => offences[k].verify !== undefined);

/** Every internal `verify` string in the signed files. None may reach a response. */
const RAW_VERIFY: string[] = [
  ...VERIFY_KEYS.map((k) => offences[k].verify as string),
  ...Object.values(
    readJson('sections/ipc-to-bns.json').mappings as Record<string, { verify?: string }>,
  )
    .map((m) => m.verify)
    .filter((v): v is string => typeof v === 'string'),
];

function expectNoRawVerify(body: unknown): void {
  const text = JSON.stringify(body);
  for (const v of RAW_VERIFY) expect(text).not.toContain(v.slice(0, 60));
  expect(text).not.toContain('"verify"');
}

beforeEach(() => {
  redisCalls.length = 0;
});

// ── AC1: files loaded, served from memory, SHA in /health ────────────────────

describe('T-371 AC1: signed files load at boot and /health shows their SHA-256', () => {
  const FILES = Object.values(SIGNED_TABLE_FILES);

  it('serves exactly the five signed files', () => {
    expect([...FILES].sort()).toEqual(
      [
        'sections/ipc-to-bns.json',
        'sections/crpc-to-bnss.json',
        'sections/iea-to-bsa.json',
        'bns-offences.json',
        'bns-triable-by.json',
      ].sort(),
    );
  });

  it("GET /health signedTables equals the sha256 of each file's bytes", async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(Object.keys(res.body.signedTables).sort()).toEqual([...FILES].sort());
    for (const f of FILES) {
      const sha = createHash('sha256')
        .update(fs.readFileSync(path.join(CONFIG, f)))
        .digest('hex');
      expect(res.body.signedTables[f]).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.signedTables[f]).toBe(sha);
    }
  });
});

describe('T-371 AC1: the loader fails fast on a missing file (unit level, real config untouched)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('fs');
  });

  it('loadSignedTables throws naming the file when one signed file is missing', () => {
    jest.resetModules();
    jest.doMock('fs', () => {
      const real = jest.requireActual('fs') as typeof import('fs');
      return {
        ...real,
        readFileSync: (p: unknown, ...rest: unknown[]) => {
          if (String(p).endsWith(path.join('sections', 'crpc-to-bnss.json'))) {
            const err = new Error("ENOENT: no such file or directory, open '" + String(p) + "'");
            (err as NodeJS.ErrnoException).code = 'ENOENT';
            throw err;
          }
          return (real.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
        },
      };
    });
    const mod = jest.requireActual<typeof import('../services/signed-tables')>(
      '../services/signed-tables',
    );
    expect(() => mod.loadSignedTables()).toThrow(/crpc-to-bnss\.json/);
    expect(() => mod.getSignedTables()).toThrow();
  });

  it('loadSignedTables throws on a file that is not valid JSON', () => {
    jest.resetModules();
    jest.doMock('fs', () => {
      const real = jest.requireActual('fs') as typeof import('fs');
      return {
        ...real,
        readFileSync: (p: unknown, ...rest: unknown[]) =>
          String(p).endsWith('bns-triable-by.json')
            ? Buffer.from('{ not json')
            : (real.readFileSync as (...a: unknown[]) => unknown)(p, ...rest),
      };
    });
    const mod = jest.requireActual<typeof import('../services/signed-tables')>(
      '../services/signed-tables',
    );
    expect(() => mod.loadSignedTables()).toThrow(/bns-triable-by\.json/);
  });
});

// ── AC2: Mongo and Redis are off the read path ───────────────────────────────

describe('T-371 AC2: no Mongo and no Redis on the read path', () => {
  const spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    for (const m of ['find', 'findOne', 'countDocuments', 'aggregate', 'distinct'] as const) {
      spies.push(
        jest.spyOn(SectionMapping, m as 'find').mockImplementation((() => {
          throw new Error(`SectionMapping.${m} must not be read (T-371)`);
        }) as never),
      );
    }
  });
  afterEach(() => {
    spies.splice(0).forEach((s) => s.mockRestore());
  });

  it('every lookup works with SectionMapping unreadable (an empty or absent collection)', async () => {
    expect((await request(app).get('/sections/map?old=302-IPC')).body.result.new_section).toBe(
      '103(1)',
    );
    expect((await request(app).get('/sections/map?new=173-BNSS')).status).toBe(200);
    expect((await request(app).get('/sections/map?q=CrPC 362')).body.result.new_section).toBe(
      '403',
    );
    expect((await request(app).get('/sections/all/IPC')).body.total_mapped).toBeGreaterThan(400);
    expect((await request(app).get('/sections/codes')).body.codes).toHaveLength(3);
    expect(
      (await request(app).get('/sections/search?q=murder&code=BNS')).body.results.length,
    ).toBeGreaterThan(0);
    expect((await request(app).get('/sections/details?section=103&code=BNS')).status).toBe(200);
    expect((await request(app).get('/sections/bail-check?sections=BNS 103')).status).toBe(200);
    expect((await request(app).post('/sections/convert').send({ text: '420 IPC' })).status).toBe(
      200,
    );
    expect(
      (await request(app).get('/sections/timeline?arrestDate=2026-09-01&sections=BNS 103')).status,
    ).toBe(200);
    expect((await convertOldReferencesInText('Section 302 IPC')).conversions).toHaveLength(1);
    expect(redisCalls).toEqual([]);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

// ── Constants match the signed files byte for byte ───────────────────────────

describe("T-371 AC5: Ajay's texts are exported exactly", () => {
  it('constants equal the signed literals', () => {
    expect(NOT_VERIFIED).toBe(SIGNED_NOT_VERIFIED);
    expect(VERIFY_CAVEAT).toBe(SIGNED_CAVEAT);
    expect(ATTRIBUTE_DEPENDS).toBe(SIGNED_ATTRIBUTE_DEPENDS);
    expect(MOST_SERIOUS_CANNOT_BE_DETERMINED).toBe(SIGNED_MOST_SERIOUS);
    expect(ADD_THE_CODE).toBe(SIGNED_ADD_THE_CODE);
    expect(NOT_AN_OFFENCE).toBe(SIGNED_NOT_AN_OFFENCE);
    expect(BNS_LAST_SECTION).toBe(358);
  });

  it('the signed file on origin/develop_staging, when present in the worktree, carries the same text', () => {
    const f = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'handoff',
      'legal',
      'T-371-verify-caveat-signed.md',
    );
    if (!fs.existsSync(f)) return; // lives on origin/develop_staging; checked by the lead
    const md = fs.readFileSync(f, 'utf-8');
    for (const t of [
      SIGNED_CAVEAT,
      SIGNED_ATTRIBUTE_DEPENDS,
      SIGNED_NOT_VERIFIED,
      SIGNED_MOST_SERIOUS,
      SIGNED_ADD_THE_CODE,
    ]) {
      expect(md).toContain(t);
    }
  });
});

// ── T-360 / CrPC mapping served from the signed file ─────────────────────────

describe('T-371 AC7: CrPC 362 -> 403 and 358 -> 399, from the signed file', () => {
  it.each([
    ['362', '403'],
    ['358', '399'],
    ['359', '400'],
    ['361', '402'],
  ])('CrPC %s -> BNSS %s (never one lower)', async (old, bnss) => {
    const res = await request(app).get(`/sections/map?old=${old}-CrPC`);
    expect(res.status).toBe(200);
    expect(res.body.result.new_section).toBe(bnss);
    expect(mapOldForTool(old, 'CrPC')?.new_section).toBe(bnss);
    const q = await request(app).get(`/sections/map?q=${encodeURIComponent(`CrPC ${old}`)}`);
    expect(q.body.result.new_section).toBe(bnss);
  });

  it('BNSS 398 has no CrPC equivalent: no CrPC lookup returns it', () => {
    const t = readJson('sections/crpc-to-bnss.json').mappings as Record<
      string,
      { new: string | null }
    >;
    expect(Object.values(t).filter((m) => m.new === '398')).toHaveLength(0);
    expect(mapOldForTool('362', 'CrPC')?.new_section).not.toBe('398');
  });
});

// ── AC3: every tool reads with the same reader ───────────────────────────────

describe('T-371 AC3: "BNS 318(4), BNS 316(2)" and "318(4), 316(2)" give the same result', () => {
  it('readToolSections reads both forms as the same two sections (code aside)', () => {
    expect(readToolSections('BNS 318(4), BNS 316(2)')).toEqual([
      { code: 'BNS', number: '318(4)' },
      { code: 'BNS', number: '316(2)' },
    ]);
    expect(readToolSections('318(4), 316(2)').map((e) => e.number)).toEqual(['318(4)', '316(2)']);
    // The tokens differ by design ("318(4)-BNS" keeps the explicit code); the RESULTS agree.
    expect(readBailInputs('BNS 318(4), BNS 316(2)')).toEqual(['318(4)-BNS', '316(2)-BNS']);
    expect(readBailInputs('318(4), 316(2)')).toEqual(['318(4)', '316(2)']);
  });

  it('checker results (sections found, titles, offence keys) agree for both forms', async () => {
    const a = await checkBailEligibility(readBailInputs('BNS 318(4), BNS 316(2)'));
    const b = await checkBailEligibility(readBailInputs('318(4), 316(2)'));
    const view = (r: Awaited<ReturnType<typeof checkBailEligibility>>) =>
      r.sections.map((s) => ({
        found: s.found,
        bns: s.bnsSection,
        title: s.offence?.title,
        key: s.offence?.resolvedKey,
      }));
    expect(view(a)).toEqual(view(b));
    expect(a.sections.every((s) => s.found)).toBe(true);
  });

  it('bail checker: both forms are found as offences and agree', async () => {
    const a = await request(app).get('/sections/bail-check?sections=BNS 318(4), BNS 316(2)');
    const b = await request(app).get('/sections/bail-check?sections=318(4), 316(2)');
    expect(a.status).toBe(200);
    expect(a.body.sections).toHaveLength(2);
    for (const s of a.body.sections) {
      expect(s.found).toBe(true);
      expect(s.offence).not.toBeNull();
      expect(s.note).toBeUndefined();
    }
    expect(a.body.sections.map((s: { bnsSection: string }) => s.bnsSection)).toEqual([
      '318(4)',
      '316(2)',
    ]);
    expect(a.body.summary).toEqual(b.body.summary);
    expect(a.body.sections.map((s: { offence: unknown }) => s.offence)).toEqual(
      b.body.sections.map((s: { offence: unknown }) => s.offence),
    );
  });

  it('timeline: both forms are used, none left out, same period', async () => {
    const get = (s: string) =>
      request(app).get(
        `/sections/timeline?arrestDate=2026-09-01&sections=${encodeURIComponent(s)}`,
      );
    const a = await get('BNS 318(4), BNS 316(2)');
    const b = await get('318(4), 316(2)');
    expect(a.status).toBe(200);
    expect(a.body.sectionsNotFound).toEqual([]);
    expect(b.body.sectionsNotFound).toEqual([]);
    expect(a.body.sectionsUsed.length + a.body.sectionsWithoutPeriod.length).toBe(2);
    expect(a.body.judicialCustodyDays).toBe(b.body.judicialCustodyDays);
    expect(a.body.periodNote).toBe(b.body.periodNote);
  });

  it('timeline: a list with "IPC 420" is read as IPC and left out as old-law, not as BNS 420', async () => {
    const res = await request(app).get(
      `/sections/timeline?arrestDate=2026-09-01&sections=${encodeURIComponent('BNS 103, IPC 420')}`,
    );
    expect(res.body.sectionsNotFound).toEqual(['IPC 420']);
  });

  it('preflight: "BNS 318(4), BNS 316(2)" passes the section checks (both are offences)', async () => {
    const base = {
      court_name: 'patna_hc',
      applicant_name: 'Ramesh Kumar',
      father_name: 'Suresh Kumar',
      respondent_name: 'State of Bihar',
      applicant_age: 35,
      fir_number: '091/2024',
      fir_date: '15.06.2024',
      incident_date: '10.06.2024',
      facts_narrative:
        'The petitioner was falsely implicated in the FIR. At the time of the alleged incident, the petitioner was at his residence in Patna. The victim was injured but received timely medical treatment and is now recovering.',
    };
    const r = await preflightCheck('bail_anticipatory', {
      ...base,
      sections_charged: 'BNS 318(4), BNS 316(2)',
    });
    const hits = r._meta?.rule_hits ?? [];
    expect(hits).not.toContain('section_whitelist');
    expect(hits).not.toContain('section_no_code');
    expect(hits).not.toContain('old_law_section');
  });

  it('single converter: "BNS 318(4)" and "BNS 316(2)" both resolve; a bare reverse lookup agrees', () => {
    for (const s of ['318(4)', '316(2)']) {
      const r = mapNewForTool(s, 'BNS');
      expect(r?.[0].found).toBe(true);
      expect(mapQueryForTool(`BNS ${s}`)).toEqual({ direction: 'new_to_old', results: r });
    }
  });
});

// ── AC4: null max_years left out of "most serious" ───────────────────────────

describe('T-371 AC4: a null max_years is left out of "most serious"', () => {
  it('rows 47, 48 and 63 have no maximum in the signed table', () => {
    for (const k of ['47', '48', '63']) expect(offences[k].max_years).toBeNull();
  });

  it('a null-max section never outranks a known one, whatever the order', async () => {
    for (const input of [
      ['63', '318(4)'],
      ['318(4)', '63'],
      ['47', '115'],
    ]) {
      const { summary } = await checkBailEligibility(input);
      expect(summary.mostSeriousSection).not.toBe('63');
      expect(summary.mostSeriousSection).not.toBe('47');
      expect(summary.mostSeriousNote).toBeNull();
    }
    expect((await checkBailEligibility(['63', '318(4)'])).summary.mostSeriousSection).toBe(
      '318(4)',
    );
    expect((await checkBailEligibility(['103', '63'])).summary.mostSeriousSection).toBe('103');
  });

  it('if all are null: mostSeriousSection is null and the text is the signed line', async () => {
    const { summary } = await checkBailEligibility(['63', '47', '48']);
    expect(summary.mostSeriousSection).toBeNull();
    expect(summary.maxPunishment).toBe(SIGNED_MOST_SERIOUS);
    expect(summary.mostSeriousNote).toBe(SIGNED_MOST_SERIOUS);
    const res = await request(app).get('/sections/bail-check?sections=BNS 63, BNS 47');
    expect(res.body.summary.mostSeriousSection).toBeNull();
    expect(res.body.summary.mostSeriousNote).toBe(SIGNED_MOST_SERIOUS);
  });
});

// ── AC5: Ajay's rules ────────────────────────────────────────────────────────

describe('T-371 AC5: Not verified only for converter misses and BNS above 358', () => {
  it('IPC 236, 254, 292A, 376DA (unverified, null target) read Not verified in the converter', () => {
    for (const s of ['236', '254', '292A', '376DA']) {
      const r = mapOldForTool(s, 'IPC');
      expect(r?.not_verified).toBe(true);
      expect(r?.label).toBe(SIGNED_NOT_VERIFIED);
      expect(r?.new_section).toBeNull();
    }
  });

  it('an unknown row gives Not verified in the converter (200, found false)', async () => {
    const res = await request(app).get('/sections/map?old=999-IPC');
    expect(res.status).toBe(200);
    expect(res.body.result.found).toBe(false);
    expect(res.body.result.label).toBe(SIGNED_NOT_VERIFIED);
    expect(res.body.result.new_section).toBeNull();
  });

  it('/map?q= for an unknown section answers 200, found:false, Not verified', async () => {
    const res = await request(app).get('/sections/map?q=999 IPC');
    expect(res.status).toBe(200);
    expect(res.body.result.found).toBe(false);
    expect(res.body.result.label).toBe(SIGNED_NOT_VERIFIED);
  });

  it('an unknown code still gets 404 (?old=) and the hint on ?q= with no code', async () => {
    expect((await request(app).get('/sections/map?old=302-XYZ')).status).toBe(404);
    expect((await request(app).get('/sections/map?new=103-XYZ')).status).toBe(404);
    const q = await request(app).get('/sections/map?q=302');
    expect(q.status).toBe(400);
    expect(q.body.error).toBe(SIGNED_ADD_THE_CODE);
  });

  it('/details: a missing old-law section carries the Not verified label', async () => {
    const d = await getSectionDetail('999', 'IPC');
    expect(d?.label).toBe(SIGNED_NOT_VERIFIED);
    const known = await getSectionDetail('302', 'IPC');
    expect(known?.label).toBeNull();
  });

  it('bail checker: BNS above 358 is Not verified', async () => {
    for (const s of ['400', '512(1)', '359']) {
      const { sections } = await checkBailEligibility([`${s}-BNS`]);
      expect(sections[0].found).toBe(false);
      expect(sections[0].note).toBe(SIGNED_NOT_VERIFIED);
    }
  });

  it('bail checker: BNS 1-358 with no row and no parent keeps NOT_AN_OFFENCE (330(1), 114)', async () => {
    for (const s of ['330(1)', '114', '358']) {
      expect(getOffenceRow(s)).toBeUndefined();
      const { sections } = await checkBailEligibility([`${s}-BNS`]);
      expect(sections[0].found).toBe(false);
      expect(sections[0].note).toBe(SIGNED_NOT_AN_OFFENCE);
    }
    // 400 is Not verified; 330(1) / 114 are not.
    expect((await checkBailEligibility(['400-BNS'])).sections[0].note).not.toBe(
      SIGNED_NOT_AN_OFFENCE,
    );
  });

  it('bail checker: an IPC section with no row or an unverified row is Not verified; a repealed row is not', async () => {
    for (const s of ['999-IPC', '236-IPC', '376DA-IPC']) {
      expect((await checkBailEligibility([s])).sections[0].note).toBe(SIGNED_NOT_VERIFIED);
    }
    const repealed = (await checkBailEligibility(['377-IPC'])).sections[0];
    expect(repealed.note).toBe('No BNS equivalent. Check the Gazette');
    expect(repealed.note).not.toBe(SIGNED_NOT_VERIFIED);
  });

  it('repealed rows keep the repealed badge in the converter', () => {
    const r = mapOldForTool('377', 'IPC');
    expect(r?.label).toBe('Repealed — no equivalent');
    expect(r?.not_verified).toBe(false);
    expect(r?.new_section).toBeNull();
  });

  it('triable-by keeps its signed T-289 value', async () => {
    const { sections } = await checkBailEligibility(['103', '74']);
    expect(sections[0].offence?.triableBy).toBe('Court of Session');
    expect(sections[1].offence?.triableBy).toBe('Any Magistrate');
    const d = await request(app).get('/sections/details?section=103&code=BNS');
    expect(d.body.triable_by).toBe('Court of Session');
  });
});

describe('T-371 AC5: VERIFY_CAVEAT on all verify-flagged rows, once per section', () => {
  it('the signed table has 84 verify-flagged rows (44 with a null max_years)', () => {
    expect(VERIFY_KEYS).toHaveLength(84);
    expect(VERIFY_KEYS.filter((k) => offences[k].max_years === null)).toHaveLength(44);
  });

  it('showsVerifyCaveat is true for each of the 84 and false for the others', () => {
    for (const k of BNS_OFFENCE_KEYS) {
      expect(showsVerifyCaveat(resolveOffence(k))).toBe(offences[k].verify !== undefined);
    }
  });

  it('the bail checker shows the exact caveat on each of the 84, and on no other row', async () => {
    for (const k of BNS_OFFENCE_KEYS) {
      const { sections } = await checkBailEligibility([`${k}-BNS`]);
      const caveat = sections[0].offence?.caveat;
      if (offences[k].verify !== undefined) expect(caveat).toBe(SIGNED_CAVEAT);
      else expect(caveat).toBeUndefined();
    }
  });

  it('shown once per section in the bail checker response', async () => {
    const res = await request(app).get('/sections/bail-check?sections=BNS 63, BNS 303');
    const text = JSON.stringify(res.body);
    expect(text.split(SIGNED_CAVEAT).length - 1).toBe(2);
    for (const s of res.body.sections) {
      expect(JSON.stringify(s).split(SIGNED_CAVEAT).length - 1).toBe(1);
    }
  });

  it('/details shows the caveat for a flagged row and null for an unflagged one', async () => {
    expect((await getSectionDetail('63', 'BNS'))?.caveat).toBe(SIGNED_CAVEAT);
    expect((await getSectionDetail('103', 'BNS'))?.caveat).toBeNull();
  });

  it('the converter shows the caveat once per section (single and bulk)', async () => {
    // First IPC row whose BNS target is verify-flagged, from the signed files.
    const ipc = readJson('sections/ipc-to-bns.json').mappings as Record<
      string,
      { new: string | null }
    >;
    const hit =
      Object.entries(ipc).find(
        ([, m]) => m.new && showsVerifyCaveat(resolveOffence(m.new)) && !/\(/.test(m.new),
      ) ?? Object.entries(ipc).find(([, m]) => m.new && showsVerifyCaveat(resolveOffence(m.new)));
    expect(hit).toBeDefined();
    const [oldSection] = hit as [string, unknown];
    const single = await request(app).get(`/sections/map?old=${oldSection}-IPC`);
    expect(single.body.result.caveat).toBe(SIGNED_CAVEAT);
    const bulk = await request(app)
      .post('/sections/convert')
      .send({ text: `${oldSection} IPC` });
    expect(bulk.body.references).toHaveLength(1);
    expect(bulk.body.references[0].caveat).toBe(SIGNED_CAVEAT);
    expect(JSON.stringify(bulk.body.references[0]).split(SIGNED_CAVEAT).length - 1).toBe(1);
  });
});

describe('T-371 AC5: ATTRIBUTE_DEPENDS replaces a null attribute (the caveat shows too)', () => {
  it('BNS 303: null bailable and cognizable', async () => {
    const { sections } = await checkBailEligibility(['303']);
    const o = sections[0].offence;
    expect(o?.bailable).toBeNull();
    expect(o?.bailableNote).toBe(SIGNED_ATTRIBUTE_DEPENDS);
    expect(o?.cognizableNote).toBe(SIGNED_ATTRIBUTE_DEPENDS);
    expect(o?.caveat).toBe(SIGNED_CAVEAT);
  });

  it('BNS 351: null compoundable, in the bail checker and /details', async () => {
    const o = (await checkBailEligibility(['351'])).sections[0].offence;
    expect(o?.compoundable).toBeNull();
    expect(o?.compoundableNote).toBe(SIGNED_ATTRIBUTE_DEPENDS);
    expect(o?.caveat).toBe(SIGNED_CAVEAT);
    const d = await getSectionDetail('351', 'BNS');
    expect(d?.compoundable_note).toBe(SIGNED_ATTRIBUTE_DEPENDS);
    expect(d?.caveat).toBe(SIGNED_CAVEAT);
  });

  it('a known attribute has no note', async () => {
    const o = (await checkBailEligibility(['103'])).sections[0].offence;
    expect(o?.bailableNote).toBeNull();
    expect(o?.cognizableNote).toBeNull();
  });
});

describe('T-371 AC5: the raw verify text is never in any API response', () => {
  it('/details, /bail-check, /map, /convert and /search, for every verify-flagged key', async () => {
    for (const k of VERIFY_KEYS) {
      expectNoRawVerify(
        (await request(app).get(`/sections/details?section=${encodeURIComponent(k)}&code=BNS`))
          .body,
      );
      expectNoRawVerify(
        (await request(app).get(`/sections/bail-check?sections=${encodeURIComponent(`BNS ${k}`)}`))
          .body,
      );
      expectNoRawVerify(
        (await request(app).get(`/sections/map?q=${encodeURIComponent(`BNS ${k}`)}`)).body,
      );
    }
  }, 20000);

  it('/map, /convert and /search for the IPC rows that carry a verify note (236, 254, 292A, 376DA)', async () => {
    for (const s of ['236', '254', '292A', '376DA']) {
      expectNoRawVerify((await request(app).get(`/sections/map?old=${s}-IPC`)).body);
      expectNoRawVerify((await request(app).get(`/sections/map?q=${s} IPC`)).body);
      expectNoRawVerify((await request(app).get(`/sections/details?section=${s}&code=IPC`)).body);
      expectNoRawVerify(
        (
          await request(app)
            .post('/sections/convert')
            .send({ text: `Section ${s} IPC` })
        ).body,
      );
      expectNoRawVerify((await request(app).get(`/sections/search?q=${s}&code=IPC`)).body);
    }
    expectNoRawVerify((await request(app).get('/sections/all/IPC')).body);
  });
});

describe('T-371 AC5: converter hint and reverse lookup of a bare BNS section', () => {
  it('ADD_THE_CODE is exact and the example resolves', () => {
    expect(ADD_THE_CODE).toBe(SIGNED_ADD_THE_CODE);
    expect(mapQueryForTool('IPC 302')).toMatchObject({ direction: 'old_to_new' });
    const r = mapQueryForTool('BNS 103(1)');
    expect('results' in r && r.results[0].found).toBe(true);
  });

  it('"103 BNS" lists the sub-section rows 103(1) and 103(2), each with its own label', async () => {
    const res = await request(app).get('/sections/map?q=103 BNS');
    expect(res.status).toBe(200);
    expect(res.body.direction).toBe('new_to_old');
    const secs = res.body.results.map((r: { new_section: string }) => r.new_section);
    expect(secs).toEqual(expect.arrayContaining(['103(1)', '103(2)']));
    for (const r of res.body.results) {
      expect(r.found).toBe(true);
      expect(r.label).not.toBe(SIGNED_NOT_VERIFIED);
      expect(r).toHaveProperty('label');
    }
    // the same through ?new= and the service
    const n = await request(app).get('/sections/map?new=103-BNS');
    expect(n.body.results.map((r: { new_section: string }) => r.new_section)).toEqual(secs);
  });

  it('Not verified only when no row sits under the section ("999 BNS", "400 BNS")', async () => {
    for (const s of ['999', '400']) {
      const res = await request(app).get(`/sections/map?q=${s} BNS`);
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].found).toBe(false);
      expect(res.body.results[0].label).toBe(SIGNED_NOT_VERIFIED);
    }
  });
});

// ── T-360 items: bulk converter ──────────────────────────────────────────────

describe('T-371 / T-360: POST /convert (convertReferencesForTool)', () => {
  it('"Sections 420, 406 and 120B IPC" converts all three', async () => {
    const res = await request(app)
      .post('/sections/convert')
      .send({ text: 'Charged under Sections 420, 406 and 120B IPC.' });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.references).toHaveLength(3);
    expect(res.body.references.map((r: { new_section: string }) => r.new_section)).toEqual([
      '318(4)',
      '316(2)',
      '61(2)',
    ]);
    for (const n of [
      '318(4) BNS (formerly 420 IPC)',
      '316(2) BNS (formerly 406 IPC)',
      '61(2) BNS (formerly 120B IPC)',
    ]) {
      expect(res.body.converted).toContain(n);
    }
    for (const r of res.body.references) expect(r.converted).toBe(true);
  });

  it('"65B of the Evidence Act" -> 63', () => {
    const r = convertReferencesForTool('Under 65B of the Evidence Act the certificate is needed.');
    expect(r.references).toHaveLength(1);
    expect(r.references[0]).toMatchObject({
      old_code: 'IEA',
      old_section: '65B',
      new_section: '63',
      converted: true,
    });
    expect(r.converted).toContain('Section 63 BSA (formerly 65B IEA)');
  });

  it('labels every reference, including the unconverted ones', () => {
    const r = convertReferencesForTool('Sections 420 and 236 IPC, and Section 377 IPC.');
    const by = Object.fromEntries(r.references.map((x) => [x.old_section, x]));
    expect(by['420'].converted).toBe(true);
    expect(by['236']).toMatchObject({
      converted: false,
      not_verified: true,
      label: SIGNED_NOT_VERIFIED,
    });
    expect(by['377']).toMatchObject({ converted: false, label: 'Repealed — no equivalent' });
    expect(by['236'].new_section).toBeNull();
  });

  it('a reference nothing maps is left in the text and still labelled', () => {
    const r = convertReferencesForTool('Section 999 IPC was cited.');
    expect(r.converted).toBe('Section 999 IPC was cited.');
    expect(r.references).toHaveLength(1);
    expect(r.references[0].label).toBe(SIGNED_NOT_VERIFIED);
  });

  it('parent fallback: CrPC 156(3) -> BNSS 175(3)', async () => {
    const r = mapOldForTool('156(3)', 'CrPC');
    expect(r?.new_section).toBe('175(3)');
    expect(r?.via_parent).toBe('156');
    const res = await request(app).post('/sections/convert').send({ text: 'Section 156(3) CrPC' });
    expect(res.body.references[0].new_section).toBe('175(3)');
    const m = await request(app).get('/sections/map?q=CrPC 156(3)');
    expect(m.body.result.new_section).toBe('175(3)');
  });
});

// ── Arjun's pin: the draft path is unchanged ─────────────────────────────────

describe('T-371 pin: convertOldReferencesInText (the draft path) is unchanged in behaviour', () => {
  it('returns { converted, conversions } only, no references', async () => {
    const r = await convertOldReferencesInText('Section 302 IPC');
    expect(Object.keys(r).sort()).toEqual(['conversions', 'converted']);
    expect(r.conversions).toEqual([
      { original: 'Section 302 IPC', replacement: 'Section 103(1) BNS (formerly 302 IPC)' },
    ]);
    expect(r.converted).toBe('Section 103(1) BNS (formerly 302 IPC)');
  });

  it('"420, 406 and 120B IPC" still converts only 120B (same extraction as before)', async () => {
    const r = await convertOldReferencesInText('420, 406 and 120B IPC');
    expect(r.conversions).toEqual([
      { original: '120B IPC', replacement: 'Section 61(2) BNS (formerly 120B IPC)' },
    ]);
    expect(r.converted).toBe('420, 406 and Section 61(2) BNS (formerly 120B IPC)');
  });

  it('"65B of the Evidence Act" is not read (no code token it knows); an unmapped row stays', async () => {
    expect((await convertOldReferencesInText('65B of the Evidence Act')).conversions).toEqual([]);
    const r = await convertOldReferencesInText('Section 236 IPC and Section 999 IPC');
    expect(r.conversions).toEqual([]);
    expect(r.converted).toBe('Section 236 IPC and Section 999 IPC');
  });

  it('no parent fallback on the draft path: "Section 156(3) CrPC" is looked up as written', async () => {
    const r = await convertOldReferencesInText('Section 156(3) CrPC');
    expect(r.conversions).toEqual([]);
    expect(r.converted).toBe('Section 156(3) CrPC');
  });

  it('a mixed draft sentence converts each match and carries no label or caveat', async () => {
    const r = await convertOldReferencesInText(
      'charged under Section 302 IPC and Section 154 CrPC, and Section 65B IEA',
    );
    expect(r.conversions.map((c) => c.original)).toEqual([
      'Section 302 IPC',
      'Section 154 CrPC',
      'Section 65B IEA',
    ]);
    expect(r.converted).toContain('Section 173 BNSS (formerly 154 CrPC)');
    expect(r.converted).toContain('Section 63 BSA (formerly 65B IEA)');
    expect(r.converted).not.toContain(SIGNED_NOT_VERIFIED);
    expect(r.converted).not.toContain(SIGNED_CAVEAT);
  });
});

// ── Round 3 (Ajay 1363d68 and 6f61d87) ───────────────────────────────────────

const SIGNED_DEPENDS_LINE = 'Depends. Check the First Schedule.';
const SIGNED_NO_BNS = 'No BNS equivalent. Check the Gazette';
const SIGNED_OTHER_ACT_TIMELINE = (n: string) =>
  `Section ${n} of another Act was not found in the BNS offences table, so it was left out of this period. Check the Gazette.`;

describe('T-371 round 3: the summary lines follow their row (Ajay 1363d68)', () => {
  it('"Section 400" (BNS above 358) and "Section IPC 236" read Not verified, as their rows do', async () => {
    const r = await checkBailEligibility(readBailInputs('BNS 400, IPC 236'));
    expect(r.sections.map((s) => s.note)).toEqual([SIGNED_NOT_VERIFIED, SIGNED_NOT_VERIFIED]);
    expect(r.summary.undeterminedSections).toEqual(['400', 'IPC 236']);
    expect(r.summary.recommendation).toContain(`Section 400: ${SIGNED_NOT_VERIFIED}`);
    expect(r.summary.recommendation).toContain(`Section IPC 236: ${SIGNED_NOT_VERIFIED}`);
    expect(r.summary.recommendation).not.toContain(SIGNED_DEPENDS_LINE);
    expect(r.summary.overallBailable).toBeNull();
    expect(r.summary.overallBailableNote).toBe(SIGNED_NOT_VERIFIED);
    expect(r.summary.bnssBailSectionTitle).toBe(SIGNED_NOT_VERIFIED);
  });

  it('a signed row with null bailable keeps "Section 303: Depends. Check the First Schedule."', async () => {
    const r = await checkBailEligibility(['303']);
    expect(r.sections[0].offence?.bailable).toBeNull();
    expect(r.summary.undeterminedSections).toEqual(['303']);
    expect(r.summary.recommendation).toContain(`Section 303: ${SIGNED_DEPENDS_LINE}`);
    expect(r.summary.overallBailableNote).toBe(SIGNED_DEPENDS_LINE);
    expect(r.summary.bnssBailSectionTitle).toBe(SIGNED_DEPENDS_LINE);
  });

  it('a mix: one signed null and one Not verified -> each line follows its row, overall is Depends', async () => {
    const r = await checkBailEligibility(['303', '400-BNS']);
    expect(r.summary.recommendation).toContain(`Section 303: ${SIGNED_DEPENDS_LINE}`);
    expect(r.summary.recommendation).toContain(`Section 400: ${SIGNED_NOT_VERIFIED}`);
    expect(r.summary.overallBailableNote).toBe(SIGNED_DEPENDS_LINE);
    expect(r.summary.bnssBailSectionTitle).toBe(SIGNED_DEPENDS_LINE);
  });

  it('a repealed IPC row: the summary line reads "No BNS equivalent. Check the Gazette", as its row', async () => {
    const r = await checkBailEligibility(['264-IPC']);
    expect(r.sections[0].note).toBe(SIGNED_NO_BNS);
    expect(r.summary.recommendation).toContain(`Section IPC 264: ${SIGNED_NO_BNS}`);
    expect(r.summary.recommendation).not.toContain(SIGNED_DEPENDS_LINE);
    expect(r.summary.overallBailableNote).toBe(SIGNED_NO_BNS);
  });
});

describe('T-371 round 3: an Act the tables do not cover', () => {
  it('"21 NDPS Act" reads "21 of another Act", never "21-OTHER"', () => {
    expect(readBailInputs('21 NDPS Act')).toEqual(['21 of another Act']);
  });

  it('is handled as Not verified, with no internal code shown', async () => {
    const r = await checkBailEligibility(readBailInputs('21 NDPS Act'));
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].found).toBe(false);
    expect(r.sections[0].offence).toBeNull();
    expect(r.sections[0].note).toBe(SIGNED_NOT_VERIFIED);
    expect(r.summary.recommendation).toContain(`Section 21 of another Act: ${SIGNED_NOT_VERIFIED}`);
    expect(JSON.stringify(r)).not.toContain('OTHER');
    expect(r.summary.overallBailableNote).toBe(SIGNED_NOT_VERIFIED);
  });

  it('over the API', async () => {
    const res = await request(app).get(
      `/sections/bail-check?sections=${encodeURIComponent('21 NDPS Act')}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.sections[0].note).toBe(SIGNED_NOT_VERIFIED);
    expect(JSON.stringify(res.body)).not.toContain('-OTHER');
  });
});

describe('T-371 round 3: an explicit BNS code is kept', () => {
  it('readBailInputs keeps the code for BNS, not for a bare number', () => {
    expect(readBailInputs('BNS 302')).toEqual(['302-BNS']);
    expect(readBailInputs('302')).toEqual(['302']);
  });

  it('"BNS 302" is BNS 302, not IPC 302 -> 103(1) murder', async () => {
    const r = await checkBailEligibility(readBailInputs('BNS 302'));
    expect(r.sections[0].bnsSection).toBe('302');
    expect(r.sections[0].convertedFromIpc).toBe(false);
    expect(r.sections[0].ipcSection).toBeUndefined();
    expect(r.sections[0].offence?.section).not.toBe('103(1)');
    expect(r.sections[0].offence?.title ?? '').not.toMatch(/murder/i);
  });

  it('"BNS 400" is Not verified', async () => {
    const r = await checkBailEligibility(readBailInputs('BNS 400'));
    expect(r.sections[0].found).toBe(false);
    expect(r.sections[0].offence).toBeNull();
    expect(r.sections[0].note).toBe(SIGNED_NOT_VERIFIED);
  });

  it('a bare "302" still goes via IPC to 103(1) (murder)', async () => {
    const r = await checkBailEligibility(readBailInputs('302'));
    expect(r.sections[0].convertedFromIpc).toBe(true);
    expect(r.sections[0].ipcSection).toBe('302');
    expect(r.sections[0].bnsSection).toBe('103(1)');
    expect(r.sections[0].offence?.section).toBe('103(1)');
  });

  it('over the API: "BNS 302" and "302" differ', async () => {
    const a = await request(app).get('/sections/bail-check?sections=BNS 302');
    const b = await request(app).get('/sections/bail-check?sections=302');
    expect(a.body.sections[0].bnsSection).toBe('302');
    expect(b.body.sections[0].bnsSection).toBe('103(1)');
  });
});

describe('T-371 round 3: POST /sections/convert caps the text at 20,000 characters', () => {
  const TOO_LONG = 'Text is too long. Paste up to 20,000 characters at a time.';

  it('CONVERT_MAX_CHARS is 20,000', () => {
    expect(CONVERT_MAX_CHARS).toBe(20_000);
  });

  it('20,001 characters -> 413 with the message', async () => {
    const res = await request(app)
      .post('/sections/convert')
      .send({ text: 'a'.repeat(20_001) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe(TOO_LONG);
  });

  it('exactly 20,000 characters is accepted', async () => {
    const res = await request(app)
      .post('/sections/convert')
      .send({ text: 'a'.repeat(20_000) });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

describe('T-371 round 3: timeline, an entry from another Act (Ajay 6f61d87)', () => {
  const get = (s: string) =>
    request(app).get(`/sections/timeline?arrestDate=2026-09-01&sections=${encodeURIComponent(s)}`);

  it('"NDPS Act 20" gives the exact "of another Act" line, number only', async () => {
    const res = await get('NDPS Act 20');
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).toContain(SIGNED_OTHER_ACT_TIMELINE('20'));
    expect(text).not.toContain('NDPS');
  });

  it('a bare "20" keeps the original T-278 line', async () => {
    const res = await get('20');
    const text = JSON.stringify(res.body);
    expect(text).toContain(
      'Section 20 was not found in the BNS offences table, so it was left out of this period. Check the Gazette.',
    );
    expect(text).not.toContain('of another Act');
  });
});
