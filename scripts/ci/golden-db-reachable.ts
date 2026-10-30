/**
 * T-659 — is the golden set's fixture DB reachable from this runner?
 *
 * The golden-set workflow runs this before "Golden set — real model", so an
 * unreachable DB (e.g. Atlas rejecting the runner's IP) is caught before any
 * model call is made. The workflow decides what an unreachable DB means for
 * the job (a notice on push, a failure on schedule / workflow_dispatch).
 *
 *   yarn ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' \
 *     scripts/ci/golden-db-reachable.ts                                  (from the repo root)
 *
 * No tsconfig: with none found, ts-node 10 defaults to module node16, which the repo's
 * TypeScript rejects without moduleResolution node16, so the options are passed inline.
 *
 * Reads GOLDEN_SET_MONGODB_URI. Connects, runs an admin ping, disconnects.
 *
 * Exit: 0 reachable; 2 no URI; 3 unreachable; 4 the check itself broke.
 *
 * stdout is one line and never contains the URI, the host, an error message
 * or a stack: only `golden-db: reachable`, `golden-db: unreachable (<ErrorClass>)`,
 * `golden-db: no URI` or `golden-db: error (<ErrorClass>)`.
 */
/* eslint-disable no-console */
import { join } from 'path';

export const EXIT = { reachable: 0, noUri: 2, unreachable: 3, error: 4 } as const;
export const SERVER_SELECTION_TIMEOUT_MS = 10_000;

// Same resolution as scripts/golden-set/lib/modules.ts (requireFromDrafting), re-implemented
// here so this helper loads nothing from the golden-set runner.
const DRAFTING_DIR = join(__dirname, '..', '..', 'apps', 'drafting');
const FROM_DRAFTING = { paths: [join(DRAFTING_DIR, 'src', 'services')] };

function requireFromDrafting<T = unknown>(name: string): T {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(require.resolve(name, FROM_DRAFTING)) as T;
}

/** An open connection: just enough to ping and close it. */
export interface DbHandle {
  ping(): Promise<unknown>;
  close(): Promise<unknown>;
}

/** Opens a connection to `uri`. Rejects if the server cannot be selected in `timeoutMs`. */
export type ConnectFn = (uri: string, timeoutMs: number) => Promise<DbHandle>;

export type ReachableResult = { reachable: true } | { reachable: false; errorClass: string };

/**
 * The error's class name only, never its message. Restricted to identifier characters so
 * nothing else from the error can reach stdout.
 */
export function errorClassName(err: unknown): string {
  const candidates: unknown[] = [];
  if (err !== null && typeof err === 'object') {
    candidates.push((err as { constructor?: { name?: unknown } }).constructor?.name);
    candidates.push((err as { name?: unknown }).name);
  }
  for (const c of candidates) {
    if (typeof c === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(c) && c !== 'Object') {
      return c;
    }
  }
  return 'UnknownError';
}

/** Pure: connect, ping, close. Any failure to connect or ping is "unreachable". */
export async function checkReachable(
  uri: string,
  connect: ConnectFn,
  timeoutMs: number = SERVER_SELECTION_TIMEOUT_MS,
): Promise<ReachableResult> {
  let handle: DbHandle | null = null;
  try {
    handle = await connect(uri, timeoutMs);
    await handle.ping();
    return { reachable: true };
  } catch (err) {
    return { reachable: false, errorClass: errorClassName(err) };
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

/**
 * The real ConnectFn: mongoose, loaded from the drafting workspace as the golden set does.
 * mongoose is required here, eagerly, so a broken install is an error (exit 4), not
 * "unreachable" (exit 3, which a push run turns into a green notice).
 */
export function mongooseConnect(): ConnectFn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mongoose = requireFromDrafting<any>('mongoose');
  return async (uri, timeoutMs) => {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: timeoutMs });
    } catch (err) {
      await mongoose.disconnect().catch(() => undefined);
      throw err;
    }
    return {
      ping: () => mongoose.connection.db.admin().ping(),
      close: () => mongoose.disconnect(),
    };
  };
}

/** Runs the check and returns the exit code. `log` gets exactly one safe line. */
export async function main(
  env: NodeJS.ProcessEnv = process.env,
  connect?: ConnectFn,
  log: (line: string) => void = (line) => console.log(line),
  timeoutMs: number = SERVER_SELECTION_TIMEOUT_MS,
): Promise<number> {
  const uri = env.GOLDEN_SET_MONGODB_URI;
  if (!uri || uri.trim() === '') {
    log('golden-db: no URI');
    return EXIT.noUri;
  }
  try {
    const result = await checkReachable(uri, connect ?? mongooseConnect(), timeoutMs);
    if (result.reachable) {
      log('golden-db: reachable');
      return EXIT.reachable;
    }
    // An `in` guard, not `result.reachable`: the scripts' ts-jest config has no
    // strictNullChecks, and without it the union does not narrow on a boolean literal.
    const errorClass = 'errorClass' in result ? result.errorClass : 'UnknownError';
    log(`golden-db: unreachable (${errorClass})`);
    return EXIT.unreachable;
  } catch (err) {
    log(`golden-db: error (${errorClassName(err)})`);
    return EXIT.error;
  }
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.log(`golden-db: error (${errorClassName(err)})`);
      process.exit(EXIT.error);
    },
  );
}
