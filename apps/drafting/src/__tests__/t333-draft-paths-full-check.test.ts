/**
 * T-333: the template, brief and guided draft paths check every code (BNS, BNSS, BSA,
 * IPC, CrPC, IEA), the way validate() does, and Ajay's ruling B on the murder sanity
 * check (explicit cited numbers only, never numbers inside an expanded range).
 *
 * Drives the real stream functions with the model stubbed to return set text.
 * No database, no real model call.
 */
import './setupEnv';

import { Response } from 'express';

import {
  streamGenerateFromBrief,
  streamGenerateFromTemplate,
  streamGenerateGuided,
} from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
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
  mockMessagesStream.mockReset();
});

interface Warn {
  type: string;
  message: string;
  details?: { section?: string; code?: string };
}

const fakeRes = () => ({
  setHeader: jest.fn(),
  write: jest.fn(),
  end: jest.fn(),
  headersSent: false,
});

/** validate()'s wording, and the BNS whitelist wording. */
const verified = (section: string, code: string) =>
  `Section ${section} of ${code} not found in the verified section mapping. Please verify this reference.`;
const whitelist = (n: string) =>
  `BNS Section ${n} cited but not found in the First Schedule whitelist — likely hallucinated. Please verify or replace.`;
const MURDER_PREFIX = 'Section 103 of BNS (Murder) is cited';

const invalid = (ws: Warn[]) => ws.filter((w) => w.type === 'invalid_section');
const murder = (ws: Warn[]) => ws.filter((w) => w.message.startsWith(MURDER_PREFIX));

const NO_DEATH =
  'The applicant is the only earning member of his family. He was injured in a quarrel.';

// ── Template path ───────────────────────────────────────────────────────────

async function viaTemplate(aiText: string, facts = NO_DEATH) {
  mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(aiText, 100, 20));
  const res = fakeRes();
  const result = await streamGenerateFromTemplate(
    {
      templateConfig: loadTemplateConfig('bail_regular')!,
      formData: { facts_narrative: facts },
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    },
    res as unknown as Response,
  );
  return { result, res, warnings: result.warnings as Warn[] };
}

describe('T-333 AC1/AC2: template path checks every code', () => {
  it('a wrong BSA, BNSS and IPC citation each give an invalid_section with validate()’s wording', async () => {
    const { warnings } = await viaTemplate(
      '1. That the applicant relies on BSA 999.\n\n2. That under BNSS 600 and IPC 999 the matter is pending.',
    );
    const inv = invalid(warnings);
    expect(inv).toHaveLength(3);
    expect(inv).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: verified('999', 'BSA'),
          details: { section: '999', code: 'BSA' },
        }),
        expect.objectContaining({
          message: verified('600', 'BNSS'),
          details: { section: '600', code: 'BNSS' },
        }),
        expect.objectContaining({
          message: verified('999', 'IPC'),
          details: { section: '999', code: 'IPC' },
        }),
      ]),
    );
  });

  it('a wrong CrPC and IEA citation are flagged too (all six codes)', async () => {
    const { warnings } = await viaTemplate('1. That under CrPC 999 and IEA 999 the matter lies.');
    const codes = invalid(warnings)
      .map((w) => w.details?.code)
      .sort();
    expect(codes).toEqual(['CrPC', 'IEA']);
  });

  it('a wrong BNS citation gives exactly one warning, with the whitelist wording, not two', async () => {
    const { warnings } = await viaTemplate('1. That the applicant is charged under BNS 999.');
    const inv = invalid(warnings).filter((w) => w.details?.code === 'BNS');
    expect(inv).toHaveLength(1);
    expect(inv[0].message).toBe(whitelist('999'));
    expect(warnings.map((w) => w.message)).not.toContain(verified('999', 'BNS'));
  });

  it('valid citations (BSA 85, IPC 302, BNSS 480) give no invalid_section', async () => {
    const { warnings } = await viaTemplate(
      '1. That BSA 85 applies.\n\n2. That IPC 302 was the old law.\n\n3. That bail lies under BNSS 480.',
    );
    expect(invalid(warnings)).toEqual([]);
  });

  it('a warning never blocks: the stream completes, the draft is returned and the warning event is sent', async () => {
    const { result, res } = await viaTemplate(
      '1. That BSA 999 and BNSS 600 and IPC 999 are cited.',
    );
    expect(result.fullText).toContain('BSA 999');
    expect(result.sections.length).toBeGreaterThan(0);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: warning'));
    const sent = res.write.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.startsWith('event: warning'))!;
    expect(sent).toContain(verified('999', 'BSA'));
    expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining('event: error'));
  });
});

