/**
 * T-147e, AC7 — `--calibrate`: per fact type, the confidence the extraction
 * pass gave each fact it read, split by whether the read was right (the
 * fixture's `expect.ledger` is the ground truth), and a suggested floor.
 * Reports only: the floors in packages/shared/src/utils/normalize/confidence.ts
 * are not changed by this code. Pure.
 */
import { displaysMatch, fold } from './assert';
import { ExtractionRead, Fixture, LedgerEvidence } from './types';

export interface CalibrationSample {
  type: string;
  confidence: number;
  correct: boolean;
}

/**
 * A read is correct when the fixture expects that key with a display whose
 * folded text contains the span's folded text or the reverse (the span is the
 * advocate's words, the display the normalized value). A read that reached the
 * ledger is judged by the ledger's display instead. Keys the fixture does
 * not state are not samples.
 */
export function samplesFor(
  fixture: Fixture,
  reads: ExtractionRead[],
  ledger: LedgerEvidence | null = null,
): CalibrationSample[] {
  const out: CalibrationSample[] = [];
  for (const r of reads) {
    const exp = fixture.expect.ledger?.find((l) => l.key === r.key);
    if (!exp) continue;
    let correct: boolean;
    const inLedger = ledger?.facts.find((f) => f.key === r.key && f.raw_span === r.span);
    if (exp.unresolved) correct = false;
    // A read that reached the ledger is judged by its normalized display.
    else if (inLedger) correct = displaysMatch(inLedger.display, exp.display ?? '');
    else {
      const d = fold(exp.display ?? '');
      const s = fold(r.span);
      correct =
        d.length > 0 &&
        s.length > 0 &&
        (d.includes(s) || s.includes(d) || (digits(d) === digits(s) && digits(d).length > 0));
    }
    out.push({ type: r.type, confidence: r.confidence, correct });
  }
  return out;
}

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

export interface TypeCalibration {
  type: string;
  currentFloor: number | null;
  n: number;
  correct: number[];
  wrong: number[];
  suggestedFloor: number | null;
  /** Correct reads the suggested floor would send to "unresolved". */
  correctLost: number;
  note: string;
}

function q(xs: number[]): string {
  if (xs.length === 0) return '-';
  const s = [...xs].sort((a, b) => a - b);
  const med = s[Math.floor(s.length / 2)];
  return `min ${s[0].toFixed(2)} / median ${med.toFixed(2)} / max ${s[s.length - 1].toFixed(2)}`;
}

export function calibrate(
  samples: CalibrationSample[],
  currentFloors: Record<string, number>,
): TypeCalibration[] {
  const types = [...new Set([...samples.map((s) => s.type), ...Object.keys(currentFloors)])].sort();
  return types.map((type) => {
    const mine = samples.filter((s) => s.type === type);
    const correct = mine.filter((s) => s.correct).map((s) => s.confidence);
    const wrong = mine.filter((s) => !s.correct).map((s) => s.confidence);
    const current = currentFloors[type] ?? null;
    let suggested: number | null = current;
    let note: string;
    if (mine.length < 5) {
      note = 'too few samples; keep the current floor';
    } else if (wrong.length === 0) {
      note = 'no wrong read seen; keep the current floor';
    } else {
      const above = Math.min(0.99, Math.round((Math.max(...wrong) + 0.01) * 100) / 100);
      suggested = current === null ? above : Math.max(current, above);
      note =
        suggested === current
          ? 'every wrong read is already below the floor'
          : 'raise: a wrong read was above the floor';
    }
    return {
      type,
      currentFloor: current,
      n: mine.length,
      correct,
      wrong,
      suggestedFloor: suggested,
      correctLost: suggested === null ? 0 : correct.filter((c) => c < suggested!).length,
      note,
    };
  });
}

export function renderCalibration(rows: TypeCalibration[]): string[] {
  const lines = ['', 'Confidence calibration (AC7). Floors are NOT changed by this run.'];
  for (const r of rows) {
    lines.push(
      `  ${r.type.padEnd(15)} floor ${r.currentFloor ?? '-'} -> suggested ${r.suggestedFloor ?? '-'}  n=${r.n}  right[${q(r.correct)}]  wrong[${q(r.wrong)}]  correct reads lost=${r.correctLost}  (${r.note})`,
    );
  }
  return lines;
}

