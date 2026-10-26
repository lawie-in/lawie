/**
 * T-600: write the landing page's template catalogue to the committed
 * apps/web/src/data/landing-catalogue.json.
 *
 * Usage:   yarn workspace @lawie/drafting export:catalogue
 *
 * Needs no env and no database: nothing in this import graph loads
 * config/env, the logger or mongoose (T-600 AC5). Re-running with no
 * catalogue change rewrites nothing (the old `generatedAt` is kept). The
 * drafting drift test compares the committed file to buildLandingCatalogue();
 * when it fails, run this script and commit the result.
 */
/* eslint-disable no-console */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { buildLandingCatalogue, serialiseLandingCatalogue } from '../services/landing-catalogue';

/** apps/drafting/src/scripts -> apps/web/src/data/landing-catalogue.json */
export const OUTPUT_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'web',
  'src',
  'data',
  'landing-catalogue.json',
);

function readPrevious(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw err;
  }
}

function main(): void {
  const catalogue = buildLandingCatalogue();
  const previous = readPrevious(OUTPUT_PATH);
  const text = serialiseLandingCatalogue(catalogue, previous);
  const categories = catalogue.categories.length;

  if (text === previous) {
    console.info(
      `landing-catalogue.json unchanged (${catalogue.total} templates, ${categories} categories)`,
    );
    return;
  }
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, text, 'utf-8');
  console.info(`Wrote ${OUTPUT_PATH} (${catalogue.total} templates, ${categories} categories)`);
}

if (require.main === module) {
  main();
}
