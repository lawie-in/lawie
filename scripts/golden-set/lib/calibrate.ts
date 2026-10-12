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
      correct = d.length > 0 && s.length > 0 && (d.includes(s) || s.includes(d) || digits(d) === digits(s) && digits(d).length > 0);
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
      note = suggested === current ? 'every wrong read is already below the floor' : 'raise: a wrong read was above the floor';
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
