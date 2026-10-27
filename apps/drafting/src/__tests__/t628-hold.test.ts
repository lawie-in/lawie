/**
 * T-628 — pastDatePrayerHold and the withholdDraft branch for past_date_in_prayer, without a
 * database. The date goes to the advocate in the SSE event only; no log call carries it.
 */
import type { Response } from 'express';

import { GenerationFailedError, pastDatePrayerHold, withholdDraft } from '../services/ai.service';
import { UsageMeter } from '../services/llm-usage';

// 27 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-27T06:30:00Z');
type Pack = Parameters<typeof pastDatePrayerHold>[0];
type Sections = Parameters<typeof pastDatePrayerHold>[2];

const O39: Pack = {
  id: 'temporary_injunction_o39',
  facts: [{ key: 'restraint_sought', label: 'Pack label for the restraint' }],
} as unknown as Pack;
const O39_NO_FACTS: Pack = { id: 'temporary_injunction_o39', facts: [] } as unknown as Pack;
const OTHER: Pack = { id: 'bail_regular', facts: [] } as unknown as Pack;

const section = (section_id: string, content: string, type = 'template') =>
  ({ section_id, type, content }) as unknown as Sections[number];
const SECTIONS = (prayer: string): Sections => [
  section('cause_title', 'IN THE COURT OF ...'),
  section('body', '', 'ai_generated'),
  section('prayer', prayer),
];
const BODY_AT = 1;
const PAST = '20 October 2026';

describe('pastDatePrayerHold', () => {
  it('a non-O.39 pack returns null even with a past date everywhere', () => {
    const r = pastDatePrayerHold(
      OTHER,
      PAST,
      SECTIONS(`PRAYER\n${PAST}`),
      BODY_AT,
      `PRAYER\n${PAST}`,
      NOW,
    );
    expect(r).toBeNull();
  });

  it('restraint_sought with a past date holds, with the key, the date as written and the pack label', () => {
    expect(
      pastDatePrayerHold(O39, `after ${PAST}`, SECTIONS('a) restrain'), BODY_AT, 'body', NOW),
    ).toEqual({
      code: 'past_date_in_prayer',
      key: 'restraint_sought',
      label: 'Pack label for the restraint',
      date: PAST,
    });
  });

  it('the signed fallback label is used when the pack gives none', () => {
    const r = pastDatePrayerHold(O39_NO_FACTS, PAST, SECTIONS('a)'), BODY_AT, 'body', NOW);
    expect(r).toMatchObject({ label: 'Acts the defendant should be restrained from' });
  });

  it('today and a future date in restraint_sought do not hold; nor does no date', () => {
    for (const v of ['27 October 2026', '15 December 2026', 'raising any construction']) {
      expect(pastDatePrayerHold(O39, v, SECTIONS('a) restrain'), BODY_AT, 'body', NOW)).toBeNull();
    }
  });

  it('a non-string restraint_sought is ignored', () => {
    expect(pastDatePrayerHold(O39, undefined, SECTIONS('a)'), BODY_AT, 'body', NOW)).toBeNull();
    expect(pastDatePrayerHold(O39, 42, SECTIONS('a)'), BODY_AT, 'body', NOW)).toBeNull();
  });

  it('a system prayer with a past date holds, though restraint_sought is clean', () => {
    const r = pastDatePrayerHold(
      O39,
      'raising any construction',
      SECTIONS(`a) restrain from building, as on ${PAST};`),
      BODY_AT,
      'body',
      NOW,
    );
    expect(r).toMatchObject({ code: 'past_date_in_prayer', date: PAST });
  });

  it('the model prayer is read only when there is no system prayer', () => {
    const body = `1. Body.\n\nPRAYER\n\na) restrain from building after ${PAST}.`;
    const noPrayer: Sections = [section('cause_title', 'T'), section('body', '', 'ai_generated')];
    // no system prayer: the model's own section is read
    expect(pastDatePrayerHold(O39, 'building', noPrayer, 1, body, NOW)).toMatchObject({
      date: PAST,
    });
    // a clean system prayer: the model's prayer is NOT read
    expect(
      pastDatePrayerHold(O39, 'building', SECTIONS('a) restrain'), BODY_AT, body, NOW),
    ).toBeNull();
  });

  it('the body is never read: a past date in a paragraph, with no prayer heading', () => {
    const noPrayer: Sections = [section('cause_title', 'T'), section('body', '', 'ai_generated')];
    expect(
      pastDatePrayerHold(O39, 'building', noPrayer, 1, `1. That on ${PAST} he threatened.`, NOW),
    ).toBeNull();
    // and a past date in the body before a clean system prayer is not read either
    expect(
      pastDatePrayerHold(O39, 'building', SECTIONS('a) restrain'), BODY_AT, `1. On ${PAST}.`, NOW),
    ).toBeNull();
  });

  it('the body section at bodyAt is not read as a system prayer even if its id says prayer', () => {
    const odd: Sections = [section('prayer', `as on ${PAST}`, 'ai_generated')];
    expect(pastDatePrayerHold(O39, 'building', odd, 0, 'body', NOW)).toBeNull();
  });

  it('restraint_sought is read first: its date is the one returned', () => {
    const r = pastDatePrayerHold(
      O39,
      `since ${PAST}`,
      SECTIONS('as on 1 March 2026'),
      BODY_AT,
      'b',
      NOW,
    );
    expect(r).toMatchObject({ date: PAST });
  });
});

