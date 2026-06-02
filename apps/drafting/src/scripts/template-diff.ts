/**
 * SCRUM-81 — Run the structural diff gate against the 6 original templates
 * and emit a Markdown report for Ajay (CLO) sign-off.
 *
 * Usage:   yarn workspace @lawie/drafting diff:templates
 *
 * The gate is structural (no LLM calls / no PDF render) — see
 * `template-diff.service.ts` for the methodology.
 *
 * Exit codes:
 *   0 — every template either retired cleanly or has a logged keep-reason.
 *   1 — any template is `missing_source` (override exists but doc-rule absent,
 *       or vice versa) — needs CLO follow-up before the gate can be
 *       re-evaluated.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

import { diffTemplate, formatReport } from '../services/template-diff.service';

const SCRUM_81_TEMPLATES = [
  'bail_anticipatory',
  'bail_regular',
  'consumer_complaint',
  'legal_notice_s138',
  'legal_notice_s80',
  'rent_agreement',
];

const TOLERANCE = 0.05;
const REPORT_PATH = join(__dirname, '..', '..', 'template-promoter-diff.md');

function main(): void {
  const diffs = SCRUM_81_TEMPLATES.map((id) => diffTemplate(id, TOLERANCE));

  const report = formatReport(diffs, TOLERANCE);
  writeFileSync(REPORT_PATH, report, 'utf-8');

  console.info(`Wrote report → ${REPORT_PATH}`);
  console.info('');
  console.info('Per-template verdicts:');
  for (const d of diffs) {
    console.info(
      `  ${d.templateId.padEnd(28)}  ${d.verdict.padEnd(16)}  (max drift ${d.maxDrift.toFixed(2)})`,
    );
  }
  console.info('');

  const missing = diffs.filter((d) => d.verdict === 'missing_source');
  if (missing.length > 0) {
    console.warn(`✗ ${missing.length} template(s) missing source — needs CLO follow-up.`);
    process.exit(1);
  }
  const retire = diffs.filter((d) => d.verdict === 'retire').length;
  const keep = diffs.filter((d) => d.verdict === 'keep').length;
  console.info(`Summary: retire ${retire} · keep ${keep} (of ${diffs.length})`);
}

main();
