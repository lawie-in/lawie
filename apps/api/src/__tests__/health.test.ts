import request from 'supertest';
import app from '../app';

describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('lawie-api');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
  });
});

describe('GET /api/v1/unknown', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });
});
