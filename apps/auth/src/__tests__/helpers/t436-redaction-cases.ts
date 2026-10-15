/**
 * T-436 AC10: shared table and seeded fuzz for the URL redaction tests (same file in auth and
 * email-worker). No credentialed Mongo URI sits in the source: schemes are passed in.
 * Secrets are markers (SeCrEt, UsEr, ...) so "no part of the user or password appears" is a
 * plain substring check.
 */
export const BAD_REDIS = '(unparseable REDIS_URL)';
export const BAD_MONGO = '(unparseable MONGO_URI)';

export interface Case {
  input: string;
  /** Exact expected output. */
  expected: string;
  /** Substrings that must not appear in the output. */
  secrets: string[];
}

const S = ['SeCrEt', 'UsEr', 'SECRETPW'];

export function redisCases(): Case[] {
  const c = (input: string, expected: string, secrets = S): Case => ({ input, expected, secrets });
  return [
    // password containing each URL delimiter: ambiguous, refused
    c('redis://default:ab/SeCrEt@host.example:6379', BAD_REDIS),
    c('redis://default:ab?SeCrEt@host.example:6379', BAD_REDIS),
    c('redis://default:ab#SeCrEt@host.example:6379', BAD_REDIS),
    c('redis://default:ab\\SeCrEt@host.example:6379', BAD_REDIS),
    c('redis://UsEr:1234/SeCrEt@host.example', BAD_REDIS),
    c('redis://default:1234/x@host.example', BAD_REDIS, ['default:1234', '/x']),
    // an '@' or '%' in the password: the last '@' ends the user info
    c('redis://default:ab@SeCrEt@host.example:6379', 'redis://host.example:6379'),
    c('redis://default:p%SeCrEt@host.example', 'redis://host.example'),
    c('redis://default:p%40SeCrEt@host.example:6379/2', 'redis://host.example:6379'),
    // normal shapes
    c(
      'rediss://default:SeCrEt@redis-1.cloud.example:14900/0',
      'rediss://redis-1.cloud.example:14900',
    ),
    c('redis://host.example:6379', 'redis://host.example:6379'),
    c('redis://UsEr@host.example:6379', 'redis://host.example:6379'),
    c('redis://:SeCrEt@10.0.0.5:6379/2?x=y', 'redis://10.0.0.5:6379'),
    c('redis://default:SeCrEt@[::1]:6379', 'redis://[::1]:6379'),
    // an '@' after the path or the query is not user info
    c('redis://host.example:6379/0?password=a@SeCrEt', BAD_REDIS),
    c('redis://host.example:6379/0#a@SeCrEt', BAD_REDIS),
    c('', BAD_REDIS, []),
    c('not a url SeCrEt', BAD_REDIS),
  ];
}

