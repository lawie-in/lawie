/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-650 (party fields in replication, written_statement and plaint_partition). Legal sign-off: Ajay,
 * handoff/legal/T-650-party-fields-signed.md (29 Oct 2026), rulings 1-3 and (3e)-(3g). Fictional placeholder
 * parties only (condition C1). The signed strings are typed here on purpose, copied from Ajay's file.
 * No model call, no network.
 *
 * "No other change" is pinned against fixtures/t650/head-<pack>.json, copies of the three packs as they were
 * before T-650 (committed, so the test needs no git refs).
 */
import './setupEnv';
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { formDataFromBrief } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadAllDocRules } from '../services/template-promoter';
import {
  buildPlaceholderContext,
  CourtLookupData,
  detectLeakedPlaceholders,
  loadCourtRule,
  renderTemplateSection,
  TemplateConfig,
} from '../services/template-engine.service';

import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// ── Signed strings (T-650) ──────────────────────────────────────────────────
const PLAINTIFF = 'Test Plaintiff A';
const DEFENDANT = 'Test Defendant B';
const SIGNED = {
  replication: {
    field: 'defendant_name',
    label: 'Defendant full name',
    rule: 'defendant_name must not be empty',
  },
  written_statement: {
    field: 'plaintiff_name',
    label: 'Plaintiff full name',
    rule: 'plaintiff_name must not be empty',
  },
  plaint_partition: {
    field: 'defendant_name',
    label: 'Defendant No. 1 full name',
    rule: 'defendant_name must not be empty',
  },
} as const;
const OTHER_LABEL = 'Are there defendants besides Defendant No. 1?';
const YES_LABEL = 'Yes, there are other defendants';
const NO_LABEL = 'No, Defendant No. 1 is the only defendant';
const DETAILS_LABEL =
  'All defendants — names, ages, addresses, relationship (every coparcener/co-sharer must be impleaded)';
const DETAILS_RULE = 'defendants_details must not be empty — every coparcener/co-sharer impleaded';

type Pack = keyof typeof SIGNED;
const PACKS = Object.keys(SIGNED) as Pack[];

const { configs, byFile } = loadAllDocRules();
const config = (id: string) => configs.get(byFile.get(`${id}.json`)!.template_id) as TemplateConfig;
const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const rawPack = (id: string): any =>
  JSON.parse(readFileSync(join(RULES_DIR, `${id}.json`), 'utf-8'));
const headPack = (id: string): any =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 't650', `head-${id}.json`), 'utf-8'));

const courtData = (): CourtLookupData => ({
  designation: 'CIVIL JUDGE (JUNIOR DIVISION), PATNA',
  city: 'Patna',
  caseNomenclature: 'Title Suit No. 245 of 2026',
  formattingRulesRef: 'civil_court_generic',
  courtType: 'civil_court',
  courtRule: loadCourtRule('civil_court_generic') ?? undefined,
});
function ctxFor(id: string, formData: Record<string, unknown>) {
  return buildPlaceholderContext(config(id), formData, { advocateName: 'Adv. A' }, courtData());
}
// plaint_partition's cause title is its first section ("header"); the others call it cause_title
const titleSection = (id: string) =>
  config(id).document_structure.sections.find(
    (x) =>
      x.section_id === 'cause_title' || (id === 'plaint_partition' && x.section_id === 'header'),
  )!;
function causeTitle(id: string, formData: Record<string, unknown>): string {
  return renderTemplateSection(titleSection(id), ctxFor(id, formData)).content;
}
const BOTH = { plaintiff_name: PLAINTIFF, defendant_name: DEFENDANT };

// ── A. Cause title ──────────────────────────────────────────────────────────
describe.each(PACKS)('T-650 A: %s cause title', (id) => {
  const form = id === 'plaint_partition' ? { ...BOTH, other_defendants: 'no' } : BOTH;

  it('prints both names, never a blank before Plaintiff or Defendant', () => {
    const out = causeTitle(id, form);
    expect(out).toContain(`${PLAINTIFF} ... Plaintiff`);
    expect(out).toContain(`${DEFENDANT} ... Defendant`);
    expect(out).not.toMatch(/_____\s*\.\.\.\s*(Plaintiff|Defendant)/);
    expect(out).not.toMatch(/\{(plaintiff|defendant)[a-z_]*\}/);
  });

  it('detectLeakedPlaceholders reports no party', () => {
    const leaked = detectLeakedPlaceholders(titleSection(id).template!, ctxFor(id, form));
    expect(leaked).toEqual([]);
  });
});

