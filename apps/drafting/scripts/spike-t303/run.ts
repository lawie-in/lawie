/**
 * T-303 spike — THROWAWAY, NOT FOR MERGE.
 *
 * Sends each rendered FIR page (render.ts) to each model with one fixed
 * extraction prompt, scores the JSON against ground-truth.json per field, and
 * prints accuracy per model x language plus tokens and cost per page.
 *
 * Arjun's rulings (15 Oct 2026): models from AppSettings `ai.intake_model` and
 * `ai.drafting_model`, direct to Anthropic via @anthropic-ai/sdk (no Helicone,
 * no OCR vendor); USD 5 hard cap counted from provider usage x rates.
 *
 * T-302: pages are made-up; nothing here is sent anywhere except the Anthropic
 * API. No Sentry, no pino, no file output: console only. `--cleanup` deletes
 * the pages at the end.
 *
 * Flags:
 *   --pages <dir>        rendered JPEGs (E1.jpg..H4.jpg); default: env T303_PAGES_DIR
 *   --truth <file>       default: ./ground-truth.json next to this script
 *   --models a,b         explicit model ids (else env T303_MODELS, else AppSettings via --mongo-url)
 *   --mongo-url <url>    read ai.intake_model, ai.drafting_model and ai.rates.<slug> (else env MONGO_URI)
 *   --rates m=in:out,..  USD per MTok, overrides AppSettings rates (required without Mongo)
 *   --cap <usd>          default 5
 *   --max-tokens <n>     output cap per call, default 1024
 *   --only E1,H2         subset of pages
 *   --verbose            print per-field mismatches (console only)
 *   --dry                no API call: load pages + truth, resolve models, show estimates
 *   --cleanup            delete the page files (and the dir if empty) at the end
 */
import fs from 'fs';
import path from 'path';

import Anthropic from '@anthropic-ai/sdk';

// ── args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(`--${name}`);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const DRY = flag('dry');
const VERBOSE = flag('verbose');
const CLEANUP = flag('cleanup');
const CAP_USD = Number(opt('cap') ?? 5);
const MAX_TOKENS = Number(opt('max-tokens') ?? 1024);
const PAGES_DIR = opt('pages') ?? process.env.T303_PAGES_DIR;
const TRUTH_FILE = opt('truth') ?? path.join(__dirname, 'ground-truth.json');
const PAGE_FILE_RE = /^([EH]\d)\.jpe?g$/i;

// ── types ────────────────────────────────────────────────────────────────────

interface Truth {
  language: 'en' | 'hi';
  fir_number: string;
  police_station: string;
  district: string;
  date_as_written: string;
  date_iso: string;
  sections_as_written: string;
  complainant_name: string;
  accused_names: string[];
}

interface Extracted {
  fir_number: string | null;
  police_station: string | null;
  district: string | null;
  date_as_written: string | null;
  date_iso: string | null;
  sections_as_written: string | null;
  complainant_name: string | null;
  accused_names: string[];
  unreadable: string[];
}

interface Rate {
  in: number;
  out: number;
  cacheWrite?: number;
  cacheRead?: number;
}

interface Page {
  id: string;
  file: string;
  width: number;
  height: number;
  bytes: number;
}

const FIELDS = [
  'fir_number',
  'police_station',
  'district',
  'date_as_written',
  'date_iso',
  'sections_as_written',
  'complainant_name',
  'accused_names',
] as const;
type Field = (typeof FIELDS)[number];

interface FieldScore {
  exact: boolean;
  norm: boolean;
  flagged: boolean; // model marked it unreadable
}

interface Result {
  page: string;
  language: 'en' | 'hi';
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parsed: boolean;
  scores: Partial<Record<Field, FieldScore>>;
  mismatches: string[];
}

// ── prompt (fixed; identical for every page and model) ───────────────────────

const SYSTEM =
  'You read photographs of Indian First Information Reports (FIRs). ' +
  'Copy values exactly as they appear on the page, in the script they are written in. ' +
  'Do not translate, transliterate, correct or guess. Reply with JSON only.';

