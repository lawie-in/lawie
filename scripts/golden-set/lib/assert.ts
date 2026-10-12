/**
 * T-147e — the assertions. Pure: a fixture and the evidence of its run in, a
 * result with readable failures out. The four verifier checks are read from
 * the verifier's own findings (the FactDiff rows of the run); each fixture's
 * explicit expectations are read against the document as delivered.
 */
import {
  AllowedViolation,
  FactDiffEvidence,
  Failure,
  Fixture,
  FixtureResult,
  RunEvidence,
} from './types';

/** Case, accents' compatibility forms, curly quotes and spacing ignored. */
export function fold(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The lines of `text` that hold `needle` (folded), with one line either side. At most 3 hits. */
export function contextLines(text: string, needle: string, folded = true): string[] {
  const lines = text.split('\n');
  const n = folded ? fold(needle) : needle;
  const out: string[] = [];
  let hits = 0;
  lines.forEach((line, i) => {
    if (hits >= 3) return;
    const hay = folded ? fold(line) : line;
    if (n.length > 0 && hay.includes(n)) {
      hits += 1;
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
        out.push(`${j === i ? '>' : ' '} ${String(j + 1).padStart(4)} | ${lines[j]}`);
      }
      out.push('');
    }
  });
  return out;
}

/** Folded, either containing the other: "PS Hazratganj" holds "Hazratganj". */
export function displaysMatch(actual: string, expected: string): boolean {
  const a = fold(actual);
  const e = fold(expected);
  return e.length > 0 && (a === e || a.includes(e) || e.includes(a));
}

function allowed(v: FactDiffEvidence, allow: AllowedViolation[]): boolean {
  return allow.some(
    (a) =>
      a.check === v.check &&
      (a.ledgerKey === undefined || a.ledgerKey === v.ledgerKey) &&
      (a.bannedEntryId === undefined || a.bannedEntryId === v.bannedEntryId),
  );
}

const CHECK_WORDS: Record<string, string> = {
  unsupported: 'a value not in the ledger',
  dropped: 'a required fact left out',
  mutation: 'a fact changed',
  banned: 'a banned assertion written',
};

export function describeFinding(v: FactDiffEvidence): Failure {
  const what = CHECK_WORDS[v.check] ?? v.check;
  const key = v.ledgerKey ? ` [${v.ledgerKey}]` : '';
  const ban = v.bannedEntryId ? ` (banned entry ${v.bannedEntryId})` : '';
  if (v.check === 'banned') {
    return {
      kind: 'verifier',
      expected: `no banned assertion ${v.bannedEntryId ?? ''} unless the ledger holds "${v.label}"${key}`,
      actual: `the Drafter wrote "${v.draftValue ?? '?'}" (paragraph ${v.paragraphIndex + 1}, ${v.phase}, ${v.resolution})`,
    };
  }
  return {
    kind: 'verifier',
    expected: `${v.label}${key}: ${v.ledgerValue !== null ? `"${v.ledgerValue}"` : 'nothing the ledger does not hold'}`,
    actual: `verifier ${v.check}${ban}, ${what}: ${v.draftValue !== null ? `"${v.draftValue}"` : 'not in the draft'} (paragraph ${v.paragraphIndex + 1}, ${v.phase}, ${v.resolution})`,
  };
}

