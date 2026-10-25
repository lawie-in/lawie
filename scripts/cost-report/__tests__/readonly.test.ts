/**
 * Read-only guard. rows.ts projections hold no text fields; main.ts is run
 * against a fake mongoose whose collections record every method called.
 */
import { COLLECTIONS, PROJECTIONS } from '../lib/rows';

const ALLOWED = new Set([
  '_id',
  'userId',
  'documentId',
  'intakeId',
  'runId',
  'runSequence',
  'runType',
  'runOrigin',
  'status',
  'docType',
  'aiModel',
  'costUsd',
  'costStatus',
  'createdAt',
  'purpose',
  'key',
  'value',
  'inputTokens',
  'outputTokens',
  'cacheCreationInputTokens',
  'cacheReadInputTokens',
  'cacheCreation5mInputTokens',
]);
const TEXT_LIKE =
  /name|email|phone|address|brief|text|prompt|response|content|body|message|output$|answer|question|facts|party|parties|fixture(Id)?$|error/i;

describe('projections', () => {
  it.each(Object.entries(PROJECTIONS))(
    '%s projection is inclusive and has only whitelisted id/number/status fields',
    (_n, proj) => {
      for (const [k, v] of Object.entries(proj)) {
        if (k === '_id') continue;
        expect(v).toBe(1);
        expect(ALLOWED.has(k)).toBe(true);
      }
    },
  );

  it('no projected field looks like user text (docType/aiModel/outputTokens are known non-text)', () => {
    for (const proj of Object.values(PROJECTIONS)) {
      for (const k of Object.keys(proj)) {
        if (['outputTokens', 'runType'].includes(k)) continue;
        expect(k).not.toMatch(TEXT_LIKE);
      }
    }
  });

  it('settings only selects key and value', () => {
    expect(Object.keys(PROJECTIONS.settings).sort()).toEqual(['_id', 'key', 'value']);
  });
});

interface Call {
  coll: string;
  method: string;
  args: unknown[];
}

async function runMain(argv: string[], docs: Record<string, any[]>) {
  const calls: Call[] = [];
  const connOpts: any[] = [];
  const logs: string[] = [];
  const errs: string[] = [];
  const collection = (coll: string): any =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => {
          if (method === 'find') {
            return (...args: unknown[]) => {
              calls.push({ coll, method, args });
              return { toArray: async () => docs[coll] ?? [] };
            };
          }
          return (...args: unknown[]) => {
            calls.push({ coll, method: String(method), args });
            throw new Error(`non-read method called: ${String(method)}`);
          };
        },
      },
    );
  const fakeConn = {
    asPromise: async () => fakeConn,
    db: { collection },
    close: async () => undefined,
  };
  const fakeMongoose = {
    __esModule: true,
    default: {
      createConnection: (uri: string, o: unknown) => {
        connOpts.push({ uri, o });
        return fakeConn;
      },
      Types: {
        ObjectId: class {
          constructor(public v: string) {}
        },
      },
    },
  };
  let code: number | undefined;
  const exitDone = new Promise<void>((resolve) => {
    jest.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      code = c;
      resolve();
      return undefined as never;
    }) as any);
  });
  jest.spyOn(console, 'log').mockImplementation((...a) => void logs.push(a.join(' ')));
  jest.spyOn(console, 'error').mockImplementation((...a) => void errs.push(a.join(' ')));
  const oldArgv = process.argv;
  const oldUri = process.env.MONGO_URI;
  process.argv = ['node', 'main.ts', ...argv];
  process.env.MONGO_URI =
    'mongodb' + '://' + ['u', 'pw12345'].join(':') + '@' + 'h1.example:27017/db';
  const l1 = process.listeners('unhandledRejection');
  const l2 = process.listeners('uncaughtException');
  jest.resetModules();
  jest.doMock('mongoose', () => fakeMongoose);
  try {
    require('../main');
    await exitDone;
  } finally {
    process.argv = oldArgv;
    if (oldUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = oldUri;
    for (const l of process.listeners('unhandledRejection'))
      if (!l1.includes(l)) process.off('unhandledRejection', l);
    for (const l of process.listeners('uncaughtException'))
      if (!l2.includes(l)) process.off('uncaughtException', l);
    jest.restoreAllMocks();
  }
  return { calls, connOpts, logs, errs, code };
}

