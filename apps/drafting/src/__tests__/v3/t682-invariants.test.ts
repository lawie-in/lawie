/**
 * T-682, Arjun's condition 1: one unit test per invariant of schema §3, each named after it.
 * Also the guards: 2 MB sealed, 100 versions, idempotent create, run taken, the flag fails closed.
 * Fictional parties only.
 */
import '../setupDb';
import mongoose from 'mongoose';

import { AppSetting } from '../../models/AppSetting.model';
import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import { _clearAppSettingsCache } from '../../services/app-settings.service';
import { createLedger as createV2Ledger } from '../../services/fact-ledger.service';
import * as L from '../../services/v3/ledger.service';
import type { LedgerEntry, LedgerSnapshot } from '../../services/v3/ledger.types';
import {
  ARREST,
  CHECKLIST,
  cand,
  CUSTODY,
  DESC_CALM,
  extractOf,
  freshLedger,
  newRun,
  PACK,
  readAnswer,
  readDescription,
  storedDoc,
  USER_A,
  USER_B,
} from './t682-helpers';

const keysOf = (es: readonly LedgerEntry[]) => es.map((e) => `${e.key}:${e.status}`);

beforeAll(async () => {
  await FactLedgerV3Model.init();
});

describe('invariant-1-one-per-run', () => {
  it('a second create for the same run and user returns the existing ledger', async () => {
    const runId = newRun();
    const a = await L.createLedger({ runId, userId: USER_A, packId: PACK });
    const b = await L.createLedger({ runId, userId: USER_A, packId: PACK });
    expect(b.ledgerId).toBe(a.ledgerId);
    expect(await FactLedgerV3Model.countDocuments({ runId })).toBe(1);
    expect(b.version).toBe(1);
  });

  it('two creates at the same moment still leave one ledger, and both callers get it', async () => {
    const runId = newRun();
    const [a, b] = await Promise.all([
      L.createLedger({ runId, userId: USER_A, packId: PACK }),
      L.createLedger({ runId, userId: USER_A, packId: PACK }),
    ]);
    expect(a.ledgerId).toBe(b.ledgerId);
    expect(await FactLedgerV3Model.countDocuments({ runId })).toBe(1);
  });

  it('the run id is unique in the database (the index, not only the code)', async () => {
    const runId = newRun();
    await L.createLedger({ runId, userId: USER_A, packId: PACK });
    await expect(
      FactLedgerV3Model.create({
        runId,
        userId: USER_B,
        packId: PACK,
        runType: 'user',
        currentVersion: 1,
        versions: [
          { version: 1, reason: 'extract', createdAt: new Date(), changedKeys: [], sealed: 'x' },
        ],
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("a run held by another user is LedgerRunTakenError, and that user's ledger is not touched", async () => {
    const runId = newRun();
    const mine = await L.createLedger({ runId, userId: USER_A, packId: PACK });
    await expect(L.createLedger({ runId, userId: USER_B, packId: PACK })).rejects.toBeInstanceOf(
      L.LedgerRunTakenError,
    );
    const doc = await storedDoc(mine.ledgerId);
    expect(String(doc!.userId)).toBe(USER_A);
    expect(doc!.currentVersion).toBe(1);
  });

  it('a change of kind is a new run: version 1 is kind_change with the asked entries carried over', async () => {
    const s = await freshLedger();
    const read = await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    const edited = await L.applyUserEdit(
      read.s.ledgerId,
      USER_A,
      read.s.version,
      { key: 'applicant_name', text: 'Test Applicant A', fromQuestion: true },
      CHECKLIST,
    );
    const earlier = (await L.openLedger(s.ledgerId, USER_A))!;
    const carried = L.carryOverState(earlier, CHECKLIST);
    // the user-read entries stay behind; the advocate's own (asked) entries go with the user
    expect(carried.entries.map((e) => e.key)).toEqual(['applicant_name']);
    expect(carried.entries.every((e) => e.origin.source === 'asked')).toBe(true);
    const next = await L.createLedger({
      runId: newRun(),
      userId: USER_A,
      packId: PACK,
      initial: carried,
      reason: 'kind_change',
    });
    const doc = await storedDoc(next.ledgerId);
    expect(doc!.versions[0].reason).toBe('kind_change');
    expect(next.entries.map((e) => e.key)).toEqual(['applicant_name']);
    expect(edited.result.status).toBe('saved');
  });
});

describe('invariant-2-append-only', () => {
  it('a write appends one version and leaves every earlier version byte for byte as it was', async () => {
    const s = await freshLedger();
    const r1 = await readDescription(s, DESC_CALM, [ARREST()]);
    const after1 = await storedDoc(s.ledgerId);
    const r2 = await readDescription(r1.s, DESC_CALM, [CUSTODY()]);
    const after2 = await storedDoc(s.ledgerId);
    expect(r1.s.version).toBe(2);
    expect(r2.s.version).toBe(3);
    expect(after2!.versions).toHaveLength(3);
    expect(after2!.currentVersion).toBe(3);
    for (let i = 0; i < after1!.versions.length; i += 1) {
      expect(after2!.versions[i].sealed).toBe(after1!.versions[i].sealed);
      expect(after2!.versions[i].reason).toBe(after1!.versions[i].reason);
      expect(after2!.versions[i].changedKeys).toEqual(after1!.versions[i].changedKeys);
    }
  });

  it('a correction is a new version; the older value stays in the older version', async () => {
    const s = await freshLedger();
    const r1 = await readDescription(s, DESC_CALM, [ARREST()]);
    const fix = await L.applyUserEdit(
      r1.s.ledgerId,
      USER_A,
      r1.s.version,
      { key: 'arrest_date', text: '11.10.2026' },
      CHECKLIST,
    );
    expect(fix.s.version).toBe(3);
    const doc = (await storedDoc(s.ledgerId))!;
    expect(doc.versions.map((v) => v.reason)).toEqual(['extract', 'extract', 'edit']);
    expect(doc.versions[1].sealed).not.toBe(doc.versions[2].sealed);
  });

  it('a write for a version that is no longer current is LedgerVersionRaceError and stores nothing', async () => {
    const s = await freshLedger();
    await readDescription(s, DESC_CALM, [ARREST()]);
    await expect(readDescription(s, DESC_CALM, [CUSTODY()])).rejects.toBeInstanceOf(
      L.LedgerVersionRaceError,
    );
    const doc = (await storedDoc(s.ledgerId))!;
    expect(doc.versions).toHaveLength(2);
    expect(doc.currentVersion).toBe(2);
  });

  it('TWO CONCURRENT appends at the same version: exactly one wins, the other is LedgerVersionRaceError', async () => {
    const s = await freshLedger();
    const first = readDescription(s, 'FIR 12/2026 was registered.', [
      cand('fir_number', '12/2026', '12/2026'),
    ]);
    const second = readDescription(s, 'Police Station Civil Lines.', [
      cand('police_station', 'Civil Lines', 'Civil Lines'),
    ]);
    const settled = await Promise.allSettled([first, second]);
    const won = settled.filter((r) => r.status === 'fulfilled');
    const lost = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(L.LedgerVersionRaceError);
    const doc = (await storedDoc(s.ledgerId))!;
    expect(doc.versions).toHaveLength(2);
    expect(doc.currentVersion).toBe(2);
  });

  it('applyUserEdit and recordNonAnswer race the same way', async () => {
    const s = await freshLedger();
    const settled = await Promise.allSettled([
      L.applyUserEdit(
        s.ledgerId,
        USER_A,
        1,
        { key: 'applicant_name', text: 'Test Applicant A' },
        CHECKLIST,
      ),
      L.recordNonAnswer(s.ledgerId, USER_A, 1, { key: 'antecedents', kind: 'not_known', turn: 1 }),
    ]);
    const lost = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(L.LedgerVersionRaceError);
  });

  it('only the owner can write: another user is LedgerNotFoundV3Error', async () => {
    const s = await freshLedger();
    await expect(readDescription(s, DESC_CALM, [ARREST()], USER_B)).rejects.toBeInstanceOf(
      L.LedgerNotFoundV3Error,
    );
  });
});

describe('invariant-3-quote-verbatim', () => {
  it('a quote that is not in the turn text is dropped and counted, never given an invented quote', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [
      cand('arrest_date', '2026-10-10', 'arrested on 11 November'),
      CUSTODY(),
    ]);
    expect(r.dropped.span_not_found).toBe(1);
    expect(keysOf(r.s.entries)).toEqual(['currently_in_custody:held']);
  });

  it("every user or asked entry has a quote, found verbatim in that turn's text", async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    const stored = r.s.entries.filter((e) => ['user', 'asked'].includes(e.origin.source));
    expect(stored.length).toBe(2);
    for (const e of stored) {
      expect(e.origin.quote.length).toBeGreaterThan(0);
      expect(e.origin.quote.length).toBeLessThanOrEqual(200);
      expect(DESC_CALM.includes(e.origin.quote)).toBe(true);
    }
  });

  it('an empty quote is dropped (no_span)', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [cand('arrest_date', '2026-10-10', '   ')]);
    expect(r.dropped.no_span).toBe(1);
    expect(r.s.entries).toEqual([]);
  });

  it('derived entries carry no quote but a derivation', async () => {
    const s = await freshLedger();
    await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    const open = (await L.openLedger(s.ledgerId, USER_A, { described: DESC_CALM }))!;
    const derived = open.entries.filter((e) => e.origin.source === 'derived');
    expect(derived.length).toBeGreaterThan(0);
    for (const e of derived) {
      expect(e.origin.quote).toBe('');
      expect(e.derivation?.rule).toBeTruthy();
    }
  });
});

