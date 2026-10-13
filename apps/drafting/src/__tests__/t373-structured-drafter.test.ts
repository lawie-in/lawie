/**
 * T-373 (ADR-025 D1, "D1 call shape"): the ledger path of streamGenerateFromBrief
 * for a pack with a signed skeleton. One structured `messages.parse` call, one
 * retry, then the code renderer; no repair calls; the checks panel built from
 * rendered[]. loadSkeleton is injected with the signed bail_regular fixture and
 * the SDK is stubbed. No database, no real model call.
 */
import './setupEnv';

import { Response } from 'express';

import {
  GenerationFailedError,
  streamGenerateFromBrief,
  StructuredOutputMissingError,
} from '../services/ai.service';
import { loadAvermentLists } from '../services/averments';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import {
  DRAFTER_D1_SYSTEM_PROMPT,
  DRAFTER_LEDGER_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import type { DraftParagraphsOutput } from '../services/draft-renderer';
import type { Skeleton } from '../types/skeleton';
import { fact, loadFixtureSkeleton, regularBase, REGULAR_NARRATIVE_RAW } from './fixtures/t373';
import { sdkAnswer, SdkStreamParams, sdkParseResponse } from './sdkStream';

const mockStream = jest.fn();
const mockParse = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub(
    (...args: unknown[]) => mockStream(...args),
    (...args: unknown[]) => mockParse(...args),
  ),
);
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

beforeEach(() => {
  mockStream.mockReset();
  mockParse.mockReset();
});

// ── Harness ─────────────────────────────────────────────────────────────────

const skeleton: Skeleton = loadFixtureSkeleton('bail_regular');
const pack = loadRulePack('bail_regular')!;

/** The regular-bail ledger with an own-words narrative that carries no date or number. */
function cleanFacts(): ReturnType<typeof regularBase> {
  return [
    ...regularBase().filter((f) => f.key !== 'facts_narrative'),
    fact('facts_narrative', 'It is a civil dispute from a failed land-sale deal.', {
      raw_span: 'it is a civil dispute from a failed land sale deal',
    }),
  ];
}

function goodOutput(facts = regularBase()): DraftParagraphsOutput {
  const held = new Set(facts.map((f) => f.key));
  return {
    paragraphs: skeleton.clauses.map((c) => {
      const refs = new Set<string>();
      for (const s of c.slots ?? []) refs.add(c.derived?.[s]?.from ?? s);
      for (const v of c.variants ?? []) for (const s of v.slots ?? []) refs.add(s);
      if (c.source === 'advocate' && c.slot) refs.add(c.slot);
      if (c.list && c.from) refs.add(c.from);
      return {
        clauseId: c.id,
        factRefs: [...refs].filter((r) => held.has(r)),
        text:
          c.source === 'advocate' && c.slot
            ? (facts.find((f) => f.key === c.slot)?.display ?? '')
            : '',
        items: [],
      };
    }),
  };
}

interface Run {
  result?: Awaited<ReturnType<typeof streamGenerateFromBrief>>;
  error?: unknown;
  writes: string[];
  events: (name: string) => string[];
}

async function run(
  opts: {
    facts?: ReturnType<typeof regularBase>;
    language?: 'en' | 'hi' | 'bilingual';
    loadSkeleton?: ((id: string) => Skeleton | null) | undefined;
    ledger?: boolean;
  } = {},
): Promise<Run> {
  const facts = opts.facts ?? regularBase();
  const u = (key: string, value: string): GivenValue => ({ source: 'user', key, value });
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: true },
    checklist: buildChecklist(pack),
    values: facts.filter((f) => f.key !== 'grounds_for_bail').map((f) => u(f.key, f.display)),
  });
  const writes: string[] = [];
  const res = {
    setHeader: jest.fn(),
    write: jest.fn((s: string) => {
      writes.push(s);
      return true;
    }),
    end: jest.fn(),
    headersSent: false,
  };
  const out: Run = {
    writes,
    events: (name) => writes.filter((w) => w.startsWith(`event: ${name}\n`)),
  };
  try {
    out.result = await streamGenerateFromBrief(
      {
        pack,
        templateConfig: loadTemplateConfig('bail_regular')!,
        brief,
        ...(opts.ledger === false
          ? {}
          : { ledger: { facts, lists: loadAvermentLists('bail_regular') } }),
        language: opts.language ?? 'en',
        targetParagraphs: 12,
        advocateName: 'Test Advocate',
        userId: 'u1',
        runId: 'r1',
        runSequence: 1,
        runType: 'initial',
        loadSkeleton: 'loadSkeleton' in opts ? opts.loadSkeleton : () => skeleton,
      },
      res as unknown as Response,
    );
  } catch (e) {
    if (process.env.T373_DEBUG) console.log((e as Error).stack);
    out.error = e;
  }
  return out;
}

