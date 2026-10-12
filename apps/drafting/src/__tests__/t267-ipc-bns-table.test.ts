/**
 * T-267 - IPC to BNS table recheck (legal content, Ajay CLO, 12 Oct 2026).
 *
 * AC1: the signed table is applied byte for byte (SHA-256 + the signed markdown block).
 * AC2: packs cite exactly the T-267 target for every IPC section they pair with a BNS number.
 * Rulings A (unverified rows), B (ipc_to_bns copy deleted), C (bail-check null target / not in table)
 * and D (signed pack texts) are each pinned below.
 */
import './setupEnv';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { SectionMapping } from '../models/SectionMapping.model';
import {
  checkBailEligibility,
  NO_BNS_EQUIVALENT,
  NOT_IN_IPC_TABLE,
} from '../services/bail-check.service';

// bail-check reads IPC rows through lookupOldToNew; serve them from the signed table itself.
jest.mock('../services/sections.service', () => {
  const nodeFs = jest.requireActual('fs') as typeof import('fs');
  const nodePath = jest.requireActual('path') as typeof import('path');
  const table = JSON.parse(
    nodeFs.readFileSync(
      nodePath.join(__dirname, '..', 'config', 'sections', 'ipc-to-bns.json'),
      'utf-8',
    ),
  ) as { mappings: Record<string, { new: string | null; type: string; new_title: string | null }> };
  return {
    lookupOldToNew: jest.fn(async (section: string, code: string) => {
      if (code !== 'IPC') return null;
      const row = table.mappings[section];
      if (!row) return null;
      return {
        old_code: 'IPC',
        old_section: section,
        new_code: 'BNS',
        new_section: row.new,
        new_title: row.new_title,
        mapping_type: row.type,
      };
    }),
  };
});

const ROOT = path.join(__dirname, '..', '..'); // apps/drafting
const REPO = path.join(ROOT, '..', '..');
const CONFIG = path.join(ROOT, 'src', 'config');
const TABLE_PATH = path.join(CONFIG, 'sections', 'ipc-to-bns.json');
const SIGNED_MD = path.join(REPO, 'handoff', 'legal', 'T-267-ipc-to-bns-corrected-signed.md');
const TS_NODE = path.join(REPO, 'node_modules', '.bin', 'ts-node');

const SIGNED_SHA = 'c7c8d74a661b304c6fe349e2dad64f1ef6663348746747d5103ca783121dcb78';
const T267_BY =
  'Ajay (CLO) - 2026-10-12 - corrected table (T-267); every row checked against the Gazette headings of the BNS and two comparison tables';
const UNVERIFIED_NOTE = 'Not verified. Check the Gazette before citing a BNS section.';

interface Row {
  new: string | null;
  type: string;
  old_title: string;
  new_title: string | null;
  verify?: string;
}
interface Table {
  meta: { validated_by: string; last_updated: string };
  mappings: Record<string, Row>;
  new_provisions: Record<string, unknown>;
}

const tableRaw = fs.readFileSync(TABLE_PATH);
const table: Table = JSON.parse(tableRaw.toString('utf-8'));

// ---------------------------------------------------------------------------
// AC1 - byte for byte
// ---------------------------------------------------------------------------

describe('T-267 AC1: the signed table is applied byte for byte', () => {
  it('ipc-to-bns.json has the signed SHA-256', () => {
    expect(createHash('sha256').update(tableRaw).digest('hex')).toBe(SIGNED_SHA);
  });

  it('is identical to the json block in the signed markdown', () => {
    const md = fs.readFileSync(SIGNED_MD, 'utf-8');
    const open = md.indexOf('```json\n');
    const close = md.indexOf('\n```', open + 8);
    expect(open).toBeGreaterThan(-1);
    const block = md.slice(open + 8, close) + '\n';
    expect(createHash('sha256').update(block).digest('hex')).toBe(SIGNED_SHA);
    expect(block).toBe(tableRaw.toString('utf-8'));
  });

  it('has 576 mappings and 12 new_provisions', () => {
    expect(Object.keys(table.mappings)).toHaveLength(576);
    expect(Object.keys(table.new_provisions)).toHaveLength(12);
    expect(Object.keys(table.new_provisions).sort()).toEqual(
      [
        '103(2)',
        '106(2)',
        '111',
        '112',
        '113',
        '152',
        '226',
        '304',
        '358',
        '48',
        '69',
        '95',
      ].sort(),
    );
  });

  it('meta carries the T-267 validated_by and 2026-10-12', () => {
    expect(table.meta.validated_by).toBe(T267_BY);
    expect(table.meta.last_updated).toBe('2026-10-12');
  });
});

