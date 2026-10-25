/**
 * T-242 round 2 should-fixes: the tags are stored SET ... EX NX (first store wins) and the two
 * Redis calls wait at most 300 ms, failing open (no tags, sign-in untouched), with no tag in a log.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import logger from '../config/logger';
import redis from '../config/redis';
import {
  OAUTH_UTM_REDIS_TIMEOUT_MS,
  oauthUtmKey,
  storeOAuthUtm,
  takeOAuthUtm,
} from '../services/oauth-state';

const CHALLENGE = 'B'.repeat(43);
const KEY = oauthUtmKey(CHALLENGE);
const SENTINEL = 'zzredissentinel';

beforeEach(() => redis.flushall());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('T-242 storeOAuthUtm is SET NX', () => {
  it('a second store for the same challenge does not overwrite the first', async () => {
    await storeOAuthUtm(CHALLENGE, { utmSource: 'first', utmMedium: 'm1' });
    await storeOAuthUtm(CHALLENGE, { utmSource: 'second', utmCampaign: 'c2' });
    expect(JSON.parse((await redis.get(KEY)) as string)).toEqual({ s: 'first', m: 'm1' });
    expect(await takeOAuthUtm(CHALLENGE)).toEqual({ utmSource: 'first', utmMedium: 'm1' });
  });

  it('sends EX 600 and NX to Redis', async () => {
    const set = jest.spyOn(redis, 'set');
    await storeOAuthUtm(CHALLENGE, { utmSource: 'a' });
    expect(set).toHaveBeenCalledWith(KEY, '{"s":"a"}', 'EX', 600, 'NX');
  });
});

describe('T-242 a hanging Redis fails open after 300 ms', () => {
  it('the timeout is 300 ms', () => {
    expect(OAUTH_UTM_REDIS_TIMEOUT_MS).toBe(300);
  });

  it('store: SET never resolves -> resolves after 300 ms, not before', async () => {
    jest.useFakeTimers();
    jest.spyOn(redis, 'set').mockImplementation((() => new Promise(() => undefined)) as never);
    let done = false;
    const p = storeOAuthUtm(CHALLENGE, { utmSource: SENTINEL }).then(() => {
      done = true;
    });
    await jest.advanceTimersByTimeAsync(OAUTH_UTM_REDIS_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('take: MULTI GET+DEL never resolves -> undefined after 300 ms, not before', async () => {
    jest.useFakeTimers();
    jest.spyOn(redis, 'multi').mockImplementation((() => ({
      get: () => ({ del: () => ({ exec: () => new Promise(() => undefined) }) }),
    })) as never);
    let result: unknown = 'pending';
    const p = takeOAuthUtm(CHALLENGE).then((r) => {
      result = r;
    });
    await jest.advanceTimersByTimeAsync(OAUTH_UTM_REDIS_TIMEOUT_MS - 1);
    expect(result).toBe('pending');
    await jest.advanceTimersByTimeAsync(1);
    await p;
    expect(result).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('real clock: a hung SET and a hung MULTI each delay by about 300 ms, not more', async () => {
    jest.spyOn(redis, 'set').mockImplementation((() => new Promise(() => undefined)) as never);
    jest.spyOn(redis, 'multi').mockImplementation((() => ({
      get: () => ({ del: () => ({ exec: () => new Promise(() => undefined) }) }),
    })) as never);

    const t0 = Date.now();
    await storeOAuthUtm(CHALLENGE, { utmSource: SENTINEL });
    const storeMs = Date.now() - t0;
    const t1 = Date.now();
    const tags = await takeOAuthUtm(CHALLENGE);
    const takeMs = Date.now() - t1;

    expect(tags).toBeUndefined();
    expect(storeMs).toBeGreaterThanOrEqual(290);
    expect(storeMs).toBeLessThan(700);
    expect(takeMs).toBeGreaterThanOrEqual(290);
    expect(takeMs).toBeLessThan(700);
  });

  it('a slow Redis that fails after the timeout does not become an unhandled rejection', async () => {
    jest.useFakeTimers();
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      let rejectLate: (e: Error) => void = () => undefined;
      jest
        .spyOn(redis, 'set')
        .mockImplementation((() => new Promise((_, rej) => (rejectLate = rej))) as never);
      const p = storeOAuthUtm(CHALLENGE, { utmSource: 'a' });
      await jest.advanceTimersByTimeAsync(OAUTH_UTM_REDIS_TIMEOUT_MS);
      await p;
      rejectLate(new Error('late failure'));
      jest.useRealTimers();
      await new Promise<void>((r) => setTimeout(r, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('a Redis that answers in time is unaffected', async () => {
    await storeOAuthUtm(CHALLENGE, { utmSource: 'fast', utmCampaign: 'c' });
    expect(await takeOAuthUtm(CHALLENGE)).toEqual({ utmSource: 'fast', utmCampaign: 'c' });
    expect(await redis.exists(KEY)).toBe(0);
  });
});

describe('T-242 the timeout path logs no tag value', () => {
  it('store and take timeouts warn without the tags', async () => {
    jest.useFakeTimers();
    const spies = (['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((l) =>
      jest.spyOn(logger, l).mockImplementation((() => undefined) as never),
    );
    jest.spyOn(redis, 'set').mockImplementation((() => new Promise(() => undefined)) as never);
    jest.spyOn(redis, 'multi').mockImplementation((() => ({
      get: () => ({ del: () => ({ exec: () => new Promise(() => undefined) }) }),
    })) as never);

    const a = storeOAuthUtm(CHALLENGE, { utmSource: SENTINEL, utmMedium: `${SENTINEL}m` });
    await jest.advanceTimersByTimeAsync(OAUTH_UTM_REDIS_TIMEOUT_MS);
    await a;
    const b = takeOAuthUtm(CHALLENGE);
    await jest.advanceTimersByTimeAsync(OAUTH_UTM_REDIS_TIMEOUT_MS);
    await b;

    const calls = spies.flatMap((s) => s.mock.calls);
    expect(calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(calls)).not.toContain(SENTINEL);
  });
});