const PROMPT = `Read this FIR page and return one JSON object with exactly these keys:
{
  "fir_number": string|null,          // FIR number as written, e.g. "087/2024"
  "police_station": string|null,      // police station name as written
  "district": string|null,            // district name as written, without the state
  "date_as_written": string|null,     // date of REPORT (not occurrence), as written
  "date_iso": string|null,            // the same date as YYYY-MM-DD
  "sections_as_written": string|null, // sections with the Act, as written
  "complainant_name": string|null,    // informant / complainant name as written, no parentage
  "accused_names": string[],          // NAMED accused only, as written, no parentage; [] if none named
  "unreadable": string[]              // keys above you could not read with confidence
}
Use null for a value that is not on the page. Output the JSON object and nothing else.`;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Width/height from a baseline or progressive JPEG SOF marker. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('not a JPEG (no SOF marker)');
}

/** Upper-bound image token estimate (Anthropic: ~w*h/750; no downscale credit taken). */
const imageTokens = (p: Page): number => Math.ceil((p.width * p.height) / 750);
/** Rough text token estimate; deliberately high (3 chars/token). */
const textTokens = (s: string): number => Math.ceil(s.length / 3);

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFKC')
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/़/g, '') // nukta: इरफ़ान == इरफान
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "(Bihar)"
    .replace(/\b(smt|shri|sri|mr|mrs|ms)\b\.?/g, ' ')
    .replace(/(श्रीमती|श्री)\s*/g, ' ')
    .replace(/\b(p\.?\s?s\.?|police station|thana)\b/g, ' ')
    .replace(/थाना/g, ' ')
    .replace(/[.,;:'"()\-–/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normFir(s: string | null): string {
  if (!s) return '';
  const t = s.normalize('NFKC').replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  const raw = /(\d+)\s*[/-]\s*(\d{2,4})/.exec(t);
  if (!raw) return norm(s);
  const year = raw[2].length === 2 ? `20${raw[2]}` : raw[2];
  return `${Number(raw[1])}/${year}`;
}

/** Section tokens, act-agnostic: "331(4), 305(a), 3(5) BNS" -> {3(5),305(a),331(4)}; "3/4" -> {3,4}. */
function sectionSet(s: string | null): string {
  if (!s) return '';
  const t = s.normalize('NFKC').replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  const toks = t.match(/\d+[A-Za-z]?(?:\s*\(\s*[0-9a-z]+\s*\))*/g) ?? [];
  return [...new Set(toks.map((x) => x.replace(/\s+/g, '').toLowerCase()))].sort().join(',');
}

function parseIsoFromWritten(s: string | null): string {
  const m = s ? /(\d{1,2})[-./](\d{1,2})[-./](\d{4})/.exec(s) : null;
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

export function score(
  field: Field,
  truth: Truth,
  got: Extracted,
): { exact: boolean; norm: boolean } {
  if (field === 'accused_names') {
    const t = truth.accused_names;
    const g = Array.isArray(got.accused_names) ? got.accused_names : [];
    const exact = t.length === g.length && t.every((n) => g.includes(n));
    const ts = new Set(t.map(norm));
    const gs = new Set(g.map(norm).filter(Boolean));
    return { exact, norm: ts.size === gs.size && [...ts].every((n) => gs.has(n)) };
  }
  const tv = truth[field];
  const gv = (got[field] ?? null) as string | null;
  const exact = gv !== null && gv.trim() === tv;
  let n: boolean;
  switch (field) {
    case 'fir_number':
      n = normFir(gv) !== '' && normFir(gv) === normFir(tv);
      break;
    case 'sections_as_written':
      n = sectionSet(gv) !== '' && sectionSet(gv) === sectionSet(tv);
      break;
    case 'date_as_written':
      n = parseIsoFromWritten(gv) !== '' && parseIsoFromWritten(gv) === truth.date_iso;
      break;
    case 'date_iso':
      n = (gv ?? '').trim() === truth.date_iso;
      break;
    default:
      n = norm(gv) !== '' && norm(gv) === norm(tv);
  }
  return { exact, norm: exact || n };
}

function parseJson(text: string): Extracted | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1)) as Partial<Extracted>;
    return {
      fir_number: o.fir_number ?? null,
      police_station: o.police_station ?? null,
      district: o.district ?? null,
      date_as_written: o.date_as_written ?? null,
      date_iso: o.date_iso ?? null,
      sections_as_written: o.sections_as_written ?? null,
      complainant_name: o.complainant_name ?? null,
      accused_names: Array.isArray(o.accused_names) ? o.accused_names.map(String) : [],
      unreadable: Array.isArray(o.unreadable) ? o.unreadable.map(String) : [],
    };
  } catch {
    return null;
  }
}

