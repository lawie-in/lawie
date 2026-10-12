import request from 'supertest';

import app from '../app';
import logger from '../config/logger';

// T-307 — a body the parsers reject gets a fixed JSON reply that echoes nothing.
// No DB needed. Express reads app.get('env') per request, so the cases run under both.

// Sentry's real Express handler captures through @sentry/core internals (and Sentry is not
// initialised under test), so spying on exports proves nothing. Replace it with a recorder
// that sits at the exact position the real one is installed, and assert what reaches it.
const mockSentrySeen = jest.fn();
const mockSentryCapture = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureException: (...a: unknown[]) => mockSentryCapture(...a),
  captureMessage: (...a: unknown[]) => mockSentryCapture(...a),
  setupExpressErrorHandler: (app: { use: (h: unknown) => void }) => {
    app.use((err: unknown, _req: unknown, _res: unknown, next: (e: unknown) => void) => {
      mockSentrySeen(err);
      next(err);
    });
  },
}));

const FRAGMENT = '{"text": FIR 123/2024 }';
const SECRETS = ['FIR', '123/2024', 'Unexpected token', 'SyntaxError', 'is not valid JSON'];
const ROUTES = ['/sections/read', '/sections/convert'];
const ENVS = ['production', 'development'] as const;
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

const expectNoEcho = (text: string) => {
  for (const s of SECRETS) expect(text).not.toContain(s);
};

describe('T-307 body parser errors', () => {
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

  const useEnv = (e: string) => {
    process.env.NODE_ENV = e;
    app.set('env', e);
  };

  const loggedText = (): string =>
    [
      ...loggerSpies.flatMap((s) => s.mock.calls),
      ...consoleSpies.flatMap((s) => s.mock.calls),
      ...stderrSpy.mock.calls,
      ...stdoutSpy.mock.calls,
    ]
      .map((c) => c.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      .join('\n');

  describe.each(ENVS)('NODE_ENV=%s', (e) => {
    beforeEach(() => useEnv(e));

    it.each(ROUTES)(
      'malformed JSON to %s gets 400 {error: Bad Request}, no echo',
      async (route) => {
        const res = await request(app)
          .post(route)
          .set('Content-Type', 'application/json')
          .send(FRAGMENT);
        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual({ error: 'Bad Request' });
        expectNoEcho(res.text);
        expect(res.text).toBe('{"error":"Bad Request"}');
      },
    );

    it('over-limit body gets 413 with fixed JSON, no echo', async () => {
      const big = JSON.stringify({
        text: 'FIR 123/2024 '.repeat(Math.ceil((10 * 1024 * 1024) / 13) + 10),
      });
      const res = await request(app)
        .post('/sections/read')
        .set('Content-Type', 'application/json')
        .send(big);
      expect(res.status).toBe(413);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({ error: 'Payload Too Large' });
      expectNoEcho(res.text);
    });

    it('unsupported Content-Encoding gets 415 with fixed JSON, no echo', async () => {
      const res = await request(app)
        .post('/sections/read')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'FIR-123-2024')
        .send(FRAGMENT);
      expect(res.status).toBe(415);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({ error: 'Unsupported Media Type' });
      expectNoEcho(res.text);
    });

    it('unsupported charset gets 415 with fixed JSON, no echo', async () => {
      const res = await request(app)
        .post('/sections/read')
        .set('Content-Type', 'application/json; charset=FIR-123-2024')
        .send(FRAGMENT);
      expect(res.status).toBe(415);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({ error: 'Unsupported Media Type' });
      expectNoEcho(res.text);
    });

    it('logs neither the body fragment nor err.message, and never reaches Sentry', async () => {
      await request(app)
        .post('/sections/read')
        .set('Content-Type', 'application/json')
        .send(FRAGMENT);
      await request(app)
        .post('/sections/convert')
        .set('Content-Type', 'application/json')
        .send(FRAGMENT);
      expectNoEcho(loggedText());
      expect(mockSentrySeen).not.toHaveBeenCalled();
      expect(mockSentryCapture).not.toHaveBeenCalled();
    });
  });

  describe('other traffic is unchanged', () => {
    it('unknown route still gets the existing 404', async () => {
      const res = await request(app).get('/no-such-route-t307');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Route not found', service: 'drafting' });
    });

    it('valid JSON to an unknown route still gets 404, not a parse error', async () => {
      const res = await request(app).post('/no-such-route-t307').send({ text: 'ok' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Route not found', service: 'drafting' });
    });

    it('/health returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('a valid body to /sections/read is still parsed', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['303'] });
      expect(res.status).toBe(200);
    });
  });
});