describe('invariant-4-non-answers-not-facts', () => {
  it('"Not known" as an answer is a NonAnswer and no entry', async () => {
    const s = await freshLedger();
    const r = await L.applyUserEdit(
      s.ledgerId,
      USER_A,
      s.version,
      { key: 'antecedents', text: 'Not known', fromQuestion: true },
      CHECKLIST,
    );
    expect(r.s.nonAnswers).toEqual([
      expect.objectContaining({ key: 'antecedents', kind: 'not_known' }),
    ]);
    expect(r.s.entries.filter((e) => e.key === 'antecedents')).toEqual([]);
    expect(L.factsForGeneration(r.s).facts).toEqual([]);
  });

  it("a non-answer removes the key's held entry in that version", async () => {
    const s = await freshLedger();
    const a = await L.applyUserEdit(
      s.ledgerId,
      USER_A,
      s.version,
      { key: 'antecedents', text: 'Two earlier cases, both acquitted', fromQuestion: true },
      CHECKLIST,
    );
    expect(a.s.entries.some((e) => e.key === 'antecedents')).toBe(true);
    const b = await L.applyUserEdit(
      a.s.ledgerId,
      USER_A,
      a.s.version,
      { key: 'antecedents', text: 'Not known', fromQuestion: true },
      CHECKLIST,
    );
    expect(b.s.entries.some((e) => e.key === 'antecedents')).toBe(false);
    expect(b.s.nonAnswers.map((n) => n.key)).toEqual(['antecedents']);
  });

  it("the Extractor's nonAnswers are recorded as not_known with the turn, and make no entry", async () => {
    const s = await freshLedger();
    const r = await readAnswer(s, 'I do not know', [], 3);
    expect(r.s.nonAnswers).toEqual([]);
    const withNon = await L.appendCandidates(
      s.ledgerId,
      USER_A,
      r.s.version,
      extractOf([], [], ['antecedents']),
      CHECKLIST,
      'unknown',
      { turn: 4, kind: 'answer' },
    );
    expect(withNon.s.nonAnswers).toEqual([{ key: 'antecedents', kind: 'not_known', turn: 4 }]);
    expect(withNon.s.entries).toEqual([]);
  });

  it('a recorded non-answer is read as "asked, empty": still no fact', async () => {
    const s = await freshLedger();
    const r = await L.recordNonAnswer(s.ledgerId, USER_A, s.version, {
      key: 'antecedents',
      kind: 'not_known',
      turn: 2,
    });
    expect(L.openItems(r).nonAnswers).toEqual([{ key: 'antecedents', kind: 'not_known', turn: 2 }]);
    expect(L.held(r)).toEqual([]);
  });
});