const parseCall = (n = 0) =>
  mockParse.mock.calls[n][0] as {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
    output_config: { format: { type: string; schema: any; parse: (s: string) => unknown } };
    [k: string]: unknown;
  };

// ── The call shape ──────────────────────────────────────────────────────────

describe('the structured call (Arjun, D1 call shape 1)', () => {
  it('is one messages.parse with output_config.format, max_tokens 16000, no tool, not streamed', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    const r = await run();
    expect(r.error).toBeUndefined();
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockStream).not.toHaveBeenCalled();
    const call = parseCall();
    expect(call.max_tokens).toBe(16000);
    expect(call.model).toBe('claude-sonnet-4-5-20250929');
    expect(call.system).toBe(DRAFTER_D1_SYSTEM_PROMPT);
    expect(call.output_config.format.type).toBe('json_schema');
    expect(call).not.toHaveProperty('tools');
    expect(call).not.toHaveProperty('tool_choice');
    expect(call).not.toHaveProperty('stream');
  });

  it('the raw JSON schema carries the per-request enums: clauseId = skeleton ids, factRefs = ledger keys and list refs (not transformed)', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    await run();
    const schema = parseCall().output_config.format.schema;
    const item = schema.properties.paragraphs.items;
    expect(item.properties.clauseId.enum).toEqual(skeleton.clauses.map((c) => c.id));
    const refs: string[] = item.properties.factRefs.items.enum;
    for (const f of regularBase()) expect(refs).toContain(f.key);
    expect(refs).toEqual(
      expect.arrayContaining(['grounds_for_bail[0]', 'grounds_for_bail[1]', 'grounds_for_bail[2]']),
    );
    expect(refs).not.toContain('grounds_for_bail[3]');
    expect(refs).not.toContain('local_ties');
    expect(item.properties.items.items.properties.factRef.enum).toEqual(refs);
    expect(item.additionalProperties).toBe(false);
    expect(JSON.stringify(schema)).not.toMatch(/must be one of|Allowed values/i);
  });

  it('the format parses the model JSON, and a malformed or non-object answer reads as null (so the retry runs)', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    await run();
    const { parse } = parseCall().output_config.format;
    expect(
      parse(
        '{"paragraphs":[{"clauseId":"opening","factRefs":["applicant_name"],"text":"","items":[]}]}',
      ),
    ).toEqual({
      paragraphs: [{ clauseId: 'opening', factRefs: ['applicant_name'], text: '', items: [] }],
    });
    expect(parse('not json')).toBeNull();
    expect(parse('{"foo":1}')).toBeNull();
    expect(parse('[]')).toBeNull();
  });

  it('the user prompt carries DOCUMENT, FACTS (with raw_span only for the advocate key) and SKELETON, and not the brief or description', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    await run();
    const user = parseCall().messages[0].content;
    expect(user).toContain('DOCUMENT:');
    expect(user).toContain('FACTS:');
    expect(user).toContain('SKELETON:');
    expect(user).toContain('"key": "applicant_name"');
    expect(user).toContain(REGULAR_NARRATIVE_RAW);
    expect(user).not.toContain('BRIEF:');
    const factsJson = JSON.parse(
      user.slice(user.indexOf('FACTS:\n') + 7, user.indexOf('\n\nSKELETON:')),
    ) as Array<{ key: string; raw_span?: string }>;
    expect(factsJson.find((f) => f.key === 'facts_narrative')!.raw_span).toBe(
      REGULAR_NARRATIVE_RAW,
    );
    expect(factsJson.find((f) => f.key === 'applicant_name')).not.toHaveProperty('raw_span');
  });
});

// ── The result ──────────────────────────────────────────────────────────────

