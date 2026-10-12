/**
 * T-324 - an IPC alias on a BNS entry skips the T-295 old-law warning only when the signed
 * T-267 table maps that IPC section to that BNS section (Ajay's condition).
 *
 * SectionMapping rows are seeded from the real ipc-to-bns.json. Expected BNS targets are
 * literals from the signed table (379 -> 303(2), 302 -> 103(1), 376 -> 64, 323 -> 115(2),
 * 406 -> 316(2), 420 -> 318(4)), checked against the JSON in the first test.
 */
import './setupEnv';
import './setupDb';

import fs from 'fs';
import path from 'path';

import { SectionMapping } from '../models/SectionMapping.model';
import { readSectionsCharged } from '../services/bns-offence-resolver';
import { preflightCheck } from '../services/preflight.service';
import { invalidateCache } from '../services/sections.service';

const TABLE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'sections', 'ipc-to-bns.json'), 'utf-8'),
) as { mappings: Record<string, { new: string; new_title: string; type: string }> };

const SEEDED = ['379', '302', '376', '323', '406', '420'];

async function seed(sections: string[] = SEEDED): Promise<void> {
  await SectionMapping.insertMany(
    sections.map((s) => ({
      oldCode: 'IPC',
      oldCodeFull: 'Indian Penal Code, 1860',
      newCode: 'BNS',
      newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
      oldSection: s,
      newSection: TABLE.mappings[s].new,
      oldTitle: 'old',
      newTitle: TABLE.mappings[s].new_title,
      mappingType: TABLE.mappings[s].type,
      effectiveDate: new Date('2024-07-01'),
    })),
  );
  // ioredis-mock keeps sections:loaded_at between tests, so force a reload from Mongo.
  await invalidateCache();
}

const SIGNED = (n: string): string =>
  `IPC ${n} is an old-law section. For an offence committed on or after 1 July 2024, use the section converter to find the BNS section. For an earlier offence, the old section may still apply.`;