describe('invariant-5-conflicts-become-a-question', () => {
  const D1 = 'Test Applicant A was arrested on 10.10.2026.';
  const D2 = 'He was arrested on 11.10.2026, says the family.';

  async function conflicted() {
    const s = await freshLedger();
    const r1 = await readDescription(s, D1, [ARREST()]);
    const r2 = await readDescription(r1.s, D2, [cand('arrest_date', '2026-10-11', '11.10.2026')]);
    return { s, r1, r2 };
  }

  it('a different reading over a reading is one conflict entry with both candidates, never a silent pick', async () => {
    const { r2 } = await conflicted();
    const entries = r2.s.entries.filter((e) => e.key === 'arrest_date');
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('conflict');
    expect(entries[0].candidates).toHaveLength(2);
    expect(entries[0].candidates!.map((c) => c.source.quote).sort()).toEqual([
      '10.10.2026',
      '11.10.2026',
    ]);
    expect(entries[0].value).toBeUndefined();
  });

  it('a conflict is never read as held', async () => {
    const { r2 } = await conflicted();
    expect(L.held(r2.s).map((e) => e.key)).not.toContain('arrest_date');
    expect(L.openItems(r2.s).conflicts.map((e) => e.key)).toEqual(['arrest_date']);
  });

  it('generation shows it as unresolved conflicting_values, and custody is not derived over it', async () => {
    const { r2 } = await conflicted();
    const withCustody = await readDescription(r2.s, DESC_CALM, [CUSTODY()]);
    const open = (await L.openLedger(r2.s.ledgerId, USER_A, { described: D1 }))!;
    const gen = L.factsForGeneration(open);
    expect(gen.unresolved.filter((u) => u.key === 'arrest_date').map((u) => u.reason)).toEqual([
      'conflicting_values',
    ]);
    expect(gen.facts.map((f) => f.key)).not.toContain('arrest_date');
    expect(gen.facts.map((f) => f.key)).not.toContain('custody_since');
    expect(withCustody.s.entries.some((e) => e.key === 'currently_in_custody')).toBe(true);
  });

  it('two conflicting values reported by the Extractor are a conflict too', async () => {
    const s = await freshLedger();
    const r = await L.appendCandidates(
      s.ledgerId,
      USER_A,
      s.version,
      extractOf(
        [],
        [
          {
            key: 'arrest_date',
            values: [
              cand('arrest_date', '2026-10-10', '10.10.2026'),
              cand('arrest_date', '2026-10-11', '11.10.2026'),
            ],
          },
        ],
      ),
      CHECKLIST,
      'arrested on 10.10.2026, or was it 11.10.2026',
      { turn: 0, kind: 'description' },
    );
    expect(r.s.entries.filter((e) => e.status === 'conflict').map((e) => e.key)).toEqual([
      'arrest_date',
    ]);
  });

  it("it closes only on the advocate's answer: reason conflict_resolved, the answer is asked", async () => {
    const { r2 } = await conflicted();
    const done = await L.applyUserEdit(
      r2.s.ledgerId,
      USER_A,
      r2.s.version,
      { key: 'arrest_date', text: '10.10.2026', fromQuestion: true },
      CHECKLIST,
    );
    expect(done.result.status).toBe('saved');
    const entries = done.s.entries.filter((e) => e.key === 'arrest_date');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      status: 'held',
      origin: expect.objectContaining({ source: 'asked' }),
    });
    const doc = (await storedDoc(r2.s.ledgerId))!;
    expect(doc.versions[doc.versions.length - 1].reason).toBe('conflict_resolved');
  });

  it('an unreadable answer leaves the conflict open', async () => {
    const { r2 } = await conflicted();
    const bad = await L.applyUserEdit(
      r2.s.ledgerId,
      USER_A,
      r2.s.version,
      { key: 'arrest_date', text: 'some day last month, maybe', fromQuestion: true },
      CHECKLIST,
    );
    expect(bad.result.status).toBe('unreadable');
    expect(L.openItems(bad.s).conflicts.map((e) => e.key)).toEqual(['arrest_date']);
  });

  it('an asked value over a read value is not a conflict: the answer replaces the reading', async () => {
    const s = await freshLedger();
    const r1 = await readDescription(s, D1, [ARREST()]);
    const a = await readAnswer(r1.s, 'It was 11.10.2026', [
      cand('arrest_date', '2026-10-11', '11.10.2026', { kind: 'answer', turn: 1 }),
    ]);
    const entries = a.s.entries.filter((e) => e.key === 'arrest_date');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'held', value: '2026-10-11' });
    expect(entries[0].origin.source).toBe('asked');
  });
});

