/**
 * T-453 cost report — command-line parsing. Pure: takes argv, returns options
 * or throws ArgsError with a message fit to print.
 */
import { Window } from './types';

export class ArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgsError';
  }
}

export interface Options {
  windows: Window[];
  user: string | null;
  json: boolean;
  includeFixtures: boolean;
  help: boolean;
}

export const USAGE = `Usage: MONGO_URI=... yarn ts-node --transpile-only scripts/cost-report/main.ts \\
         --window "<label>=<ISO start>/<ISO end>" [--window ...] [--user <userId>] [--json] [--include-fixtures]

  --window            Repeatable. "<label>=" is optional (default w1, w2, ...). End is exclusive.
                      ISO times need a zone, e.g. 2026-10-15T10:00:00+05:30 or ...Z.
  --user              Only rows of this user (24-hex ObjectId).
  --json              Print the report as JSON instead of text.
  --include-fixtures  Also count golden-set rows (runOrigin/runType 'fixture'); left out by default.

Reads MONGO_URI from the environment. Read-only (find only), readPreference secondaryPreferred.`;

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const LABEL = /^[A-Za-z0-9._:-]{1,64}$/;

function parseTime(s: string, what: string, spec: string): Date {
  if (!ISO_WITH_ZONE.test(s)) {
    throw new ArgsError(`--window "${spec}": ${what} "${s}" is not an ISO time with a zone`);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime()))
    throw new ArgsError(`--window "${spec}": ${what} "${s}" is not a valid time`);
  return d;
}

export function parseWindow(spec: string, index: number): Window {
  let label = `w${index + 1}`;
  let range = spec;
  const eq = spec.indexOf('=');
  if (eq >= 0) {
    label = spec.slice(0, eq).trim();
    range = spec.slice(eq + 1).trim();
    if (!LABEL.test(label)) {
      throw new ArgsError(`--window "${spec}": label must be 1-64 of A-Z a-z 0-9 . _ : -`);
    }
  }
  const parts = range.split('/');
  if (parts.length !== 2) {
    throw new ArgsError(`--window "${spec}": expected <ISO start>/<ISO end>`);
  }
  const start = parseTime(parts[0].trim(), 'start', spec);
  const end = parseTime(parts[1].trim(), 'end', spec);
  if (end.getTime() <= start.getTime()) {
    throw new ArgsError(`--window "${spec}": end must be after start`);
  }
  return { label, start, end };
}

export function parseArgs(argv: string[]): Options {
  const specs: string[] = [];
  let user: string | null = null;
  let json = false;
  let includeFixtures = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takeValue = (flag: string): string => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new ArgsError(`${flag} needs a value`);
      i++;
      return v;
    };
    if (a === '--window') specs.push(takeValue('--window'));
    else if (a.startsWith('--window=')) specs.push(a.slice('--window='.length));
    else if (a === '--user') user = takeValue('--user');
    else if (a.startsWith('--user=')) user = a.slice('--user='.length);
    else if (a === '--json') json = true;
    else if (a === '--include-fixtures') includeFixtures = true;
    else if (a === '--help' || a === '-h') help = true;
    else throw new ArgsError(`unknown argument "${a}"`);
  }
  if (help) return { windows: [], user, json, includeFixtures, help };
  if (specs.length === 0) throw new ArgsError('at least one --window is required');
  if (user !== null && !OBJECT_ID.test(user)) {
    throw new ArgsError('--user must be a 24-character hex ObjectId');
  }
  const windows = specs.map((s, i) => parseWindow(s, i));
  const seen = new Set<string>();
  for (const w of windows) {
    if (seen.has(w.label)) throw new ArgsError(`duplicate window label "${w.label}"`);
    seen.add(w.label);
  }
  return { windows, user, json, includeFixtures, help };
}
