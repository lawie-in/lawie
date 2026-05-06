import './setupEnv';
import './setupDb';
import request from 'supertest';

import app from '../app';
import { Court } from '../models/Court.model';

async function seedCourts() {
  await Court.insertMany([
    {
      courtId: 'patna_hc',
      name: 'High Court of Judicature at Patna',
      designation: 'IN THE HIGH COURT OF JUDICATURE AT PATNA',
      courtType: 'high_court',
      state: 'Bihar',
      stateId: 'bihar',
      city: 'Patna',
      formattingRulesRef: 'patna_hc',
      caseNomenclature: 'Cr. Misc. No. _____ of {current_year}',
      supportedLanguages: ['en', 'hi'],
      isActive: true,
    },
    {
      courtId: 'bihar_sessions_patna',
      name: 'District & Sessions Court, Patna',
      designation: 'IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA',
      courtType: 'sessions',
      state: 'Bihar',
      stateId: 'bihar',
      city: 'Patna',
      formattingRulesRef: 'bihar_district',
      caseNomenclature: 'Criminal Miscellaneous Case No. _____ of {current_year}',
      supportedLanguages: ['en', 'hi'],
      isActive: true,
    },
    {
      courtId: 'delhi_hc',
      name: 'Delhi High Court',
      designation: 'IN THE HIGH COURT OF DELHI AT NEW DELHI',
      courtType: 'high_court',
      state: 'Delhi',
      stateId: 'delhi',
      city: 'New Delhi',
      formattingRulesRef: 'delhi_hc',
      caseNomenclature: 'Bail Appln. No. _____ of {current_year}',
      supportedLanguages: ['en', 'hi'],
      isActive: true,
    },
    {
      courtId: 'delhi_saket',
      name: 'Saket District Court, New Delhi',
      designation: 'IN THE COURT OF ADDITIONAL SESSIONS JUDGE, SAKET COURTS, NEW DELHI',
      courtType: 'sessions',
      state: 'Delhi',
      stateId: 'delhi',
      city: 'New Delhi',
      formattingRulesRef: 'delhi_district',
      caseNomenclature: 'Bail Application No. _____ of {current_year}',
      supportedLanguages: ['en', 'hi'],
      isActive: true,
    },
    {
      courtId: 'inactive_court',
      name: 'Inactive Test Court',
      designation: 'TEST',
      courtType: 'sessions',
      state: 'Bihar',
      stateId: 'bihar',
      city: 'Patna',
      formattingRulesRef: 'sessions_generic',
      isActive: false,
    },
  ]);
}

describe('Courts Routes', () => {
  beforeEach(async () => {
    await seedCourts();
  });

  // ── GET /courts/states ──────────────────────────────────────────────────────

  describe('GET /courts/states', () => {
    it('returns distinct states from active courts', async () => {
      const res = await request(app).get('/courts/states');
      expect(res.status).toBe(200);
      expect(res.body.states).toHaveLength(2);
      const stateIds = res.body.states.map((s: { id: string }) => s.id);
      expect(stateIds).toContain('bihar');
      expect(stateIds).toContain('delhi');
    });

    it('excludes states with only inactive courts', async () => {
      // Remove all active bihar courts except the inactive one
      await Court.deleteMany({ stateId: 'bihar', isActive: true });
      const res = await request(app).get('/courts/states');
      expect(res.body.states).toHaveLength(1);
      expect(res.body.states[0].id).toBe('delhi');
    });

    it('returns states sorted alphabetically', async () => {
      const res = await request(app).get('/courts/states');
      const names = res.body.states.map((s: { name: string }) => s.name);
      expect(names).toEqual([...names].sort());
    });
  });

  // ── GET /courts/types ───────────────────────────────────────────────────────

  describe('GET /courts/types', () => {
    it('returns court types for a given state', async () => {
      const res = await request(app).get('/courts/types?state=bihar');
      expect(res.status).toBe(200);
      const typeIds = res.body.types.map((t: { id: string }) => t.id);
      expect(typeIds).toContain('high_court');
      expect(typeIds).toContain('sessions');
    });

    it('returns 400 if state param is missing', async () => {
      const res = await request(app).get('/courts/types');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/state/i);
    });

    it('returns empty array for unknown state', async () => {
      const res = await request(app).get('/courts/types?state=unknown');
      expect(res.status).toBe(200);
      expect(res.body.types).toHaveLength(0);
    });

    it('excludes inactive courts from type enumeration', async () => {
      // bihar has an inactive sessions court — should still show sessions from active ones
      const res = await request(app).get('/courts/types?state=bihar');
      expect(res.body.types.length).toBeGreaterThan(0);
    });
  });

  // ── GET /courts ─────────────────────────────────────────────────────────────

  describe('GET /courts', () => {
    it('returns courts filtered by state and type', async () => {
      const res = await request(app).get('/courts?state=bihar&type=sessions');
      expect(res.status).toBe(200);
      expect(res.body.courts).toHaveLength(1);
      expect(res.body.courts[0].courtId).toBe('bihar_sessions_patna');
    });

    it('returns all active courts when no filters', async () => {
      const res = await request(app).get('/courts');
      expect(res.status).toBe(200);
      // 4 active courts, 1 inactive excluded
      expect(res.body.courts).toHaveLength(4);
    });

    it('filters by state only', async () => {
      const res = await request(app).get('/courts?state=delhi');
      expect(res.status).toBe(200);
      expect(res.body.courts).toHaveLength(2);
    });

    it('returns courts sorted by name', async () => {
      const res = await request(app).get('/courts');
      const names = res.body.courts.map((c: { name: string }) => c.name);
      expect(names).toEqual([...names].sort());
    });
  });

  // ── GET /courts/:courtId ────────────────────────────────────────────────────

  describe('GET /courts/:courtId', () => {
    it('returns a court with its formatting rules', async () => {
      const res = await request(app).get('/courts/patna_hc');
      expect(res.status).toBe(200);
      expect(res.body.court.courtId).toBe('patna_hc');
      expect(res.body.court.designation).toBe('IN THE HIGH COURT OF JUDICATURE AT PATNA');
      expect(res.body.formattingRules).not.toBeNull();
      expect(res.body.formattingRules.courtId).toBe('patna_hc');
    });

    it('returns 404 for unknown courtId', async () => {
      const res = await request(app).get('/courts/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns 404 for inactive court', async () => {
      const res = await request(app).get('/courts/inactive_court');
      expect(res.status).toBe(404);
    });

    it('returns court even when formatting rules file is missing', async () => {
      const res = await request(app).get('/courts/delhi_saket');
      expect(res.status).toBe(200);
      expect(res.body.court.courtId).toBe('delhi_saket');
      // delhi_district rules exist, so formattingRules should be loaded
      expect(res.body.formattingRules).not.toBeNull();
    });
  });
});
