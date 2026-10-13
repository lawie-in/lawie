import './setupDb';
import request from 'supertest';

import app from '../app';
import * as promoter from '../services/template-promoter';
import { clearConfigCache } from '../services/template-engine.service';
import { cardDescriptionFor } from '../utils/cardDescription';

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

type Item = { template_id: string; description: string; credits_cost?: number };

/** Real registry with one pack's card_description removed (a pack lacking its signed line). */
function registryWithout(templateId: string) {
  const real = promoter.getTemplateRegistry();
  const configs = new Map(real.configs);
  const { card_description: _dropped, ...rest } = configs.get(templateId) as unknown as Record<
    string,
    unknown
  >;
  void _dropped;
  configs.set(templateId, rest as never);
  jest
    .spyOn(promoter, 'getTemplateRegistry')
    .mockReturnValue({ ...real, configs } as ReturnType<typeof promoter.getTemplateRegistry>);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /template-configs (T-365 AC6: the signed card line)', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('returns the signed card line for a known pack', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    const item = (res.body.templates as Item[]).find((t) => t.template_id === 'affidavit_identity');
    expect(item?.description).toBe(cardDescriptionFor('affidavit_identity'));
    expect(item?.description).toBe(
      "A sworn affidavit confirming a person's identity, for banks, offices and property work.",
    );
  });

  it('every listed description is its card line and never carries the config prefix', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const items = res.body.templates as Item[];
    expect(items.length).toBeGreaterThan(0);
    for (const t of items) {
      expect(t.description).toBe(cardDescriptionFor(t.template_id));
      expect(t.description).not.toContain('Document-rules config for');
    }
  });

  it("returns '' for a pack with no card line (no fallback to the internal text)", async () => {
    registryWithout('affidavit_identity');
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const item = (res.body.templates as Item[]).find((t) => t.template_id === 'affidavit_identity');
    expect(item?.description).toBe('');
    expect(JSON.stringify(item?.description)).not.toContain('Document-rules config for');
  });

  it('keeps the T-372 cost fields', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const item = (res.body.templates as Item[]).find((t) => t.template_id === 'affidavit_identity');
    expect(item?.credits_cost).toBe(1);
    expect(typeof res.body.guided_credits_cost).toBe('number');
  });
});

describe('GET /template-configs/:id (T-365 AC6: the signed card line)', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('returns the signed card line for a known pack', async () => {
    const res = await request(app)
      .get('/template-configs/affidavit_identity')
      .set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config.description).toBe(cardDescriptionFor('affidavit_identity'));
    expect(res.body.config.description).toBe(
      "A sworn affidavit confirming a person's identity, for banks, offices and property work.",
    );
  });

  it('never re-adds the old internal description (certiorari)', async () => {
    const res = await request(app).get('/template-configs/certiorari').set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config.description).toBe(cardDescriptionFor('certiorari'));
    expect(res.body.config.description).not.toContain('Document-rules config for');
    expect(res.body.config.description).not.toMatch(/inferior court, tribunal, or quasi-judicial/);
  });

  it("returns '' for a pack with no card line", async () => {
    registryWithout('affidavit_identity');
    const res = await request(app)
      .get('/template-configs/affidavit_identity')
      .set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config.description).toBe('');
  });

  it('still returns the form schema and structure beside the card line', async () => {
    const res = await request(app)
      .get('/template-configs/affidavit_identity')
      .set(internalHeaders('pro'));
    expect(res.body.config.template_id).toBe('affidavit_identity');
    expect(res.body.config.form_schema).toBeDefined();
    expect(res.body.config.document_structure).toBeDefined();
  });
});
