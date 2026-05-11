import './setupDb';
import request from 'supertest';

import app from '../app';
import { Template } from '../models/Template.model';

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
      name: 'Bail Application',
      slug: 'bail-application',
      category: 'criminal',
      docType: 'bail_application',
      description: 'Standard bail application',
      promptTemplate: 'Draft a bail application for {{clientName}}',
      planAccess: 'free',
      reviewedBy: 'Ajay CLO',
      isActive: true,
    },
    {
      name: 'Writ Petition',
      slug: 'writ-petition',
      category: 'civil',
      docType: 'petition',
      description: 'Writ petition under Article 226',
      promptTemplate: 'Draft a writ petition for {{clientName}}',
      planAccess: 'pro',
      reviewedBy: 'Ajay CLO',
      isActive: true,
    },
    {
      name: 'Inactive Template',
      slug: 'inactive-template',
      category: 'civil',
      docType: 'legal_notice',
      description: 'Inactive template',
      promptTemplate: 'Draft a notice',
      planAccess: 'free',
      reviewedBy: 'Ajay CLO',
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
      expect(res.body.templates).toHaveLength(1);
      expect(res.body.templates[0].slug).toBe('bail-application');
      expect(res.body.plan).toBe('free');
    });

    it('pro user sees all templates', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('pro'));
      expect(res.status).toBe(200);
      expect(res.body.templates).toHaveLength(2); // bail-application + writ-petition (inactive excluded)
      expect(res.body.plan).toBe('pro');
    });

    it('inactive templates are never returned', async () => {
      const res = await request(app).get('/templates').set(internalHeaders('pro'));
      const slugs = res.body.templates.map((t: { slug: string }) => t.slug);
      expect(slugs).not.toContain('inactive-template');
    });
  });

  describe('GET /templates/:slug', () => {
    it('returns 401 without internal secret', async () => {
      const res = await request(app).get('/templates/bail-application');
      expect(res.status).toBe(401);
    });

    it('free user can access free template', async () => {
      const res = await request(app)
        .get('/templates/bail-application')
        .set(internalHeaders('free'));
      expect(res.status).toBe(200);
      expect(res.body.template.slug).toBe('bail-application');
    });

    it('free user gets 403 on pro template', async () => {
      const res = await request(app).get('/templates/writ-petition').set(internalHeaders('free'));
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Pro plan');
      expect(res.body.upgradeUrl).toBeDefined();
    });

    it('pro user can access pro template', async () => {
      const res = await request(app).get('/templates/writ-petition').set(internalHeaders('pro'));
      expect(res.status).toBe(200);
      expect(res.body.template.slug).toBe('writ-petition');
    });

    it('returns 404 for unknown slug', async () => {
      const res = await request(app)
        .get('/templates/nonexistent-slug')
        .set(internalHeaders('free'));
      expect(res.status).toBe(404);
    });

    it('returns 404 for inactive template', async () => {
      const res = await request(app)
        .get('/templates/inactive-template')
        .set(internalHeaders('pro'));
      expect(res.status).toBe(404);
    });
  });
});
