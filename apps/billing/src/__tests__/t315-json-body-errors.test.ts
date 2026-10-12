import request from 'supertest';

import app from '../app';
import logger from '../config/logger';

// T-315 — billing: a body the json parser or the webhook's raw parser rejects gets a fixed JSON
// 4xx that echoes nothing and never reaches Sentry. No DB needed: parsing fails before routing.

const mockSentrySeen = jest.fn();
const mockSentryCapture = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureException: (...a: unknown[]) => mockSentryCapture(...a),
  captureMessage: (...a: unknown[]) => mockSentryCapture(...a),
  setupExpressErrorHandler: (a: { use: (h: unknown) => void }) => {
    a.use((err: unknown, _req: unknown, _res: unknown, next: (e: unknown) => void) => {
      mockSentrySeen(err);
      next(err);
    });
  },
}));

const FRAGMENT = '{"card": "4111-SECRETCARD", "amount": oops}';
const SECRETS = ['SECRETCARD', '4111', 'Unexpected token', 'SyntaxError', 'is not valid JSON'];
const ENVS = ['production', 'development'] as const;
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

const expectNoEcho = (text: string) => {
  // body-parser lower-cases the encoding name and upper-cases the charset, so compare case-insensitively.
  const lower = text.toLowerCase();
  for (const s of SECRETS) expect(lower).not.toContain(s.toLowerCase());
};

describe('T-315 billing body parser errors', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = app.get('env');
  let loggerSpies: jest.SpyInstance[];
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let consoleSpies: jest.SpyInstance[];

  beforeEach(() => {
    mockSentrySeen.mockClear();
    mockSentryCapture.mockClear();
    loggerSpies = LEVELS.map((l) => jest.spyOn(logger, l));
    stderrSpy = jest.spyOn(process.stderr, 'write');
    stdoutSpy = jest.spyOn(process.stdout, 'write');
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    app.set('env', originalAppEnv);
  });

  const loggedText = (): string =>
    [
      ...loggerSpies.flatMap((s) => s.mock.calls),
      ...consoleSpies.flatMap((s) => s.mock.calls),
      ...stderrSpy.mock.calls,
      ...stdoutSpy.mock.calls,
    ]
      .map((c) => c.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      .join('\n');

  const expectQuiet = () => {
    expectNoEcho(loggedText());
    expect(mockSentrySeen).not.toHaveBeenCalled();
    expect(mockSentryCapture).not.toHaveBeenCalled();
  };

  describe.each(ENVS)('NODE_ENV=%s', (e) => {
    beforeEach(() => {
      process.env.NODE_ENV = e;
      app.set('env', e);
    });

    it.each(['/subscribe', '/topup/order'])('malformed JSON to POST %s gets 400', async (route) => {
      const res = await request(app)
        .post(route)
        .set('Content-Type', 'application/json')
        .send(FRAGMENT);
      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).toBe('{"error":"Bad Request"}');
      expectNoEcho(res.text);
      expectQuiet();
    });

    it('over-limit JSON (>10mb) gets 413', async () => {
      const big = JSON.stringify({
        card: '4111-SECRETCARD'.repeat(Math.ceil((10 * 1024 * 1024) / 15) + 10),
      });
      const res = await request(app)
        .post('/subscribe')
        .set('Content-Type', 'application/json')
        .send(big);
      expect(res.status).toBe(413);
      expect(res.text).toBe('{"error":"Payload Too Large"}');
      expectNoEcho(res.text);
      expectQuiet();
    });

    it('over-limit body (>100kb) to /webhook/razorpay (express.raw) gets 413', async () => {
      const big = JSON.stringify({ card: '4111-SECRETCARD'.repeat(10000) });
      const res = await request(app)
        .post('/webhook/razorpay')
        .set('Content-Type', 'application/json')
        .send(big);
      expect(res.status).toBe(413);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).toBe('{"error":"Payload Too Large"}');
      expectNoEcho(res.text);
      expectQuiet();
    });

    it.each(['/subscribe', '/webhook/razorpay'])(
      'unsupported Content-Encoding to %s gets 415',
      async (route) => {
        const res = await request(app)
          .post(route)
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', 'SECRETCARD-enc')
          .send(FRAGMENT);
        expect(res.status).toBe(415);
        expect(res.text).toBe('{"error":"Unsupported Media Type"}');
        expectNoEcho(res.text);
        expectQuiet();
      },
    );

    it('unsupported JSON charset gets 415', async () => {
      const res = await request(app)
        .post('/subscribe')
        .set('Content-Type', 'application/json; charset=SECRETCARD-cs')
        .send(FRAGMENT);
      expect(res.status).toBe(415);
      expect(res.text).toBe('{"error":"Unsupported Media Type"}');
      expectNoEcho(res.text);
      expectQuiet();
    });
  });

  describe('other traffic is unchanged', () => {
    it('unknown route still gets the existing 404', async () => {
      const res = await request(app).get('/no-such-route-t315');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Route not found', service: 'billing' });
    });

    it('valid JSON to a guarded route is parsed and reaches auth (401, not 400)', async () => {
      const res = await request(app).post('/subscribe').send({ ok: 1 });
      expect(res.status).toBe(401);
    });

    it('/health returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });
});
