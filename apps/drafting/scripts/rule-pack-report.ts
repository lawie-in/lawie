/**
 * T-124 — the rule-pack report (ADR-021 section 3.7).
 *
 * Loads every file in src/config/document-rules/ through the rule-pack loader and
 * writes what is missing from each: the number of required facts, the groups that
 * name no facts, and the fixed parts that are absent. Ajay fills the gaps in T-128.
 *
 *   yarn workspace @lawie/drafting report:rule-packs
 *   yarn workspace @lawie/drafting report:rule-packs --out <path/to/report.md>
 *
 * Reads files only. Needs no database, no Redis, no model and no .env. Costs nothing.
 * Default output: handoff/data/rule-pack-report.md at the repo root.
 * Exits with code 1 when a pack cannot be read.
 */
/* eslint-disable no-console */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { buildRulePackReport, loadAllRulePacks } from '../src/services/rule-pack.service';

function outPath(): string {
  const idx = process.argv.indexOf('--out');
  if (idx !== -1 && process.argv[idx + 1]) return resolve(process.argv[idx + 1]);
  return join(__dirname, '..', '..', '..', 'handoff', 'data', 'rule-pack-report.md');
}

function main(): void {
  const result = loadAllRulePacks();
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const report = buildRulePackReport(result, today);
  const path = outPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, report, 'utf-8');

  console.log(`Packs read: ${result.packs.length}. Could not be read: ${result.errors.length}.`);
  for (const e of result.errors) console.error(`  ${e.id}: ${e.message}`);
  console.log(`Report written to ${path}`);
  if (result.errors.length > 0) process.exitCode = 1;
}

main();
