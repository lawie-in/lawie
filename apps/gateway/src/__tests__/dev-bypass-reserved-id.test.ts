/**
 * T-147e — the dev bypass must not be a way to act as the golden-set fixture
 * user (id 0000000000000000000f147e). Fixture rows are hidden from billing,
 * lists and analytics, so a real caller who could take that identity could hide
 * their own drafts from all three. The bypass exists only with
 * NODE_ENV=development; the app is loaded in that mode here.
 */
import request from 'supertest';

jest.mock('ioredis', () => require('ioredis-mock'));

const FIXTURE_ID = '0000000000000000000f147e';

function devApp() {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  let app!: import('express').Express;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    app = require('../app').default;
  });
  process.env.NODE_ENV = previous;
  return app;
}

describe('dev bypass and the reserved fixture user id', () => {
  const app = devApp();
  const get = (id: string) =>
    request(app).get('/api/documents').set('X-Dev-Bypass', 'true').set('X-Dev-User-Id', id);

  it.each([
    ['lower case', FIXTURE_ID],
    ['upper case', FIXTURE_ID.toUpperCase()],
    ['mixed case', '0000000000000000000F147e'],
  ])('refuses the fixture id (%s) with 403', async (_label, id) => {
    const res = await get(id);
    expect(res.status).toBe(403);
  });

  it('a normal dev user id still passes the bypass (no 401 or 403; the upstream is not running, so 502)', async () => {
    const res = await get('507f1f77bcf86cd799439011');
    expect([401, 403]).not.toContain(res.status);
  });

  it('the default dev id (no X-Dev-User-Id) still passes', async () => {
    const res = await request(app).get('/api/documents').set('X-Dev-Bypass', 'true');
    expect([401, 403]).not.toContain(res.status);
  });
});