describe('the result of a D1 draft', () => {
  it('prints the signed wording through the renderer into the body and returns rendered[]', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    const { result, events } = await run();
    expect(result!.rendered).toBeDefined();
    expect(result!.rendered!.map((r) => r.clauseId)).toEqual(
      expect.arrayContaining(['opening', 'fir_details', 'facts', 'grounds', 'no_flight_risk']),
    );
    expect(result!.fullText).toContain(
      'The applicant, Ramesh Kumar, aged 34 years, resident of Village Kotwali, Patna',
    );
    expect(result!.fullText).toContain('FIR No. 143/2026 dated 2 June 2026');
    expect(result!.fullText).toContain('under BNS 318(4), BNS 316(2).');
    expect(events('template_sections')).toHaveLength(1);
    expect(events('error')).toHaveLength(0);
  });

  it('streams no body text before the renderer has run (no `data: {"text"` events)', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    const { writes } = await run();
    expect(writes.filter((w) => w.startsWith('data: {"text"'))).toEqual([]);
  });

  it('meters the call: provider tokens, section "body"', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput(), { input: 5000, output: 1200 }));
    const { result } = await run();
    expect(result!.usage.llmCalls).toBe(1);
    expect(result!.usage.inputTokens).toBe(5000);
    expect(result!.usage.outputTokens).toBe(1200);
    expect(result!.usage.usageSource).toBe('provider');
    expect(result!.usage.calls.map((c) => c.sectionId)).toEqual(['body']);
  });

  it('runs no repair calls: no stream call, no second parse, whatever the draft contains', async () => {
    const facts = [...regularBase().filter((f) => f.key !== 'fir_date')];
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput(facts)));
    await run({ facts });
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('adds no clause trailer: the draft holds no ===CLAUSES=== marker and the model is not asked for one', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    const { result } = await run();
    expect(result!.fullText).not.toContain('CLAUSES');
    expect(parseCall().system).not.toContain('===CLAUSES===');
  });
});

// ── Retry and failure (Arjun, D1 call shape 2) ──────────────────────────────

describe('null parsed_output: one retry, then an error and no draft', () => {
  it('twice null: exactly two calls, an error event, GenerationFailedError, no draft', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(null));
    const { result, error, events } = await run();
    expect(mockParse).toHaveBeenCalledTimes(2);
    expect(result).toBeUndefined();
    expect(error).toBeInstanceOf(GenerationFailedError);
    expect(events('error')).toHaveLength(1);
    expect(events('error')[0]).toContain('"section":"body"');
    expect(events('template_sections')).toHaveLength(0);
    expect(events('warning')).toHaveLength(0);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('the error carries both attempts in its usage', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(null, { input: 3000, output: 100 }));
    const { error } = await run();
    const usage = (error as GenerationFailedError).usage;
    expect(usage.llmCalls).toBe(2);
    expect(usage.inputTokens).toBe(6000);
    expect(usage.outputTokens).toBe(200);
    expect(usage.calls.map((c) => c.sectionId)).toEqual(['body', 'body_retry']);
  });

  it('is classified as a StructuredOutputMissingError, retryable, not a silent blank', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(null));
    const { error, events } = await run();
    expect(new StructuredOutputMissingError().message).toMatch(/no structured output/i);
    expect((error as GenerationFailedError).message.length).toBeGreaterThan(0);
    const payload = JSON.parse(events('error')[0].split('data: ')[1]) as {
      retryable: boolean;
      code: string;
      reason: string;
    };
    expect(typeof payload.retryable).toBe('boolean');
    expect(payload.reason.length).toBeGreaterThan(0);
  });

  it('null then valid: two calls, the draft is made, both attempts metered (body, body_retry)', async () => {
    mockParse
      .mockResolvedValueOnce(sdkParseResponse(null, { input: 3000, output: 100 }))
      .mockResolvedValueOnce(sdkParseResponse(goodOutput(), { input: 3000, output: 900 }));
    const { result, error } = await run();
    expect(error).toBeUndefined();
    expect(mockParse).toHaveBeenCalledTimes(2);
    expect(result!.usage.llmCalls).toBe(2);
    expect(result!.usage.inputTokens).toBe(6000);
    expect(result!.usage.outputTokens).toBe(1000);
    expect(result!.usage.calls.map((c) => c.sectionId)).toEqual(['body', 'body_retry']);
    expect(result!.fullText).toContain('Ramesh Kumar');
  });

  it('the retry sends the same request as the first call', async () => {
    mockParse
      .mockResolvedValueOnce(sdkParseResponse(null))
      .mockResolvedValueOnce(sdkParseResponse(goodOutput()));
    await run();
    const a = parseCall(0);
    const b = parseCall(1);
    expect(b.messages).toEqual(a.messages);
    expect(b.system).toBe(a.system);
    expect(b.max_tokens).toBe(a.max_tokens);
    expect(b.output_config.format.schema).toEqual(a.output_config.format.schema);
  });

  it('an API failure (thrown) is an error event and GenerationFailedError after one call, not a retry or a draft', async () => {
    mockParse.mockRejectedValue(Object.assign(new Error('overloaded'), { status: 529 }));
    const { result, error, events } = await run();
    expect(result).toBeUndefined();
    expect(error).toBeInstanceOf(GenerationFailedError);
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(events('error')).toHaveLength(1);
    expect(events('template_sections')).toHaveLength(0);
  });
});