const usd = (n: number): string => `$${n.toFixed(4)}`;
const pct = (a: number, b: number): string =>
  b === 0 ? '  -  ' : `${Math.round((100 * a) / b)}%`.padStart(5);

// ── models and rates ─────────────────────────────────────────────────────────

const modelSlug = (m: string): string => m.toLowerCase().replace(/[^a-z0-9._-]/g, '-');

function parseRatesArg(s: string | undefined): Record<string, Rate> {
  const out: Record<string, Rate> = {};
  if (!s) return out;
  for (const part of s.split(',')) {
    const [model, r] = part.split('=');
    const [i, o] = (r ?? '').split(':').map(Number);
    if (!model || !Number.isFinite(i) || !Number.isFinite(o))
      throw new Error(`bad --rates entry: ${part}`);
    out[model.trim()] = { in: i, out: o };
  }
  return out;
}

async function resolveModelsAndRates(): Promise<{
  models: string[];
  rates: Record<string, Rate>;
  source: string;
}> {
  const explicit = opt('models') ?? process.env.T303_MODELS;
  const rates = parseRatesArg(opt('rates'));
  const mongoUrl = opt('mongo-url') ?? process.env.MONGO_URI;
  let models = explicit
    ? explicit
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : [];
  let source = explicit ? 'explicit' : '';

  if (mongoUrl && (models.length === 0 || models.some((m) => !rates[m]))) {
    const mongoose = (await import('mongoose')).default;
    const { AppSetting } = await import('../../src/models/AppSetting.model');
    await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 8000 });
    try {
      const get = async (key: string): Promise<string | null> =>
        ((await AppSetting.findOne({ key }).lean()) as { value?: string } | null)?.value ?? null;
      if (models.length === 0) {
        const intake = await get('ai.intake_model');
        const drafting = await get('ai.drafting_model');
        if (!intake || !drafting)
          throw new Error('AppSettings ai.intake_model and/or ai.drafting_model not set');
        models = [...new Set([intake, drafting])];
        source = 'AppSettings ai.intake_model, ai.drafting_model';
      }
      for (const m of models) {
        if (rates[m]) continue;
        const raw = await get(`ai.rates.${modelSlug(m)}`);
        if (!raw) continue;
        try {
          const p = JSON.parse(raw) as Record<string, unknown>;
          if (
            typeof p.input_usd_per_mtok === 'number' &&
            typeof p.output_usd_per_mtok === 'number'
          ) {
            rates[m] = {
              in: p.input_usd_per_mtok,
              out: p.output_usd_per_mtok,
              cacheWrite:
                typeof p.cache_write_usd_per_mtok === 'number'
                  ? p.cache_write_usd_per_mtok
                  : undefined,
              cacheRead:
                typeof p.cache_read_usd_per_mtok === 'number'
                  ? p.cache_read_usd_per_mtok
                  : undefined,
            };
          }
        } catch {
          /* malformed rate -> treated as missing */
        }
      }
    } finally {
      await mongoose.disconnect();
    }
  }
  return { models, rates, source };
}

// ── pages and truth ──────────────────────────────────────────────────────────

