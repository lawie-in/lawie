/**
 * T-003 — admin cost screens convert USD→INR using the AppSetting rate
 * instead of a hardcoded 85, with a safe fallback to 85 if unset.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Generation } from '../models/Generation.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439011';

function adminHeaders() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'admin@test.com',
    'x-user-name': 'Admin',
    'x-user-plan': 'pro',
    'x-user-role': 'Admin',
  };
}

beforeEach(async () => {
  _clearAppSettingsCache();
  await Generation.create({
    userId: USER_ID,
    docType: 'bail_application',
    tokensUsed: 1000,
    costUsd: 2, // deliberately simple — makes costInr = rate * 2
  });
});

describe('GET /admin/ai-usage — USD to INR conversion', () => {
  it('uses the configured billing.usd_to_inr_rate', async () => {
    await AppSetting.create({ key: 'billing.usd_to_inr_rate', value: '90' });

    const res = await request(app).get('/admin/ai-usage').set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.totalCostUsd).toBe(2);
    expect(res.body.totalCostInr).toBe(180); // 2 * 90, not 2 * 85
  });

  it('falls back to 85 when the rate is not configured', async () => {
    const res = await request(app).get('/admin/ai-usage').set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.totalCostInr).toBe(170); // 2 * 85 fallback
  });
});

describe('GET /admin/documents/analytics — USD to INR conversion', () => {
  it('uses the configured billing.usd_to_inr_rate for aiCostInr', async () => {
    await AppSetting.create({ key: 'billing.usd_to_inr_rate', value: '90' });

    const res = await request(app).get('/admin/documents/analytics').set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.kpis.aiCostInr).toBe(180);
  });
});