describe('invariant-6-derived-code-only-never-stored', () => {
  it('custody_since is computed at read from the arrest date and custody, and NEVER stored', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    // nothing derived in the returned write snapshot or in the stored sealed state
    expect(r.s.entries.filter((e) => e.origin.source === 'derived')).toEqual([]);
    const open = (await L.openLedger(s.ledgerId, USER_A, { described: DESC_CALM }))!;
    const derived = open.entries.filter((e) => e.origin.source === 'derived');
    expect(derived.map((e) => e.key).sort()).toEqual(['custody_since', 'custody_since_derived']);
    expect(derived.find((e) => e.key === 'custody_since')).toMatchObject({
      value: '2026-10-10',
      derivation: expect.objectContaining({ rule: 'custody_since.r1' }),
    });
    const doc = (await storedDoc(s.ledgerId))!;
    const sealedKeys = await sealedEntries(doc);
    expect(sealedKeys.map((e) => e.key)).not.toContain('custody_since');
    expect(sealedKeys.some((e) => e.origin.source === 'derived')).toBe(false);
  });

  it('it follows the inputs: a corrected arrest date changes the derived date, nothing stale', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    await L.applyUserEdit(
      r.s.ledgerId,
      USER_A,
      r.s.version,
      { key: 'arrest_date', text: '11.10.2026' },
      CHECKLIST,
    );
    const open = (await L.openLedger(s.ledgerId, USER_A, { described: DESC_CALM }))!;
    expect(open.entries.find((e) => e.key === 'custody_since')?.value).toBe('2026-10-11');
  });

  it('a held asked custody_since blocks the rule (B5): no derived entry over it', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    await L.applyUserEdit(
      r.s.ledgerId,
      USER_A,
      r.s.version,
      { key: 'custody_since', text: '12.10.2026', fromQuestion: true },
      CHECKLIST,
    );
    const open = (await L.openLedger(s.ledgerId, USER_A, { described: DESC_CALM }))!;
    const since = open.entries.filter((e) => e.key === 'custody_since');
    expect(since).toHaveLength(1);
    expect(since[0].origin.source).toBe('asked');
    expect(open.entries.some((e) => e.key === 'custody_since_derived')).toBe(false);
  });

  it('a model candidate for a code-only key is dropped (derived_key), never stored', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, 'Cheque amount Rs 5,00,000 in words five lakh.', [
      cand('amount_in_words', 'Five lakh rupees only', 'five lakh'),
      cand('custody_since_derived', 'yes', 'five lakh'),
      cand('custody_since', '2026-10-10', 'five lakh'),
    ]);
    expect(r.dropped.derived_key).toBe(2);
    expect(r.s.entries.map((e) => e.key)).not.toContain('amount_in_words');
    expect(r.s.entries.map((e) => e.key)).not.toContain('custody_since_derived');
  });

  it('a derived entry never overwrites a held user entry of the same key', async () => {
    const s = await freshLedger();
    const r = await readDescription(
      s,
      'Arrested on 10.10.2026, in judicial custody since 12.10.2026.',
      [ARREST(), CUSTODY(), cand('custody_since', '2026-10-12', '12.10.2026')],
    );
    expect(r.s.entries.some((e) => e.key === 'custody_since' && e.status === 'held')).toBe(true);
    const open = (await L.openLedger(s.ledgerId, USER_A))!;
    expect(
      open.entries.filter((e) => e.key === 'custody_since').map((e) => e.origin.source),
    ).toEqual(['user']);
  });

  it('no held input, no derived entry (it is never guessed)', async () => {
    const s = await freshLedger();
    await readDescription(s, DESC_CALM, [CUSTODY()]);
    const open = (await L.openLedger(s.ledgerId, USER_A))!;
    expect(open.entries.filter((e) => e.origin.source === 'derived')).toEqual([]);
  });
});