// ── The checks panel reads rendered[] (ADR-025 renderer rule 5) ─────────────

describe('missing clauses and warnings come from rendered[]', () => {
  it('a blank in the draft is a missing clause and a missing_clause warning, with the clause id', async () => {
    const facts = regularBase().filter((f) => f.key !== 'fir_date');
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput(facts)));
    const { result, events } = await run({ facts });
    const missingFromRendered = result!
      .rendered!.filter((r) => r.status === 'missing')
      .map((r) => r.clauseId);
    expect(missingFromRendered).toContain('fir_details');
    expect(result!.missingClauses.map((m) => m.id)).toEqual(missingFromRendered);
    expect(result!.mandatoryClausesComplete).toBe(false);
    const mc = result!.warnings.filter((w) => w.type === 'missing_clause');
    expect(mc.map((w) => (w.details as { clauseId: string }).clauseId)).toEqual(
      missingFromRendered,
    );
    expect(events('warning')).toHaveLength(1);
    expect(result!.startingDraft).toBe(true);
    expect(result!.labelReason).toBeTruthy();
  });

  it('a clause the renderer printed in full is never reported missing, even if the checks of the old path would not see it', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    const { result } = await run();
    expect(result!.missingClauses).toEqual([]);
    expect(result!.warnings.filter((w) => w.type === 'missing_clause')).toEqual([]);
    expect(result!.mandatoryClausesComplete).toBe(true);
  });

  it('the clause trailer and findMissingClauses are not used: a stub that returns text for the old path is never called', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    mockStream.mockImplementation(async () => sdkAnswer('1. x\n\n===CLAUSES===\nopening: 1', 1, 1));
    const { result } = await run();
    expect(mockStream).not.toHaveBeenCalled();
    expect(result!.fullText).not.toContain('===CLAUSES===');
  });

  it('verifyDraft is read-only: findings go to the fact-diff log as flagged, the body is unchanged, there is no banner', async () => {
    // The advocate's own words carry a date no typed fact backs: the renderer falls back to raw_span
    // verbatim, and the read-only verifier then reports it. Nothing is rewritten or bannered.
    const raw = 'He was arrested on 5 May 2026 over a land-sale quarrel.';
    const facts = [
      ...regularBase().filter((f) => f.key !== 'facts_narrative'),
      fact('facts_narrative', 'He was arrested over a land-sale quarrel.', { raw_span: raw }),
    ];
    const out = goodOutput(facts);
    out.paragraphs.find((p) => p.clauseId === 'facts')!.text = '';
    mockParse.mockResolvedValue(sdkParseResponse(out));
    const { result } = await run({ facts });
    const fc = result!.factCheck!;
    expect(result!.fullText).toContain(raw);
    expect(fc.banner).toBeNull();
    expect(fc.repairRan).toBe(false);
    expect(fc.afterRepair).toBeNull();
    expect(fc.initial.length).toBeGreaterThan(0);
    expect(fc.records.length).toBe(fc.initial.length);
    expect(fc.records.every((r) => r.resolution === 'flagged')).toBe(true);
    expect(fc.body).toContain(raw);
    expect(fc.passed).toBe(false);
    expect(result!.repaired).toBe(false);
    expect(result!.fullText).not.toMatch(/\[To be confirmed|\{\{MISSING: date/);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('a clean draft has no findings and no banner', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput(cleanFacts())));
    const { result } = await run({ facts: cleanFacts() });
    expect(result!.factCheck!.banner).toBeNull();
    // The read-only verifier still reports `dropped` for signed paraphrases (e.g. "None" -> "no criminal
    // antecedents"); those are logged as flagged, never repaired. It finds no invented value.
    expect(
      result!.factCheck!.initial.filter((v) =>
        ['unsupported', 'mutation', 'banned'].includes(v.check),
      ),
    ).toEqual([]);
    expect(result!.factCheck!.records.every((r) => r.resolution === 'flagged')).toBe(true);
    expect(result!.factCheck!.repairRan).toBe(false);
  });
});

