/**
 * T-113 — the intake gate before `feature.describe_first` is switched on
 * (ADR-019 §5). Runs a labelled set through the real POST /intake route,
 * in-process, against the real model. COSTS MONEY. Run by hand, never in CI.
 *
 *   yarn workspace @lawie/drafting gate:intake --set <path/to/set.json> --dry-run
 *   yarn workspace @lawie/drafting gate:intake --set <path/to/set.json> --yes
 *
 * Needs: MONGO_URI and REDIS_URL of the environment under test (dev), and
 * `ai.intake_model` + `ai.rates.<model>` seeded there. Loads .env.development
 * or .env from the repo root, as the seed script does.
 *
 * Set file — JSON array of:
 *   { "id": "t-001",
 *     "description": "…",                      // synthetic, no real personal data
 *     "expected": "<template_id>" | "guided_strict" | "guided_light" | "no_match",
 *     "also_ok": ["<template_id>", …],          // optional: other templates that are not wrong
 *     "court": true | false,                    // optional: is this a court request
 *     "language": "en" | "hi" | "mixed" }       // optional, for the Hindi/mixed coverage check
 *
 * scripts/intake-gate/example-set.json shows the format only. Its labels are
 * illustrative, not Ajay's; the real set is written by Priya and Ajay (T-113).
 *
 * Results: docs/adr/ADR-019-gate-results/<timestamp>.json (next to the ADR).
 * Each item runs as its own synthetic user (ids start 0000000000000000) so the
 * per-user limits (10 per 10 min) do not block a 150-item run.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const repoRoot = join(__dirname, '..', '..', '..');
for (const candidate of ['.env.development', '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

import mongoose from 'mongoose';
import request from 'supertest';

import app from '../src/app';
import redis from '../src/config/redis';
import { env } from '../src/config/env';
import { getCatalogue } from '../src/services/intake.service';

import {
  checkComposition,
  GateItem,
  ItemResult,
  judge,
  summarise,
} from '../src/services/intake-gate-scoring';
/* eslint-enable import/order, import/first */

function syntheticUserId(i: number): string {
  return `0000000000000000${(i + 1).toString(16).padStart(8, '0')}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const setIdx = args.indexOf('--set');
  if (setIdx < 0 || !args[setIdx + 1]) {
    console.error(
      'Usage: gate:intake --set <set.json> (--dry-run | --yes) [--allow-small-set] [--out <dir>]',
    );
    process.exit(2);
  }
  const setPath = resolve(process.cwd(), args[setIdx + 1]);
  const items = JSON.parse(readFileSync(setPath, 'utf-8')) as GateItem[];
  const catalogue = getCatalogue().map((c) => c.template_id);
  const problems = checkComposition(items, catalogue);

  console.log(
    `Set: ${setPath} — ${items.length} descriptions, ${catalogue.length} templates in the catalogue`,
  );
  if (problems.length > 0) {
    console.log('Set does not meet the T-113 composition rules:');
    for (const p of problems) console.log(`  - ${p}`);
  }
  // Two model calls at most per item, roughly $0.01 each at Haiku list prices (T-101 live check).
  console.log(
    `Estimated cost: about $${(items.length * 0.01).toFixed(2)} (two Haiku calls per item at most)`,
  );

  if (args.includes('--dry-run')) return;
  if (!args.includes('--yes')) {
    console.error(
      'Not run. This calls the real model and costs money. Add --yes to run, or --dry-run to only check the set.',
    );
    process.exit(2);
  }
  if (problems.length > 0 && !args.includes('--allow-small-set')) {
    console.error(
      'Not run: fix the set, or pass --allow-small-set for a trial run (its result cannot pass the gate).',
    );
    process.exit(2);
  }

  await mongoose.connect(env.MONGO_URI);
  const results: ItemResult[] = [];
  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const res = await request(app)
        .post('/intake')
        .set({
          'x-internal-secret': env.INTERNAL_SECRET,
          'x-user-id': syntheticUserId(i),
          'x-user-email': 'intake-gate@lawie.invalid',
          'x-user-name': 'Intake Gate',
          'x-user-plan': 'pro',
          'x-user-role': 'Client',
        })
        .send({ description: item.description });
      const r = judge(item, res.status, res.body as Record<string, unknown>);
      results.push(r);
      if (r.verdict !== 'pass' || r.unquotedValues.length > 0) {
        console.log(
          `FAIL ${r.id}: expected ${r.expected}, got ${r.outcome}${r.template_id ? ` (${r.template_id})` : ''}${r.choices ? ` choices=${r.choices.join('/')}` : ''} — ${r.verdict}${r.unquotedValues.length ? `, unquoted: ${r.unquotedValues.join(',')}` : ''}`,
        );
      }
    }
  } finally {
    await mongoose.disconnect();
    redis.disconnect();
  }

  const summary = summarise(results);
  if (problems.length > 0) summary.verdict = 'trial run on an incomplete set: cannot pass the gate';
  const outIdx = args.indexOf('--out');
  const outDir =
    outIdx >= 0 && args[outIdx + 1]
      ? resolve(process.cwd(), args[outIdx + 1])
      : join(repoRoot, 'docs', 'adr', 'ADR-019-gate-results');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = join(outDir, `${stamp}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        set: setPath,
        composition: problems.length ? problems : 'meets the T-113 rules',
        summary,
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Saved: ${outFile}`);
  if (problems.length > 0)
    console.log(
      'Trial run on a set that does not meet the composition rules: this result cannot pass the gate.',
    );
}

if (require.main === module) {
  main()
    .then(() => {
      redis.disconnect(); // importing the app opens a Redis client that would keep the process alive
      process.exit(0);
    })
    .catch((err) => {
      console.error('gate:intake failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
