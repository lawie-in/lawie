/**
 * T-285 — the SSE keep-alive heartbeat (": keep-alive" comment line every 15 s).
 *
 * Transport only (Ajay's scope): a comment is not an event, so it never reaches the draft text.
 * Unit tests for utils/sse-keepalive.ts, then each of the four streaming functions of
 * ai.service.ts run against a fake response and a stubbed model whose calls take 90 s
 * (fake timers). No database, no network; every model answer is a fixture.
 */
import './setupEnv';

import { Response } from 'express';

import {
  streamGenerateDocument,
  streamGenerateFromBrief,
  streamGenerateFromTemplate,
  streamGenerateGuided,
} from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { startSseKeepAlive } from '../utils/sse-keepalive';
import { sdkStreamOf } from './sdkStream';

jest.mock('../services/app-settings.service', () => ({
  ...jest.requireActual('../services/app-settings.service'),
  getAppSetting: jest.fn(async () => 'claude-sonnet-4-5-20250929'),
}));

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const LINE = ': keep-alive\n\n';

type Listener = () => void;

/** A response fake with the bits the heartbeat looks at. */
function fakeRes(extra: Record<string, unknown> = {}) {
  const listeners: Record<string, Listener[]> = {};
  const headers: Record<string, string> = {};
  const res = {
    headers,
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    write: jest.fn(),
    end: jest.fn(),
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    on: jest.fn((ev: string, fn: Listener) => {
      (listeners[ev] ||= []).push(fn);
    }),
    off: jest.fn((ev: string, fn: Listener) => {
      listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
    }),
    emit: (ev: string) => [...(listeners[ev] || [])].forEach((f) => f()),
    listenerCount: (ev: string) => (listeners[ev] || []).length,
    ...extra,
  };
  const writes = () => res.write.mock.calls.map((c) => String(c[0]));
  return {
    res,
    r: res as unknown as Response,
    writes,
    beats: () => writes().filter((w) => w === LINE).length,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockMessagesStream.mockReset();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('startSseKeepAlive', () => {
  it('writes ": keep-alive" every 15 s and nothing before the first interval', () => {
    const f = fakeRes();
    startSseKeepAlive(f.r);
    jest.advanceTimersByTime(14999);
    expect(f.res.write).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(f.writes()).toEqual([LINE]);
    jest.advanceTimersByTime(75000);
    expect(f.beats()).toBe(6);
  });

  it('the heartbeat is an SSE comment: starts with ":" and is not an event or data line', () => {
    const f = fakeRes();
    startSseKeepAlive(f.r);
    jest.advanceTimersByTime(15000);
    const line = f.writes()[0];
    expect(line.startsWith(':')).toBe(true);
    expect(line).not.toMatch(/^(event|data|id|retry):/m);
    expect(line.endsWith('\n\n')).toBe(true);
  });

  it('stop() clears the interval, is idempotent and removes the close listener', () => {
    const f = fakeRes();
    const stop = startSseKeepAlive(f.r);
    expect(jest.getTimerCount()).toBe(1);
    expect(f.res.listenerCount('close')).toBe(1);
    stop();
    stop();
    expect(jest.getTimerCount()).toBe(0);
    expect(f.res.listenerCount('close')).toBe(0);
    jest.advanceTimersByTime(60000);
    expect(f.res.write).not.toHaveBeenCalled();
  });

  it('client disconnect (close event) stops it and clears the timer', () => {
    const f = fakeRes();
    startSseKeepAlive(f.r);
    jest.advanceTimersByTime(15000);
    f.res.emit('close');
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60000);
    expect(f.beats()).toBe(1);
  });

  it('destroyed response: no write on the next tick, timer cleared', () => {
    const f = fakeRes();
    startSseKeepAlive(f.r);
    f.res.destroyed = true;
    jest.advanceTimersByTime(15000);
    expect(f.res.write).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('after res.end() (writableEnded): no write-after-end, timer cleared', () => {
    const f = fakeRes();
    startSseKeepAlive(f.r);
    jest.advanceTimersByTime(15000);
    expect(f.beats()).toBe(1);
    f.res.writableEnded = true;
    jest.advanceTimersByTime(15000);
    expect(f.beats()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60000);
    expect(f.beats()).toBe(1);
  });

  it('a throwing write stops the heartbeat and does not throw out of the timer', () => {
    const f = fakeRes();
    f.res.write.mockImplementation(() => {
      throw new Error('write after end');
    });
    startSseKeepAlive(f.r);
    expect(() => jest.advanceTimersByTime(15000)).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60000);
    expect(f.res.write).toHaveBeenCalledTimes(1);
  });

  it('works on a minimal fake with no .on / .off / writableEnded / destroyed', () => {
    const write = jest.fn();
    const res = { write } as unknown as Response;
    const stop = startSseKeepAlive(res);
    jest.advanceTimersByTime(30000);
    expect(write).toHaveBeenCalledTimes(2);
    stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('falls back to removeListener when there is no off', () => {
    const removeListener = jest.fn();
    const res = { write: jest.fn(), on: jest.fn(), removeListener } as unknown as Response;
    startSseKeepAlive(res)();
    expect(removeListener).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('unrefs the timer so it cannot hold the process open', () => {
    const unref = jest.fn();
    const real = global.setInterval;
    const spy = jest.spyOn(global, 'setInterval').mockImplementation(((
      fn: () => void,
      ms: number,
    ) => {
      const t = real(fn, ms);
      (t as unknown as { unref: () => void }).unref = unref;
      return t;
    }) as unknown as typeof setInterval);
    startSseKeepAlive(fakeRes().r);
    spy.mockRestore();
    expect(unref).toHaveBeenCalled();
  });

  it('honours a custom interval', () => {
    const f = fakeRes();
    startSseKeepAlive(f.r, 1000);
    jest.advanceTimersByTime(3000);
    expect(f.beats()).toBe(3);
  });

  it('never touches anything but res (a heartbeat cannot extend a hold: no hold/credit/Generation import)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(
      require.resolve('../utils/sse-keepalive'),
      'utf8',
    ) as string;
    const imports = src.split('\n').filter((l) => /^import /.test(l));
    expect(imports).toEqual(["import type { Response } from 'express';"]);
  });
});

// ── The four streaming functions ────────────────────────────────────────────

const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });

function packBrief() {
  const pack = loadRulePack('bail_regular')!;
  const grounds = buildChecklist(pack).find((i) => i.key === 'grounds_for_bail')!.options![2];
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values: [
      u('applicant_name', 'Ramesh Mahto'),
      u('father_name', 'Shri Suresh Mahto'),
      u('applicant_age', '34'),
      u('address', 'Village Karmatand, PS Saraidhela, Dhanbad'),
      u('fir_number', '214/2026'),
      u('fir_date', '2026-09-10'),
      u('police_station', 'Saraidhela'),
      u('sections_charged', ['303']),
      u('currently_in_custody', 'Yes — Judicial custody'),
      u('custody_since', '2026-09-13'),
      u('facts_narrative', 'He is the only earning member of his family.'),
      u('grounds_for_bail', [grounds]),
    ],
    court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
  });
  return { pack, brief };
}

