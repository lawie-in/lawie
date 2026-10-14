/**
 * T-429 (Ajay 0864b04, ea02c86, and T-430 03b3e6e): discharge_application's NI Act
 * material (relevantActs entry s.138 / S.141, the Para 10 instruction on director
 * prosecutions) reaches the model only when the charged sections include NI Act s.138.
 * Gate test: handoff/legal/T-427-T-430-verify-signed.md :43.
 *
 * A  niS138Charged truth table (and the blanks the real generators write)
 * B  packForCharge on the real discharge pack
 * C  prompt renderers with the gated pack
 * D  streamGenerateFromBrief and streamGenerateFromTemplate end to end, stubbed model
 * E  the signed strings in the three packs (S.438 / S.440 / S.442, :251 sentence)
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import { Response } from 'express';

import type { LedgerFact } from '@lawie/shared';

import {
  niS138Charged,
  packForCharge,
  streamGenerateFromBrief,
  streamGenerateFromTemplate,
  templateForCharge,
} from '../services/ai.service';
import {
  buildDrafterUserPrompt,
  buildLedgerDrafterUserPrompt,
  buildRepairUserPrompt,
  CLAUSES_MARKER,
  formDataFromBrief,
  ledgerSkeletonBrief,
} from '../services/brief-drafter';
import { buildBrief, buildChecklist, type GivenValue } from '../services/intake-brief';
import { loadAvermentLists } from '../services/averments';
import { loadRulePack, type RulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

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

const PACK_ID = 'discharge_application';
const RULES_DIR = join(__dirname, '../config/document-rules');

function dischargePack(): RulePack {
  const p = loadRulePack(PACK_ID);
  if (!p) throw new Error('no discharge pack');
  return p;
}

const niActs = (p: RulePack) => p.relevantActs.filter((a) => /negotiable instruments/i.test(a.act));
const para10 = (p: RulePack) => p.draftingInstructions.filter((l) => /^Para 10:/.test(l));

const BNS_ONLY = 'BNS 318(4), 316(2)';
const S138_CHARGE = 'Section 138 of the Negotiable Instruments Act, 1881';

// ── A ────────────────────────────────────────────────────────────────────
describe('T-429 A: niS138Charged', () => {
  it.each([
    ['S.138 NI Act', true],
    ['s. 138 N.I. Act', true],
    ['Section 138 of the Negotiable Instruments Act, 1881', true],
    ['ＮＩ Ａｃｔ １３８', true], // fullwidth, NFKC
    ['N I Act 138', true],
    ['NEGOTIABLE INSTRUMENTS ACT s.138', true],
    ['BNS 318(4), 316(2) and S.138 NI Act', true],
    ['S.138 NI Act, BNS 318(4)', true],
    [BNS_ONLY, false],
    ['S.1138 NI Act', false],
    ['S.1380 NI Act', false],
    ['NI Act s.141', false],
    ['Section 138 BNS', false], // a 138 but not the NI Act
    ['S.138', false],
    ['', false],
    ['   ', false],
    ['[To be confirmed: sections charged]', false],
    ['{{MISSING: BNS / Special Act sections charged}}', false],
    ['[To be confirmed: NI Act 138]', false], // the blank names it, the advocate did not
    ['{{MISSING: NI Act s.138}}', false],
    [null, false],
    [undefined, false],
    [42, false],
    [{}, false],
    [['S.138 NI Act'], false],
  ])('%j -> %s', (v, expected) => {
    expect(niS138Charged(v)).toBe(expected);
  });

  it('a real charge next to a placeholder still counts', () => {
    expect(niS138Charged('[To be confirmed: more] S.138 NI Act')).toBe(true);
  });

  describe('the blanks the real generators write', () => {
    const checklist = () => buildChecklist(dischargePack());
    const brief = (values: GivenValue[]) =>
      buildBrief({
        kind: { id: PACK_ID, name: 'Discharge', court_document: true },
        checklist: checklist(),
        values,
      });
    const config = () => loadTemplateConfig(PACK_ID)!;

    it('premise: the discharge template config exists with offences_charged', () => {
      const ids = config().form_schema.steps.flatMap((s) => s.fields.map((f) => f.field_id));
      expect(ids).toContain('offences_charged');
    });

    it('brief path, charge not given: placeholder blank, not charged', () => {
      const data = formDataFromBrief(brief([]), config(), 'en');
      expect(String(data.offences_charged)).toMatch(/^\[To be confirmed: /);
      expect(niS138Charged(data.offences_charged)).toBe(false);
    });

    it('ledger path, charge not given: MISSING blank, not charged', () => {
      const data = formDataFromBrief(ledgerSkeletonBrief(brief([]), []), config(), 'en');
      expect(String(data.offences_charged)).toMatch(/^\{\{MISSING: /);
      expect(niS138Charged(data.offences_charged)).toBe(false);
    });

    it.each([
      [BNS_ONLY, false],
      [S138_CHARGE, true],
      ['S.138 NI Act', true],
    ])('brief path, charge %j -> %s', (charge, expected) => {
      const data = formDataFromBrief(
        brief([{ key: 'offences_charged', value: charge, source: 'user' }]),
        config(),
        'en',
      );
      expect(niS138Charged(data.offences_charged)).toBe(expected);
    });
  });
});

// ── B ────────────────────────────────────────────────────────────────────
describe('T-429 B: packForCharge on the real discharge pack', () => {
  it('premise: the real pack has one NI Act entry (S.138, S.141) and one Para 10 NI line', () => {
    const p = dischargePack();
    expect(niActs(p)).toHaveLength(1);
    expect(niActs(p)[0].sections.map((s) => s.number)).toEqual(['S.138', 'S.141']);
    expect(para10(p)).toHaveLength(1);
    expect(para10(p)[0]).toContain('S.M.S. Pharmaceuticals');
  });

  const NO_CHARGE: Array<[string, unknown]> = [
    ['BNS only', BNS_ONLY],
    ['empty', ''],
    ['whitespace', '  '],
    ['brief placeholder', '[To be confirmed: BNS / Special Act sections charged]'],
    ['ledger placeholder', '{{MISSING: BNS / Special Act sections charged}}'],
    ['S.141 only', 'NI Act s.141'],
    ['S.1138', 'S.1138 NI Act'],
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
  ];

  it.each(NO_CHARGE)(
    '%s: no NI Act act, no Para 10, everything else kept in order, cached pack unchanged',
    (_n, charge) => {
      const pack = dischargePack();
      const before = JSON.parse(JSON.stringify(pack));
      const out = packForCharge(pack, { offences_charged: charge });
      expect(out).not.toBe(pack);
      expect(niActs(out)).toHaveLength(0);
      expect(para10(out)).toHaveLength(0);
      expect(JSON.stringify(out)).not.toMatch(/negotiable instruments|S\.M\.S\./i);
      expect(out.relevantActs.map((a) => a.act)).toEqual(
        pack.relevantActs.filter((a) => !/negotiable instruments/i.test(a.act)).map((a) => a.act),
      );
      expect(out.draftingInstructions).toEqual(
        pack.draftingInstructions.filter((l) => !l.startsWith('Para 10:')),
      );
      expect(out.draftingInstructions).toHaveLength(pack.draftingInstructions.length - 1);
      expect(out.id).toBe(pack.id);
      expect(out.mandatoryClauses).toBe(pack.mandatoryClauses);
      expect(pack).toEqual(before);
      expect(niActs(pack)).toHaveLength(1);
      expect(para10(pack)).toHaveLength(1);
    },
  );

  it('values with no offences_charged key: gated', () => {
    expect(niActs(packForCharge(dischargePack(), {}))).toHaveLength(0);
  });

  it.each([
    'S.138 NI Act',
    's. 138 N.I. Act',
    S138_CHARGE,
    'ＮＩ Ａｃｔ １３８',
    'N I Act 138',
    `${BNS_ONLY} and S.138 NI Act`,
  ])('charge %j: the same pack object, NI Act entry and Para 10 kept', (charge) => {
    const pack = dischargePack();
    const out = packForCharge(pack, { offences_charged: charge });
    expect(out).toBe(pack);
    expect(niActs(out)).toHaveLength(1);
    expect(para10(out)).toHaveLength(1);
  });

  it.each(['legal_notice_s138', 'quashing_528_bnss', 'criminal_revision', 'consumer_complaint'])(
    'pack %s: same reference whatever the charge',
    (id) => {
      const pack = loadRulePack(id);
      expect(pack).toBeTruthy();
      for (const c of [BNS_ONLY, '', undefined, S138_CHARGE]) {
        expect(packForCharge(pack as RulePack, { offences_charged: c })).toBe(pack);
      }
    },
  );

  it('legal_notice_s138 keeps its NI Act entry on a BNS-only value', () => {
    const pack = loadRulePack('legal_notice_s138') as RulePack;
    expect(niActs(packForCharge(pack, { offences_charged: BNS_ONLY })).length).toBeGreaterThan(0);
  });

  it('a synthetic pack with another id and an NI Act entry is returned as it is', () => {
    const synthetic = { ...dischargePack(), id: 'some_other_pack' } as RulePack;
    expect(packForCharge(synthetic, { offences_charged: BNS_ONLY })).toBe(synthetic);
  });

  it('a discharge-id pack with nothing NI Act in it is returned as it is', () => {
    const clean = packForCharge(dischargePack(), { offences_charged: BNS_ONLY });
    expect(packForCharge(clean, { offences_charged: BNS_ONLY })).toBe(clean);
  });
});

describe('T-429 B2: templateForCharge on the real discharge template config', () => {
  const config = () => loadTemplateConfig(PACK_ID)!;
  const aiPrompts = (c: ReturnType<typeof config>) =>
    c.document_structure.sections
      .filter((s) => s.type === 'ai_generated')
      .map((s) => s.prompt_context ?? '')
      .join('\n');

  it('premise: the config carries the NI Act related act and the Para 10 line', () => {
    expect(config().related_acts.join('\n')).toMatch(/negotiable instruments/i);
    expect(aiPrompts(config())).toMatch(/Para 10:/);
  });

  it.each([BNS_ONLY, '', undefined, '[To be confirmed: x]', '{{MISSING: x}}'])(
    'charge %j: related act and Para 10 line gone, input unchanged',
    (charge) => {
      const c = config();
      const before = JSON.parse(JSON.stringify(c));
      const out = templateForCharge(c, { offences_charged: charge });
      expect(out).not.toBe(c);
      expect(out.related_acts.join('\n')).not.toMatch(/negotiable instruments/i);
      expect(aiPrompts(out)).not.toMatch(/Negotiable|S\.M\.S\.|Para 10:/);
      expect(out.related_acts).toHaveLength(c.related_acts.length - 1);
      expect(c).toEqual(before);
      expect(aiPrompts(c)).toMatch(/Para 10:/);
    },
  );

  it('s.138 charge: same config object', () => {
    const c = config();
    expect(templateForCharge(c, { offences_charged: 'S.138 NI Act' })).toBe(c);
  });

  it('another template: same config object', () => {
    const c = loadTemplateConfig('legal_notice_s138')!;
    expect(templateForCharge(c, { offences_charged: BNS_ONLY })).toBe(c);
  });
});

// ── C ────────────────────────────────────────────────────────────────────
function drafterInput(pack: RulePack) {
  return {
    pack,
    brief: {},
    systemParts: [],
    courtRules: [],
    target: 10,
    language: 'en',
  } as unknown as Parameters<typeof buildDrafterUserPrompt>[0];
}

function ledgerInput(pack: RulePack) {
  return {
    pack,
    facts: { court: null, facts: [], missing: [] },
    averments: { allowed: [], banned: [] },
    systemParts: [],
    courtRules: [],
    target: 10,
    language: 'en',
  } as unknown as Parameters<typeof buildLedgerDrafterUserPrompt>[0];
}

describe('T-429 C: the prompt renderers with the gated pack', () => {
  const renderers: Array<[string, (p: RulePack) => string]> = [
    ['drafter', (p) => buildDrafterUserPrompt(drafterInput(p))],
    ['repair', (p) => buildRepairUserPrompt(drafterInput(p), 'doc text', ['m1'])],
    ['ledger drafter', (p) => buildLedgerDrafterUserPrompt(ledgerInput(p))],
  ];

  describe.each(renderers)('%s', (_n, render) => {
    it('control: the ungated pack names the NI Act', () => {
      expect(render(dischargePack())).toContain('Negotiable Instruments');
    });

    it.each([BNS_ONLY, '', '[To be confirmed: x]', '{{MISSING: x}}'])(
      'charge %j: no NI Act, no S.M.S. Pharmaceuticals, no Para 10 text, other content kept',
      (charge) => {
        const text = render(packForCharge(dischargePack(), { offences_charged: charge }));
        expect(text).not.toContain('Negotiable Instruments');
        expect(text).not.toContain('S.M.S. Pharmaceuticals');
        expect(text).not.toContain('Neeta Bhalla');
        expect(text).not.toContain('NI Act');
        expect(text).toContain('Bharatiya Nagarik Suraksha Sanhita');
        expect(text).toContain('Bharatiya Nyaya Sanhita');
      },
    );

    it.each(['S.138 NI Act', S138_CHARGE])('charge %j: NI Act and Para 10 present', (charge) => {
      const text = render(packForCharge(dischargePack(), { offences_charged: charge }));
      expect(text).toContain('Negotiable Instruments');
      expect(text).toContain('Offences by companies');
    });
  });

  it('drafter: Para 10 text is there for s.138 and not otherwise', () => {
    const on = buildDrafterUserPrompt(
      drafterInput(packForCharge(dischargePack(), { offences_charged: 'S.138 NI Act' })),
    );
    const off = buildDrafterUserPrompt(
      drafterInput(packForCharge(dischargePack(), { offences_charged: BNS_ONLY })),
    );
    expect(on).toContain('S.M.S. Pharmaceuticals');
    expect(off).not.toContain('S.M.S. Pharmaceuticals');
  });
});

// ── D ────────────────────────────────────────────────────────────────────
const BASE: Record<string, string> = {
  applicant_name: 'Suresh Gupta',
  applicant_address: '12 Karol Bagh, Delhi',
  advocate_name: 'A. Advocate',
};

function callsText(): string {
  return mockMessagesStream.mock.calls
    .map((c) => {
      const p = c[0] as SdkStreamParams;
      return `${p.system}\n${p.messages.map((m) => m.content).join('\n')}`;
    })
    .join('\n=====\n');
}

function resStub() {
  return { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
}

function heldFacts(charge: string | null): LedgerFact[] {
  const facts = Object.entries({ ...BASE, ...(charge ? { offences_charged: charge } : {}) }).map(
    ([k, v]) =>
      ({ key: k, label: k, type: 'text', display: v, source: 'asked' }) as never as LedgerFact,
  );
  return facts;
}

async function briefPromptsFor(charge: string | undefined, viaLedger = false): Promise<string> {
  const pack = dischargePack();
  const values: GivenValue[] = Object.entries(BASE).map(([k, v]) => ({
    key: k,
    value: v,
    source: 'user',
  }));
  if (charge !== undefined) values.push({ key: 'offences_charged', value: charge, source: 'user' });
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: true },
    checklist: buildChecklist(pack),
    values,
  });
  const clauses = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () =>
      sdkAnswer(`1. That the applicant is innocent.\n\n${CLAUSES_MARKER}\n${clauses}`, 4000, 800),
    );
  await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig(PACK_ID)!,
      brief,
      described: null,
      language: 'en',
      targetParagraphs: 10,
      advocateName: 'Test Advocate',
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
      ...(viaLedger
        ? { ledger: { facts: heldFacts(charge ?? null), lists: loadAvermentLists(PACK_ID) } }
        : {}),
    } as unknown as Parameters<typeof streamGenerateFromBrief>[0],
    resStub() as unknown as Response,
  );
  return callsText();
}

async function templatePromptsFor(charge: unknown): Promise<string> {
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () => sdkAnswer('1. That the applicant is innocent.', 4000, 800));
  const formData: Record<string, unknown> = { ...BASE };
  if (charge !== undefined) formData.offences_charged = charge;
  await streamGenerateFromTemplate(
    {
      templateConfig: loadTemplateConfig(PACK_ID)!,
      formData,
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
    resStub() as unknown as Response,
  );
  return callsText();
}

describe('T-429 D: end to end with a stubbed model', () => {
  describe('streamGenerateFromBrief', () => {
    it.each([BNS_ONLY, undefined])('charge %j: no stream call mentions the NI Act', async (c) => {
      const text = await briefPromptsFor(c);
      expect(mockMessagesStream).toHaveBeenCalled();
      expect(text).not.toContain('Negotiable Instruments');
      expect(text).not.toContain('S.M.S. Pharmaceuticals');
    });

    it.each([BNS_ONLY, undefined])('ledger path, charge %j: no NI Act', async (c) => {
      const text = await briefPromptsFor(c, true);
      expect(mockMessagesStream).toHaveBeenCalled();
      expect(text).not.toContain('Negotiable Instruments');
      expect(text).not.toContain('S.M.S. Pharmaceuticals');
    });

    it.each(['S.138 NI Act', S138_CHARGE])('charge %j: the prompt has the NI Act', async (c) => {
      const text = await briefPromptsFor(c);
      expect(text).toContain('Negotiable Instruments');
    });

    it('ledger path, s.138 charge: the prompt has the NI Act', async () => {
      expect(await briefPromptsFor('S.138 NI Act', true)).toContain('Negotiable Instruments');
    });
  });

  describe('streamGenerateFromTemplate', () => {
    it.each([BNS_ONLY, undefined, '', '[To be confirmed: x]'])(
      'charge %j: no stream call mentions the NI Act',
      async (c) => {
        const text = await templatePromptsFor(c);
        expect(mockMessagesStream).toHaveBeenCalled();
        expect(text).not.toContain('Negotiable Instruments');
        expect(text).not.toContain('S.M.S. Pharmaceuticals');
      },
    );

    it.each(['S.138 NI Act', S138_CHARGE])('charge %j: the prompt has the NI Act', async (c) => {
      const text = await templatePromptsFor(c);
      expect(mockMessagesStream).toHaveBeenCalled();
      expect(text).toContain('Negotiable Instruments');
      expect(text).toContain('S.M.S. Pharmaceuticals');
    });

    it('the registry config is not changed by a gated run', async () => {
      const before = JSON.stringify(loadTemplateConfig(PACK_ID));
      await templatePromptsFor(BNS_ONLY);
      expect(JSON.stringify(loadTemplateConfig(PACK_ID))).toBe(before);
      expect(before).toContain('Negotiable Instruments');
    });
  });
});

// ── E ────────────────────────────────────────────────────────────────────
type RawPack = {
  draftingInstructions?: string[];
  drafting_instructions?: string[];
  relevantActs: Array<{ act: string; sections: Array<{ number: string; description: string }> }>;
};
const rawPack = (id: string): RawPack =>
  JSON.parse(readFileSync(join(RULES_DIR, `${id}.json`), 'utf8')) as RawPack;

const SIGNED = {
  'S.438': 'Calling for records to exercise powers of revision (was S.397 CrPC)',
  'S.440': "Sessions Judge's powers of revision (was S.399 CrPC)",
  'S.442': "High Court's powers of revision (was S.401 CrPC)",
} as const;

const DISCHARGE_REVISION_SENTENCE =
  'Revision against the discharge order lies under S.438 read with S.440 (Sessions Judge) or S.442 (High Court) BNSS.';

const OLD_STRINGS = ['Revisional powers of Court of Session', 'S.438 BNSS revision to HC by State'];

describe('T-429 E: the signed strings (T-430, ea02c86)', () => {
  const bnss = (p: RawPack) => p.relevantActs.find((a) => /Nagarik Suraksha/.test(a.act))!;

  describe.each(['discharge_application', 'quashing_528_bnss', 'criminal_revision'])('%s', (id) => {
    it.each(Object.entries(SIGNED))('%s description is word for word', (num, desc) => {
      const matches = bnss(rawPack(id)).sections.filter((s) => s.number === num);
      expect(matches).toHaveLength(1);
      expect(matches[0].description).toBe(desc);
    });

    it('the loaded pack carries the same three descriptions', () => {
      const loaded = loadRulePack(id) as RulePack;
      const sections = loaded.relevantActs.flatMap((a) => a.sections);
      for (const [num, desc] of Object.entries(SIGNED)) {
        expect(sections.find((s) => s.number === num)?.description).toBe(desc);
      }
    });

    it('the old strings appear nowhere in relevantActs or instructions', () => {
      const loaded = loadRulePack(id) as RulePack;
      const text = JSON.stringify([loaded.relevantActs, loaded.draftingInstructions]);
      for (const old of OLD_STRINGS) expect(text).not.toContain(old);
      const raw = rawPack(id);
      const rawText = JSON.stringify([raw.relevantActs, raw.draftingInstructions]);
      for (const old of OLD_STRINGS) expect(rawText).not.toContain(old);
    });
  });

  it.each(['discharge_application', 'quashing_528_bnss'])(
    '%s: S.440 sits between S.438 and S.442',
    (id) => {
      const nums = bnss(rawPack(id)).sections.map((s) => s.number);
      const i438 = nums.indexOf('S.438');
      const i440 = nums.indexOf('S.440');
      const i442 = nums.indexOf('S.442');
      expect(i438).toBeGreaterThanOrEqual(0);
      expect(i440).toBe(i438 + 1);
      expect(i442).toBe(i440 + 1);
    },
  );

  it('discharge: the revision instruction is exactly the signed sentence, once', () => {
    const loaded = dischargePack();
    expect(loaded.draftingInstructions.filter((l) => l.startsWith('Revision against'))).toEqual([
      DISCHARGE_REVISION_SENTENCE,
    ]);
  });

  it('discharge: the revision instruction survives the s.138 gate on a BNS-only charge', () => {
    const out = packForCharge(dischargePack(), { offences_charged: BNS_ONLY });
    expect(out.draftingInstructions).toContain(DISCHARGE_REVISION_SENTENCE);
    expect(buildDrafterUserPrompt(drafterInput(out))).toContain(DISCHARGE_REVISION_SENTENCE);
  });

  it('discharge: the NI Act relevantActs entry is the only one the gate removes', () => {
    const pack = dischargePack();
    const out = packForCharge(pack, { offences_charged: BNS_ONLY });
    const gone = pack.relevantActs.filter((a) => !out.relevantActs.includes(a));
    expect(gone.map((a) => a.act)).toEqual(['Negotiable Instruments Act, 1881']);
  });
});
