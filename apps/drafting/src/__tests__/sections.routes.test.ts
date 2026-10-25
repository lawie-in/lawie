import './setupEnv';
import './setupDb';
import request from 'supertest';

import app from '../app';
import { NOT_VERIFIED } from '../services/sections.service';

// T-371 (ADR-025 D2): the tables are served from the signed files in memory. The
// SectionMapping collection stays EMPTY in this suite, so every answer below proves
// the read path no longer touches Mongo.

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

      it('maps IEA 45 → BSA 39(1) (Opinions of experts)', async () => {
        const res = await request(app).get('/sections/map?old=45-IEA');
        expect(res.status).toBe(200);
        expect(res.body.result.old_code).toBe('IEA');
        expect(res.body.result.new_code).toBe('BSA');
        expect(res.body.result.new_section).toBe('39(1)');
      });

      it('flags repealed sections (IPC 377)', async () => {
        const res = await request(app).get('/sections/map?old=377-IPC');
        expect(res.status).toBe(200);
        expect(res.body.result.mapping_type).toBe('repealed');
        expect(res.body.result.new_section).toBeNull();
        // The signed T-267 row's own note (the old seed's Navtej Singh Johar text was
        // test data, not in the signed file).
        expect(res.body.result.notes).toContain('deleted from the Bill');
        expect(res.body.result.notes).not.toContain('Navtej');
      });

      it('flags repealed sections (IPC 309 — attempt to suicide)', async () => {
        const res = await request(app).get('/sections/map?old=309-IPC');
        expect(res.status).toBe(200);
        expect(res.body.result.mapping_type).toBe('repealed');
        expect(res.body.result.new_section).toBeNull();
      });

      // T-371 / T-360: an unknown section is not a 404 any more. 200, not found, with
      // Ajay's label and no guessed new section. An unknown code is still 404.
      it('answers 200 with Not verified for an unknown section', async () => {
        const res = await request(app).get('/sections/map?old=9999-IPC');
        expect(res.status).toBe(200);
        expect(res.body.result.found).toBe(false);
        expect(res.body.result.label).toBe(NOT_VERIFIED);
        expect(res.body.result.new_section).toBeNull();
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

      it('maps BSA 39(1) → IEA 45 (Opinions of experts)', async () => {
        const res = await request(app).get('/sections/map?new=39(1)-BSA');
        expect(res.status).toBe(200);
        expect(res.body.results[0].old_code).toBe('IEA');
        expect(res.body.results[0].old_section).toBe('45');
      });

      it('answers 200 with Not verified for an unknown new section', async () => {
        const res = await request(app).get('/sections/map?new=9999-BNS');
        expect(res.status).toBe(200);
        expect(res.body.results).toHaveLength(1);
        expect(res.body.results[0].found).toBe(false);
        expect(res.body.results[0].label).toBe(NOT_VERIFIED);
      });

      it('returns 404 for an unknown new code', async () => {
        const res = await request(app).get('/sections/map?new=103-XYZ');
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
    it('maps IEA 32 → BSA 26 (NOT BSA 32 — signed T-250 table)', async () => {
      const res = await request(app).get('/sections/map?old=32-IEA');
      expect(res.status).toBe(200);
      expect(res.body.result.old_code).toBe('IEA');
      expect(res.body.result.old_section).toBe('32');
      expect(res.body.result.new_code).toBe('BSA');
      expect(res.body.result.new_section).toBe('26');
      // Must NOT be 32 — that was the incorrect mapping
      expect(res.body.result.new_section).not.toBe('32');
    });

    it('maps IPC 416 → BNS 319(1) (Cheating by personation — new row)', async () => {
      const res = await request(app).get('/sections/map?old=416-IPC');
      expect(res.status).toBe(200);
      expect(res.body.result.old_code).toBe('IPC');
      expect(res.body.result.old_section).toBe('416');
      expect(res.body.result.new_code).toBe('BNS');
      expect(res.body.result.new_section).toBe('319(1)');
      expect(res.body.result.old_title).toContain('personation');
    });

    it('reverse lookup: BSA 26 → IEA 32 (dying declaration)', async () => {
      const res = await request(app).get('/sections/map?new=26-BSA');
      expect(res.status).toBe(200);
      expect(res.body.direction).toBe('new_to_old');
      expect(res.body.results[0].old_code).toBe('IEA');
      expect(res.body.results[0].old_section).toBe('32');
    });

    it('reverse lookup: BNS 319(1) → IPC 416 (cheating by personation)', async () => {
      const res = await request(app).get('/sections/map?new=319(1)-BNS');
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

  describe('GET /sections/details (SCRUM-83 rich card)', () => {
    it('returns 400 when section or code is missing', async () => {
      const a = await request(app).get('/sections/details?code=BNS');
      expect(a.status).toBe(400);
      const b = await request(app).get('/sections/details?section=103');
      expect(b.status).toBe(400);
    });

    it('returns the mapping envelope for a known BNS section', async () => {
      const res = await request(app).get('/sections/details?section=103(1)&code=BNS');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('BNS');
      expect(res.body.section).toBe('103(1)');
      expect(res.body.statute).toBe('Bharatiya Nyaya Sanhita, 2023');
      expect(res.body.mapping).toMatchObject({
        old_code: 'IPC',
        old_section: '302',
        new_code: 'BNS',
        new_section: '103(1)',
      });
    });

    it('returns offence metadata (bailable / cognizable / compoundable / punishment) from bns-offences.json', async () => {
      const res = await request(app).get('/sections/details?section=103&code=BNS');
      expect(res.status).toBe(200);
      expect(typeof res.body.bailable).toBe('boolean');
      expect(typeof res.body.cognizable).toBe('boolean');
      expect(['yes', 'no', 'with_permission']).toContain(res.body.compoundable);
      expect(typeof res.body.punishment).toBe('string');
    });

    it('returns triable_by from the signed file (T-289), as printed', async () => {
      const res = await request(app).get('/sections/details?section=103&code=BNS');
      expect(res.body.triable_by).toBe('Court of Session');
      const res2 = await request(app).get('/sections/details?section=74&code=BNS');
      expect(res2.body.triable_by).toBe('Any Magistrate');
    });

    it('returns a placeholder envelope for unknown sections (no 404)', async () => {
      const res = await request(app).get('/sections/details?section=999999&code=BNS');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('');
      expect(res.body.mapping).toBeNull();
    });

    it('returns 400 for unsupported code', async () => {
      const res = await request(app).get('/sections/details?section=103&code=ZZZ');
      expect(res.status).toBe(400);
    });
  });
});