const BODY =
  '1. That FIR No. 214/2026 was registered at PS Saraidhela under Section 303 of BNS against Ramesh Mahto.\n\n2. That the applicant is the only earning member of his family.';
const RUN = { userId: 'u1', runId: 'r1', runSequence: 1, runType: 'initial' as const };

interface Streamer {
  name: string;
  /** Answer text the stubbed model gives. */
  answer: () => string;
  run: (res: Response) => Promise<unknown>;
}

const streamers: Streamer[] = [
  {
    name: 'streamGenerateDocument',
    answer: () => BODY,
    run: (res) =>
      streamGenerateDocument(
        {
          docType: 'bail_application',
          courtName: 'District Court',
          courtType: 'sessions',
          partyDetails: { applicant: 'Ramesh Mahto' },
          keyFacts: 'He is the only earning member of his family.',
          reliefPrayer: 'Grant bail.',
          ...RUN,
        },
        res,
      ),
  },
  {
    name: 'streamGenerateFromTemplate',
    answer: () => BODY,
    run: (res) =>
      streamGenerateFromTemplate(
        { templateConfig: loadTemplateConfig('bail_regular')!, formData: {}, ...RUN },
        res,
      ),
  },
  {
    name: 'streamGenerateFromBrief',
    answer: () => {
      const { pack } = packBrief();
      return `${BODY}\n\n${CLAUSES_MARKER}\n${pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n')}`;
    },
    run: (res) => {
      const { pack, brief } = packBrief();
      return streamGenerateFromBrief(
        {
          pack,
          templateConfig: loadTemplateConfig('bail_regular')!,
          brief,
          described: null,
          language: 'en',
          targetParagraphs: 12,
          advocateName: 'Test Advocate',
          ...RUN,
        },
        res,
      );
    },
  },
  {
    name: 'streamGenerateGuided',
    answer: () => BODY,
    run: (res) => {
      const { brief } = packBrief();
      brief.kind = { ...brief.kind, id: null };
      return streamGenerateGuided({ brief, language: 'en', targetParagraphs: 6, ...RUN }, res);
    },
  },
];

