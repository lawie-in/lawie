import './setupEnv';
import './setupDb';
import request from 'supertest';

import app from '../app';
import { SectionMapping } from '../models/SectionMapping.model';
import { invalidateCache } from '../services/sections.service';

// Seed a representative subset of mappings into the in-memory MongoDB
async function seedSections() {
  const EFFECTIVE_DATE = new Date('2024-07-01');

  await SectionMapping.insertMany([
    // IPC → BNS
    {
      oldCode: 'IPC',
      oldCodeFull: 'Indian Penal Code, 1860',
      newCode: 'BNS',
      newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
      oldSection: '302',
      newSection: '103(1)',
      oldTitle: 'Punishment for murder',
      newTitle: 'Punishment for murder',
      mappingType: 'direct',
      effectiveDate: EFFECTIVE_DATE,
    },
    {
      oldCode: 'IPC',
      oldCodeFull: 'Indian Penal Code, 1860',
      newCode: 'BNS',
      newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
      oldSection: '420',
      newSection: '318(4)',
      oldTitle: 'Cheating and dishonestly inducing delivery of property',
      newTitle: 'Cheating and dishonestly inducing delivery of property',
      mappingType: 'merged',
      effectiveDate: EFFECTIVE_DATE,
    },
    {
      oldCode: 'IPC',
      oldCodeFull: 'Indian Penal Code, 1860',
      newCode: 'BNS',
      newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
      oldSection: '498A',
      newSection: '85',
      oldTitle: 'Husband or relative of husband of a woman subjecting her to cruelty',
      newTitle: 'Cruelty by husband or relatives of husband',
      mappingType: 'direct',
      effectiveDate: EFFECTIVE_DATE,
    },
    {
      oldCode: 'IPC',
      oldCodeFull: 'Indian Penal Code, 1860',
      newCode: 'BNS',
      newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
      oldSection: '377',
      newSection: null,
      oldTitle: 'Unnatural offences',
      newTitle: null,
      mappingType: 'repealed',
      notes:
        'Struck down by Supreme Court in Navtej Singh Johar v. Union of India (2018). Not included in BNS',
      effectiveDate: EFFECTIVE_DATE,
    },
    {
      oldCode: 'IPC',
      oldCodeFull: 'Indian Penal Code, 1860',
      newCode: 'BNS',
      newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
      oldSection: '309',
      newSection: null,
      oldTitle: 'Attempt to commit suicide',
      newTitle: null,
      mappingType: 'repealed',
      notes: 'Decriminalized — attempt to suicide no longer an offence under BNS',
      effectiveDate: EFFECTIVE_DATE,
    },
    // CrPC → BNSS
    {
      oldCode: 'CrPC',
      oldCodeFull: 'Code of Criminal Procedure, 1973',
      newCode: 'BNSS',
      newCodeFull: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
      oldSection: '154',
      newSection: '173',
      oldTitle: 'Information in cases of cognizable offences (FIR)',
      newTitle: 'Information in cognizable cases (FIR)',
      mappingType: 'direct',
      effectiveDate: EFFECTIVE_DATE,
    },
    {
      oldCode: 'CrPC',
      oldCodeFull: 'Code of Criminal Procedure, 1973',
      newCode: 'BNSS',
      newCodeFull: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
      oldSection: '438',
      newSection: '482',
      oldTitle: 'Direction for grant of bail to person apprehending arrest (Anticipatory bail)',
      newTitle: 'Direction for grant of bail to person apprehending arrest (Anticipatory bail)',
      mappingType: 'direct',
      effectiveDate: EFFECTIVE_DATE,
    },
    // IEA → BSA
    {
      oldCode: 'IEA',
      oldCodeFull: 'Indian Evidence Act, 1872',
      newCode: 'BSA',
      newCodeFull: 'Bharatiya Sakshya Adhiniyam, 2023',
      oldSection: '45',
      newSection: '44',
      oldTitle: 'Opinions of experts',
      newTitle: 'Opinions of experts',
      mappingType: 'direct',
      effectiveDate: EFFECTIVE_DATE,
    },
    // CLO patch: IEA 32 → BSA 32 (was incorrectly BSA 26)
    {
      oldCode: 'IEA',
      oldCodeFull: 'Indian Evidence Act, 1872',
      newCode: 'BSA',
      newCodeFull: 'Bharatiya Sakshya Adhiniyam, 2023',
      oldSection: '32',
      newSection: '32',
      oldTitle:
        'Cases in which statement of relevant fact by person who is dead or cannot be found etc. is relevant (Dying declaration)',
      newTitle:
        'Cases in which statement of relevant fact by person who is dead or cannot be found etc. is relevant',
      mappingType: 'partial',
      notes: 'CLO fix: was incorrectly mapped to BSA 26. Corrected to BSA 32.',
      validatedBy: 'Ajay - CLO',
      effectiveDate: EFFECTIVE_DATE,
    },
    // CLO patch: IPC 416 → BNS 319 (new row)
    {
      oldCode: 'IPC',
      oldCodeFull: 'Indian Penal Code, 1860',
      newCode: 'BNS',
      newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
      oldSection: '416',
      newSection: '319',
      oldTitle: 'Cheating by personation',
      newTitle: 'Cheating by personation',
      mappingType: 'direct',
      notes: 'IPC 416 (Cheating by personation) maps directly to BNS 319.',
      validatedBy: 'Ajay - CLO',
      effectiveDate: EFFECTIVE_DATE,
    },
    // New provision (BNS)
    {
      oldCode: 'IPC',
      oldCodeFull: 'Indian Penal Code, 1860',
      newCode: 'BNS',
      newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
      oldSection: 'NEW-111',
      newSection: '111',
      oldTitle: 'No equivalent in old code',
      newTitle: 'Organised crime',
      mappingType: 'direct',
      isNewProvision: true,
      notes: 'New provision — covers organised crime syndicates, no IPC equivalent',
      effectiveDate: EFFECTIVE_DATE,
    },
  ]);

  // Invalidate cache so service reloads from DB
  invalidateCache();
}