describe('T-333 ruling B: murder sanity uses explicit numbers only (template path)', () => {
  it('"Ss. 100-105 BNS" with facts that do not mention death: no murder warning', async () => {
    const { warnings } = await viaTemplate(
      '1. That the applicant is charged under Ss. 100-105 BNS.',
    );
    expect(murder(warnings)).toEqual([]);
  });

  it('"BNS 103" with the same facts: the murder warning', async () => {
    const { warnings } = await viaTemplate('1. That the applicant is charged under BNS 103.');
    expect(murder(warnings)).toHaveLength(1);
  });

  it('"Ss. 103-105 BNS": 103 is written out as the first end of the range, so the murder warning', async () => {
    const { warnings } = await viaTemplate(
      '1. That the applicant is charged under Ss. 103-105 BNS.',
    );
    expect(murder(warnings)).toHaveLength(1);
  });

  it('"Ss. 99-103 BNS": 103 is the last end of the range, so the murder warning', async () => {
    const { warnings } = await viaTemplate(
      '1. That the applicant is charged under Ss. 99-103 BNS.',
    );
    expect(murder(warnings)).toHaveLength(1);
  });

  it('"BNS 103" with facts that mention death: no murder warning', async () => {
    const { warnings } = await viaTemplate(
      '1. That the applicant is charged under BNS 103.',
      'The deceased died after the quarrel.',
    );
    expect(murder(warnings)).toEqual([]);
  });

  it('the whitelist still gets the full range: "Ss. 355-360 BNS" flags 359 and 360', async () => {
    const { warnings } = await viaTemplate(
      '1. That the applicant is charged under Ss. 355-360 BNS.',
    );
    const flagged = invalid(warnings)
      .filter((w) => w.details?.code === 'BNS')
      .map((w) => w.details?.section)
      .sort();
    expect(flagged).toEqual(['359', '360']);
  });

  it('the whitelist still flags a number only inside a range: "Ss. 357-360 BNS" flags 359 (inner) and 360', async () => {
    const { warnings } = await viaTemplate(
      '1. That the applicant is charged under Ss. 357-360 BNS.',
    );
    const flagged = invalid(warnings).map((w) => w.details?.section);
    expect(flagged).toContain('359');
    expect(flagged).toContain('360');
  });
});

// ── Brief path ──────────────────────────────────────────────────────────────

const BASE =
  '1. That FIR No. 214/2026 was registered at PS Saraidhela under Section 303 of BNS against Ramesh Mahto.\n\n2. That the applicant is the only earning member of his family.';

async function viaBrief(extraPara: string) {
  const pack = loadRulePack('bail_regular')!;
  const grounds = buildChecklist(pack).find((i) => i.key === 'grounds_for_bail')!.options![2];
  const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });
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
  if (!brief.can_confirm) throw new Error('brief cannot be confirmed');
  const clauses = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  const answer = `${BASE}\n\n${extraPara}\n\n${CLAUSES_MARKER}\n${clauses}`;
  mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(answer, 4000, 800));
  const res = fakeRes();
  const result = await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig('bail_regular')!,
      brief,
      described: null,
      language: 'en',
      targetParagraphs: 12,
      advocateName: 'Test Advocate',
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    },
    res as unknown as Response,
  );
  return { result, res, warnings: result.warnings as Warn[] };
}

describe('T-333 AC1/AC2: brief path checks every code', () => {
  it('wrong BSA, BNSS and IPC citations are flagged with validate()’s wording', async () => {
    const { warnings } = await viaBrief('3. That BSA 999, BNSS 600 and IPC 999 are relied on.');
    const msgs = invalid(warnings).map((w) => w.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        verified('999', 'BSA'),
        verified('600', 'BNSS'),
        verified('999', 'IPC'),
      ]),
    );
  });

  it('a wrong BNS citation gets the whitelist wording once, not twice', async () => {
    const { warnings } = await viaBrief('3. That the charge is also BNS 999.');
    const bns = invalid(warnings).filter((w) => w.details?.code === 'BNS');
    expect(bns).toHaveLength(1);
    expect(bns[0].message).toBe(whitelist('999'));
  });

  it('valid citations give no invalid_section, and the draft is returned', async () => {
    const { warnings, result } = await viaBrief(
      '3. That BSA 85, IPC 302 and BNSS 480 are relied on.',
    );
    expect(invalid(warnings)).toEqual([]);
    expect(result.fullText).toContain('BNSS 480');
  });

  it('a warning does not block: the draft with the wrong citation is returned', async () => {
    const { result, res } = await viaBrief('3. That BSA 999 is relied on.');
    expect(result.fullText).toContain('BSA 999');
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: warning'));
  });

  it('ruling B: "Ss. 100-105 BNS" gives no murder warning, "BNS 103" gives it', async () => {
    const range = await viaBrief('3. That the charge is Ss. 100-105 BNS.');
    expect(murder(range.warnings)).toEqual([]);
    const explicit = await viaBrief('3. That the charge is BNS 103.');
    expect(murder(explicit.warnings)).toHaveLength(1);
  });
});

