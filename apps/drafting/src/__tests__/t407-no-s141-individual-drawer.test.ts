/**
 * T-407 part 1 (Ajay's ruling 2, handoff/legal/T-363-s138-notice-wording-signed.md):
 * s.141 NI Act reaches the model only for drawer type company or partnership.
 * Individual, HUF, unknown, empty and placeholder give no s.141.
 *
 * Covers the brief / ledger / repair / D1 paths in ai.service.ts (packForDrawer).
 * Part 2 (F, G, H below) covers the config path: buildAISystemPrompt with a
 * PlaceholderContext, and streamGenerateFromTemplate end to end.
 *
 * A  s141Applies truth table
 * B  packForDrawer on the real s.138 pack
 * C  the prompt renderers with the filtered pack
 * D  streamGenerateFromBrief end to end with a stubbed model
 * E  advocate-visible labels through formDataFromBrief
 * F  config path: buildAISystemPrompt RELATED ACTS per drawer
 * G  config path: streamGenerateFromTemplate end to end with a stubbed model
 * H  guard parity: ni_act_related_sections vs ni_act_sections_ref
 */
import './setupEnv';

import { Response } from 'express';

import {
  packForDrawer,
  s141Applies,
  streamGenerateFromBrief,
  streamGenerateFromTemplate,
} from '../services/ai.service';
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import {
  buildDrafterUserPrompt,
  formDataFromBrief,
  ledgerSkeletonBrief,
  buildLedgerDrafterUserPrompt,
  buildRepairUserPrompt,
  CLAUSES_MARKER,
} from '../services/brief-drafter';
import { buildBrief, buildChecklist, type Brief, type GivenValue } from '../services/intake-brief';
import { loadAvermentLists } from '../services/averments';
import { loadRulePack, type RulePack } from '../services/rule-pack.service';
import {
  buildAISystemPrompt,
  buildPlaceholderContext,
  loadTemplateConfig,
  replacePlaceholders,
} from '../services/template-engine.service';
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

const PACK_ID = 'legal_notice_s138';

function s138Pack(): RulePack {
  const p = loadRulePack(PACK_ID);
  if (!p) throw new Error('no s138 pack');
  return p;
}

const sectionNumbers = (p: RulePack) =>
  p.relevantActs
    .filter((a) => /negotiable instruments/i.test(a.act))
    .flatMap((a) => a.sections.map((s) => s.number));

const NO_S141: Array<[string, unknown]> = [
  ['individual', 'individual'],
  ['huf', 'huf'],
  ['empty string', ''],
  ['to-be-confirmed placeholder', '[To be confirmed: drawer type]'],
  ['MISSING placeholder', '{{MISSING: Drawer Type}}'],
  ['undefined', undefined],
];

// ── A ────────────────────────────────────────────────────────────────────
describe('T-407 A: s141Applies', () => {
  it.each([
    ['company', true],
    ['partnership', true],
    [' company ', false], // exact ===, like the template guard: no trim
    ['\tpartnership\n', false],
    ['individual', false],
    ['huf', false],
    ['', false],
    ['   ', false],
    ['[To be confirmed: drawer type]', false],
    ['{{MISSING: Drawer Type}}', false],
    ['Company / LLP', false],
    ['Partnership Firm', false],
    ['COMPANY', false],
    ['Company', false],
    ['unknown', false],
    [undefined, false],
    [null, false],
    [0, false],
    [true, false],
    [{}, false],
    [['company'], false],
  ])('%j -> %s', (v, expected) => {
    expect(s141Applies(v)).toBe(expected);
  });
});