beforeEach(async () => {
  await seedSections();
});

afterEach(() => {
  invalidateCache();
});

describe('Sections Routes', () => {
  describe('GET /sections/map', () => {
    it('returns 400 when no query params provided', async () => {
      const res = await request(app).get('/sections/map');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing query parameter');
      expect(res.body.usage).toBeDefined();
    });

    describe('old→new lookup (?old=)', () => {
      it('maps IPC 302 → BNS 103(1) (Murder)', async () => {
        const res = await request(app).get('/sections/map?old=302-IPC');
        expect(res.status).toBe(200);
        expect(res.body.direction).toBe('old_to_new');
        expect(res.body.result.old_code).toBe('IPC');
        expect(res.body.result.old_section).toBe('302');
        expect(res.body.result.new_code).toBe('BNS');
        expect(res.body.result.new_section).toBe('103(1)');
        expect(res.body.result.mapping_type).toBe('direct');
      });

      it('maps IPC 420 → BNS 318(4) (Cheating)', async () => {
        const res = await request(app).get('/sections/map?old=420-IPC');
        expect(res.status).toBe(200);
        expect(res.body.result.new_section).toBe('318(4)');
        expect(res.body.result.new_code).toBe('BNS');
      });

      it('maps IPC 498A → BNS 85 (Cruelty by husband)', async () => {
        const res = await request(app).get('/sections/map?old=498A-IPC');
        expect(res.status).toBe(200);
        expect(res.body.result.new_section).toBe('85');
      });

      it('maps CrPC 154 → BNSS 173 (FIR)', async () => {
        const res = await request(app).get('/sections/map?old=154-CrPC');
        expect(res.status).toBe(200);
        expect(res.body.result.old_code).toBe('CrPC');
        expect(res.body.result.new_code).toBe('BNSS');
        expect(res.body.result.new_section).toBe('173');
      });

      it('maps CrPC 438 → BNSS 482 (Anticipatory bail)', async () => {
        const res = await request(app).get('/sections/map?old=438-CrPC');
        expect(res.status).toBe(200);
        expect(res.body.result.new_section).toBe('482');
      });

      it('maps IEA 45 → BSA 44 (Opinions of experts)', async () => {
        const res = await request(app).get('/sections/map?old=45-IEA');
        expect(res.status).toBe(200);
        expect(res.body.result.old_code).toBe('IEA');
        expect(res.body.result.new_code).toBe('BSA');
        expect(res.body.result.new_section).toBe('44');
      });

      it('flags repealed sections (IPC 377)', async () => {
        const res = await request(app).get('/sections/map?old=377-IPC');
        expect(res.status).toBe(200);
        expect(res.body.result.mapping_type).toBe('repealed');
        expect(res.body.result.new_section).toBeNull();
        expect(res.body.result.notes).toContain('Navtej Singh Johar');
      });

      it('flags repealed sections (IPC 309 — attempt to suicide)', async () => {
        const res = await request(app).get('/sections/map?old=309-IPC');
        expect(res.status).toBe(200);
        expect(res.body.result.mapping_type).toBe('repealed');
        expect(res.body.result.new_section).toBeNull();
      });

      it('returns 404 for unknown section', async () => {
        const res = await request(app).get('/sections/map?old=9999-IPC');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Section mapping not found');
      });

      it('returns 404 for unknown code', async () => {
        const res = await request(app).get('/sections/map?old=302-XYZ');
        expect(res.status).toBe(404);
      });
    });

    describe('new→old reverse lookup (?new=)', () => {
      it('maps BNS 103(1) → IPC 302 (Murder)', async () => {
        const res = await request(app).get('/sections/map?new=103(1)-BNS');
        expect(res.status).toBe(200);
        expect(res.body.direction).toBe('new_to_old');
        expect(res.body.results).toBeInstanceOf(Array);
        expect(res.body.results[0].old_code).toBe('IPC');
        expect(res.body.results[0].old_section).toBe('302');
      });

      it('maps BNSS 173 → CrPC 154 (FIR)', async () => {
        const res = await request(app).get('/sections/map?new=173-BNSS');
        expect(res.status).toBe(200);
        expect(res.body.results[0].old_code).toBe('CrPC');
        expect(res.body.results[0].old_section).toBe('154');
      });

      it('maps BSA 44 → IEA 45 (Opinions of experts)', async () => {
        const res = await request(app).get('/sections/map?new=44-BSA');
        expect(res.status).toBe(200);
        expect(res.body.results[0].old_code).toBe('IEA');
        expect(res.body.results[0].old_section).toBe('45');
      });

      it('returns 404 for unknown new section', async () => {
        const res = await request(app).get('/sections/map?new=9999-BNS');
        expect(res.status).toBe(404);
      });
    });

    describe('auto-detect lookup (?section=&code=)', () => {
      it('auto-detects IPC as old→new', async () => {
        const res = await request(app).get('/sections/map?section=302&code=IPC');
        expect(res.status).toBe(200);
        expect(res.body.direction).toBe('old_to_new');
      });

      it('auto-detects BNS as new→old', async () => {
        const res = await request(app).get('/sections/map?section=103(1)&code=BNS');
        expect(res.status).toBe(200);
        expect(res.body.direction).toBe('new_to_old');
      });
    });
  });

  describe('POST /sections/convert', () => {
    it('converts old-law references in text to new-law', async () => {
      const res = await request(app).post('/sections/convert').send({
        text: 'The accused was charged under Section 302 IPC and Section 154 CrPC was invoked.',
      });
      expect(res.status).toBe(200);
      expect(res.body.converted).toContain('BNS');
      expect(res.body.converted).toContain('BNSS');
      expect(res.body.conversions.length).toBeGreaterThanOrEqual(2);
      expect(res.body.count).toBeGreaterThanOrEqual(2);
    });

    it('returns original text when no old references found', async () => {
      const res = await request(app)
        .post('/sections/convert')
        .send({ text: 'No section references here.' });
      expect(res.status).toBe(200);
      expect(res.body.converted).toBe('No section references here.');
      expect(res.body.count).toBe(0);
    });

    it('returns 400 when text is missing', async () => {
      const res = await request(app).post('/sections/convert').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /sections/codes', () => {
    it('returns metadata for seeded code mappings', async () => {
      const res = await request(app).get('/sections/codes');
      expect(res.status).toBe(200);
      expect(res.body.codes.length).toBeGreaterThanOrEqual(1);

      const ipc = res.body.codes.find((c: { old_code: string }) => c.old_code === 'IPC');
      expect(ipc).toBeDefined();
      expect(ipc.new_code).toBe('BNS');
      expect(ipc.effective_date).toBe('2024-07-01');
      expect(ipc.mapped_sections).toBeGreaterThanOrEqual(3);
    });
  });

  describe('CLO patch validation (SCRUM-27)', () => {
    it('maps IEA 32 → BSA 32 (NOT BSA 26 — CLO fix)', async () => {
      const res = await request(app).get('/sections/map?old=32-IEA');
      expect(res.status).toBe(200);
      expect(res.body.result.old_code).toBe('IEA');
      expect(res.body.result.old_section).toBe('32');
      expect(res.body.result.new_code).toBe('BSA');
      expect(res.body.result.new_section).toBe('32');
      // Must NOT be 26 — that was the incorrect mapping
      expect(res.body.result.new_section).not.toBe('26');
    });

    it('maps IPC 416 → BNS 319 (Cheating by personation — new row)', async () => {
      const res = await request(app).get('/sections/map?old=416-IPC');
      expect(res.status).toBe(200);
      expect(res.body.result.old_code).toBe('IPC');
      expect(res.body.result.old_section).toBe('416');
      expect(res.body.result.new_code).toBe('BNS');
      expect(res.body.result.new_section).toBe('319');
      expect(res.body.result.old_title).toContain('personation');
    });

    it('reverse lookup: BSA 32 → IEA 32 (dying declaration)', async () => {
      const res = await request(app).get('/sections/map?new=32-BSA');
      expect(res.status).toBe(200);
      expect(res.body.direction).toBe('new_to_old');
      expect(res.body.results[0].old_code).toBe('IEA');
      expect(res.body.results[0].old_section).toBe('32');
    });

    it('reverse lookup: BNS 319 → IPC 416 (cheating by personation)', async () => {
      const res = await request(app).get('/sections/map?new=319-BNS');
      expect(res.status).toBe(200);
      expect(res.body.direction).toBe('new_to_old');
      expect(res.body.results[0].old_code).toBe('IPC');
      expect(res.body.results[0].old_section).toBe('416');
    });
  });

  describe('GET /sections/all/:code', () => {
    it('returns all IPC→BNS mappings', async () => {
      const res = await request(app).get('/sections/all/IPC');
      expect(res.status).toBe(200);
      expect(res.body.meta.old_code).toBe('IPC');
      expect(res.body.meta.new_code).toBe('BNS');
      expect(res.body.total_mapped).toBeGreaterThanOrEqual(3);
      expect(res.body.new_provisions).toBeDefined();
    });

    it('returns mappings via new code name', async () => {
      const res = await request(app).get('/sections/all/BNSS');
      expect(res.status).toBe(200);
      expect(res.body.meta.new_code).toBe('BNSS');
    });

    it('returns 404 for unsupported code', async () => {
      const res = await request(app).get('/sections/all/XYZ');
      expect(res.status).toBe(404);
      expect(res.body.supported).toContain('IPC');
    });
  });

  describe('GET /sections/search (SCRUM-85 typeahead)', () => {
    it('returns 400 when q is missing', async () => {
      const res = await request(app).get('/sections/search?code=BNS');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('q');
    });

    it('returns 400 when code is missing', async () => {
      const res = await request(app).get('/sections/search?q=302');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('code');
    });

    it('matches new section number by prefix (BNS)', async () => {
      const res = await request(app).get('/sections/search?q=103&code=BNS');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results.some((r: { section: string }) => r.section.startsWith('103'))).toBe(
        true,
      );
    });

    it('matches by title substring (case-insensitive)', async () => {
      const res = await request(app).get('/sections/search?q=murder&code=BNS');
      expect(res.status).toBe(200);
      const titles: string[] = res.body.results.map((r: { title: string }) =>
        r.title.toLowerCase(),
      );
      expect(titles.some((t: string) => t.includes('murder'))).toBe(true);
    });

    it('returns the counterpart mapping shape (new → mapped_to old)', async () => {
      const res = await request(app).get('/sections/search?q=103&code=BNS');
      const row = res.body.results.find((r: { section: string }) => r.section === '103(1)');
      expect(row).toBeDefined();
      expect(row.mapped_to.code).toBe('IPC');
      expect(row.mapped_to.section).toBe('302');
    });

    it('caps results at the limit (clamped to 25 max)', async () => {
      const res = await request(app).get('/sections/search?q=1&code=BNS&limit=2');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeLessThanOrEqual(2);
    });

    it('returns empty results for unknown code', async () => {
      const res = await request(app).get('/sections/search?q=302&code=XYZ');
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });

    it('searches old codes (IPC) by prefix too', async () => {
      const res = await request(app).get('/sections/search?q=302&code=IPC');
      expect(res.status).toBe(200);
      expect(res.body.results.some((r: { section: string }) => r.section === '302')).toBe(true);
    });
  });
});