// ── B. Pack JSON: the new fields, byte for byte ─────────────────────────────
describe.each(PACKS)('T-650 B: %s pack fields', (id) => {
  const fields = rawPack(id).form_schema.fields as any[];
  const field = fields.find((f) => f.id === SIGNED[id].field);

  it('the new party field is required text with the signed label', () => {
    expect(field).toBeDefined();
    expect(field.label).toBe(SIGNED[id].label);
    expect(field.type).toBe('text');
    expect(field.required).toBe(true);
    expect(fields.filter((f) => f.id === SIGNED[id].field)).toHaveLength(1);
  });

  it('the validation line is byte-exact and present once', () => {
    const rules = rawPack(id).validation_rules as string[];
    expect(rules.filter((r) => r === SIGNED[id].rule)).toHaveLength(1);
  });
});

describe('T-650 B: plaint_partition other_defendants', () => {
  const fields = rawPack('plaint_partition').form_schema.fields as any[];
  const f = fields.find((x) => x.id === 'other_defendants');

  it('is a required select with the signed label, ids yes/no and the signed option labels', () => {
    expect(f.label).toBe(OTHER_LABEL);
    expect(f.type).toBe('select');
    expect(f.required).toBe(true);
    expect(f.options).toEqual([
      { id: 'yes', label: YES_LABEL },
      { id: 'no', label: NO_LABEL },
    ]);
  });

  it('blocks Confirm (3g)', () => {
    expect(f.blocks_confirm).toBe(true);
  });

  it('defendants_details keeps its label and its validation line, byte for byte', () => {
    const d = fields.find((x) => x.id === 'defendants_details');
    expect(d.label).toBe(DETAILS_LABEL);
    expect(rawPack('plaint_partition').validation_rules).toContain(DETAILS_RULE);
  });

  it('the title format and the computed suffix are the signed ones (3c, 3e)', () => {
    const p = rawPack('plaint_partition');
    expect(p.causeTitle.format.endsWith('VERSUS\n{defendant}{defendants_title_suffix}')).toBe(true);
    expect(p.computed_fields).toEqual({
      defendants_title_suffix: {
        logic: "if other_defendants === 'yes' then ' & Ors. ... Defendants' else ' ... Defendant'",
      },
    });
  });
});

// ── C. No other change in the three packs ───────────────────────────────────
/** HEAD with exactly the T-650 edits applied. Anything else that differs fails the equality. */
function expectedPack(id: Pack): any {
  const p = JSON.parse(JSON.stringify(headPack(id)));
  const insertBefore = (fieldId: string, ...add: any[]) => {
    const at = p.form_schema.fields.findIndex((f: any) => f.id === fieldId);
    p.form_schema.fields.splice(at, 0, ...add);
  };
  const insertRuleAfter = (after: string, line: string) => {
    const at = p.validation_rules.indexOf(after);
    p.validation_rules.splice(at + 1, 0, line);
  };
  const party = (f: string, label: string) => ({ id: f, label, type: 'text', required: true });
  if (id === 'replication') {
    insertBefore('ws_filing_date', party('defendant_name', SIGNED.replication.label));
    insertRuleAfter('plaintiff_name must not be empty', SIGNED.replication.rule);
  } else if (id === 'written_statement') {
    insertBefore('summons_service_date', party('plaintiff_name', SIGNED.written_statement.label));
    insertRuleAfter('defendant_name must not be empty', SIGNED.written_statement.rule);
  } else {
    p.causeTitle.format = p.causeTitle.format.replace(
      '{defendants} ... Defendants',
      '{defendant}{defendants_title_suffix}',
    );
    p.computed_fields = {
      defendants_title_suffix: {
        logic: "if other_defendants === 'yes' then ' & Ors. ... Defendants' else ' ... Defendant'",
      },
    };
    insertBefore('defendants_details', party('defendant_name', SIGNED.plaint_partition.label), {
      id: 'other_defendants',
      label: OTHER_LABEL,
      type: 'select',
      required: true,
      options: [
        { id: 'yes', label: YES_LABEL },
        { id: 'no', label: NO_LABEL },
      ],
      blocks_confirm: true,
    });
    insertRuleAfter('plaintiff_name must not be empty', SIGNED.plaint_partition.rule);
  }
  return p;
}

