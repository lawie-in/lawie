import './setupDb';
import request from 'supertest';

import app from '../app';
import { clearConfigCache } from '../services/template-engine.service';

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

describe('GET /template-configs', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('strips the document-rules config prefix from a listed description', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    const affidavitIdentity = res.body.templates.find(
      (t: { template_id: string }) => t.template_id === 'affidavit_identity',
    );
    expect(affidavitIdentity.description).toBe(
      'Standalone affidavit of identity for KYC, bank, property, government use',
    );
  });

  it('strips the prefix when the id segment has a parenthetical, not a single token', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const jda = res.body.templates.find(
      (t: { template_id: string }) => t.template_id === 'joint_development_agreement',
    );
    expect(jda.description).not.toContain('Document-rules config for');
    expect(jda.description.startsWith('Landowner contributes land')).toBe(true);
  });

  it('leaves a listed description with no config prefix unchanged', async () => {
    const res = await request(app).get('/template-configs').set(internalHeaders('pro'));
    const certiorari = res.body.templates.find(
      (t: { template_id: string }) => t.template_id === 'certiorari',
    );
    expect(certiorari.description).toBe(
      'Writ of certiorari to quash an order, decision, or proceeding of an inferior court, tribunal, or quasi-judicial authority for want or excess of jurisdiction, violation of natural justice, or error of law apparent on the face of the record.',
    );
  });
});

describe('GET /template-configs/:id', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('strips the document-rules config prefix from a single config description', async () => {
    const res = await request(app)
      .get('/template-configs/affidavit_identity')
      .set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config.description).toBe(
      'Standalone affidavit of identity for KYC, bank, property, government use',
    );
  });

  it('leaves a single config description with no config prefix unchanged', async () => {
    const res = await request(app).get('/template-configs/certiorari').set(internalHeaders('pro'));
    expect(res.status).toBe(200);
    expect(res.body.config.description).toBe(
      'Writ of certiorari to quash an order, decision, or proceeding of an inferior court, tribunal, or quasi-judicial authority for want or excess of jurisdiction, violation of natural justice, or error of law apparent on the face of the record.',
    );
  });
});
