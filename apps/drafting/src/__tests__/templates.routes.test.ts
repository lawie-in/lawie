import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { TEMPLATE_CATALOGUE } from '../config/catalogue';
import { AppSetting } from '../models/AppSetting.model';
import { Template } from '../models/Template.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CIVIL_PLAINT_CATEGORY, TEMPLATE_CIVIL_PLAINT_SETTING } from '../services/feature-switches';
import { PUBLIC_TEMPLATE_ROW_KEYS } from '../utils/publicTemplateConfig';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;

function internalHeaders(plan: 'free' | 'pro' = 'free') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': '507f1f77bcf86cd799439011',
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': plan,
    'x-user-role': 'Client',
  };
}

async function seedTemplates() {
  await Template.insertMany([
    {
      templateId: 'bail-application',
      slug: 'bail-application',
      displayName: 'Bail Application',
      category: 'criminal',
      catalogueCategory: 'criminal_bail_custody',
      description: 'Standard bail application',
      planAccess: 'free',
      sourceFile: 'bail-application.json',
      creditsCost: 2,
      isActive: true,
    },
    {
      templateId: 'writ-petition',
      slug: 'writ-petition',
      displayName: 'Writ Petition',
      category: 'civil',
      catalogueCategory: 'writs_constitutional',
      description: 'Writ petition under Article 226',
      planAccess: 'pro',
      sourceFile: 'writ-petition.json',
      creditsCost: 2,
      isActive: true,
    },
    {
      templateId: 'affidavit_identity',
      slug: 'affidavit-identity',
      displayName: 'Affidavit of Identity',
      category: 'civil',
      catalogueCategory: 'affidavits_court_forms',
      description:
        'Document-rules config for affidavit_identity — standalone affidavit of identity for KYC, bank, property, government use',
      planAccess: 'free',
      sourceFile: 'affidavit-identity.json',
      creditsCost: 1,
      isActive: true,
    },
    {
      templateId: 'inactive-template',
      slug: 'inactive-template',
      displayName: 'Inactive Template',
      category: 'civil',
      catalogueCategory: 'notices_replies',
      description: 'Inactive template',
      planAccess: 'free',
      sourceFile: 'inactive-template.json',
      creditsCost: 2,
      isActive: false,
    },
  ]);
}