describe.each(PACKS)(
  'T-650 C: %s differs from the pre-T-650 pack only by the signed edits',
  (id) => {
    it('the whole pack equals HEAD plus the signed edits', () => {
      expect(rawPack(id)).toEqual(expectedPack(id));
    });

    it('the field id order is HEAD order with the new fields inserted, nothing moved', () => {
      const now = (rawPack(id).form_schema.fields as any[]).map((f) => f.id);
      const before = (headPack(id).form_schema.fields as any[]).map((f) => f.id);
      const added =
        id === 'plaint_partition' ? ['defendant_name', 'other_defendants'] : [SIGNED[id].field];
      expect(now.filter((x) => !added.includes(x))).toEqual(before);
      expect(now).toHaveLength(before.length + added.length);
    });
  },
);

// ── D. plaint_partition: "& Ors." only when there are other defendants ──────
describe('T-650 D: plaint_partition title suffix (3c, 3e)', () => {
  const title = (extra: Record<string, unknown>) =>
    causeTitle('plaint_partition', { ...BOTH, ...extra });

  it('yes: "Test Defendant B & Ors. ... Defendants"', () => {
    const out = title({ other_defendants: 'yes' });
    expect(out).toContain(`VERSUS\n${DEFENDANT} & Ors. ... Defendants`);
    expect(out).not.toMatch(/\.\.\. Defendant$/m);
  });

  it('no: "Test Defendant B ... Defendant", and "& Ors." never prints', () => {
    const out = title({ other_defendants: 'no' });
    expect(out).toContain(`VERSUS\n${DEFENDANT} ... Defendant`);
    expect(out).not.toContain('& Ors.');
    expect(out).not.toContain('Defendants');
  });

  it('unanswered: the singular title, with no "& Ors." (Confirm is what blocks it, 3g)', () => {
    const out = title({});
    expect(out).toContain(`${DEFENDANT} ... Defendant`);
    expect(out).not.toContain('& Ors.');
  });

  it('the label of the option is not the id: the labels never print in the title', () => {
    for (const v of ['yes', 'no']) {
      const out = title({ other_defendants: v });
      expect(out).not.toContain('Yes, there are');
      expect(out).not.toContain('No, Defendant');
    }
  });

  it('the suffix is not leaked as a token', () => {
    for (const v of ['yes', 'no']) {
      expect(causeTitle('plaint_partition', { ...BOTH, other_defendants: v })).not.toMatch(
        /\{defendants_title_suffix\}/,
      );
    }
  });
});

// ── E. Form route: a missing new field is refused with "<label> is required" ──
const USER_ID = '507f1f77bcf86cd799439650';
const MODEL = 'claude-sonnet-4-5-20250929';
const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

describe('T-650 E: form route refuses an empty new field', () => {
  beforeEach(async () => {
    mockMessagesStream.mockReset();
    _clearAppSettingsCache();
    await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
    // plaint_partition is a civil plaint: its switch must be on or the route 404s
    await AppSetting.create({ key: 'feature.template_civil_plaint', value: 'on' });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
    });
    await createVerifiedUser({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
  });

  const REQUIRED_LABELS: Array<[Pack, string, string]> = [
    ['replication', 'defendant_name', 'Defendant full name'],
    ['written_statement', 'plaintiff_name', 'Plaintiff full name'],
    ['plaint_partition', 'defendant_name', 'Defendant No. 1 full name'],
    ['plaint_partition', 'other_defendants', OTHER_LABEL],
  ];

  it.each(REQUIRED_LABELS)(
    '%s: no %s gives 400 "%s is required" and nothing runs',
    async (id, field, label) => {
      const form: Record<string, unknown> = {
        state: 'bihar',
        court_type: 'civil_court',
        court_name: 'bihar_civil_junior_patna',
        plaintiff_name: PLAINTIFF,
        defendant_name: DEFENDANT,
        other_defendants: 'no',
        language: 'en',
      };
      delete form[field];
      const res = await request(app)
        .post('/generate-from-template')
        .set(headers())
        .send({ template_id: byFile.get(`${id}.json`)!.template_id, form_data: form });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(`${label} is required`);
      expect(mockMessagesStream).not.toHaveBeenCalled();
      expect(await Generation.countDocuments({})).toBe(0);
      expect(await LawieDocument.countDocuments({})).toBe(0);
      expect(mongoose.connection.readyState).toBe(1);
    },
  );

  it.each(REQUIRED_LABELS)(
    '%s: an empty-string %s is refused the same way',
    async (id, field, label) => {
      const form: Record<string, unknown> = {
        state: 'bihar',
        court_type: 'civil_court',
        court_name: 'bihar_civil_junior_patna',
        plaintiff_name: PLAINTIFF,
        defendant_name: DEFENDANT,
        other_defendants: 'no',
        language: 'en',
        [field]: '',
      };
      const res = await request(app)
        .post('/generate-from-template')
        .set(headers())
        .send({ template_id: byFile.get(`${id}.json`)!.template_id, form_data: form });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(`${label} is required`);
    },
  );
});

