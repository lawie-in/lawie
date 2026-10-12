import http from 'http';
import type { AddressInfo } from 'net';

import { logger } from '../config/logger';

// T-315 — email-worker: POST /send with a body express.json rejects gets a fixed JSON 4xx that
// echoes nothing. Uses createApp() (no BullMQ workers, no fixed port) and Node's fetch.
// Before T-315 there was no handler, so Express's default handler printed err.stack (with the
// body slice) to stderr and sent an HTML page.

import { createApp } from '../app';

const FRAGMENT = '{"to": "a@b.co", "data": {"otp": "SECRETOTP-123"} oops}';
const SECRETS = ['SECRETOTP', 'a@b.co', 'Unexpected token', 'SyntaxError', 'is not valid JSON'];
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

const expectNoEcho = (text: string) => {
  for (const s of SECRETS) expect(text).not.toContain(s);
};

describe('T-315 email-worker body parser errors', () => {
  let server: http.Server;
  let base: string;
  let loggerSpies: jest.SpyInstance[];
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let consoleSpies: jest.SpyInstance[];

  beforeAll(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });
  beforeEach(() => {
    loggerSpies = LEVELS.map((l) => jest.spyOn(logger, l));
    stderrSpy = jest.spyOn(process.stderr, 'write');
    stdoutSpy = jest.spyOn(process.stdout, 'write');
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  const loggedText = (): string =>
    [
      ...loggerSpies.flatMap((s) => s.mock.calls),
      ...consoleSpies.flatMap((s) => s.mock.calls),
      ...stderrSpy.mock.calls,
      ...stdoutSpy.mock.calls,
    ]
      .map((c) => c.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      .join('\n');

  const post = (headers: Record<string, string>, body: string) =>
    fetch(`${base}/send`, { method: 'POST', headers, body });

  it('malformed JSON gets 400 {error: Bad Request}, no echo, nothing logged', async () => {
    const res = await post({ 'Content-Type': 'application/json' }, FRAGMENT);
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(text).toBe('{"error":"Bad Request"}');
    expectNoEcho(text);
    expectNoEcho(loggedText());
  });

  it('over-limit body (>100kb) gets 413, no echo, nothing logged', async () => {
    const big = JSON.stringify({ data: { otp: 'SECRETOTP-123'.repeat(10000) } });
    const res = await post({ 'Content-Type': 'application/json' }, big);
    const text = await res.text();
    expect(res.status).toBe(413);
    expect(text).toBe('{"error":"Payload Too Large"}');
    expectNoEcho(text);
    expectNoEcho(loggedText());
  });

  it('unsupported Content-Encoding gets 415, no echo, nothing logged', async () => {
    const res = await post(
      { 'Content-Type': 'application/json', 'Content-Encoding': 'SECRETOTP-enc' },
      FRAGMENT,
    );
    const text = await res.text();
    expect(res.status).toBe(415);
    expect(text).toBe('{"error":"Unsupported Media Type"}');
    expectNoEcho(text);
    expectNoEcho(loggedText());
  });

  it('unsupported charset gets 415, no echo, nothing logged', async () => {
    const res = await post({ 'Content-Type': 'application/json; charset=SECRETOTP-cs' }, FRAGMENT);
    const text = await res.text();
    expect(res.status).toBe(415);
    expect(text).toBe('{"error":"Unsupported Media Type"}');
    expectNoEcho(text);
    expectNoEcho(loggedText());
  });

  it('valid JSON is still parsed (no secret header -> 401 from sendHandler, not 400)', async () => {
    const res = await post({ 'Content-Type': 'application/json' }, '{"template":"x"}');
    expect(res.status).toBe(401);
  });

  it('GET /health returns 200', async () => {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('email-worker');
  });
});