const W = '--window=w=2026-10-15T00:00:00Z/2026-10-16T00:00:00Z';
const USER = 'a1b2c3d4e5f6a7b8c9d0e1f2';

describe('main.ts DB adapter', () => {
  it('only calls find(), with a projection each, on the three expected collections', async () => {
    const r = await runMain([W], {
      appsettings: [{ key: 'finance.usd_inr', value: '90' }],
      generations: [
        {
          _id: 'g1',
          documentId: 'd1',
          intakeId: 'i1',
          userId: USER,
          aiModel: 'm',
          costUsd: 1,
          costStatus: 'priced',
          createdAt: new Date('2026-10-15T01:00:00Z'),
        },
      ],
      llmauxcalls: [],
    });
    expect(r.code).toBe(0);
    expect(r.calls.length).toBeGreaterThan(0);
    for (const c of r.calls) {
      expect(c.method).toBe('find');
      expect(Object.values(COLLECTIONS)).toContain(c.coll);
      const opts = c.args[1] as any;
      expect(opts.projection).toBeDefined();
      expect(Object.values(opts.projection).every((v) => v === 0 || v === 1)).toBe(true);
    }
    expect(r.connOpts[0].o).toMatchObject({
      readPreference: 'secondaryPreferred',
      autoIndex: false,
      autoCreate: false,
    });
    expect(r.logs.join('\n')).toContain('usd_inr=90');
    const out = r.logs.join('\n') + r.errs.join('\n');
    expect(out).not.toContain('pw12345');
    expect(out).not.toContain('h1.example');
  });

  it('excludes fixture rows by default and includes them with --include-fixtures', async () => {
    const find = async (argv: string[]) => (await runMain(argv, {})).calls;
    const def = await find([W]);
    expect(def.filter((c) => c.coll === 'generations')[0].args[0]).toMatchObject({
      runOrigin: { $ne: 'fixture' },
    });
    expect(def.filter((c) => c.coll === 'llmauxcalls')[0].args[0]).toMatchObject({
      runType: { $ne: 'fixture' },
    });
    const inc = await find([W, '--include-fixtures']);
    expect(
      JSON.stringify(inc.filter((c) => c.coll !== 'appsettings').map((c) => c.args[0])),
    ).not.toContain('fixture');
  });

  it('applies the window and the user filter', async () => {
    const calls = (await runMain([W, `--user=${USER}`], {})).calls;
    const gen = calls.find((c) => c.coll === 'generations')!.args[0] as any;
    expect(gen.createdAt.$gte).toEqual(new Date('2026-10-15T00:00:00Z'));
    expect(gen.createdAt.$lt).toEqual(new Date('2026-10-16T00:00:00Z'));
    expect(gen.userId.v).toBe(USER);
  });

  it('fetches intake rows linked to generations even when created before the window', async () => {
    const r = await runMain([W], {
      generations: [
        {
          _id: 'g1',
          documentId: 'd1',
          intakeId: 'i1',
          createdAt: new Date('2026-10-15T01:00:00Z'),
        },
      ],
    });
    const linked = r.calls
      .filter((c) => c.coll === 'llmauxcalls')
      .map((c) => c.args[0] as any)
      .find((f) => f.intakeId);
    expect(linked).toBeDefined();
    expect(linked.intakeId.$in).toEqual(['i1']);
    expect(linked.createdAt).toBeUndefined();
    expect(linked.purpose).toEqual({ $ne: 'preflight' });
  });

  it('bad arguments exit 2 without touching the DB; missing MONGO_URI is not required for that', async () => {
    const r = await runMain(['--window', 'nonsense'], {});
    expect(r.code).toBe(2);
    expect(r.calls).toHaveLength(0);
    expect(r.connOpts).toHaveLength(0);
    expect(r.errs.join('\n')).toMatch(/Usage/);
  });
});