describe('T-267: pairs Ajay relies on in the signed texts', () => {
  it.each([
    ['34', '3(5)'],
    ['107', '45'],
    ['120A', '61(1)'],
    ['120B', '61(2)'],
    ['302', '103(1)'],
    ['304', '105'],
    ['304A', '106(1)'],
    ['304B', '80'],
    ['307', '109'],
    ['323', '115(2)'],
    ['354A', '75'],
    ['354D', '78'],
    ['375', '63'],
    ['376', '64'],
    ['379', '303(2)'],
    ['392', '309(4)'],
    ['406', '316(2)'],
    ['420', '318(4)'],
    ['498A', '85'],
    ['499', '356(1)'],
    ['509', '79'],
    ['511', '62'],
  ])('IPC %s -> BNS %s', (ipc, bns) => {
    expect(table.mappings[ipc].new).toBe(bns);
  });

  it('124A is repealed with new null (BNS 152 is a new offence, not its successor)', () => {
    expect(table.mappings['124A'].type).toBe('repealed');
    expect(table.mappings['124A'].new).toBeNull();
  });

  it('303 -> 104, 312 -> 88, 377 repealed with null', () => {
    expect(table.mappings['303'].new).toBe('104');
    expect(table.mappings['312'].new).toBe('88');
    expect(table.mappings['377'].new).toBeNull();
    expect(table.mappings['377'].type).toBe('repealed');
  });

  it('exactly IPC 236, 254, 292A, 376DA are unverified, each with new null', () => {
    const unverified = Object.entries(table.mappings)
      .filter(([, r]) => r.type === 'unverified')
      .map(([k]) => k)
      .sort();
    expect(unverified).toEqual(['236', '254', '292A', '376DA']);
    for (const k of unverified) expect(table.mappings[k].new).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ruling B - ipc_to_bns copy deleted
// ---------------------------------------------------------------------------

describe('T-267 ruling B: the ipc_to_bns copy in bns-mapping.json is gone', () => {
  const bns = JSON.parse(fs.readFileSync(path.join(CONFIG, 'bns-mapping.json'), 'utf-8'));
  it('has no ipc_to_bns key and its schema_note does not name it', () => {
    expect(bns).not.toHaveProperty('ipc_to_bns');
    expect(bns._meta.schema_note).not.toContain('ipc_to_bns');
    expect(bns._meta.schema_note).toContain('crpc_to_bnss');
    expect(bns).toHaveProperty('crpc_to_bnss');
  });
});

// ---------------------------------------------------------------------------
// Ruling A - seed (real run)
// ---------------------------------------------------------------------------

describe('T-267 seed-sections.ts (real run)', () => {
  let mongo: MongoMemoryServer;

  const runSeed = (uri: string): Promise<{ code: number | null; out: string }> =>
    new Promise((resolve) => {
      execFile(
        TS_NODE,
        ['--transpile-only', path.join(ROOT, 'src', 'scripts', 'seed-sections.ts')],
        { cwd: ROOT, env: { ...process.env, MONGO_URI: uri, NODE_ENV: 'test' }, timeout: 150_000 },
        (err, stdout, stderr) => resolve({ code: err ? 1 : 0, out: `${stdout}\n${stderr}` }),
      );
    });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    await mongoose.connect(uri);
    await mongoose.connection.syncIndexes();
    const res = await runSeed(uri);
    if (res.code !== 0) throw new Error(`seed failed: ${res.out}`);
  }, 240_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  it('seeds 576 IPC mappings and 12 IPC new provisions', async () => {
    expect(await SectionMapping.countDocuments({ oldCode: 'IPC', isNewProvision: false })).toBe(
      576,
    );
    expect(await SectionMapping.countDocuments({ oldCode: 'IPC', isNewProvision: true })).toBe(12);
  });

  it.each(['236', '254', '292A', '376DA'])(
    'IPC %s seeds as unverified, newSection null, notes exactly the ruling-A sentence',
    async (sec) => {
      const row = await SectionMapping.findOne({
        oldCode: 'IPC',
        oldSection: sec,
        isNewProvision: false,
      });
      expect(row).not.toBeNull();
      expect(row?.mappingType).toBe('unverified');
      expect(row?.newSection).toBeNull();
      expect(row?.notes).toBe(UNVERIFIED_NOTE);
    },
  );

  it('no seeded document contains any `verify` text', async () => {
    const verifyTexts = Object.values(table.mappings)
      .map((r) => r.verify)
      .filter((v): v is string => typeof v === 'string');
    expect(verifyTexts).toHaveLength(4);
    const all = JSON.stringify(await SectionMapping.find({}).lean());
    expect(all).not.toContain('Needs Ajay');
    for (const v of verifyTexts) {
      expect(all).not.toContain(v);
      expect(all).not.toContain(v.slice(0, 40));
    }
    expect(await SectionMapping.countDocuments({ verify: { $exists: true } })).toBe(0);
  });

  it('every IPC row carries the T-267 validatedBy and 2026-10-12', async () => {
    const rows = await SectionMapping.find({ oldCode: 'IPC' });
    expect(rows).toHaveLength(588);
    for (const r of rows) {
      expect(r.validatedBy).toBe(T267_BY);
      expect(r.validatedAt?.getTime()).toBe(new Date('2026-10-12').getTime());
    }
  });

  it('seeds the corrected pairs (302 -> 103(1), 124A null, 377 null, 303 -> 104)', async () => {
    const get = (s: string) =>
      SectionMapping.findOne({ oldCode: 'IPC', oldSection: s, isNewProvision: false });
    expect((await get('302'))?.newSection).toBe('103(1)');
    expect((await get('303'))?.newSection).toBe('104');
    expect((await get('124A'))?.newSection).toBeNull();
    expect((await get('124A'))?.mappingType).toBe('repealed');
    expect((await get('377'))?.newSection).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ruling C - bail-check
// ---------------------------------------------------------------------------

describe('T-267 ruling C: bail-check with the signed table', () => {
  it('exports the two ruling-C sentences exactly', () => {
    expect(NO_BNS_EQUIVALENT).toBe('No BNS equivalent. Check the Gazette');
    expect(NOT_IN_IPC_TABLE).toBe('Not found in the IPC table. Check the Gazette');
  });

  it('264-IPC (null target) is not looked up as BNS 264', async () => {
    const { sections } = await checkBailEligibility(['264-IPC']);
    expect(sections).toHaveLength(1);
    expect(sections[0].found).toBe(false);
    expect(sections[0].offence).toBeNull();
    expect(sections[0].note).toBe('No BNS equivalent. Check the Gazette');
    expect(sections[0].bnsSection).not.toBe('264');
    expect(sections[0].bnsSection).toBe('');
    expect(sections[0].ipcSection).toBe('264');
  });

  it('377-IPC and bare 377 both report no equivalent', async () => {
    for (const input of ['377-IPC', '377']) {
      const { sections } = await checkBailEligibility([input]);
      expect(sections[0].found).toBe(false);
      expect(sections[0].note).toBe('No BNS equivalent. Check the Gazette');
    }
  });

  it('the unverified rows (null target) report no equivalent, never a guessed section', async () => {
    for (const input of [
      '236-IPC',
      '254-IPC',
      '292A-IPC',
      '376DA' /* bare form: 376 > 358, so unambiguously IPC */,
    ]) {
      const { sections } = await checkBailEligibility([input]);
      expect(sections[0].found).toBe(false);
      expect(sections[0].offence).toBeNull();
      expect(sections[0].note).toBe('No BNS equivalent. Check the Gazette');
    }
  });

  // Round 4: the dash regex now allows a two-letter suffix.
  it('376DA-IPC (two-letter suffix) reports no equivalent like the other null rows', async () => {
    const { sections } = await checkBailEligibility(['376DA-IPC']);
    expect(sections[0].found).toBe(false);
    expect(sections[0].note).toBe('No BNS equivalent. Check the Gazette');
  });

  it('376DB-IPC resolves to 70(2) from the table, never treated as BNS 376', async () => {
    const { sections } = await checkBailEligibility(['376DB-IPC']);
    expect(sections[0].bnsSection).toBe('70(2)');
    expect(sections[0].ipcSection).toBe('376DB');
    expect(sections[0].bnsSection).not.toBe('376');
    // T-277: bns-offences has no 70(2) row, so it resolves through its parent row 70
    // (Ajay R2 step 3), which has no variants. It is found, with no note.
    expect(sections[0].found).toBe(true);
    expect(sections[0].offence?.resolution).toBe('parent');
    expect(sections[0].offence?.resolvedKey).toBe('70');
    expect(sections[0].note).toBeUndefined();
  });

  it('999-IPC (no row) says it is not in the IPC table', async () => {
    const { sections } = await checkBailEligibility(['999-IPC']);
    expect(sections[0].found).toBe(false);
    expect(sections[0].note).toBe('Not found in the IPC table. Check the Gazette');
    expect(sections[0].bnsSection).not.toBe('999');
  });

  it('302-IPC resolves to 103(1) and is found, with no note', async () => {
    const { sections, summary } = await checkBailEligibility(['302-IPC']);
    expect(sections[0].bnsSection).toBe('103(1)');
    expect(sections[0].ipcSection).toBe('302');
    expect(sections[0].convertedFromIpc).toBe(true);
    expect(sections[0].found).toBe(true);
    expect(sections[0].note).toBeUndefined();
    // T-277 (R2 step 3, Q4): found through the parent row 103; the parent sets the
    // court level only, never the default-bail period.
    expect(sections[0].offence?.resolution).toBe('parent');
    expect(sections[0].offence?.resolvedKey).toBe('103');
    expect(summary.courtLevel).toBe('Court of Session');
    expect(summary.maxYears).toBeNull();
  });

  it('a bare BNS number with no IPC involvement carries no note', async () => {
    const { sections } = await checkBailEligibility(['103']);
    expect(sections[0].found).toBe(true);
    expect(sections[0].note).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Ruling D + AC2 - packs
// ---------------------------------------------------------------------------

const packFiles = ['document-rules', 'court-rules', 'courts'].flatMap((d) => {
  const dir = path.join(CONFIG, d);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
});

type Json = unknown;
function strings(o: Json, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => strings(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out));
  return out;
}
function objects(o: Json, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) o.forEach((x) => objects(x, out));
  else if (o && typeof o === 'object') {
    out.push(o as Record<string, unknown>);
    Object.values(o).forEach((x) => objects(x, out));
  }
  return out;
}
const readPack = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(CONFIG, 'document-rules', `${name}.json`), 'utf-8'));
const packStrings = (name: string) => strings(readPack(name));
const packHas = (name: string, text: string) => packStrings(name).some((s) => s.includes(text));
const hasEntry = (name: string, number: string, description: string) =>
  objects(readPack(name)).some((o) => o.number === number && o.description === description);

describe('T-267 AC2: every pack line pairing a BNS number with an IPC section cites the table target', () => {
  const NUM = /^(?:S\.|BNS |Section )?\s*(\d+[A-Z]?(?:\([a-z0-9]+\))*)$/;
  const IPC_REF = /IPC\s+(?:Sections?\s+)?(\d+[A-Z]*(?:\s*[/,]\s*\d+[A-Z]*)*)/g;
  // "BNS 318(4) (Cheating, was IPC 420)", "S.80 (dowry death - was IPC 304B)", "S.125 BNS ... (was IPC 336)"
  const PROSE =
    /(?:BNS|S\.|Section)\s*(\d+[A-Z]?(?:\([a-z0-9]+\))*)[^;\n]*?\b(?:was|replaces|successor to|formerly)\s+IPC\s+(?:Sections?\s+)?(\d+[A-Z]*)/g;
  // "IPC 498A = BNS 85"
  const EQ = /IPC\s+(\d+[A-Z]*)\s*=\s*BNS\s*(\d+[A-Z]?(?:\([a-z0-9]+\))*)/g;

  interface Pair {
    file: string;
    ipc: string;
    cited: string;
    where: string;
  }
  const pairs: Pair[] = [];
  const lineOf = (file: string, needle: string): number => {
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    const probe = needle.slice(0, 50).replace(/\n/g, ' ');
    const i = lines.findIndex((l) => l.includes(probe.split(/\\n|\n/)[0]));
    return i + 1;
  };

  for (const file of packFiles) {
    const doc = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const base = path.basename(file);
    for (const o of objects(doc)) {
      if (typeof o.number === 'string' && typeof o.description === 'string') {
        const m = o.number.match(NUM);
        if (!m) continue;
        for (const r of o.description.matchAll(IPC_REF)) {
          for (const ipc of r[1].split(/\s*[/,]\s*/)) {
            pairs.push({
              file: base,
              ipc,
              cited: m[1],
              where: `${base}:${lineOf(file, `"number": "${o.number}"`)} ${o.number} / ${o.description}`,
            });
          }
        }
      }
    }
    for (const s of strings(doc)) {
      for (const m of s.matchAll(PROSE)) {
        pairs.push({
          file: base,
          ipc: m[2],
          cited: m[1],
          where: `${base}:${lineOf(file, s)} "${m[0].slice(0, 90)}"`,
        });
      }
      for (const m of s.matchAll(EQ)) {
        pairs.push({
          file: base,
          ipc: m[1],
          cited: m[2],
          where: `${base}:${lineOf(file, s)} "${m[0]}"`,
        });
      }
    }
  }

  it('scans a non-trivial number of files and finds the pairs', () => {
    expect(packFiles.length).toBeGreaterThan(100);
    expect(pairs.length).toBeGreaterThanOrEqual(40);
  });

  it('every IPC section named in a pair exists in the table', () => {
    expect(pairs.filter((p) => !table.mappings[p.ipc]).map((p) => p.where)).toEqual([]);
  });

  it('every pair cites exactly the T-267 target (sub-section included)', () => {
    const wrong = pairs
      .filter((p) => table.mappings[p.ipc] && table.mappings[p.ipc].new !== p.cited)
      .map((p) => `${p.where} -> table says ${table.mappings[p.ipc].new}`);
    expect(wrong).toEqual([]);
  });

  it('the affidavit_identity prose "same as IPC 191/192" follows BNS 227/228', () => {
    expect(table.mappings['191'].new).toBe('227');
    expect(table.mappings['192'].new).toBe('228');
    expect(table.mappings['193'].new).toBe('229');
    expect(
      packHas(
        'affidavit_identity',
        'BNS Section 227 (giving false evidence) / BNS Section 228 (fabricating false evidence) — same as IPC 191/192.',
      ),
    ).toBe(true);
  });
});

describe("T-267 ruling D: Ajay's signed pack strings are present, the wrong ones are gone", () => {
  it('304B -> BNS 80 in fir_quashing, discharge_application and quashing_528_bnss', () => {
    expect(packHas('fir_quashing', 'BNS 80 (Dowry death, was IPC 304B)')).toBe(true);
    expect(hasEntry('fir_quashing', 'S.80', 'Dowry death (was IPC 304B)')).toBe(true);
    expect(
      hasEntry('discharge_application', 'S.80', 'Dowry death (was IPC 304B) — strict ingredients'),
    ).toBe(true);
    expect(packHas('quashing_528_bnss', 'S.80 (dowry death — was IPC 304B)')).toBe(true);
  });

  it.each(['fir_quashing', 'discharge_application', 'quashing_528_bnss'])(
    '%s no longer cites BNS 86 / S.86 for dowry death',
    (name) => {
      const all = packStrings(name).join('\n');
      expect(all).not.toMatch(/\bS\.86\b/);
      expect(all).not.toMatch(/\bBNS 86\b/);
      expect(all).not.toMatch(/\(?dowry death[^)]*\)?[^\n]{0,20}86\b/i);
    },
  );

  it('sub-sections: 316(2), 318(4), 336(1), 103(1), 115(2), 106(1)', () => {
    expect(packHas('fir_quashing', 'BNS 318(4) (Cheating, was IPC 420)')).toBe(true);
    expect(packHas('fir_quashing', 'BNS 316(2) (Criminal breach of trust, was IPC 406)')).toBe(
      true,
    );
    expect(hasEntry('fir_quashing', 'S.316(2)', 'Criminal breach of trust (was IPC 406)')).toBe(
      true,
    );
    expect(hasEntry('fir_quashing', 'S.318(4)', 'Cheating (was IPC 420)')).toBe(true);
    expect(hasEntry('fir_quashing', 'S.336(1)', 'Forgery (was IPC 463)')).toBe(true);
    expect(
      hasEntry(
        'discharge_application',
        'S.316(2)',
        'Criminal breach of trust (was IPC 406) — entrustment requirement',
      ),
    ).toBe(true);
    expect(
      hasEntry(
        'discharge_application',
        'S.318(4)',
        'Cheating (was IPC 420) — deception requirement',
      ),
    ).toBe(true);
    expect(packHas('quashing_528_bnss', 'S.103(1) (murder — was IPC 302)')).toBe(true);
    expect(packHas('quashing_528_bnss', 'S.115(2) (voluntarily causing hurt — was IPC 323)')).toBe(
      true,
    );
    expect(packHas('quashing_528_bnss', 'S.318(4) (cheating — was IPC 420)')).toBe(true);
    expect(hasEntry('bail_regular', '103(1)', 'Murder (replaces IPC 302)')).toBe(true);
    expect(hasEntry('mact_claim', 'S.106(1)', 'Causing death by negligence (was IPC 304A)')).toBe(
      true,
    );
  });

  it('affidavit_identity: 191->227, 192->228, 193->229, the L178 text, three entries', () => {
    const name = 'affidavit_identity';
    expect(
      packHas(
        name,
        'False statements in affidavits attract BNS Section 227 (giving false evidence) / BNS Section 228 (fabricating false evidence) — same as IPC 191/192.',
      ),
    ).toBe(true);
    expect(
      packStrings(name).includes(
        'Do NOT include any IPC reference — if citing penalty for false affidavit, use BNS Section 229 (false evidence is defined in Section 227).',
      ),
    ).toBe(true);
    expect(hasEntry(name, '227', 'Giving false evidence (successor to IPC 191)')).toBe(true);
    expect(hasEntry(name, '228', 'Fabricating false evidence (successor to IPC 192)')).toBe(true);
    expect(hasEntry(name, '229', 'Punishment for false evidence (successor to IPC 193)')).toBe(
      true,
    );
    const nums = objects(readPack(name))
      .filter(
        (o) =>
          typeof o.description === 'string' &&
          /successor to IPC 19\d/.test(o.description as string),
      )
      .map((o) => o.number);
    expect(nums).toEqual(['227', '228', '229']);
  });

  it('affidavit_identity: the old 229/230 successor-to-191/192 texts are gone', () => {
    const all = packStrings('affidavit_identity').join('\n');
    expect(all).not.toContain('BNS Section 229 (giving false evidence)');
    expect(all).not.toContain('BNS Section 230');
    expect(all).not.toContain('BNS Sections 229-230');
    expect(all).not.toContain('successor to IPC 191/193');
    expect(all).not.toContain('successor to IPC 192/194');
    expect(objects(readPack('affidavit_identity')).some((o) => o.number === '230')).toBe(false);
  });

  it('mact_claim: 125 / 125(a) / 125(b) and the signed para-6 text', () => {
    expect(
      packHas(
        'mact_claim',
        'S.106(1) BNS causing death by negligence — was IPC 304A; S.125 BNS act endangering life or personal safety of others (was IPC 336); S.125(a) BNS where hurt is caused (was IPC 337); S.125(b) BNS where grievous hurt is caused (was IPC 338)',
      ),
    ).toBe(true);
    expect(
      hasEntry(
        'mact_claim',
        'S.125',
        'Act endangering life or personal safety of others (was IPC 336)',
      ),
    ).toBe(true);
    expect(
      hasEntry(
        'mact_claim',
        'S.125(a)',
        'Act endangering life or personal safety of others, where hurt is caused (was IPC 337)',
      ),
    ).toBe(true);
    expect(
      hasEntry(
        'mact_claim',
        'S.125(b)',
        'Act endangering life or personal safety of others, where grievous hurt is caused (was IPC 338)',
      ),
    ).toBe(true);
    expect(packStrings('mact_claim').join('\n')).not.toContain('was IPC 336/337/338');
  });

  it('discharge_application Para 12 says BNS 80 for dowry death; 85/318/316 stay unchanged', () => {
    const line = packStrings('discharge_application').find((x) => x.startsWith('Para 12:')) ?? '';
    expect(line).toContain('BNS 80 (dowry death)');
    expect(line).toContain('BNS 85 (cruelty)');
    expect(line).toContain('BNS 318 (cheating)');
    expect(line).toContain('BNS 316 (criminal breach of trust)');
    expect(line).not.toContain('BNS 86');
  });

  it('legal_notice_defamation: 356(1) / 356(2) and the new L197 text', () => {
    const name = 'legal_notice_defamation';
    expect(
      hasEntry(name, '356(1)', 'Defamation — definition and exceptions (replaces IPC Section 499)'),
    ).toBe(true);
    expect(hasEntry(name, '356(2)', 'Defamation — punishment (replaces IPC Section 500)')).toBe(
      true,
    );
    expect(
      packStrings(name).includes(
        'If criminal route, cite BNS Section 356(1) for the offence and 356(2) for the punishment (not IPC 499/500 — IPC stands repealed for offences committed after 1 July 2024).',
      ),
    ).toBe(true);
    expect(objects(readPack(name)).some((o) => o.number === '356')).toBe(false);
  });
});