// ── F. Brief: party items, Confirm blocked ──────────────────────────────────
describe('T-650 F: the brief', () => {
  const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };
  const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
  const briefOf = (id: Pack, values: GivenValue[]) =>
    buildBrief({
      kind: { id, name: id, court_document: true },
      checklist: buildChecklist(loadRulePack(id)!),
      values,
      court: COURT,
    } as any);

  describe.each(PACKS)('%s', (id) => {
    const f = SIGNED[id].field;
    const other = f === 'defendant_name' ? 'plaintiff_name' : 'defendant_name';

    it('the new field is a party item on the brief, required', () => {
      const item = briefOf(id, []).items.find((i) => i.key.split('.').pop() === f)!;
      expect(item.party_name).toBe(true);
      expect(item.required).toBe(true);
      expect(item.label).toBe(SIGNED[id].label);
    });

    it('missing, it blocks Confirm with the signed (3h) line or the generic T-127 line', () => {
      const b = briefOf(id, [user(other, other === 'plaintiff_name' ? PLAINTIFF : DEFENDANT)]);
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('parties');
      // T-661: plaint_partition takes Ajay's signed (3h) line; replication and written_statement keep
      // the generic line built from the field label (partyLabel).
      const expected =
        id === 'plaint_partition'
          ? 'Add the name of Defendant No. 1 to continue.'
          : `Add the name of the ${f === 'plaintiff_name' ? 'plaintiff' : 'defendant'} to continue.`;
      expect(b.confirm_message!.split('\n')[0]).toBe(expected);
    });

    it('both parties held: the party block lifts', () => {
      const extra = id === 'plaint_partition' ? [user('other_defendants', NO_LABEL)] : [];
      const b = briefOf(id, [
        user('plaintiff_name', PLAINTIFF),
        user('defendant_name', DEFENDANT),
        ...extra,
      ]);
      expect(b.confirm_blockers).not.toContain('parties');
    });
  });
});

// ── G. plaint_partition brief: other_defendants blocks Confirm; labels map to ids ──
describe('T-650 G: plaint_partition other_defendants on the brief', () => {
  const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };
  const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
  const briefOf = (values: GivenValue[]) =>
    buildBrief({
      kind: { id: 'plaint_partition', name: 'Partition', court_document: true },
      checklist: buildChecklist(loadRulePack('plaint_partition')!),
      values,
      court: COURT,
    } as any);
  const PARTIES = [user('plaintiff_name', PLAINTIFF), user('defendant_name', DEFENDANT)];

  it('unanswered: required_fields blocks, with other_defendants the blocking key', () => {
    const b = briefOf(PARTIES);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('required_fields');
    expect((b.confirm_blocking_keys ?? []).map((k) => k.split('.').pop())).toEqual([
      'other_defendants',
    ]);
    expect(b.items.find((i) => i.key.split('.').pop() === 'other_defendants')!.blocks_confirm).toBe(
      true,
    );
    // T-661: Ajay's signed (3g) ask line
    expect(b.confirm_message).toBe('Say whether there are other defendants to continue.');
  });

  it.each([YES_LABEL, NO_LABEL])('answered "%s": the block lifts', (label) => {
    const b = briefOf([...PARTIES, user('other_defendants', label)]);
    expect(b.confirm_blockers).not.toContain('required_fields');
    expect(b.can_confirm).toBe(true);
  });

  it.each([
    [YES_LABEL, 'yes'],
    [NO_LABEL, 'no'],
  ])('formDataFromBrief maps "%s" to the id %s', (label, id) => {
    const b = briefOf([...PARTIES, user('other_defendants', label)]);
    const data = formDataFromBrief(b, config('plaint_partition'), 'en');
    expect(data.other_defendants).toBe(id);
  });

  it('end to end: the brief answer fills the title (yes and no)', () => {
    for (const [label, tail] of [
      [YES_LABEL, '& Ors. ... Defendants'],
      [NO_LABEL, '... Defendant'],
    ]) {
      const data = formDataFromBrief(
        briefOf([...PARTIES, user('other_defendants', label)]),
        config('plaint_partition'),
        'en',
      );
      const out = causeTitle('plaint_partition', data);
      expect(out).toContain(`${DEFENDANT} ${tail}`);
    }
  });
});