describe('withholdDraft: past_date_in_prayer', () => {
  function fakeRes() {
    const writes: string[] = [];
    const res = {
      headersSent: false,
      setHeader: jest.fn(),
      write: jest.fn((s: string) => {
        writes.push(s);
        return true;
      }),
      end: jest.fn(),
    };
    return { res: res as unknown as Response, writes, raw: res };
  }
  const usage = new UsageMeter().totals();
  const held = {
    code: 'past_date_in_prayer' as const,
    key: 'restraint_sought' as const,
    label: 'Acts the defendant should be restrained from',
    date: PAST,
  };
  const LINE =
    'The prayer refers to 20 October 2026, which has already passed. An injunction can only restrain what happens from now on. What should the defendant be restrained from?';

  it('sends the error event with the EN signed line and returns a GenerationFailedError', () => {
    const { res, writes, raw } = fakeRes();
    const err = withholdDraft(res, 'run-9', 'temporary_injunction_o39', held, usage);
    expect(err).toBeInstanceOf(GenerationFailedError);
    expect(err.code).toBe('past_date_in_prayer');
    expect(err.usage).toEqual(usage);
    const block = writes
      .join('')
      .split('\n\n')
      .find((b) => b.startsWith('event: error\n'))!;
    expect(JSON.parse(block.split('\ndata: ')[1])).toMatchObject({
      section: 'body',
      reason: LINE,
      retryable: false,
      code: 'past_date_in_prayer',
      error: 'past_date_in_prayer',
      key: 'restraint_sought',
      label: 'Acts the defendant should be restrained from',
      runId: 'run-9',
    });
    expect(writes.join('')).not.toContain('event: done');
    expect(raw.end).not.toHaveBeenCalled();
  });

  it('logs keys=restraint_sought only: the date never reaches a log call, nor the error message', () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // the log line is skipped under test
    const spies = (['info', 'log', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    try {
      const { res } = fakeRes();
      const err = withholdDraft(res, 'run-10', 'temporary_injunction_o39', held, usage);
      const logged = spies
        .flatMap((s) => s.mock.calls)
        .map((c) => c.map(String).join(' '))
        .join('\n');
      expect(logged).toContain(
        '[drafting] draft withheld (kind=temporary_injunction_o39, code=past_date_in_prayer, keys=restraint_sought)',
      );
      expect(logged).not.toContain(PAST);
      expect(logged).not.toContain('20 October');
      expect(logged).not.toContain('already passed');
      expect(err.message).toBe('draft withheld: past_date_in_prayer (keys=restraint_sought)');
      expect(err.message).not.toContain('2026');
    } finally {
      process.env.NODE_ENV = prevEnv;
      spies.forEach((s) => s.mockRestore());
    }
  });
});