/** Evaluate one fixture against the evidence of its run. */
export function evaluate(fixture: Fixture, ev: RunEvidence): FixtureResult {
  const failures: Failure[] = [];
  const e = fixture.expect;

  if (!ev.isolation.ok) {
    for (const p of ev.isolation.problems) {
      failures.push({ kind: 'isolation', expected: 'every row of this run marked fixture', actual: p });
    }
  }

  if (ev.pipelineError !== null || ev.deliveredText === null) {
    failures.push({
      kind: 'pipeline',
      expected: 'a delivered draft',
      actual: ev.pipelineError ?? 'no draft was delivered',
    });
    return result(fixture, ev, failures);
  }
  const text = ev.deliveredText;
  const ftext = fold(text);
  // A placeholder's label is the system's words, not an assertion: `absent` skips it.
  const asserted = fold(text.replace(/\{\{\s*MISSING\s*:[^}]*\}\}/g, ' '));

  // The four verifier checks. Initial findings are what the model wrote;
  // after-repair findings are what the repair left. Any not allowed fails.
  const allow = e.allow_violations ?? [];
  const seen = new Set<string>();
  for (const v of ev.factDiffs) {
    if (allowed(v, allow)) continue;
    const k = `${v.phase}|${v.check}|${v.ledgerKey}|${v.bannedEntryId}|${v.draftValue}`;
    if (seen.has(k)) continue;
    seen.add(k);
    failures.push(describeFinding(v));
  }

  for (const nw of e.not_written ?? []) {
    const hit = ev.factDiffs.find((v) => v.check === 'banned' && v.bannedEntryId === nw.banned_entry_id);
    if (hit) {
      failures.push({
        kind: 'not_written',
        expected: `the Drafter does not write banned assertion ${nw.banned_entry_id}`,
        actual: `it wrote "${hit.draftValue ?? '?'}" (${hit.resolution} before delivery)`,
        why: nw.why,
      });
    }
  }

  for (const a of e.absent ?? []) {
    const found = a.any_of.filter((s) => asserted.includes(fold(s)));
    if (found.length > 0) {
      failures.push({
        kind: 'absent',
        expected: `absent: ${a.any_of.map((s) => `"${s}"`).join(' / ')}`,
        actual: `found "${found[0]}"`,
        why: a.why,
        context: contextLines(text, found[0]),
      });
    }
  }

  for (const p of e.present ?? []) {
    if (!p.any_of.some((s) => ftext.includes(fold(s)))) {
      failures.push({
        kind: 'present',
        expected: `present: ${p.any_of.map((s) => `"${s}"`).join(' / ')}`,
        actual: 'not in the delivered document',
        why: p.why,
      });
    }
  }

  for (const x of e.exact ?? []) {
    if (!x.any_of.some((s) => text.includes(s))) {
      const near = x.any_of.find((s) => ftext.includes(fold(s)));
      failures.push({
        kind: 'exact',
        expected: `character-exact: ${x.any_of.map((s) => `"${s}"`).join(' / ')}`,
        actual: near
          ? `only a near match (case or spacing differs) for "${near}"`
          : 'not in the delivered document',
        why: x.why,
        context: near ? contextLines(text, near) : undefined,
      });
    }
  }

  for (const l of e.ledger ?? []) {
    const fact = ev.ledger?.facts.find((f) => f.key === l.key);
    const unres = ev.ledger?.unresolved.find((u) => u.key === l.key);
    if (l.unresolved) {
      if (fact) {
        failures.push({
          kind: 'ledger',
          expected: `ledger holds ${l.key} as unresolved`,
          actual: `ledger holds it as a fact: "${fact.display}"`,
          why: l.why,
        });
      }
    } else if (!fact || !displaysMatch(fact.display, l.display ?? '')) {
      failures.push({
        kind: 'ledger',
        expected: `ledger ${l.key} = "${l.display}"`,
        actual: fact
          ? `"${fact.display}"`
          : unres
            ? `unresolved (${unres.reason}) from "${unres.raw_span}"`
            : 'not in the ledger',
        why: l.why,
      });
    }
  }

  return result(fixture, ev, failures);
}

function result(fixture: Fixture, ev: RunEvidence, failures: Failure[]): FixtureResult {
  return {
    id: fixture.id,
    pack: fixture.pack,
    title: fixture.title,
    risk: fixture.risk,
    passed: failures.length === 0,
    skipped: false,
    failures,
    runId: ev.runId,
    intakeId: ev.intakeId,
    documentId: ev.documentId,
    ledgerId: ev.ledgerId,
    tokens: ev.tokens,
    verifierFindings: ev.factDiffs.filter((v) => v.phase === 'initial').length,
    missingClauses: ev.missingClauses,
  };
}

export function skipped(fixture: Fixture, reason: string): FixtureResult {
  return {
    id: fixture.id,
    pack: fixture.pack,
    title: fixture.title,
    risk: fixture.risk,
    passed: true,
    skipped: true,
    skipReason: reason,
    failures: [],
    runId: null,
    intakeId: null,
    documentId: null,
    ledgerId: null,
    tokens: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
    verifierFindings: 0,
    missingClauses: [],
  };
}