const BASE = {
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

async function run(sections: unknown) {
  const r = await preflightCheck('bail_anticipatory', { ...BASE, sections_charged: sections });
  const hits = r._meta?.rule_hits ?? [];
  return { r, hits, oldLaw: hits.filter((h) => h === 'old_law_section').length };
}

describe('T-324: the signed table rows the tests rely on', () => {
  it('maps 379 -> 303(2), 302 -> 103(1), 376 -> 64, 323 -> 115(2)', () => {
    expect(TABLE.mappings['379'].new).toBe('303(2)');
    expect(TABLE.mappings['302'].new).toBe('103(1)');
    expect(TABLE.mappings['376'].new).toBe('64');
    expect(TABLE.mappings['323'].new).toBe('115(2)');
  });
});

describe('T-324 reader: attachedTo on alias entries', () => {
  it('is set on the alias entry and names the entry the bracket follows', () => {
    expect(readSectionsCharged('BNS 303 (IPC 379)')).toEqual([
      { code: 'BNS', number: '303' },
      { code: 'IPC', number: '379', alias: true, attachedTo: { code: 'BNS', number: '303' } },
    ]);
  });

  it('survives dedupe: the second BNS 303 is dropped, the alias keeps its owner', () => {
    expect(readSectionsCharged('BNS 303, BNS 103, BNS 303 (IPC 302)')).toEqual([
      { code: 'BNS', number: '303' },
      { code: 'BNS', number: '103' },
      { code: 'IPC', number: '302', alias: true, attachedTo: { code: 'BNS', number: '303' } },
    ]);
  });

  it('a bracket before any entry gets no attachedTo key', () => {
    const out = readSectionsCharged('(IPC 379) BNS 303');
    const alias = out.find((e) => e.alias);
    expect(alias).toEqual({ code: 'IPC', number: '379', alias: true });
    expect('attachedTo' in alias!).toBe(false);
  });

  it('a bare owner takes the default code', () => {
    expect(readSectionsCharged('303 (IPC 379)', 'BNS')[1]).toEqual({
      code: 'IPC',
      number: '379',
      alias: true,
      attachedTo: { code: 'BNS', number: '303' },
    });
    expect(readSectionsCharged('303 (IPC 379)')[1].attachedTo).toEqual({
      code: null,
      number: '303',
    });
  });

  it('an owner whose code is applied back (a trailing code) is resolved: "303 (IPC 379) BNS"', () => {
    const out = readSectionsCharged('303 (IPC 379) BNS');
    expect(out.find((e) => e.alias)?.attachedTo).toEqual({ code: 'BNS', number: '303' });
  });

  it('a later bare duplicate replaces the kept alias: no alias, no attachedTo', () => {
    const out = readSectionsCharged('BNS 303 (IPC 379), IPC 379');
    expect(out).toEqual([
      { code: 'BNS', number: '303' },
      { code: 'IPC', number: '379' },
    ]);
    const kept = out.find((e) => e.number === '379')!;
    expect('alias' in kept).toBe(false);
    expect('attachedTo' in kept).toBe(false);
  });

  it('non-alias entries never carry attachedTo', () => {
    for (const e of readSectionsCharged('BNS 303 (IPC 379), IPC 302')) {
      if (!e.alias) expect('attachedTo' in e).toBe(false);
    }
  });
});

describe('T-324 preflight: the old-law warning on an IPC alias', () => {
  describe('with the signed table seeded', () => {
    beforeEach(() => seed());

    it('AC1: matching pair "BNS 303 (IPC 379)" -> no old_law_section, verdict pass', async () => {
      const { r, hits } = await run('BNS 303 (IPC 379)');
      expect(hits).not.toContain('old_law_section');
      expect(hits).toEqual([]);
      expect(r.questions).not.toContain(SIGNED('379'));
      expect(r.verdict).toBe('pass');
    });

    it('AC1a: mismatched pair "BNS 303 (IPC 302)" -> soft with the IPC 302 signed line', async () => {
      const { r, hits } = await run('BNS 303 (IPC 302)');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('302'));
    });

    it('AC2: bare IPC entry "IPC 302" -> soft with the signed line', async () => {
      const { r, hits } = await run('IPC 302');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('302'));
    });

    it('a bare IPC entry whose number is in the table ("IPC 379") still warns', async () => {
      const { r, hits } = await run('IPC 379');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('379'));
    });

    it('dedupe: "BNS 303, BNS 103, BNS 303 (IPC 302)" -> soft (attached to BNS 303, not 103)', async () => {
      const { r, oldLaw } = await run('BNS 303, BNS 103, BNS 303 (IPC 302)');
      expect(r.verdict).toBe('soft');
      expect(oldLaw).toBe(1);
      expect(r.questions).toContain(SIGNED('302'));
    });

    it('the owner is the entry the bracket follows: "BNS 103, BNS 303 (IPC 302)" -> soft, but "BNS 303, BNS 103 (IPC 302)" -> pass', async () => {
      // 302 -> 103(1); the bracket follows BNS 103 only in the second input.
      expect((await run('BNS 103, BNS 303 (IPC 302)')).r.verdict).toBe('soft');
      const ok = await run('BNS 303, BNS 103 (IPC 302)');
      expect(ok.hits).not.toContain('old_law_section');
      expect(ok.r.verdict).toBe('pass');
    });

    it('sub-section rule: "BNS 303(2)(a) (IPC 379)" passes (descendant of the 303(2) target)', async () => {
      const { r, hits } = await run('BNS 303(2)(a) (IPC 379)');
      expect(hits).not.toContain('old_law_section');
      expect(r.verdict).toBe('pass');
    });

    it('sub-section rule: "BNS 303(2) (IPC 379)" passes (exact)', async () => {
      const { hits } = await run('BNS 303(2) (IPC 379)');
      expect(hits).not.toContain('old_law_section');
    });

    it('sub-section rule: "BNS 303(1) (IPC 379)" is soft (sibling of 303(2))', async () => {
      const { r, hits } = await run('BNS 303(1) (IPC 379)');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('379'));
    });

    it('"IPC 420 (IPC 406)" -> two old-law findings (IPC owner never counts)', async () => {
      const { r, oldLaw } = await run('IPC 420 (IPC 406)');
      expect(r.verdict).toBe('soft');
      expect(oldLaw).toBe(2);
      expect(r.questions).toContain(SIGNED('420'));
      expect(r.questions).toContain(SIGNED('406'));
    });

    it('"BNS 303 (CrPC 154)" -> soft (only IPC aliases are skipped)', async () => {
      const { r, hits } = await run('BNS 303 (CrPC 154)');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(
        'CrPC 154 is an old-law section. For an offence committed on or after 1 July 2024, use the section converter to find the BNSS section. For an earlier offence, the old section may still apply.',
      );
    });

    it('"(IPC 379) BNS 303" (bracket before any entry) -> soft', async () => {
      const { r, hits } = await run('(IPC 379) BNS 303');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
    });

    it('"BNS 303 (IPC 379), IPC 379" -> soft with the IPC 379 line (explicit entry wins over the alias)', async () => {
      const { r, oldLaw } = await run('BNS 303 (IPC 379), IPC 379');
      expect(r.verdict).toBe('soft');
      expect(oldLaw).toBe(1);
      expect(r.questions).toContain(SIGNED('379'));
    });

    it('"IPC 379, BNS 303 (IPC 379)" -> soft', async () => {
      const { r, hits } = await run('IPC 379, BNS 303 (IPC 379)');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('379'));
    });

    it('array ["BNS 303 (IPC 379)", "IPC 379"] -> soft with the IPC 379 line', async () => {
      const { r, hits } = await run(['BNS 303 (IPC 379)', 'IPC 379']);
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('379'));
    });

    it('array ["BNS 303 (IPC 379)"] -> pass', async () => {
      const { r, hits } = await run(['BNS 303 (IPC 379)']);
      expect(hits).toEqual([]);
      expect(r.verdict).toBe('pass');
    });

    it('"BNS 64, 115(2) (IPC 376, 323)": IPC 323 is skipped (-> 115(2)), IPC 376 still warns', async () => {
      const { r, oldLaw } = await run('BNS 64, 115(2) (IPC 376, 323)');
      expect(oldLaw).toBe(1);
      expect(r.verdict).toBe('soft');
      expect(r.questions).toContain(SIGNED('376'));
      expect(r.questions).not.toContain(SIGNED('323'));
    });

    it('"BNS 64 (IPC 376)" passes (376 -> 64)', async () => {
      const { r, hits } = await run('BNS 64 (IPC 376)');
      expect(hits).toEqual([]);
      expect(r.verdict).toBe('pass');
    });

    it('an IPC number the table does not carry keeps the warning ("BNS 303 (IPC 999)")', async () => {
      const { r, hits } = await run('BNS 303 (IPC 999)');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('999'));
    });
  });

  describe('with no table rows', () => {
    beforeEach(() => invalidateCache());

    it('"BNS 303 (IPC 379)" keeps the warning (never skip on an unknown)', async () => {
      const { r, hits } = await run('BNS 303 (IPC 379)');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('379'));
    });
  });
});
