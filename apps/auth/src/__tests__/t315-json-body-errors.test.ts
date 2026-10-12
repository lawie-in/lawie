import { BODY_PARSER_ERRORS } from '@lawie/shared';
import request from 'supertest';

// Without this, loading ../app opens a real Redis connection that keeps Jest from exiting.
jest.mock('ioredis', () => require('ioredis-mock'));

import app from '../app';
import logger from '../config/logger';

// T-315 — auth: a body the json/urlencoded parsers reject gets a fixed JSON 4xx that echoes
// nothing and never reaches Sentry or errorHandler (which would log it and answer 500).
// Before T-315 auth answered 500, logged the body slice at error level and sent it to Sentry.

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

const FRAGMENT = '{"email": "a@b.co", "password": "Sup3rS3cret!" oops}';
const SECRETS = ['Sup3rS3cret', 'password', 'Unexpected token', 'SyntaxError', 'is not valid JSON'];
const ENVS = ['production', 'development'] as const;
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
const JSON_ROUTES = ['/login', '/register'];

const expectNoEcho = (text: string) => {
  // body-parser lower-cases the encoding name and upper-cases the charset, so compare case-insensitively.
  const lower = text.toLowerCase();
  for (const s of SECRETS) expect(lower).not.toContain(s.toLowerCase());
};