// ── B ────────────────────────────────────────────────────────────────────
describe('T-407 B: packForDrawer on the real s.138 pack', () => {
  it('premise: the real pack lists section 141 between 138 and 142', () => {
    expect(sectionNumbers(s138Pack())).toEqual(['138', '141', '142', '143', '144']);
  });

  it.each(NO_S141)(
    '%s: no section 141, 138/142/143/144 kept in order, input unchanged',
    (_n, t) => {
      const pack = s138Pack();
      const before = JSON.parse(JSON.stringify(pack));
      const out = packForDrawer(pack, { respondent_type: t });
      expect(out).not.toBe(pack);
      expect(sectionNumbers(out)).toEqual(['138', '142', '143', '144']);
      expect(sectionNumbers(out)).not.toContain('141');
      expect(pack).toEqual(before);
      expect(sectionNumbers(pack)).toContain('141');
      // everything but the acts is the same
      expect(out.id).toBe(pack.id);
      expect(out.mandatoryClauses).toBe(pack.mandatoryClauses);
      expect(out.draftingInstructions).toBe(pack.draftingInstructions);
    },
  );

  it('values with no respondent_type key at all: no section 141', () => {
    expect(sectionNumbers(packForDrawer(s138Pack(), {}))).not.toContain('141');
  });

  it.each(['company', 'partnership'])('%s: the same pack object is returned', (t) => {
    const pack = s138Pack();
    expect(packForDrawer(pack, { respondent_type: t })).toBe(pack);
    expect(sectionNumbers(pack)).toContain('141');
  });

  it('a pack with no s.141 entry is returned as it is, whatever the drawer', () => {
    const other = loadRulePack('consumer_complaint');
    expect(other).toBeTruthy();
    for (const t of ['individual', 'company', undefined, '']) {
      expect(packForDrawer(other as RulePack, { respondent_type: t })).toBe(other);
    }
  });

  it('discharge_application (NI Act, no respondent_type): same reference, S.141 kept', () => {
    const pack = loadRulePack('discharge_application');
    expect(pack).toBeTruthy();
    const p = pack as RulePack;
    expect(p.id).not.toBe(PACK_ID);
    expect(JSON.stringify(p)).toMatch(/S\.\s?141/);
    expect(packForDrawer(p, {})).toBe(p);
    expect(packForDrawer(p, { respondent_type: 'individual' })).toBe(p);
    expect(JSON.stringify(packForDrawer(p, {}))).toMatch(/S\.\s?141/);
  });

  it('a synthetic pack with another id and an NI Act 141 is returned as it is', () => {
    const synthetic = {
      ...s138Pack(),
      id: 'some_other_ni_pack',
    } as RulePack;
    expect(sectionNumbers(synthetic)).toContain('141');
    for (const t of [undefined, 'individual', 'huf', '']) {
      const out = packForDrawer(synthetic, { respondent_type: t });
      expect(out).toBe(synthetic);
      expect(sectionNumbers(out)).toContain('141');
    }
  });

  it('only the NI Act loses 141: a section 141 of another act is kept; "141(1)" is kept', () => {
    const base = s138Pack();
    const synthetic = {
      ...base,
      relevantActs: [
        {
          act: 'Negotiable Instruments Act, 1881',
          sections: [
            { number: 'Section 141', description: 'a' },
            { number: 'S. 141', description: 'b' },
            { number: 'Sec. 141', description: 'c' },
            { number: '141(1)', description: 'd' },
            { number: '142', description: 'e' },
          ],
        },
        { act: 'Some Other Act, 2000', sections: [{ number: '141', description: 'x' }] },
      ],
    } as RulePack;
    const out = packForDrawer(synthetic, { respondent_type: 'individual' });
    expect(out.relevantActs[0].sections.map((s) => s.number)).toEqual(['141(1)', '142']);
    expect(out.relevantActs[1].sections.map((s) => s.number)).toEqual(['141']);
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

describe('T-407 C: the prompt renderers with the drawer-filtered pack', () => {
  const renderers: Array<[string, (p: RulePack) => string]> = [
    ['drafter', (p) => buildDrafterUserPrompt(drafterInput(p))],
    ['repair', (p) => buildRepairUserPrompt(drafterInput(p), 'doc text', ['m1'])],
    ['ledger drafter', (p) => buildLedgerDrafterUserPrompt(ledgerInput(p))],
  ];

  it.each(renderers)('%s: control, the unfiltered pack does name s.141', (_n, render) => {
    expect(render(s138Pack())).toContain('141');
  });

  describe.each(renderers)('%s', (_n, render) => {
    it.each(NO_S141)('%s: no 141', (_l, t) => {
      const text = render(packForDrawer(s138Pack(), { respondent_type: t }));
      expect(text).not.toContain('141');
      expect(text).toContain('138');
      expect(text).toContain('142');
    });

    it.each(['company', 'partnership'])('%s: names 141', (t) => {
      expect(render(packForDrawer(s138Pack(), { respondent_type: t }))).toContain(
        'Offences by companies',
      );
    });
  });
});

// ── D ────────────────────────────────────────────────────────────────────
const BASE: Record<string, string> = {
  applicant_name: 'Suresh Gupta',
  applicant_address: '12 Karol Bagh, Delhi',
  respondent_name: 'Demo Traders',
  respondent_address: '5 Lajpat Nagar, Delhi',
  advocate_name: 'A. Advocate',
  advocate_address: 'Chamber 3, Tis Hazari',
  cheque_number: '123456',
  cheque_date: '2026-05-01',
  cheque_amount: '3,00,000',
  amount_in_words: 'Three Lakh',
  drawee_bank: 'SBI',
  drawee_branch: 'Karol Bagh',
  dishonour_date: '2026-05-10',
};
// buildBrief accepts a choice by the pack's option label.
const TYPE_LABEL: Record<string, string> = {
  individual: 'Individual',
  company: 'Company / LLP',
  partnership: 'Partnership Firm',
  huf: 'HUF',
};

async function promptsSentFor(type: string | undefined, viaLedger = false): Promise<string> {
  const pack = s138Pack();
  const values: GivenValue[] = Object.entries(BASE).map(([k, v]) => ({
    key: k,
    value: v,
    source: 'user',
  }));
  if (type) values.push({ key: 'respondent_type', value: TYPE_LABEL[type], source: 'user' });
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: false },
    checklist: buildChecklist(pack),
    values,
  });
  const clauses = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () =>
      sdkAnswer(`1. That the cheque was dishonoured.\n\n${CLAUSES_MARKER}\n${clauses}`, 4000, 800),
    );
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
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
        ? {
            ledger: {
              facts: heldFacts(type ? TYPE_LABEL[type] : null),
              lists: loadAvermentLists(PACK_ID),
            },
          }
        : {}),
    } as unknown as Parameters<typeof streamGenerateFromBrief>[0],
    res as unknown as Response,
  );
  // every call (drafter and any repair) is checked
  return mockMessagesStream.mock.calls
    .map((c) => {
      const p = c[0] as SdkStreamParams;
      return `${p.system}\n${p.messages.map((m) => m.content).join('\n')}`;
    })
    .join('\n=====\n');
}