// ── Fallback log (Ajay: every fallback logged, ids and reason only) ─────────

describe('the fallback log', () => {
  const PII = [
    'Ramesh',
    'Kotwali',
    '143/2026',
    'Village',
    'land-sale',
    'civil',
    '5 May',
    'Suresh',
    'quarrel',
    '34',
  ];

  async function runLogged(out: DraftParagraphsOutput, facts = cleanFacts()) {
    const was = process.env.NODE_ENV;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.NODE_ENV = 'production';
    try {
      mockParse.mockResolvedValue(sdkParseResponse(out));
      const r = await run({ facts });
      const lines = [warn, info, log, err].flatMap((s) =>
        s.mock.calls.map((c) => c.map(String).join(' ')),
      );
      return { r, lines };
    } finally {
      process.env.NODE_ENV = was;
      warn.mockRestore();
      info.mockRestore();
      log.mockRestore();
      err.mockRestore();
    }
  }

  it('logs each fallback with pack, runId, clauseId and reason', async () => {
    const out = goodOutput(cleanFacts());
    out.paragraphs.find((p) => p.clauseId === 'facts')!.text =
      'He was arrested on 5 May 2026 by Suresh.';
    const { r, lines } = await runLogged(out);
    expect(r.error).toBeUndefined();
    const fb = lines.filter((l) => /fallback/i.test(l));
    expect(fb).toHaveLength(1);
    expect(fb[0]).toContain('bail_regular');
    expect(fb[0]).toContain('runId=r1');
    expect(fb[0]).toContain('clause=facts');
    expect(fb[0]).toContain('reason=unverified');
  });

  it('a clause the model did not return is logged as not_returned', async () => {
    const out = goodOutput(cleanFacts());
    out.paragraphs = out.paragraphs.filter((p) => p.clauseId !== 'facts');
    const { lines } = await runLogged(out);
    expect(
      lines.filter(
        (l) =>
          /fallback/i.test(l) && l.includes('reason=not_returned') && l.includes('clause=facts'),
      ),
    ).toHaveLength(1);
  });

  it("no PII: no log line from a D1 run holds the advocate's words, a name, a date, a number or the model's text", async () => {
    const out = goodOutput(cleanFacts());
    out.paragraphs.find((p) => p.clauseId === 'facts')!.text =
      'Suresh Yadav took the money on 5 May 2026.';
    const { lines } = await runLogged(out);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) for (const pii of PII) expect(l).not.toContain(pii);
  });

  it('a draft with no fallback logs none', async () => {
    const { lines } = await runLogged(goodOutput(cleanFacts()));
    expect(lines.filter((l) => /fallback/i.test(l))).toEqual([]);
  });

  it('the fallback line ends with the counts: fallbacks=N, ownWordsClauses=M, one line per fallback, no text', async () => {
    const facts = [
      ...cleanFacts(),
      fact('additional_context', 'His brother is a witness.', {
        raw_span: 'his brother is a witness',
      }),
    ];
    const out = goodOutput(facts);
    out.paragraphs.find((p) => p.clauseId === 'facts')!.text = 'It is a violent dispute.';
    out.paragraphs.find((p) => p.clauseId === 'further_grounds')!.text =
      'His brother is a violent witness.';
    const { r, lines } = await runLogged(out, facts);
    const fb = lines.filter((l) => /fallback/i.test(l));
    expect(fb).toHaveLength(2);
    const own = new Set(skeleton.clauses.filter((c) => c.source === 'advocate').map((c) => c.id));
    const m = r.result!.rendered!.filter((x) => own.has(x.clauseId)).length;
    expect(m).toBeGreaterThanOrEqual(2);
    for (const l of fb) {
      expect(l).toMatch(
        new RegExp(
          `\\(kind=bail_regular, runId=r1, clause=\\w+, reason=unverified, fallbacks=2, ownWordsClauses=${m}\\)$`,
        ),
      );
    }
    expect(fb.map((l) => /clause=(\w+)/.exec(l)![1]).sort()).toEqual(['facts', 'further_grounds']);
    for (const l of fb)
      for (const bad of ['violent', 'brother', 'dispute', ...PII]) expect(l).not.toContain(bad);
  });

  it('an added content word in the advocate clause is what makes the line (end to end)', async () => {
    const out = goodOutput(cleanFacts());
    out.paragraphs.find((p) => p.clauseId === 'facts')!.text =
      'It is a civil dispute that escalated.';
    const { lines } = await runLogged(out);
    expect(lines.filter((l) => /fallback/i.test(l))).toHaveLength(1);
  });

  it('the D1 prompt asks for one item per entry of a repeated advocate key', () => {
    expect(DRAFTER_D1_SYSTEM_PROMPT).toMatch(/one item for each entry/i);
    expect(DRAFTER_D1_SYSTEM_PROMPT).toContain('factRef "<key>[<n>]"');
  });

  it('result.rendered carries the reason on the fallback clause', async () => {
    const out = goodOutput(cleanFacts());
    out.paragraphs = out.paragraphs.filter((p) => p.clauseId !== 'facts');
    mockParse.mockResolvedValue(sdkParseResponse(out));
    const { result } = await run({ facts: cleanFacts() });
    expect(result!.rendered!.find((x) => x.clauseId === 'facts')).toMatchObject({
      status: 'fallback',
      reason: 'not_returned',
    });
    expect(result!.fullText).toContain('it is a civil dispute from a failed land sale deal');
  });
});