function loadPages(): Page[] {
  if (!PAGES_DIR) throw new Error('--pages <dir> (or T303_PAGES_DIR) is required');
  const only = opt('only')
    ?.split(',')
    .map((s) => s.trim().toUpperCase());
  return fs
    .readdirSync(PAGES_DIR)
    .filter((f) => PAGE_FILE_RE.test(f))
    .map((f) => {
      const file = path.join(PAGES_DIR, f);
      const buf = fs.readFileSync(file);
      return {
        id: f.match(PAGE_FILE_RE)![1].toUpperCase(),
        file,
        bytes: buf.length,
        ...jpegSize(buf),
      };
    })
    .filter((p) => !only || only.includes(p.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function cleanup(): void {
  if (!PAGES_DIR || !fs.existsSync(PAGES_DIR)) return;
  let n = 0;
  for (const f of fs.readdirSync(PAGES_DIR)) {
    if (PAGE_FILE_RE.test(f)) {
      fs.unlinkSync(path.join(PAGES_DIR, f));
      n++;
    }
  }
  if (fs.readdirSync(PAGES_DIR).length === 0) fs.rmdirSync(PAGES_DIR);
  console.log(`cleanup: deleted ${n} page file(s) from ${PAGES_DIR}`);
}

// ── report ───────────────────────────────────────────────────────────────────

function printReport(results: Result[], models: string[]): void {
  console.log('\n== Per-field accuracy (exact / normalised; "flag" = model said unreadable) ==');
  for (const model of models) {
    for (const lang of ['en', 'hi'] as const) {
      const rs = results.filter((r) => r.model === model && r.language === lang);
      if (rs.length === 0) continue;
      const parsed = rs.filter((r) => r.parsed).length;
      console.log(
        `\n${model} | ${lang === 'en' ? 'English' : 'Hindi'} | pages ${rs.length} | JSON parsed ${parsed}/${rs.length}`,
      );
      console.log(`  ${'field'.padEnd(20)} exact   norm   flag`);
      for (const f of FIELDS) {
        const ex = rs.filter((r) => r.scores[f]?.exact).length;
        const nm = rs.filter((r) => r.scores[f]?.norm).length;
        const fl = rs.filter((r) => r.scores[f]?.flagged).length;
        console.log(
          `  ${f.padEnd(20)} ${pct(ex, rs.length)}  ${pct(nm, rs.length)}  ${String(fl).padStart(4)}`,
        );
      }
    }
  }

  console.log('\n== Tokens and cost per page ==');
  console.log(
    `  ${'page'.padEnd(5)} ${'model'.padEnd(34)} ${'in'.padStart(7)} ${'out'.padStart(6)} ${'cost'.padStart(9)}`,
  );
  for (const r of results) {
    console.log(
      `  ${r.page.padEnd(5)} ${r.model.padEnd(34)} ${String(r.inputTokens).padStart(7)} ${String(r.outputTokens).padStart(6)} ${usd(r.costUsd).padStart(9)}`,
    );
  }
  console.log('\n== Per model ==');
  for (const model of models) {
    const rs = results.filter((r) => r.model === model);
    if (rs.length === 0) continue;
    const sum = (k: 'inputTokens' | 'outputTokens' | 'costUsd'): number =>
      rs.reduce((a, r) => a + r[k], 0);
    console.log(
      `  ${model}: ${rs.length} pages | avg in ${Math.round(sum('inputTokens') / rs.length)} | avg out ${Math.round(sum('outputTokens') / rs.length)} | avg cost/page ${usd(sum('costUsd') / rs.length)} | total ${usd(sum('costUsd'))}`,
    );
  }
  if (VERBOSE) {
    console.log('\n== Mismatches (console only) ==');
    for (const r of results)
      for (const m of r.mismatches) console.log(`  ${r.page} ${r.model} ${m}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const truthAll = (
    JSON.parse(fs.readFileSync(TRUTH_FILE, 'utf8')) as { pages: Record<string, Truth> }
  ).pages;
  const pages = loadPages();
  const missingTruth = pages.filter((p) => !truthAll[p.id]).map((p) => p.id);
  if (missingTruth.length) throw new Error(`no ground truth for: ${missingTruth.join(', ')}`);

  const { models, rates, source } = await resolveModelsAndRates();
  const promptTokens = textTokens(SYSTEM + PROMPT);

  console.log(
    `T-303 spike | ${DRY ? 'DRY RUN (no API call)' : 'LIVE'} | cap ${usd(CAP_USD)} | max_tokens ${MAX_TOKENS}`,
  );
  console.log(`truth: ${Object.keys(truthAll).length} pages from ${TRUTH_FILE}`);
  console.log(`pages: ${pages.length} from ${PAGES_DIR}`);
  for (const p of pages) {
    console.log(
      `  ${p.id} [${truthAll[p.id].language}] ${p.width}x${p.height} ${Math.round(p.bytes / 1024)} KB, est image tokens <= ${imageTokens(p)}`,
    );
  }
  console.log(
    `models: ${models.length ? models.join(', ') : '(none resolved)'}${source ? ` [${source}]` : ''}`,
  );
  for (const m of models) {
    const r = rates[m];
    console.log(`  ${m}: ${r ? `in $${r.in}/MTok, out $${r.out}/MTok` : 'RATE MISSING'}`);
  }
  console.log(`prompt est tokens: ${promptTokens}`);

  const estCall = (p: Page, r: Rate): number =>
    ((imageTokens(p) + promptTokens) * r.in + MAX_TOKENS * r.out) / 1e6;
  if (models.length > 0 && models.every((m) => rates[m])) {
    const worst = models.reduce(
      (a, m) => a + pages.reduce((b, p) => b + estCall(p, rates[m]), 0),
      0,
    );
    console.log(
      `worst-case estimate for ${pages.length} pages x ${models.length} models: ${usd(worst)} (cap ${usd(CAP_USD)})`,
    );
  }

  if (DRY) {
    if (CLEANUP) cleanup();
    return;
  }

  // Live run preconditions — fail closed.
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  if (models.length === 0) throw new Error('no models: pass --models or --mongo-url / MONGO_URI');
  const unpriced = models.filter((m) => !rates[m]);
  if (unpriced.length)
    throw new Error(
      `no rate for ${unpriced.join(', ')}: set ai.rates.<slug> or pass --rates; the cap needs it`,
    );

  // Direct to Anthropic. baseURL pinned so an ANTHROPIC_BASE_URL (e.g. a proxy) cannot reroute page images.
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: 'https://api.anthropic.com',
  });

  const results: Result[] = [];
  let spent = 0;
  let stopped = false;

  outer: for (const page of pages) {
    const truth = truthAll[page.id];
    const data = fs.readFileSync(page.file).toString('base64');
    for (const model of models) {
      const rate = rates[model];
      const est = estCall(page, rate);
      if (spent + est > CAP_USD) {
        console.log(
          `\nCAP: stopping before ${page.id} x ${model}: spent ${usd(spent)} + est ${usd(est)} > ${usd(CAP_USD)}`,
        );
        stopped = true;
        break outer;
      }
      const res: Result = {
        page: page.id,
        language: truth.language,
        model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        parsed: false,
        scores: {},
        mismatches: [],
      };
      try {
        const msg = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
                { type: 'text', text: PROMPT },
              ],
            },
          ],
        });
        const u = msg.usage;
        const cw = u.cache_creation_input_tokens ?? 0;
        const cr = u.cache_read_input_tokens ?? 0;
        res.inputTokens = u.input_tokens + cw + cr;
        res.outputTokens = u.output_tokens;
        res.costUsd =
          (u.input_tokens * rate.in +
            cw * (rate.cacheWrite ?? rate.in * 2) +
            cr * (rate.cacheRead ?? rate.in * 0.1) +
            u.output_tokens * rate.out) /
          1e6;
        spent += res.costUsd;

        const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        const got = parseJson(text);
        if (got) {
          res.parsed = true;
          for (const f of FIELDS) {
            const s = score(f, truth, got);
            res.scores[f] = { ...s, flagged: got.unreadable.includes(f) };
            if (!s.norm) {
              const gv = f === 'accused_names' ? JSON.stringify(got.accused_names) : String(got[f]);
              const tv = f === 'accused_names' ? JSON.stringify(truth.accused_names) : truth[f];
              res.mismatches.push(`${f}: got ${gv} | want ${tv}`);
            }
          }
        } else {
          res.mismatches.push('response was not parseable JSON');
          for (const f of FIELDS) res.scores[f] = { exact: false, norm: false, flagged: false };
        }
      } catch (err) {
        // Errors carry the SDK message only; never the request body.
        res.mismatches.push(`call failed: ${err instanceof Error ? err.message : 'unknown error'}`);
        for (const f of FIELDS) res.scores[f] = { exact: false, norm: false, flagged: false };
      }
      results.push(res);
      console.log(
        `  ${page.id} x ${model}: in ${res.inputTokens} out ${res.outputTokens} ${usd(res.costUsd)} | spent ${usd(spent)}`,
      );
    }
  }

  printReport(results, models);
  console.log(
    `\nTotal spent: ${usd(spent)} of ${usd(CAP_USD)} cap${stopped ? ' (STOPPED AT CAP)' : ''}`,
  );
  console.log('Handwritten pages: untested, waiting on pages (T-303 ruling 1).');
  if (CLEANUP) cleanup();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    if (CLEANUP) cleanup();
    process.exit(1);
  });
}