describe('invariant-7-unresolved-are-not-facts', () => {
  it('a reading below the confidence floor is an unresolved entry with a reason, not a held fact', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [ARREST({ confidence: 0.05 })]);
    const e = r.s.entries.find((x) => x.key === 'arrest_date')!;
    expect(e.status).toBe('unresolved');
    expect(e.reason).toBeTruthy();
    expect(e.value).toBeUndefined();
    expect(L.held(r.s).map((x) => x.key)).not.toContain('arrest_date');
    const gen = L.factsForGeneration(r.s);
    expect(gen.facts.map((f) => f.key)).not.toContain('arrest_date');
    expect(gen.unresolved.map((u) => u.key)).toEqual(['arrest_date']);
  });

  it('an unresolved reading never downgrades a held value', async () => {
    const s = await freshLedger();
    const r1 = await readDescription(s, DESC_CALM, [ARREST()]);
    const r2 = await readDescription(r1.s, DESC_CALM, [ARREST({ confidence: 0.05 })]);
    expect(r2.s.version).toBe(r1.s.version);
    expect(r2.s.entries.find((e) => e.key === 'arrest_date')?.status).toBe('held');
  });

  it('openItems lists unresolved entries apart from held ones', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [ARREST({ confidence: 0.05 }), CUSTODY()]);
    expect(L.openItems(r.s).unresolved.map((e) => e.key)).toEqual(['arrest_date']);
    expect(L.held(r.s, { derived: false }).map((e) => e.key)).toEqual(['currently_in_custody']);
  });
});