// ── Date confidence table (T-453 round 2, Arjun 15 Oct 2026) ────────────────
//
// Every date the extraction pass read, with the confidence the model gave it,
// judged against the fixture's expected display, so a real run shows whether
// 0.85 ever means "right". Ids, field keys and dates only: the dates are
// fixture-authored test data, never the span text. Reports only; the 0.9
// floor is not changed here.

/** A date normaliser: ISO `YYYY-MM-DD`, or null when the text is no date. */
export type DateReader = (text: string) => string | null;

export interface DateConfidenceRow {
  fixtureId: string;
  key: string;
  /** The read normalised to ISO, or null when it does not normalise. */
  read: string | null;
  /** The fixture's expected display normalised to ISO; `unresolved`; or null when the fixture does not state the key. */
  expected: string | null;
  confidence: number;
  /** Null when the fixture does not state the key (not judged). */
  correct: boolean | null;
}

/**
 * One row per date read (type `date`). Correct when the read and the
 * expected display normalise to the same day; when the fixture expects the
 * key unresolved, correct only when the read does not normalise either.
 */
export function dateConfidenceRows(
  fixture: Fixture,
  reads: ExtractionRead[],
  readDate: DateReader,
): DateConfidenceRow[] {
  const out: DateConfidenceRow[] = [];
  for (const r of reads) {
    if (r.type !== 'date') continue;
    const read = readDate(r.span);
    const exp = fixture.expect.ledger?.find((l) => l.key === r.key);
    let expected: string | null = null;
    let correct: boolean | null = null;
    if (exp?.unresolved) {
      expected = 'unresolved';
      correct = read === null;
    } else if (exp) {
      expected = readDate(exp.display ?? '');
      correct = read !== null && expected !== null && read === expected;
    }
    out.push({
      fixtureId: fixture.id,
      key: r.key,
      read,
      expected,
      confidence: r.confidence,
      correct,
    });
  }
  return out;
}

export const DATE_CONFIDENCE_BUCKETS = ['<0.80', '0.80', '0.85', '0.90', '0.95', '1.00'] as const;
export type DateConfidenceBucket = (typeof DATE_CONFIDENCE_BUCKETS)[number];

/** `0.80` holds [0.80, 0.85), ... `0.95` holds [0.95, 1.00), `1.00` holds 1.00 (and above). */
export function dateConfidenceBucket(c: number): DateConfidenceBucket {
  if (!(c >= 0.8)) return '<0.80';
  if (c >= 1) return '1.00';
  const step = Math.floor(c * 20 + 1e-9) / 20;
  return step.toFixed(2) as DateConfidenceBucket;
}

export interface DateConfidenceHistogram {
  bucket: DateConfidenceBucket;
  right: number;
  wrong: number;
  /** Reads of keys the fixture does not state. */
  unjudged: number;
}

export function dateConfidenceHistogram(rows: DateConfidenceRow[]): DateConfidenceHistogram[] {
  const h = DATE_CONFIDENCE_BUCKETS.map((bucket) => ({ bucket, right: 0, wrong: 0, unjudged: 0 }));
  for (const r of rows) {
    const b = h.find((x) => x.bucket === dateConfidenceBucket(r.confidence))!;
    if (r.correct === true) b.right++;
    else if (r.correct === false) b.wrong++;
    else b.unjudged++;
  }
  return h;
}

export function renderDateConfidence(rows: DateConfidenceRow[]): string[] {
  const lines = [
    '',
    'Date reads by model confidence (T-453). The 0.9 floor is NOT changed by this run.',
  ];
  if (rows.length === 0) {
    lines.push('  no date reads');
    return lines;
  }
  lines.push(
    `  ${'fixture'.padEnd(48)} ${'key'.padEnd(28)} ${'read'.padEnd(10)} ${'expected'.padEnd(10)} conf  correct`,
  );
  for (const r of rows) {
    const ok = r.correct === null ? '-' : r.correct ? 'right' : 'WRONG';
    lines.push(
      `  ${r.fixtureId.padEnd(48)} ${r.key.padEnd(28)} ${(r.read ?? '-').padEnd(10)} ${(r.expected ?? '-').padEnd(10)} ${r.confidence.toFixed(2)}  ${ok}`,
    );
  }
  lines.push('  histogram (bucket: right / wrong / not judged):');
  for (const b of dateConfidenceHistogram(rows))
    lines.push(`    ${b.bucket.padEnd(5)}  ${b.right} / ${b.wrong} / ${b.unjudged}`);
  return lines;
}
