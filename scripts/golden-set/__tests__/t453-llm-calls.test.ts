/**
 * T-453 — the golden harness's per-stage model-usage summary: nearest-rank
 * percentiles, stop-reason counts, cap-hit listing, and the rendered block.
 * Pure: records in, text out. (The listener copy / swallow behaviour lives in
 * the service and is tested in apps/drafting t453-effort.test.ts.)
 */
import { percentiles, renderLlmCalls, summariseLlmCalls } from '../lib/report';
import { LlmCallObserved } from '../lib/types';

function call(over: Partial<LlmCallObserved> = {}): LlmCallObserved {
  return {
    stage: 'body',
    call: 'd1',
    model: 'm',
    effort: 'medium',
    status: 'completed',
    input_tokens: 10,
    output_tokens: 10,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    stop_reason: 'end_turn',
    ...over,
  };
}

describe('percentiles (nearest rank)', () => {
  it('is null for no values', () => {
    expect(percentiles([])).toBeNull();
  });
  it('odd count: median is the middle value, p90 the top rank', () => {
    expect(percentiles([5, 1, 3])).toEqual({ median: 3, p90: 5 });
    expect(percentiles([9, 1, 5, 3, 7])).toEqual({ median: 5, p90: 9 });
  });
  it('even count: median is the lower middle (rank ceil(n/2)), p90 rank ceil(0.9n)', () => {
    expect(percentiles([4, 1, 3, 2])).toEqual({ median: 2, p90: 4 });
    expect(percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({ median: 5, p90: 9 });
  });
  it('a single value is both', () => {
    expect(percentiles([7])).toEqual({ median: 7, p90: 7 });
  });
});

describe('summariseLlmCalls', () => {
  const calls: LlmCallObserved[] = [
    call({
      stage: 'intake',
      call: 'intake_match',
      input_tokens: 100,
      output_tokens: 10,
      fixture_id: 'f1',
    }),
    call({
      stage: 'intake',
      call: 'intake_fill',
      input_tokens: 300,
      output_tokens: 30,
      fixture_id: 'f1',
    }),
    call({
      stage: 'intake',
      call: 'intake_fill',
      status: 'failed',
      input_tokens: 9999,
      output_tokens: 9999,
      stop_reason: null,
    }),
    call({
      stage: 'body',
      input_tokens: 1000,
      output_tokens: 500,
      stop_reason: 'max_tokens',
      fixture_id: 'f2',
    }),
    call({ stage: 'body', input_tokens: 2000, output_tokens: 700, fixture_id: 'f3' }),
    call({
      stage: 'body',
      call: 'stream',
      input_tokens: 3000,
      output_tokens: 900,
      stop_reason: 'max_tokens',
    }),
  ];
  const s = summariseLlmCalls(calls);

  it('counts calls and failures per stage; failed calls are left out of the percentiles', () => {
    expect(s.stages.intake.calls).toBe(3);
    expect(s.stages.intake.failed).toBe(1);
    expect(s.stages.intake.inputTokens).toEqual({ median: 100, p90: 300 }); // even count of 2 completed
    expect(s.stages.intake.outputTokens).toEqual({ median: 10, p90: 30 });
    expect(s.stages.body.inputTokens).toEqual({ median: 2000, p90: 3000 }); // odd count of 3
  });

  it('counts stop reasons, with "none" for a call that reported none', () => {
    expect(s.stages.intake.stopReasons).toEqual({ end_turn: 2, none: 1 });
    expect(s.stages.body.stopReasons).toEqual({ max_tokens: 2, end_turn: 1 });
    expect(s.stages.body.maxTokensHits).toBe(2);
    expect(s.stages.intake.maxTokensHits).toBe(0);
  });

  it('a stage with no calls has zeros and null percentiles', () => {
    expect(s.stages.preflight).toEqual({
      calls: 0,
      failed: 0,
      inputTokens: null,
      outputTokens: null,
      stopReasons: {},
      maxTokensHits: 0,
    });
  });

  it('lists every max_tokens call, with a null fixture when none was set', () => {
    expect(s.capHits).toEqual([
      { fixtureId: 'f2', stage: 'body', call: 'd1', outputTokens: 500 },
      { fixtureId: null, stage: 'body', call: 'stream', outputTokens: 900 },
    ]);
  });

  it('no calls at all gives an empty summary', () => {
    const e = summariseLlmCalls([]);
    expect(e.capHits).toEqual([]);
    expect(e.stages.body.calls).toBe(0);
  });
});

describe('renderLlmCalls', () => {
  it('prints a header, one line per stage, and the cap hits', () => {
    const lines = renderLlmCalls(
      summariseLlmCalls([
        call({ stage: 'intake', input_tokens: 100, output_tokens: 10 }),
        call({
          stage: 'body',
          input_tokens: 5,
          output_tokens: 50,
          stop_reason: 'max_tokens',
          fixture_id: 'f2',
        }),
      ]),
    );
    expect(lines[0]).toBe('');
    expect(lines[1]).toMatch(/^Model calls per stage/);
    const intake = lines.find((l) => l.trim().startsWith('intake'))!;
    expect(intake).toContain('calls=1 failed=0');
    expect(intake).toContain('in 100 / 100');
    expect(intake).toContain('out 10 / 10');
    expect(intake).toContain('stop: end_turn=1');
    expect(lines.find((l) => l.trim().startsWith('preflight'))).toContain('no calls');
    const body = lines.find((l) => l.trim().startsWith('body'))!;
    expect(body).toContain('max_tokens hits=1');
    expect(lines).toContain('Cap hits (stop_reason max_tokens): 1');
    expect(lines).toContain('  - f2  body/d1  out=50');
  });

  it('says "none" when there are no cap hits, and "-" for missing percentiles', () => {
    const lines = renderLlmCalls(summariseLlmCalls([call({ status: 'failed' })]));
    expect(lines).toContain('Cap hits (stop_reason max_tokens): none');
    expect(lines.find((l) => l.trim().startsWith('body'))).toContain('in - ');
  });

  it('prints no text beyond ids and counts', () => {
    const joined = renderLlmCalls(summariseLlmCalls([call()])).join('\n');
    expect(joined).not.toMatch(/prompt|userId/i);
  });
});