// ── Limits ──────────────────────────────────────────────────────────────────

describe('limits', () => {
  it('a version whose sealed state exceeds 2 MB is LedgerVersionTooLargeError and nothing is stored', async () => {
    const big: LedgerEntry = {
      id: 'big-1',
      key: 'facts_narrative',
      label: 'Brief facts',
      type: 'text',
      status: 'held',
      value: 'a'.repeat(3 * 1024 * 1024),
      display: 'a',
      origin: { source: 'user', quote: 'a', confidence: 1 },
      requiredInDraft: false,
    };
    const runId = newRun();
    await expect(
      L.createLedger({
        runId,
        userId: USER_A,
        packId: PACK,
        initial: L.importV2State({ entries: [big], nonAnswers: [] } as unknown as LedgerSnapshot),
      }),
    ).rejects.toBeInstanceOf(L.LedgerVersionTooLargeError);
    expect(await FactLedgerV3Model.countDocuments({ runId })).toBe(0);
  });

  it('a write that would exceed 2 MB leaves the ledger as it was', async () => {
    const s = await freshLedger();
    const huge = 'word '.repeat(700_000);
    const r = L.appendCandidates(
      s.ledgerId,
      USER_A,
      s.version,
      extractOf([cand('facts_narrative', huge, huge.slice(0, 190))]),
      CHECKLIST,
      huge,
      { turn: 0, kind: 'description' },
    );
    await r.then(
      () => undefined,
      () => undefined,
    );
    const doc = (await storedDoc(s.ledgerId))!;
    // either the read kept it small (a quote is bounded) or the guard refused it: never an oversize row
    expect(
      doc.versions.every(
        (v) => Buffer.byteLength(v.sealed, 'utf8') <= L.LEDGER_V3_MAX_SEALED_BYTES,
      ),
    ).toBe(true);
  });

  it('the cap is 100 versions: LedgerFullError, and the ledger keeps its 100', async () => {
    const s = await freshLedger();
    let version = s.version;
    for (let i = version; i < L.LEDGER_V3_MAX_VERSIONS; i += 1) {
      const r = await L.recordNonAnswer(s.ledgerId, USER_A, version, {
        key: i % 2 === 0 ? 'antecedents' : 'dependants',
        kind: i % 3 === 0 ? 'not_known' : 'none',
        turn: i,
      });
      // alternate the kind so each write changes something
      version = r.version;
    }
    expect(version).toBe(L.LEDGER_V3_MAX_VERSIONS);
    await expect(
      L.recordNonAnswer(s.ledgerId, USER_A, version, {
        key: 'applicant_occupation',
        kind: 'not_known',
        turn: 200,
      }),
    ).rejects.toBeInstanceOf(L.LedgerFullError);
    const doc = (await storedDoc(s.ledgerId))!;
    expect(doc.versions).toHaveLength(L.LEDGER_V3_MAX_VERSIONS);
  });

  it('a write that changes nothing appends nothing', async () => {
    const s = await freshLedger();
    const r1 = await readDescription(s, DESC_CALM, [ARREST()]);
    const r2 = await readDescription(r1.s, DESC_CALM, [ARREST()]);
    expect(r2.s.version).toBe(r1.s.version);
    expect((await storedDoc(s.ledgerId))!.versions).toHaveLength(2);
  });

  it('ids that are not ObjectIds are not found, not an error', async () => {
    expect(await L.openLedger('nope', USER_A)).toBeNull();
    expect(await L.openLedger(String(new mongoose.Types.ObjectId()), 'nope')).toBeNull();
    expect(await L.openLedgerForRun('', USER_A)).toBeNull();
    expect(await L.openLedgerForRun('run', 'nope')).toBeNull();
  });
});

