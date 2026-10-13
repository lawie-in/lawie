/**
 * T-372 — GET /template-configs carries each template's Ink cost, read from the same single
 * source the charge uses (T-227 costForTemplate), and leaves the field out when unpriced.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import * as credits from '../services/credits.service';
const { costForTemplate } = credits;
import * as engine from '../services/template-engine.service';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';
const headers = {
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': '507f1f77bcf86cd799439372',
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'pro',
  'x-user-role': 'Client',
};

interface Item {
  template_id: string;
  credits_cost?: number;
}

beforeEach(() => {
  engine.clearConfigCache();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /template-configs credits_cost', () => {
  it('every listed template carries the number the charge uses', async () => {
    const res = await request(app).get('/template-configs').set(headers);
    expect(res.status).toBe(200);
    const items = res.body.templates as Item[];
    expect(items.length).toBeGreaterThan(0);
    for (const t of items) {
      const expected = costForTemplate(t.template_id);
      if (expected === undefined) expect('credits_cost' in t).toBe(false);
      else expect(t.credits_cost).toBe(expected);
    }
    // the cost is a positive whole number of Ink for the priced ones
    const priced = items.filter((t) => t.credits_cost !== undefined);
    expect(priced.length).toBeGreaterThan(0);
    for (const t of priced) expect(Number.isInteger(t.credits_cost)).toBe(true);
  });

  it('known ids: a 1-Ink and a 2-Ink document', async () => {
    const res = await request(app).get('/template-configs').set(headers);
    const by = (id: string) => (res.body.templates as Item[]).find((t) => t.template_id === id);
    expect(by('affidavit_identity')?.credits_cost).toBe(1);
    expect(by('affidavit_identity')?.credits_cost).toBe(costForTemplate('affidavit_identity'));
    expect(by('bail_regular')?.credits_cost).toBe(costForTemplate('bail_regular'));
    expect(by('bail_regular')?.credits_cost).toBeGreaterThanOrEqual(1);
  });

  it('an id with no price has no credits_cost key at all', async () => {
    const real = engine.listTemplateConfigs();
    const fake = (id: string) => ({ ...real[0], template_id: id });
    jest
      .spyOn(engine, 'listTemplateConfigs')
      .mockReturnValue([fake('unpriced_doc_t372'), fake('toString'), fake('affidavit_identity')]);
    const res = await request(app).get('/template-configs').set(headers);
    expect(res.status).toBe(200);
    const [unpriced, proto, priced] = res.body.templates as Item[];
    expect(Object.prototype.hasOwnProperty.call(unpriced, 'credits_cost')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(proto, 'credits_cost')).toBe(false);
    expect(priced.credits_cost).toBe(1);
    expect(JSON.stringify(res.body.templates[0])).not.toContain('credits_cost');
  });
});

describe('GET /template-configs guided_credits_cost', () => {
  it('equals the guided price the charge uses, and templates are unchanged', async () => {
    const res = await request(app).get('/template-configs').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.guided_credits_cost).toBe(costForTemplate('guided'));
    expect(typeof res.body.guided_credits_cost).toBe('number');
    const items = res.body.templates as Item[];
    expect(items.length).toBe(engine.listTemplateConfigs().length);
    for (const t of items) expect(t.credits_cost).toBe(costForTemplate(t.template_id));
  });

  it('is absent when guided has no price', async () => {
    const real = credits.costForTemplate;
    jest
      .spyOn(credits, 'costForTemplate')
      .mockImplementation((id: string) => (id === 'guided' ? undefined : real(id)));
    const res = await request(app).get('/template-configs').set(headers);
    expect(res.status).toBe(200);
    expect('guided_credits_cost' in res.body).toBe(false);
    expect((res.body.templates as Item[]).some((t) => t.credits_cost !== undefined)).toBe(true);
  });
});