describe('T-315 auth body parser errors', () => {
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

  // errorHandler logs 'Request failed' at error level; the Redis client may log unrelated
  // connection errors at the same level, so match on the message.
  const errorLevelCalls = () =>
    [...loggerSpies.flatMap((s) => s.mock.calls)].filter((c) => c[1] === 'Request failed').length;

  describe.each(ENVS)('NODE_ENV=%s', (e) => {
    beforeEach(() => useEnv(e));

    it.each(JSON_ROUTES)('malformed JSON to POST %s gets 400 {error: Bad Request}', async (r) => {
      const res = await request(app).post(r).set('Content-Type', 'application/json').send(FRAGMENT);
      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).toBe('{"error":"Bad Request"}');
      expectNoEcho(res.text);
      expect(errorLevelCalls()).toBe(0);
      expectNoEcho(loggedText());
      expect(mockSentrySeen).not.toHaveBeenCalled();
      expect(mockSentryCapture).not.toHaveBeenCalled();
    });

    it('over-limit JSON (>10mb) gets 413, no echo, no log', async () => {
      const big = JSON.stringify({
        password: 'Sup3rS3cret!'.repeat(Math.ceil((10 * 1024 * 1024) / 12) + 10),
      });
      const res = await request(app)
        .post('/login')
        .set('Content-Type', 'application/json')
        .send(big);
      expect(res.status).toBe(413);
      expect(res.text).toBe('{"error":"Payload Too Large"}');
      expectNoEcho(res.text);
      expect(errorLevelCalls()).toBe(0);
      expectNoEcho(loggedText());
      expect(mockSentrySeen).not.toHaveBeenCalled();
    });

    it('unsupported Content-Encoding gets 415, no echo, no log', async () => {
      const res = await request(app)
        .post('/login')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'Sup3rS3cret-enc')
        .send(FRAGMENT);
      expect(res.status).toBe(415);
      expect(res.text).toBe('{"error":"Unsupported Media Type"}');
      expectNoEcho(res.text);
      expect(errorLevelCalls()).toBe(0);
      expectNoEcho(loggedText());
      expect(mockSentrySeen).not.toHaveBeenCalled();
    });

    it('unsupported JSON charset gets 415, no echo, no log', async () => {
      const res = await request(app)
        .post('/login')
        .set('Content-Type', 'application/json; charset=Sup3rS3cret-cs')
        .send(FRAGMENT);
      expect(res.status).toBe(415);
      expect(res.text).toBe('{"error":"Unsupported Media Type"}');
      expectNoEcho(res.text);
      expectNoEcho(loggedText());
      expect(mockSentrySeen).not.toHaveBeenCalled();
    });

    it('urlencoded with an unsupported charset gets 415, no echo, no log', async () => {
      const res = await request(app)
        .post('/login')
        .set('Content-Type', 'application/x-www-form-urlencoded; charset=Sup3rS3cret-cs')
        .send('email=a%40b.co&password=Sup3rS3cret!');
      expect(res.status).toBe(415);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).toBe('{"error":"Unsupported Media Type"}');
      expectNoEcho(res.text);
      expect(errorLevelCalls()).toBe(0);
      expectNoEcho(loggedText());
      expect(mockSentrySeen).not.toHaveBeenCalled();
      expect(mockSentryCapture).not.toHaveBeenCalled();
    });

    it('over-limit urlencoded (>100kb default) gets 413, no echo', async () => {
      const res = await request(app)
        .post('/login')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('password=' + 'Sup3rS3cret'.repeat(12000));
      expect(res.status).toBe(413);
      expect(res.text).toBe('{"error":"Payload Too Large"}');
      expectNoEcho(res.text);
      expectNoEcho(loggedText());
    });

    it('urlencoded with more than 1000 parameters (parameters.too.many) gets 413, no echo', async () => {
      const body =
        'password=Sup3rS3cret!&' + Array.from({ length: 1100 }, (_, i) => `k${i}=v`).join('&');
      const res = await request(app)
        .post('/login')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(body);
      expect(res.status).toBe(413);
      expect(res.text).toBe('{"error":"Payload Too Large"}');
      expectNoEcho(res.text);
      expect(errorLevelCalls()).toBe(0);
      expectNoEcho(loggedText());
      expect(mockSentrySeen).not.toHaveBeenCalled();
    });

    // querystring.parse.rangeError could not be triggered through a real request (the parser
    // fails first with parameters.too.many), so the mounted middleware is called directly.
    it('querystring.parse.rangeError gets 400 {error: Bad Request} from the mounted middleware', () => {
      const layers = (
        app as unknown as { _router: { stack: { handle: (...a: unknown[]) => void }[] } }
      )._router.stack
        .map((l) => l.handle)
        .filter((h) => h.length === 4);
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const err = Object.assign(new RangeError('Sup3rS3cret'), {
        type: 'querystring.parse.rangeError',
      });
      for (const h of layers) {
        h(err, { method: 'POST', path: '/login' }, { status }, jest.fn());
        if (status.mock.calls.length) break;
      }
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Bad Request' });
      expectNoEcho(JSON.stringify([status.mock.calls, json.mock.calls]));
      expectNoEcho(loggedText());
    });
  });

  describe('other traffic is unchanged', () => {
    it('unknown route still gets the existing 404', async () => {
      const res = await request(app).get('/no-such-route-t315');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Route not found', service: 'auth' });
    });

    it('valid JSON to an unknown route still gets 404', async () => {
      const res = await request(app).post('/no-such-route-t315').send({ a: 1 });
      expect(res.status).toBe(404);
    });

    it('/health returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });

  describe('T-320 BODY_PARSER_ERRORS is frozen', () => {
    it('the map and every entry are frozen', () => {
      expect(Object.isFrozen(BODY_PARSER_ERRORS)).toBe(true);
      for (const entry of Object.values(BODY_PARSER_ERRORS)) {
        expect(Object.isFrozen(entry)).toBe(true);
      }
    });

    it('assignment, addition and deletion do not change the map', () => {
      const before = JSON.stringify(BODY_PARSER_ERRORS);
      const m = BODY_PARSER_ERRORS as Record<string, { status: number; error: string }>;
      const attempts = [
        () => {
          m['entity.parse.failed'] = { status: 200, error: 'ok' };
        },
        () => {
          m['entity.parse.failed'].status = 200;
        },
        () => {
          m['x.new'] = { status: 418, error: 'teapot' };
        },
        () => {
          delete m['entity.too.large'];
        },
      ];
      // Strict mode throws TypeError on writes to frozen objects; sloppy mode ignores them.
      for (const a of attempts) {
        try {
          a();
        } catch (e) {
          expect(e).toBeInstanceOf(TypeError);
        }
      }
      expect(JSON.stringify(BODY_PARSER_ERRORS)).toBe(before);
      expect(BODY_PARSER_ERRORS['entity.parse.failed']).toEqual({
        status: 400,
        error: 'Bad Request',
      });
      expect('x.new' in BODY_PARSER_ERRORS).toBe(false);
    });
  });
});