describe('Templates Routes', () => {
  beforeEach(async () => {
    await seedTemplates();
  });

  describe('GET /templates', () => {
    it('returns 401 without internal secret', async () => {
      const res = await request(app).get('/templates');
      expect(res.status).toBe(401);
    });

    it('free user only sees free templates', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('free'));
      expect(res.status).toBe(200);
      expect(res.body.templates).toHaveLength(2);
      const slugs = res.body.templates.map((t: { slug: string }) => t.slug);
      expect(slugs).toEqual(expect.arrayContaining(['bail-application', 'affidavit-identity']));
      expect(res.body.plan).toBe('free');
    });

    it('pro user sees all templates', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('pro'));
      expect(res.status).toBe(200);
      expect(res.body.templates).toHaveLength(3); // bail-application + writ-petition + affidavit-identity (inactive excluded)
      expect(res.body.plan).toBe('pro');
    });

    it('inactive templates are never returned', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('pro'));
      const slugs = res.body.templates.map((t: { slug: string }) => t.slug);
      expect(slugs).not.toContain('inactive-template');
    });

    it('returns the signed card line for a known pack id', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('free'));
      const template = res.body.templates.find(
        (t: { slug: string }) => t.slug === 'affidavit-identity',
      );
      expect(template.description).toBe(
        "A sworn affidavit confirming a person's identity, for banks, offices and property work.",
      );
    });

    it('returns an empty description for a slug with no pack', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('free'));
      const template = res.body.templates.find(
        (t: { slug: string }) => t.slug === 'bail-application',
      );
      expect(template.description).toBe('');
    });

    it('does not select the stored description from Mongo (T-365 review 1)', async () => {
      const selectSpy = jest.spyOn(mongoose.Query.prototype, 'select');
      try {
        const res = await request(app).get('/templates').set(internalHeaders('free'));
        expect(res.status).toBe(200);
        const fields = selectSpy.mock.calls.map((c) => String(c[0]));
        expect(fields.length).toBeGreaterThan(0);
        const listSelect = fields.find((f) => f.includes('templateId'));
        expect((listSelect ?? '').split(/\s+/)).not.toContain('description');
        expect(listSelect).toContain('displayName');
        const card = res.body.templates.find(
          (t: { slug: string }) => t.slug === 'affidavit-identity',
        );
        expect(card.description).toBe(
          "A sworn affidavit confirming a person's identity, for banks, offices and property work.",
        );
      } finally {
        selectSpy.mockRestore();
      }
    });

    it('never returns the old "Document-rules config for" text or a stored description', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('pro'));
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('Document-rules config for');
      expect(body).not.toContain('Standard bail application');
      expect(body).not.toContain('Writ petition under Article 226');
    });
  });

  describe('GET /templates hides plaint rows while feature.template_civil_plaint is off (T-385)', () => {
    const PLAINT_ID = Object.keys(TEMPLATE_CATALOGUE).filter(
      (id) => TEMPLATE_CATALOGUE[id].category === CIVIL_PLAINT_CATEGORY,
    )[0];
    const LEGACY_SLUG_ONLY = Object.keys(TEMPLATE_CATALOGUE).filter(
      (id) => TEMPLATE_CATALOGUE[id].category === CIVIL_PLAINT_CATEGORY,
    )[1];

    const plaintRow = (templateId: string, slug: string) => ({
      templateId,
      slug,
      displayName: `Plaint ${templateId}`,
      category: 'civil',
      catalogueCategory: CIVIL_PLAINT_CATEGORY,
      planAccess: 'free',
      sourceFile: `${templateId}.json`,
      creditsCost: 2,
      isActive: true,
    });

    beforeEach(async () => {
      _clearAppSettingsCache();
      await Template.insertMany([
        plaintRow(PLAINT_ID, PLAINT_ID),
        // a row from before SCRUM-80: its templateId differs, only the slug is the catalogue id
        plaintRow('legacy-plaint-row', LEGACY_SLUG_ONLY),
      ]);
    });

    afterEach(() => {
      _clearAppSettingsCache();
    });

    const slugs = (body: { templates: Array<{ slug: string }> }) =>
      body.templates.map((t) => t.slug);

    it('off (no AppSetting doc): rows matching by templateId or by slug are hidden, others stay', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('pro'));
      expect(res.status).toBe(200);
      expect(slugs(res.body)).not.toContain(PLAINT_ID);
      expect(slugs(res.body)).not.toContain(LEGACY_SLUG_ONLY);
      expect(slugs(res.body)).toEqual(
        expect.arrayContaining(['bail-application', 'writ-petition', 'affidavit-identity']),
      );
      expect(res.body.templates).toHaveLength(3);
    });

    it('off explicitly: same', async () => {
      await AppSetting.create({ key: TEMPLATE_CIVIL_PLAINT_SETTING, value: 'off' });
      const res = await request(app).get('/templates').set(internalHeaders('pro'));
      expect(slugs(res.body)).not.toContain(PLAINT_ID);
      expect(res.body.templates).toHaveLength(3);
    });

    it('on: both plaint rows are listed again, projected through publicTemplateRow', async () => {
      await AppSetting.create({ key: TEMPLATE_CIVIL_PLAINT_SETTING, value: 'on' });
      const res = await request(app).get('/templates').set(internalHeaders('pro'));
      expect(res.status).toBe(200);
      expect(slugs(res.body)).toEqual(expect.arrayContaining([PLAINT_ID, LEGACY_SLUG_ONLY]));
      expect(res.body.templates).toHaveLength(5);
      for (const row of res.body.templates) {
        for (const k of Object.keys(row)) {
          expect(PUBLIC_TEMPLATE_ROW_KEYS as readonly string[]).toContain(k);
        }
        expect(row).not.toHaveProperty('_id');
      }
    });
  });

  describe('GET /templates/:slug (T-385: route removed, no caller)', () => {
    it.each([
      ['bail-application', 'free'],
      ['writ-petition', 'free'],
      ['writ-petition', 'pro'],
      ['nonexistent-slug', 'pro'],
      ['inactive-template', 'pro'],
    ] as const)('GET /templates/%s is 404 for a %s user', async (slug, plan) => {
      const res = await request(app).get(`/templates/${slug}`).set(internalHeaders(plan));
      expect(res.status).toBe(404);
      expect(res.body.template).toBeUndefined();
    });

    it('the plan logic still lives on the list: free sees no pro template', async () => {
      const free = await request(app).get('/templates').set(internalHeaders('free'));
      expect(free.body.templates.map((t: { slug: string }) => t.slug)).not.toContain(
        'writ-petition',
      );
      const pro = await request(app).get('/templates').set(internalHeaders('pro'));
      expect(pro.body.templates.map((t: { slug: string }) => t.slug)).toContain('writ-petition');
    });
  });
});
