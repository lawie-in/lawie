/**
 * T-567 item 24 (Ajay, signed 22 Oct): the rate-limit line is the T-221 line. {n} is the
 * Retry-After seconds rounded up to whole minutes, minimum 1; n = 1 gives the one-minute
 * line; no usable Retry-After gives the generic line. No upsell. Both limiters.
 */
import express from 'express';
import request from 'supertest';

import { rateLimitMessage } from '../middleware/rateLimiter';

const ONE_MINUTE = 'Too many requests. Please wait 1 minute, then try again.';
const GENERIC = 'Too many requests. Please wait a few minutes, then try again.';

describe('T-567 rateLimitMessage', () => {
  it.each([
    [1, ONE_MINUTE],
    [30, ONE_MINUTE],
    [60, ONE_MINUTE],
    [0, ONE_MINUTE],
    [61, 'Too many requests. Please wait 2 minutes, then try again.'],
    [120, 'Too many requests. Please wait 2 minutes, then try again.'],
    [121, 'Too many requests. Please wait 3 minutes, then try again.'],
    ['899', 'Too many requests. Please wait 15 minutes, then try again.'],
    [900, 'Too many requests. Please wait 15 minutes, then try again.'],
  ])('Retry-After %p', (seconds, expected) => {
    expect(rateLimitMessage(seconds)).toBe(expected);
  });

  it.each([[undefined], [null], [''], ['soon'], [NaN], [-5], [Infinity]])(
    'unusable Retry-After %p gives the generic line',
    (value) => {
      expect(rateLimitMessage(value)).toBe(GENERIC);
    },
  );

  it('never mentions an upgrade', () => {
    for (const v of [1, 100, undefined]) {
      expect(rateLimitMessage(v)).not.toMatch(/upgrade|pro|limits/i);
    }
  });
});

describe('T-567 both limiters answer with the signed text from the real Retry-After header', () => {
  /** Fresh module (fresh in-memory counters) mounted on a tiny app. */
  function mount(kind: 'plan' | 'public') {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require('../middleware/rateLimiter');
    const app = express();
    app.set('trust proxy', 1);
    app.use((req, _res, next) => {
      req.jwtPayload = { sub: 'u_t567', plan: 'free' } as never;
      next();
    });
    app.use(kind === 'plan' ? mod.createPlanRateLimiter() : mod.publicRateLimiter);
    app.get('/x', (_req, res) => {
      res.json({ ok: true });
    });
    return request(app);
  }

  it('plan limiter (60 s window, free = 60): the 61st request gets the one-minute line', async () => {
    const agent = mount('plan');
    for (let i = 0; i < 60; i++) await agent.get('/x').expect(200);
    const res = await agent.get('/x');
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(res.body).toEqual({ error: ONE_MINUTE });
    expect(Object.keys(res.body)).toEqual(['error']);
  });

  it('public limiter (15 min window, 200): the 201st request gets the 15-minute line', async () => {
    const agent = mount('public');
    for (let i = 0; i < 200; i++) await agent.get('/x').expect(200);
    const res = await agent.get('/x');
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(900);
    expect(res.body).toEqual({
      error: 'Too many requests. Please wait 15 minutes, then try again.',
    });
    expect(Object.keys(res.body)).toEqual(['error']);
  });
});