// ── The switch ──────────────────────────────────────────────────────────────

describe('feature.drafting_v3_stage fails closed', () => {
  beforeEach(() => _clearAppSettingsCache());
  const setStage = async (value: string | null) => {
    await AppSetting.deleteMany({ key: L.DRAFTING_V3_STAGE_SETTING });
    if (value !== null) await AppSetting.create({ key: L.DRAFTING_V3_STAGE_SETTING, value });
    _clearAppSettingsCache();
  };

  it('unset is off', async () => {
    await setStage(null);
    expect(await L.draftingV3Stage()).toBe(0);
    expect(await L.isLedgerV3On()).toBe(false);
  });

  it.each(['0', '00', ' 0 '])('stage %j is off', async (v) => {
    await setStage(v);
    expect(await L.isLedgerV3On()).toBe(false);
  });

  it.each(['off', 'false', '-1', '1.5', 'abc', '1x'])(
    'a value that is not a whole number (%j) is off',
    async (v) => {
      await setStage(v);
      expect(await L.isLedgerV3On()).toBe(false);
      expect(await L.draftingV3Stage()).toBe(0);
    },
  );

  it.each([
    ['1', 1],
    ['2', 2],
    [' 3 ', 3],
  ])('stage %j is on', async (v, n) => {
    await setStage(v);
    expect(await L.isLedgerV3On()).toBe(true);
    expect(await L.draftingV3Stage()).toBe(n);
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

async function sealedEntries(doc: { versions: Array<{ sealed: string }> }) {
  const { decrypt } = await import('../../utils/encryption');
  const last = doc.versions[doc.versions.length - 1];
  return (JSON.parse(decrypt(last.sealed)) as { entries: LedgerEntry[] }).entries;
}

// keep an unused import honest: v2 ledgers are used in the compatibility file
void createV2Ledger;
