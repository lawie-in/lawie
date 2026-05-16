/**
 * SCRUM-83 — bookmarks + recent endpoints (users.routes).
 */
import './setupEnv';
import './setupDb';
import request from 'supertest';

import app from '../app';
import { SectionBookmark } from '../models/SectionBookmark.model';
import { SectionRecent } from '../models/SectionRecent.model';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439012';

function headers(userId = USER_A, plan: 'free' | 'pro' = 'free') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': `${userId}@test.com`,
    'x-user-name': 'Test',
    'x-user-plan': plan,
    'x-user-role': 'Client',
  };
}

describe('Users Routes (SCRUM-83)', () => {
  beforeEach(async () => {
    await SectionBookmark.syncIndexes();
    await SectionRecent.syncIndexes();
  });

  describe('POST /users/me/bookmarks/sections', () => {
    it('rejects unauth (no internal secret)', async () => {
      const res = await request(app)
        .post('/users/me/bookmarks/sections')
        .send({ code: 'BNS', section: '103' });
      expect(res.status).toBe(401);
    });

    it('creates a bookmark and returns the persisted row', async () => {
      const res = await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers())
        .send({ code: 'BNS', section: '103', title: 'Murder' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ code: 'BNS', section: '103', title: 'Murder' });
      expect(res.body.id).toBeDefined();
    });

    it('rejects missing fields', async () => {
      const res = await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers())
        .send({ code: 'BNS' });
      expect(res.status).toBe(400);
    });

    it('upserts on duplicate (same user + code + section)', async () => {
      await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers())
        .send({ code: 'BNS', section: '103', title: 'Murder' });
      const second = await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers())
        .send({ code: 'BNS', section: '103', title: 'Murder (again)' });
      expect(second.status).toBe(201);
      const count = await SectionBookmark.countDocuments();
      expect(count).toBe(1);
    });
  });

  describe('GET /users/me/bookmarks/sections', () => {
    it('returns only the calling user’s bookmarks, newest first', async () => {
      await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers(USER_A))
        .send({ code: 'BNS', section: '103', title: 'Murder' });
      await new Promise((r) => setTimeout(r, 10));
      await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers(USER_A))
        .send({ code: 'BNS', section: '85', title: 'Cruelty' });
      // Different user should not appear.
      await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers(USER_B))
        .send({ code: 'BNS', section: '111', title: 'Organised crime' });

      const res = await request(app).get('/users/me/bookmarks/sections').set(headers(USER_A));
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.bookmarks[0].section).toBe('85'); // newest first
      expect(res.body.bookmarks[1].section).toBe('103');
    });
  });

  describe('DELETE /users/me/bookmarks/sections/:id', () => {
    it('removes the user’s own bookmark', async () => {
      const created = await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers())
        .send({ code: 'BNS', section: '103', title: 'Murder' });
      const del = await request(app)
        .delete(`/users/me/bookmarks/sections/${created.body.id}`)
        .set(headers());
      expect(del.status).toBe(204);
      expect(await SectionBookmark.countDocuments()).toBe(0);
    });

    it('returns 404 when deleting another user’s bookmark', async () => {
      const created = await request(app)
        .post('/users/me/bookmarks/sections')
        .set(headers(USER_A))
        .send({ code: 'BNS', section: '103', title: 'Murder' });
      const del = await request(app)
        .delete(`/users/me/bookmarks/sections/${created.body.id}`)
        .set(headers(USER_B));
      expect(del.status).toBe(404);
    });

    it('rejects invalid id', async () => {
      const res = await request(app).delete('/users/me/bookmarks/sections/notanid').set(headers());
      expect(res.status).toBe(400);
    });
  });

  describe('Recent searches', () => {
    it('POST upserts and bumps searchedAt on repeat', async () => {
      const first = await request(app)
        .post('/users/me/recent/sections')
        .set(headers())
        .send({ code: 'BNS', section: '103', title: 'Murder' });
      expect(first.status).toBe(200);
      await new Promise((r) => setTimeout(r, 15));
      const second = await request(app)
        .post('/users/me/recent/sections')
        .set(headers())
        .send({ code: 'BNS', section: '103', title: 'Murder' });
      expect(second.status).toBe(200);
      expect(new Date(second.body.searchedAt).getTime()).toBeGreaterThan(
        new Date(first.body.searchedAt).getTime(),
      );
      expect(await SectionRecent.countDocuments()).toBe(1);
    });

    it('GET returns up to 20 newest, scoped to the calling user', async () => {
      for (let i = 0; i < 22; i++) {
        await request(app)
          .post('/users/me/recent/sections')
          .set(headers(USER_A))
          .send({ code: 'BNS', section: `${100 + i}`, title: `t${i}` });
      }
      await request(app)
        .post('/users/me/recent/sections')
        .set(headers(USER_B))
        .send({ code: 'BNS', section: '999', title: 'other-user' });
      const res = await request(app).get('/users/me/recent/sections').set(headers(USER_A));
      expect(res.status).toBe(200);
      expect(res.body.count).toBeLessThanOrEqual(20);
      expect(res.body.recent.every((r: { section: string }) => r.section !== '999')).toBe(true);
    });
  });
});
