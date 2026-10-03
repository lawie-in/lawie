/**
 * T-003 §3.7 — admin cost screens: cost sums include failed rows (we paid
 * for them), generation counts exclude them. USD→INR comes from
 * finance.usd_inr, falling back to 85 when unset.
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
  await Generation.create([
    {
      userId: USER_ID,
      docType: 'bail_application',
      tokensUsed: 1000,
      costUsd: 2,
      status: 'completed',
    },
    {
      userId: USER_ID,
      docType: 'bail_application',
      tokensUsed: 200,
      costUsd: 0.5,
      status: 'failed',
    },
  ]);
});

describe('GET /admin/ai-usage — includes failed-row cost, excludes failed-row count', () => {
  it('sums cost across both rows but counts only the completed one', async () => {
    await AppSetting.create({ key: 'finance.usd_inr', value: '90' });

    const res = await request(app).get('/admin/ai-usage').set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.totalCostUsd).toBe(2.5); // 2 + 0.5, failed row included
    expect(res.body.totalCostInr).toBe(225); // 2.5 * 90
    expect(res.body.generationCount).toBe(1); // only the completed row
  });

  it('falls back to 85 when finance.usd_inr is not configured', async () => {
    const res = await request(app).get('/admin/ai-usage').set(adminHeaders());
    expect(res.body.totalCostInr).toBe(Math.round(2.5 * 85));
  });
});

describe('GET /admin/documents/analytics — same cost/count split', () => {
  it('includes failed-row cost, excludes failed rows from the generation count', async () => {
    await AppSetting.create({ key: 'finance.usd_inr', value: '90' });

    const res = await request(app).get('/admin/documents/analytics').set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.kpis.aiCostInr).toBe(225);
    expect(res.body.kpis.aiGenCount).toBe(1);
  });
});
