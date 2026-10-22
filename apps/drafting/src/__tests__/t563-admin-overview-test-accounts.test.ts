/**
 * T-563 - the admin overview leaves test accounts (isTestAccount) out of user counts, the Ink
 * in circulation and the recent-signups feed. A normal user is still counted.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const ADMIN = '507f1f77bcf86cd7994390b9';
const admin = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': ADMIN,
  'x-user-email': 'admin@test.com',
  'x-user-name': 'Admin',
  'x-user-plan': 'pro',
  'x-user-role': 'Admin',
});

async function seed() {
  const now = new Date();
  const users = mongoose.connection.db!.collection('users');
  await users.insertOne({
    name: 'Normal Person',
    email: 'normal.t563@example.com',
    createdAt: now,
    updatedAt: now,
    inkTopup: 10,
  });
  await users.insertMany([
    {
      name: 'TEST One',
      email: 'one.t563@example.com',
      isTestAccount: true,
      createdAt: now,
      updatedAt: now,
      inkTopup: 60,
    },
    {
      name: 'TEST Two',
      email: 'two.t563@example.com',
      isTestAccount: true,
      createdAt: now,
      updatedAt: now,
      inkTopup: 60,
    },
  ]);
}

describe('T-563 admin overview excludes test accounts', () => {
  it('kpis: user counts and Ink circulation count only the normal user', async () => {
    await seed();
    const res = await request(app).get('/admin/overview/kpis').set(admin());
    expect(res.status).toBe(200);
    expect(res.body.activeAdvocates.value).toBe(1);
    expect(res.body.activeAdvocates.deltaWeek).toBe(1);
    expect(res.body.inkCirculation).toBe(10);
  });

  it('activity: the signup feed shows the normal user and no test account', async () => {
    await seed();
    const res = await request(app).get('/admin/overview/activity').set(admin());
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).toContain('Normal Person');
    expect(text).not.toContain('TEST One');
    expect(text).not.toContain('TEST Two');
  });
});
