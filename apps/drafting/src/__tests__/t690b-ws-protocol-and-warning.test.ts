/**
 * T-690b (Ajay, 29 Oct 2026, option (a)): written_statement change_protocol wording, and the soft
 * warning when days_from_service is strictly more than 90. Legal content: every signed string is
 * typed out here, byte for byte, and compared with toBe.
 */
import fs from 'fs';
import path from 'path';

import './setupEnv';
import './setupDb';

// eslint-disable-next-line import/order
import { preflightCheck } from '../services/preflight.service';

const SIGNED_PROTOCOL: string =
  "All edits require CLO sign-off. Para-wise denial structure and the Order VIII Rule 1 time limits (30 days; up to 90 with the court's leave; 120 days outer limit in a commercial suit) are non-negotiable.";
const OLD_PROTOCOL_FRAGMENT = '30/120-day limitation';
const SIGNED_WARNING: string =
  'This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.';
const RULE_30 = 'days_from_service must not exceed 30 unless delay_application provided';
const RULE_120 = 'In commercial suits, days_from_service cannot exceed 120 (SCG Contracts)';
const INSTRUCTION = '120-day limit in commercial suits is mandatory and inflexible.';

const PACK_PATH = path.join(__dirname, '..', 'config', 'document-rules', 'written_statement.json');
const raw = fs.readFileSync(PACK_PATH, 'utf8');
const pack = JSON.parse(raw);

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

async function ws(days: unknown, extra: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...extra };
  if (days !== undefined) data['days_from_service'] = days;
  return preflightCheck('written_statement', data);
}

function warnings(r: { questions: string[] }): string[] {
  return r.questions.filter((q) => q === SIGNED_WARNING);
}

describe('T-690b A. written_statement.json', () => {
  it('_meta.change_protocol is the signed text, byte for byte', () => {
    expect(pack._meta.change_protocol).toBe(SIGNED_PROTOCOL);
  });

  it('the apostrophe in "court\'s" is ASCII 0x27', () => {
    const i = pack._meta.change_protocol.indexOf('court');
    expect(pack._meta.change_protocol.charCodeAt(i + 5)).toBe(0x27);
  });

  it('the old limitation wording is gone; the signed string appears exactly once in the file', () => {
    expect(raw).not.toContain(OLD_PROTOCOL_FRAGMENT);
    expect(count(raw, SIGNED_PROTOCOL)).toBe(1);
  });

  it('both validation rules are unchanged, once each', () => {
    expect(pack.validation_rules).toContain(RULE_30);
    expect(pack.validation_rules).toContain(RULE_120);
    expect(count(raw, RULE_30)).toBe(1);
    expect(count(raw, RULE_120)).toBe(1);
  });

  it('the promptInstructions line about the 120-day limit is still present', () => {
    expect(pack.prompt_context.promptInstructions).toContain(INSTRUCTION);
  });
});

describe('T-690b B. soft warning via preflightCheck', () => {
  it.each([
    ['number 91', 91],
    ["string '91'", '91'],
    ["string ' 120 '", ' 120 '],
    ['number 90.5', 90.5],
    ['number 1000', 1000],
  ])('%s -> exactly one signed warning, verdict soft', async (_n, v) => {
    const r = await ws(v);
    expect(warnings(r)).toHaveLength(1);
    expect(warnings(r)[0]).toBe(SIGNED_WARNING);
    expect(r.verdict).toBe('soft');
    expect(r.hardBlockReason).toBeUndefined();
  });

  it.each([
    ['number 90', 90],
    ["string '90'", '90'],
    ['number 90.0', 90.0],
    ['number 30', 30],
    ['number 0', 0],
    ['number -5', -5],
  ])('%s -> no warning', async (_n, v) => {
    const r = await ws(v);
    expect(warnings(r)).toHaveLength(0);
    expect(r.questions.some((q) => q.includes('more than 90 days after service'))).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['true', true],
    ['array', []],
    ['array [120]', [120]],
    ['object', {}],
    ['abc', 'abc'],
    ['NaN', NaN],
    ['Infinity (not finite, so no warning)', Infinity],
    ["'Infinity' (Number gives Infinity, not finite, so no warning)", 'Infinity'],
    ['91abc', '91abc'],
  ])('%s -> no warning and no throw', async (_n, v) => {
    await expect(ws(v)).resolves.toBeDefined();
    const r = await ws(v);
    expect(warnings(r)).toHaveLength(0);
  });

  it('other templates with days_from_service 120 get no warning', async () => {
    for (const id of [
      'bail_anticipatory',
      'legal_notice_s138',
      'replication',
      'WRITTEN_STATEMENT',
    ]) {
      const r = await preflightCheck(id, { days_from_service: 120 });
      expect(warnings(r)).toHaveLength(0);
    }
  });

  it('a hard finding plus days 120: the hard verdict wins', async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000);
    const d = `${String(tomorrow.getDate()).padStart(2, '0')}.${String(tomorrow.getMonth() + 1).padStart(2, '0')}.${tomorrow.getFullYear()}`;
    const r = await ws(120, { fir_date: d });
    expect(r.verdict).toBe('hard');
    expect(r.hardBlockReason).toBeDefined();
    expect(r.hardBlockReason).not.toBe(SIGNED_WARNING);
  });

  it('the warning is the only text of its kind: it appears in no other source or config file', () => {
    const root = path.join(__dirname, '..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (
          /\.(ts|tsx|json)$/.test(e.name) &&
          fs.readFileSync(p, 'utf8').includes(SIGNED_WARNING)
        )
          hits.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(hits.sort()).toEqual(
      ['__tests__/t690b-ws-protocol-and-warning.test.ts', 'services/preflight.service.ts'].sort(),
    );
  });

  it('the finding has rule_id ws_over_90_days and severity soft only (service source)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'preflight.service.ts'),
      'utf8',
    );
    expect(count(src, "rule_id: 'ws_over_90_days'")).toBe(1);
    expect(src).toMatch(
      /rule_id: 'ws_over_90_days',\s*severity: 'soft',\s*question: WS_OVER_90_DAYS_WARNING/,
    );
  });
});