export function mongoCases(M: string, MS: string): Case[] {
  const cred = (u: string, p: string) => [u, p].join(':');
  const c = (input: string, expected: string, secrets = S): Case => ({ input, expected, secrets });
  return [
    c(`${M}${cred('UsEr', 'ab/SeCrEt')}@h1.example:27017/db`, BAD_MONGO),
    c(`${M}${cred('UsEr', 'ab?SeCrEt')}@h1.example:27017/db`, BAD_MONGO),
    c(`${M}${cred('UsEr', 'ab#SeCrEt')}@h1.example:27017/db`, BAD_MONGO),
    c(`${M}${cred('UsEr', 'ab\\SeCrEt')}@h1.example:27017/db`, BAD_MONGO),
    c(`${M}${cred('UsEr', '1234/SeCrEt')}@h1.example`, BAD_MONGO),
    c(
      `${M}${cred('UsEr', 'ab@SeCrEt')}@h1:27017,h2:27017/db?replicaSet=rs0`,
      `${M}h1:27017,h2:27017/db`,
    ),
    c(`${M}${cred('UsEr', 'p%SeCrEt')}@h1.example/db`, `${M}h1.example/db`),
    c(`${M}${cred('UsEr', 'p%40SeCrEt')}@h1.example:27017/db`, `${M}h1.example:27017/db`),
    c(
      `${MS}${cred('UsEr', 'SeCrEt')}@cluster0.abc.mongodb.net/lawie?retryWrites=true&w=majority`,
      `${MS}cluster0.abc.mongodb.net/lawie`,
    ),
    c(`${M}localhost:27017/test`, `${M}localhost:27017/test`),
    c(`${M}UsEr@host.example/db`, `${M}host.example/db`),
    // no '@' at all: it cannot be read as user info, and it does not parse as a host
    c(`${M}${cred('UsEr', 'SeCrEt')}`, BAD_MONGO),
    c(`${M}${cred('UsEr', 'SeCrEt')}@[::1]:27017/db`, `${M}[::1]:27017/db`),
    c(`${M}h1.example/db?tlsCertificateKeyFilePassword=a@SeCrEt`, BAD_MONGO),
    c(`${M}h1.example/db#a@SeCrEt`, BAD_MONGO),
    c('', BAD_MONGO, []),
    c('no-scheme-SeCrEt', BAD_MONGO),
  ];
}

// ── seeded fuzz ─────────────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIALS = ['/', '?', '#', '\\', '@', '%', ':', '[', ']', ',', ' ', '%40', '%2F', '.', '-'];
const HOSTS = [
  'host.example',
  'redis-1.cloud.example:14900',
  '10.0.0.5:6379',
  '[::1]:6379',
  'h1:27017,h2:27017',
  'localhost',
];

export const MARKERS = { user: 'UMK', pw: 'PMK', query: 'QMK', frag: 'FMK', path: 'PATHMK' };

export interface Fuzz {
  input: string;
  /** Markers that must not appear in the output. */
  forbidden: string[];
}

/**
 * `kind` 'redis' also puts a marker in the path (never printed); 'mongo' prints the database
 * name by design, so its path carries no marker. A string with user info always has an '@' after
 * it (the accepted limit is a string with no '@' at all, which has no user info to find).
 */
export function fuzzCases(
  kind: 'redis' | 'mongo',
  scheme: string,
  n: number,
  seed: number,
): Fuzz[] {
  const r = rng(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const junk = (marker: string) => {
    let s = '';
    const parts = 1 + Math.floor(r() * 3);
    for (let i = 0; i < parts; i += 1) s += pick(SPECIALS) + (r() < 0.5 ? marker : 'x');
    return r() < 0.5 ? marker + s : s + marker;
  };
  const out: Fuzz[] = [];
  for (let i = 0; i < n; i += 1) {
    const forbidden: string[] = [];
    let s = scheme;
    if (r() < 0.8) {
      const withUser = r() < 0.8;
      const withPw = r() < 0.8;
      let ui = '';
      if (withUser) {
        ui += junk(MARKERS.user);
        forbidden.push(MARKERS.user);
      }
      if (withPw) {
        ui += ':' + junk(MARKERS.pw);
        forbidden.push(MARKERS.pw);
      }
      s += ui + '@';
    }
    s += pick(HOSTS);
    if (r() < 0.6) {
      s +=
        '/' + (kind === 'redis' && r() < 0.7 ? junk(MARKERS.path) : pick(['0', 'lawie', 'db', '']));
    }
    if (r() < 0.5) {
      s += '?' + junk(MARKERS.query);
      forbidden.push(MARKERS.query);
    }
    if (r() < 0.3) {
      s += '#' + junk(MARKERS.frag);
      forbidden.push(MARKERS.frag);
    }
    out.push({ input: s, forbidden });
  }
  return out;
}

export const CLEAN_REDIS =
  /^rediss?:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/;
export const CLEAN_MONGO = /^mongodb(?:\+srv)?:\/\/[A-Za-z0-9.,:[\]-]+(?:\/[A-Za-z0-9_.$-]*)?$/;
