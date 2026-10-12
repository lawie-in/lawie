/**
 * T-321: Ajay's T-317 Addendum 5. (1) The model instruction carries his line
 * word for word. (2) A starting draft's PDF prints STARTING_DRAFT_FOOTER and not
 * the generic export footer: every export carries exactly one disclaimer.
 * Signed text is read from the signed file at test time; none is retyped here.
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import { STARTING_DRAFT_FOOTER } from '../services/brief-drafter';
import { contentToHtml } from '../services/pdf-export.service';
import { buildAISystemPrompt, loadTemplateConfig } from '../services/template-engine.service';

const SIGNED_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'handoff',
  'legal',
  'T-317-home-faq-footer-signed.md',
);
const signedFile = readFileSync(SIGNED_PATH, 'utf8').replace(/\r\n/g, '\n');

/** Addendum 5 item 1: the backticked line after "exact replacement:". */
function addendum5Instruction(): string {
  const start = signedFile.indexOf('## Addendum 5');
  if (start < 0) throw new Error('no Addendum 5');
  const m = signedFile.slice(start).match(/exact replacement:\s*\n\s*`([^`]+)`/);
  if (!m) throw new Error('no exact replacement line in Addendum 5');
  return m[1];
}

/** The generic footer: Addendum 4 row for pdf-export.service.ts (as t318 reads it). */
function genericFooter(): string {
  const rows = signedFile
    .slice(signedFile.indexOf('## Addendum 4'))
    .split('\n')
    .filter((l) => l.startsWith('|') && l.includes('pdf-export.service.ts'));
  if (rows.length !== 1) throw new Error('expected one pdf-export row');
  const m = rows[0].split('|')[2].match(/^\s*`([^`]+)`/);
  if (!m) throw new Error('no generic footer text');
  return m[1];
}

const countOf = (hay: string, needle: string) => hay.split(needle).length - 1;
const GENERIC = genericFooter();
const BODY = 'PRAYER\n\nIt is prayed.';

describe('T-321 signed text is read correctly', () => {
  it('reads Addendum 5 and the generic footer', () => {
    expect(
      addendum5Instruction().startsWith('- The footer disclaimer ("First draft generated with AI"'),
    ).toBe(true);
    expect(GENERIC.startsWith('First draft generated with AI.')).toBe(true);
    expect(STARTING_DRAFT_FOOTER.length).toBeGreaterThan(10);
    expect(STARTING_DRAFT_FOOTER).not.toBe(GENERIC);
  });
});

describe('T-321 server PDF: exactly one disclaimer', () => {
  it('starting draft: one disclaimer div, STARTING_DRAFT_FOOTER, no generic text', () => {
    const html = contentToHtml(BODY, false, true);
    expect(countOf(html, 'class="disclaimer"')).toBe(1);
    expect(html).toContain(`<div class="disclaimer">${STARTING_DRAFT_FOOTER}</div>`);
    expect(html).not.toContain(GENERIC);
    expect(html).not.toContain('Check it against the applicable law before filing');
  });

  it('normal draft: one disclaimer div, the generic text exact, no starting-draft line', () => {
    const html = contentToHtml(BODY, false, false);
    expect(countOf(html, 'class="disclaimer"')).toBe(1);
    expect(html).toContain(`<div class="disclaimer">${GENERIC}</div>`);
    expect(html).not.toContain(STARTING_DRAFT_FOOTER);
  });

  it('default startingDraft argument is the normal case', () => {
    const html = contentToHtml(BODY, false);
    expect(countOf(html, 'class="disclaimer"')).toBe(1);
    expect(html).toContain(GENERIC);
  });
});

describe('T-321 model instruction', () => {
  const prompt = buildAISystemPrompt(loadTemplateConfig('bail_regular')!, null);

  it("contains Ajay's Addendum 5 line word for word, once", () => {
    expect(countOf(prompt, addendum5Instruction())).toBe(1);
  });

  it('no longer says AI-assisted draft', () => {
    expect(prompt).not.toMatch(/AI-assisted/i);
  });
});