describe('T-407 D: streamGenerateFromBrief on an s.138 brief', () => {
  it.each(['individual', 'huf', undefined])(
    'drawer %s: nothing sent to the model has 141',
    async (t) => {
      const text = await promptsSentFor(t);
      expect(mockMessagesStream).toHaveBeenCalled();
      expect(text).toContain('138');
      expect(text).not.toContain('141');
    },
  );

  it.each(['company', 'partnership'])('drawer %s: the prompt names 141', async (t) => {
    const text = await promptsSentFor(t);
    expect(text).toContain('Offences by companies');
    expect(text).toContain('141');
  });

  // The ledger path (input.ledger set): the ledger drafter and its repair/verifier calls.
  it.each(['individual', 'huf', undefined])(
    'ledger path, drawer %s: nothing sent to the model has 141',
    async (t) => {
      const text = await promptsSentFor(t, true);
      expect(mockMessagesStream).toHaveBeenCalled();
      expect(text).toContain('138');
      expect(text).not.toContain('141');
    },
  );

  it.each(['company', 'partnership'])('ledger path, drawer %s: the prompt names 141', async (t) => {
    const text = await promptsSentFor(t, true);
    expect(text).toContain('Offences by companies');
    expect(text).toContain('141');
  });
});

// ── E: the labels the advocate sees, through formDataFromBrief (Ajay's condition on fe5df17) ──
const TWIN = JSON.parse(
  readFileSync(join(__dirname, '../../../../docs/templates/legal_notice_s138.json'), 'utf8'),
) as {
  form_schema: {
    steps: Array<{
      fields: Array<{ field_id: string; options?: Array<{ id: string; label: string }> }>;
    }>;
  };
};
const OPTIONS = TWIN.form_schema.steps
  .flatMap((s) => s.fields)
  .find((f) => f.field_id === 'respondent_type')!.options!;
const labelOf = (id: string) => OPTIONS.find((o) => o.id === id)!.label;

function labelBrief(label: string | null): Brief {
  const pack = s138Pack();
  const values: GivenValue[] = Object.entries(BASE).map(([k, v]) => ({
    key: k,
    value: v,
    source: 'user',
  }));
  if (label !== null) values.push({ key: 'respondent_type', value: label, source: 'user' });
  return buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: false },
    checklist: buildChecklist(pack),
    values,
  });
}

