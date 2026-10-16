/**
 * T-453 — read-only cost report per draft for a set of time windows.
 *
 *   MONGO_URI=... yarn ts-node --transpile-only scripts/cost-report/main.ts \
 *     --window "anushka-1=2026-10-15T10:00:00+05:30/2026-10-15T11:00:00+05:30" [--user <id>] [--json]
 *
 * Only find() on generations, llmauxcalls and appsettings, with inclusive
 * projections of ids, numbers, statuses and times. No writes, no index or
 * collection creation (no Mongoose models are registered; autoIndex and
 * autoCreate are off). readPreference secondaryPreferred. MONGO_URI is never
 * printed: every error goes through redact().
 *
 * Exit: 0 report printed; 1 database or unexpected error; 2 bad arguments or MONGO_URI unset.
 */
/* eslint-disable no-console */
import mongoose from 'mongoose';

import { buildReport } from './lib/aggregate';
import { ArgsError, Options, parseArgs, USAGE } from './lib/args';
import { ratesFromSettings, RATE_KEY_PREFIX, USD_INR_KEY } from './lib/rates';
import { describeError } from './lib/redact';
import { renderText } from './lib/render';
import { COLLECTIONS, PROJECTIONS, toAuxRow, toGenerationRow } from './lib/rows';
import { AuxRow, WindowRows } from './lib/types';

const MAX_TIME_MS = 60_000;

type Filter = Record<string, unknown>;

async function run(opts: Options, uri: string): Promise<void> {
  const conn = mongoose.createConnection(uri, {
    readPreference: 'secondaryPreferred',
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 15_000,
    appName: 'lawie-cost-report',
  });
  try {
    await conn.asPromise();
    const db = conn.db;
    if (!db) throw new Error('no database handle after connect');
    const generations = db.collection(COLLECTIONS.generation);
    const aux = db.collection(COLLECTIONS.aux);
    const settings = db.collection(COLLECTIONS.settings);

    const settingRows = await settings
      .find(
        {
          $or: [
            { key: { $regex: `^${RATE_KEY_PREFIX.replace(/\./g, '\\.')}` } },
            { key: USD_INR_KEY },
          ],
        },
        { projection: PROJECTIONS.settings, maxTimeMS: MAX_TIME_MS },
      )
      .toArray();
    const { rates, usdInr, usdInrFallback } = ratesFromSettings(
      settingRows.map((s) => ({ key: s.key as string, value: s.value as string })),
    );

    const userFilter: Filter = opts.user ? { userId: new mongoose.Types.ObjectId(opts.user) } : {};
    const genOrigin: Filter = opts.includeFixtures ? {} : { runOrigin: { $ne: 'fixture' } };
    const auxOrigin: Filter = opts.includeFixtures ? {} : { runType: { $ne: 'fixture' } };

    const windows: WindowRows[] = [];
    for (const w of opts.windows) {
      const inWindow: Filter = { createdAt: { $gte: w.start, $lt: w.end } };
      const genDocs = await generations
        .find(
          { ...inWindow, ...userFilter, ...genOrigin },
          { projection: PROJECTIONS.generation, maxTimeMS: MAX_TIME_MS },
        )
        .toArray();
      const genRows = genDocs.map((d) => toGenerationRow(d));

      const auxDocs = await aux
        .find(
          { ...inWindow, ...userFilter, ...auxOrigin },
          { projection: PROJECTIONS.aux, maxTimeMS: MAX_TIME_MS },
        )
        .toArray();
      const auxRows: AuxRow[] = auxDocs.map((d) => toAuxRow(d));

      // The intake of a draft generated in the window may have started just before it.
      const seen = new Set(auxRows.map((r) => r.id));
      const intakeIds = [
        ...new Set(genRows.map((g) => g.intakeId).filter((x): x is string => !!x)),
      ];
      if (intakeIds.length > 0) {
        const linked = await aux
          .find(
            { intakeId: { $in: intakeIds }, purpose: { $ne: 'preflight' }, ...auxOrigin },
            { projection: PROJECTIONS.aux, maxTimeMS: MAX_TIME_MS },
          )
          .toArray();
        for (const d of linked) {
          const row = toAuxRow(d);
          if (!seen.has(row.id)) {
            seen.add(row.id);
            auxRows.push(row);
          }
        }
      }
      windows.push({ window: w, generations: genRows, aux: auxRows });
    }

    const report = buildReport({
      windows,
      rates,
      usdInr,
      usdInrFallback,
      includeFixtures: opts.includeFixtures,
      userFilter: opts.user,
    });
    console.log(opts.json ? JSON.stringify(report, null, 2) : renderText(report));
  } finally {
    await conn.close().catch(() => undefined);
  }
}

async function main(): Promise<number> {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ArgsError) {
      console.error(`cost-report: ${err.message}\n\n${USAGE}`);
      return 2;
    }
    throw err;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  const uri = process.env.MONGO_URI;
  if (!uri || uri.trim() === '') {
    console.error(
      'cost-report: MONGO_URI is not set. Set it in the environment for this command only, ' +
        'e.g. MONGO_URI=... yarn ts-node --transpile-only scripts/cost-report/main.ts --window ...',
    );
    return 2;
  }
  await run(opts, uri);
  return 0;
}

function fail(err: unknown): never {
  console.error(`cost-report: ${describeError(err, process.env.MONGO_URI)}`);
  process.exit(1);
}

process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);

main().then((code) => process.exit(code), fail);
