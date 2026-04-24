import request from 'supertest';
import app from '../app';

describe('Gateway', () => {
  describe('GET /health', () => {
    it('returns 200 with service name', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('gateway');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Unknown routes', () => {
    it('returns 404 for unmatched routes', async () => {
      const res = await request(app).get('/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.service).toBe('gateway');
    });
  });
});