// ── Which requests take the D1 path ─────────────────────────────────────────

describe('which requests take the D1 path', () => {
  const OLD_BODY =
    '1. That the applicant is Ramesh Kumar.\n\n2. That the applicant prays for bail.\n';

  it("Hindi on a D1 pack takes today's path (a streamed call, no parse) with the starting-draft label", async () => {
    mockStream.mockImplementation(async () => sdkAnswer(OLD_BODY, 4000, 800));
    const loadSkeleton = jest.fn(() => skeleton);
    const { result, error } = await run({ language: 'hi', loadSkeleton });
    expect(error).toBeUndefined();
    expect(mockParse).not.toHaveBeenCalled();
    expect(mockStream).toHaveBeenCalled();
    expect(loadSkeleton).not.toHaveBeenCalled();
    expect(result!.rendered).toBeUndefined();
    expect(result!.startingDraft).toBe(true);
    expect(result!.labelReason).toBeTruthy();
  });

  it("bilingual also stays on today's path", async () => {
    mockStream.mockImplementation(async () => sdkAnswer(OLD_BODY, 4000, 800));
    await run({ language: 'bilingual' });
    expect(mockParse).not.toHaveBeenCalled();
    expect(mockStream).toHaveBeenCalled();
  });

  it("loadSkeleton returning null runs today's path unchanged (stream call, ledger system prompt, 8192 tokens)", async () => {
    mockStream.mockImplementation(async () => sdkAnswer(OLD_BODY, 4000, 800));
    const { result } = await run({ loadSkeleton: () => null });
    expect(mockParse).not.toHaveBeenCalled();
    const call = mockStream.mock.calls[0][0] as SdkStreamParams;
    expect(call.system).toBe(DRAFTER_LEDGER_SYSTEM_PROMPT);
    expect(call.max_tokens).toBe(8192);
    expect(result!.rendered).toBeUndefined();
  });

  it('no loadSkeleton at all is the same as null', async () => {
    mockStream.mockImplementation(async () => sdkAnswer(OLD_BODY, 4000, 800));
    const { result } = await run({ loadSkeleton: undefined });
    expect(mockParse).not.toHaveBeenCalled();
    expect(result!.rendered).toBeUndefined();
  });

  it('a skeleton with no clauses is no skeleton', async () => {
    mockStream.mockImplementation(async () => sdkAnswer(OLD_BODY, 4000, 800));
    await run({ loadSkeleton: () => ({ ...skeleton, clauses: [] }) });
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('without the ledger the skeleton is not used', async () => {
    mockStream.mockImplementation(async () => sdkAnswer(OLD_BODY, 4000, 800));
    const loadSkeleton = jest.fn(() => skeleton);
    await run({ ledger: false, loadSkeleton });
    expect(mockParse).not.toHaveBeenCalled();
    expect(mockStream).toHaveBeenCalled();
  });

  it('loadSkeleton is asked for the pack id', async () => {
    mockParse.mockResolvedValue(sdkParseResponse(goodOutput()));
    const loadSkeleton = jest.fn(() => skeleton);
    await run({ loadSkeleton });
    expect(loadSkeleton).toHaveBeenCalledWith('bail_regular');
  });
});
