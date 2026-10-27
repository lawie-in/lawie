/**
 * T-616c - JWT_REFRESH_EXPIRES_IN was dropped from the auth env schema. A deployment that
 * still sets it (an old deploy, a stale config) must keep booting, and the key must be stripped.
 */
import './setupEnv';

describe('loadEnv with a leftover JWT_REFRESH_EXPIRES_IN', () => {
  const SAVED = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
    Object.assign(process.env, SAVED);
    jest.restoreAllMocks();
  });

  it('boots and the parsed env has no JWT_REFRESH_EXPIRES_IN key', () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    let loaded = null as { env: Record<string, unknown> } | null;
    jest.isolateModules(() => {
      loaded = require('../config/env');
    });
    expect(exit).not.toHaveBeenCalled();
    expect(loaded!.env.JWT_SECRET).toBeDefined();
    expect(Object.keys(loaded!.env)).not.toContain('JWT_REFRESH_EXPIRES_IN');
  });
});