/** The model call takes `ms` before it answers. */
function slowModel(answer: string, ms: number, calls: { n: number }) {
  mockMessagesStream.mockImplementation(async () => {
    calls.n += 1;
    await new Promise((r) => setTimeout(r, ms));
    return sdkStreamOf(answer);
  });
}

/** Move the fake clock on, a second at a time, until the run has settled (a run may make several model calls). */
async function settle<T>(p: Promise<T>, maxMs = 1_200_000): Promise<'ok' | unknown> {
  let out: 'ok' | unknown = undefined;
  let done = false;
  p.then(
    () => {
      out = 'ok';
      done = true;
    },
    (e: unknown) => {
      out = e;
      done = true;
    },
  );
  for (let t = 0; t < maxMs && !done; t += 1000) await jest.advanceTimersByTimeAsync(1000);
  expect(done).toBe(true);
  return out;
}

describe.each(streamers)('$name', (s) => {
  it('AC1/AC3: a 90 s model call gets a ": keep-alive" every 15 s, the stream still completes, and the timer is gone after', async () => {
    const f = fakeRes();
    const calls = { n: 0 };
    slowModel(s.answer(), 90000, calls);
    let finished = false;
    const p = s.run(f.r).then((r) => {
      finished = true;
      return r;
    });

    await jest.advanceTimersByTimeAsync(89999);
    expect(finished).toBe(false);
    expect(f.beats()).toBe(5); // t = 15, 30, 45, 60, 75
    expect(await settle(p)).toBe('ok');
    expect(finished).toBe(true);
    expect(calls.n).toBeGreaterThanOrEqual(1);
    expect(f.beats()).toBeGreaterThanOrEqual(5);

    // started and stopped: no timer left, no close listener left, nothing more written
    expect(jest.getTimerCount()).toBe(0);
    expect(f.res.listenerCount('close')).toBe(0);
    const before = f.writes().length;
    await jest.advanceTimersByTimeAsync(120000);
    expect(f.writes().length).toBe(before);
  });

  it('AC4: the heartbeat is only ever a comment line, never mixed into a data/event payload or the result text', async () => {
    const f = fakeRes();
    slowModel(s.answer(), 40000, { n: 0 });
    const p = s.run(f.r);
    let result: unknown;
    p.then((r) => (result = r));
    expect(await settle(p)).toBe('ok');
    expect(f.beats()).toBeGreaterThanOrEqual(2);
    for (const w of f.writes()) {
      if (w.includes('keep-alive')) expect(w).toBe(LINE);
    }
    expect(JSON.stringify(result)).not.toContain('keep-alive');
  });

  it('AC ticket l.43: Cache-Control is "no-cache, no-transform" (and the other SSE headers are unchanged)', async () => {
    const f = fakeRes();
    slowModel(s.answer(), 0, { n: 0 });
    const p = s.run(f.r);
    expect(await settle(p)).toBe('ok');
    expect(f.res.headers['Cache-Control']).toBe('no-cache, no-transform');
    expect(f.res.headers['Content-Type']).toBe('text/event-stream');
    expect(f.res.headers['Connection']).toBe('keep-alive');
    expect(f.res.headers['X-Accel-Buffering']).toBe('no');
  });

  it('AC2: a model failure ends the heartbeat (no beat after the error, timer cleared)', async () => {
    const f = fakeRes();
    mockMessagesStream.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20000));
      throw new Error('503 service unavailable');
    });
    const p = s.run(f.r);
    const err = await settle(p);
    expect(err).not.toBe('ok');
    expect(f.beats()).toBe(1); // t = 15 only
    expect(f.writes().some((w) => w.startsWith('event: error'))).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    const before = f.writes().length;
    await jest.advanceTimersByTimeAsync(120000);
    expect(f.writes().length).toBe(before);
  });

  it('AC2: client disconnect mid-call stops the heartbeat at once', async () => {
    const f = fakeRes();
    slowModel(s.answer(), 90000, { n: 0 });
    const p = s.run(f.r);
    await jest.advanceTimersByTimeAsync(31000);
    expect(f.beats()).toBe(2);
    f.res.destroyed = true;
    f.res.emit('close');
    expect(f.res.listenerCount('close')).toBe(0);
    await jest.advanceTimersByTimeAsync(60000);
    expect(f.beats()).toBe(2);
    await settle(p);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('AC2: after res.end() no further heartbeat is written (no write-after-end)', async () => {
    const f = fakeRes();
    slowModel(s.answer(), 90000, { n: 0 });
    const p = s.run(f.r);
    await jest.advanceTimersByTimeAsync(16000);
    expect(f.beats()).toBe(1);
    f.res.writableEnded = true;
    await jest.advanceTimersByTimeAsync(30000);
    expect(f.beats()).toBe(1);
    await settle(p);
    expect(f.beats()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