// ── Guided path ─────────────────────────────────────────────────────────────

const GUIDED_BASE =
  '1. That the applicant Ramesh Mahto is the only earning member of his family.\n\n2. That FIR No. 214/2026 is registered against him.';

async function viaGuided(body: string) {
  const pack = loadRulePack('bail_regular')!;
  const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: true },
    checklist: buildChecklist(pack),
    values: [
      u('applicant_name', 'Ramesh Mahto'),
      u('fir_number', '214/2026'),
      u('facts_narrative', 'He is the only earning member of his family.'),
    ],
    court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
  });
  brief.kind = { ...brief.kind, id: null };
  mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(body, 4000, 800));
  const res = fakeRes();
  const result = await streamGenerateGuided(
    {
      brief,
      language: 'en',
      targetParagraphs: 6,
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    },
    res as unknown as Response,
  );
  return { result, res, warnings: result.warnings as Warn[] };
}

describe('T-333 AC1/AC2: guided path checks every code', () => {
  it('wrong BSA, BNSS and IPC citations are flagged with validate()’s wording', async () => {
    const { warnings } = await viaGuided(
      `${GUIDED_BASE}\n\n3. That BSA 999, BNSS 600 and IPC 999 are relied on.`,
    );
    const msgs = invalid(warnings).map((w) => w.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        verified('999', 'BSA'),
        verified('600', 'BNSS'),
        verified('999', 'IPC'),
      ]),
    );
  });

  it('a wrong BNS citation gets the whitelist wording once, not twice', async () => {
    const { warnings } = await viaGuided(`${GUIDED_BASE}\n\n3. That the charge is also BNS 999.`);
    const bns = invalid(warnings).filter((w) => w.details?.code === 'BNS');
    expect(bns).toHaveLength(1);
    expect(bns[0].message).toBe(whitelist('999'));
  });

  it('valid citations give no invalid_section', async () => {
    const { warnings } = await viaGuided(
      `${GUIDED_BASE}\n\n3. That BSA 85, IPC 302 and BNSS 480 are relied on.`,
    );
    expect(invalid(warnings)).toEqual([]);
  });

  it('a warning does not block: the draft is returned and the warning event is sent', async () => {
    const { result, res } = await viaGuided(`${GUIDED_BASE}\n\n3. That BSA 999 is relied on.`);
    expect(result.fullText).toContain('BSA 999');
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: warning'));
    expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining('event: error'));
  });
});

// ── T-270 ruling A on the stream paths ──────────────────────────────────────

const PATHS: Array<[string, (para: string) => Promise<Warn[]>]> = [
  ['template', async (p) => (await viaTemplate(`1. ${p}`)).warnings],
  ['brief', async (p) => (await viaBrief(`3. ${p}`)).warnings],
  ['guided', async (p) => (await viaGuided(`${GUIDED_BASE}\n\n3. ${p}`)).warnings],
];

describe.each(PATHS)('T-333 ruling A (%s path)', (_name, run) => {
  const forIpc = (ws: Warn[], section: string) =>
    ws.filter((w) => w.details?.code === 'IPC' && w.details?.section === section);

  it('"Section 999 IPC" (not a table row): exactly one warning, invalid_section, no old_law_reference', async () => {
    const ws = await run('That the applicant relies on Section 999 IPC.');
    const mine = forIpc(ws, '999');
    expect(mine).toHaveLength(1);
    expect(mine[0].type).toBe('invalid_section');
    expect(mine[0].message).toBe(verified('999', 'IPC'));
    expect(
      ws.filter((w) => w.type === 'old_law_reference' && w.details?.section === '999'),
    ).toEqual([]);
  });

  it('"Section 302 IPC" (a table row): old_law_reference, no invalid_section', async () => {
    const ws = await run('That the applicant relies on Section 302 IPC.');
    const mine = forIpc(ws, '302');
    expect(mine.map((w) => w.type)).toEqual(['old_law_reference']);
    // (brief and guided also run the unrelated "not in your brief" check, which has no code; not ours.)
    expect(ws.filter((w) => w.message === verified('302', 'IPC'))).toEqual([]);
    expect(invalid(ws).filter((w) => w.details?.code === 'IPC')).toEqual([]);
  });
});