function heldFacts(label: string | null): LedgerFact[] {
  const facts = Object.entries(BASE).map(
    ([k, v]) =>
      ({ key: k, label: k, type: 'text', display: v, source: 'asked' }) as never as LedgerFact,
  );
  if (label !== null) {
    facts.push({
      key: 'respondent_type',
      label: 'Drawer Type',
      type: 'text',
      display: label,
      source: 'asked',
    } as never as LedgerFact);
  }
  return facts;
}

function promptsFor(data: Record<string, unknown>): string[] {
  const pack = packForDrawer(s138Pack(), data);
  return [
    buildDrafterUserPrompt(drafterInput(pack)),
    buildRepairUserPrompt(drafterInput(pack), 'doc', ['m1']),
    buildLedgerDrafterUserPrompt(ledgerInput(pack)),
  ];
}

describe('T-407 E: advocate-visible labels through formDataFromBrief', () => {
  const config = () => loadTemplateConfig(PACK_ID)!;

  it('premise: the twin labels are the ones in use', () => {
    expect(OPTIONS.map((o) => o.id).sort()).toEqual([
      'company',
      'huf',
      'individual',
      'partnership',
    ]);
  });

  describe.each([
    ['brief path', (l: string | null) => formDataFromBrief(labelBrief(l), config(), 'en')],
    [
      'ledger path',
      (l: string | null) =>
        formDataFromBrief(ledgerSkeletonBrief(labelBrief(null), heldFacts(l)), config(), 'en'),
    ],
  ])('%s', (_n, toData) => {
    it.each(['company', 'partnership'])(
      'label of %s -> option id, keeps s.141 in every prompt',
      (id) => {
        const data = toData(labelOf(id));
        expect(data.respondent_type).toBe(id);
        for (const t of promptsFor(data)) expect(t).toContain('Offences by companies');
      },
    );

    it.each(['individual', 'huf'])(
      'label of %s -> option id, drops s.141 in every prompt',
      (id) => {
        const data = toData(labelOf(id));
        expect(data.respondent_type).toBe(id);
        for (const t of promptsFor(data)) expect(t).not.toContain('141');
      },
    );

    it('drawer type not given: the blank the path generates drops s.141', () => {
      const data = toData(null);
      expect(String(data.respondent_type)).toMatch(/^(\[To be confirmed: |\{\{MISSING: )/);
      for (const t of promptsFor(data)) expect(t).not.toContain('141');
    });
  });

  it('the blanks are the path-specific forms: brief "[To be confirmed: ", ledger "{{MISSING: "', () => {
    expect(String(formDataFromBrief(labelBrief(null), config(), 'en').respondent_type)).toMatch(
      /^\[To be confirmed: /,
    );
    expect(
      String(
        formDataFromBrief(ledgerSkeletonBrief(labelBrief(null), heldFacts(null)), config(), 'en')
          .respondent_type,
      ),
    ).toMatch(/^\{\{MISSING: /);
  });
});

// ── Part 2: the config path ──────────────────────────────────────────────
const RT_FIELD = TWIN.form_schema.steps
  .flatMap((s) => s.fields)
  .find((f) => f.field_id === 'respondent_type') as unknown as {
  placeholder?: string;
};
const optId = (id: string) => OPTIONS.find((o) => o.id === id)!.id;

// Drawer values that must give no s.141, ids taken from the template's options.
const CFG_NO_S141: Array<[string, unknown]> = [
  ['individual', optId('individual')],
  ['huf', optId('huf')],
  ['empty string', ''],
  ['undefined', undefined],
  ['padded " company"', ` ${optId('company')}`],
  ['padded "partnership "', `${optId('partnership')} `],
  ['to-be-confirmed placeholder', '[To be confirmed: drawer type]'],
  ['MISSING placeholder', '{{MISSING: Drawer Type}}'],
  ['option label "Company / LLP"', labelOf('company')],
];
const CFG_S141: Array<[string, string]> = [
  ['company', optId('company')],
  ['partnership', optId('partnership')],
];

function cfgCtx(drawer: unknown) {
  const config = loadTemplateConfig(PACK_ID)!;
  const data: Record<string, unknown> = { ...BASE };
  if (drawer !== undefined) data.respondent_type = drawer;
  return { config, ctx: buildPlaceholderContext(config, data) };
}

function relatedLine(prompt: string): string {
  const m = prompt.match(/RELATED ACTS: ([^\n]*)/);
  if (!m) throw new Error('no RELATED ACTS line');
  return m[1];
}

// ── F ────────────────────────────────────────────────────────────────────
describe('T-407 F: buildAISystemPrompt RELATED ACTS per drawer (config path)', () => {
  it('premise: the template carries the computed field and the related_acts placeholder', () => {
    const config = loadTemplateConfig(PACK_ID)!;
    expect(config.related_acts.join(' ')).toContain('{ni_act_related_sections}');
    expect(Object.keys(config.computed_fields ?? {})).toContain('ni_act_related_sections');
    expect(typeof (RT_FIELD.placeholder ?? '')).toBe('string');
  });

  it.each(CFG_NO_S141)('%s: no 141, has "138, 139, 142"', (_n, d) => {
    const { config, ctx } = cfgCtx(d);
    const line = relatedLine(buildAISystemPrompt(config, undefined, undefined, ctx));
    expect(line).not.toContain('141');
    expect(line).toContain('Sections 138, 139, 142');
    expect(buildAISystemPrompt(config, undefined, undefined, ctx)).not.toContain(
      '{ni_act_related_sections}',
    );
  });

  it.each(CFG_S141)('%s: names 141', (_n, d) => {
    const { config, ctx } = cfgCtx(d);
    const line = relatedLine(buildAISystemPrompt(config, undefined, undefined, ctx));
    expect(line).toContain('Sections 138, 139, 141, 142');
  });

  it('without ctx the entries are unchanged (the literal placeholder, no 141 digits)', () => {
    const config = loadTemplateConfig(PACK_ID)!;
    const line = relatedLine(buildAISystemPrompt(config));
    expect(line).toContain('{ni_act_related_sections}');
    expect(line).not.toContain('141');
  });

  it('does not mutate config.related_acts', () => {
    const { config, ctx } = cfgCtx(optId('company'));
    const before = [...config.related_acts];
    buildAISystemPrompt(config, undefined, undefined, ctx);
    expect(config.related_acts).toEqual(before);
  });
});

// ── G ────────────────────────────────────────────────────────────────────
async function templatePromptsFor(drawer: unknown): Promise<string> {
  const config = loadTemplateConfig(PACK_ID)!;
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () => sdkAnswer('1. That the cheque was dishonoured.', 4000, 800));
  const formData: Record<string, unknown> = { ...BASE };
  if (drawer !== undefined) formData.respondent_type = drawer;
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  await streamGenerateFromTemplate(
    {
      templateConfig: config,
      formData,
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
    res as unknown as Response,
  );
  return mockMessagesStream.mock.calls
    .map((c) => {
      const p = c[0] as SdkStreamParams;
      return `${p.system}\n${p.messages.map((m) => m.content).join('\n')}`;
    })
    .join('\n=====\n');
}

describe('T-407 G: streamGenerateFromTemplate on the s.138 config (end to end)', () => {
  it.each(CFG_NO_S141.filter(([n]) => !n.startsWith('option label')))(
    'drawer %s: no stream call has 141 anywhere',
    async (_n, d) => {
      const text = await templatePromptsFor(d);
      expect(mockMessagesStream).toHaveBeenCalled();
      expect(text).toContain('Sections 138, 139, 142');
      // The BNS whitelist line lists BNS s.141 (a different Act, unrelated to the NI Act);
      // it is the only other place the digits appear, so it is set aside by name.
      const hits = text
        .split('\n')
        .filter((l) => l.includes('141') && !l.startsWith('BNS SECTION WHITELIST'));
      expect(hits).toEqual([]);
    },
  );

  it.each(CFG_S141)('drawer %s: the prompt names 141', async (_n, d) => {
    const text = await templatePromptsFor(d);
    expect(mockMessagesStream).toHaveBeenCalled();
    expect(text).toContain('Sections 138, 139, 141, 142');
  });
});

// ── H ────────────────────────────────────────────────────────────────────
describe('T-407 H: ni_act_related_sections and ni_act_sections_ref use the same guard', () => {
  it.each([...CFG_NO_S141, ...CFG_S141])('%s: 141 in one iff 141 in the other', (_n, d) => {
    const { ctx } = cfgCtx(d);
    const related = replacePlaceholders('{ni_act_related_sections}', ctx);
    const ref = replacePlaceholders('{ni_act_sections_ref}', ctx);
    expect(related).not.toContain('{');
    expect(ref).not.toContain('{');
    expect(related.includes('141')).toBe(ref.includes('141'));
    expect(related.includes('141')).toBe(d === 'company' || d === 'partnership');
  });
});
