/**
 * T-471 round 5 (Ajay's byte-check corrections, 16 Oct 2026; handoff/legal/T-245-old-new-law-switch-signed.md,
 * commits b46848f0, 722c548a, c5887591, acbec79f). The signed wording is typed here on purpose: a code change
 * cannot move it.
 *
 * a  s.138 respondent_name is read as text (a firm kept); every other pack keeps person-name typing
 * b  a proprietorship with no proprietor named prints the signed blank, never the firm alone, no s.141
 * c  the s.138 pack's dishonour_details description (the :355 fallback)
 * d  the six drafter prompts carry the signed rule-4 sentence, once each
 * e  no {{MISSING: ...}} survives missingAsBlanks, the PDF export path or the review link
 */
import './setupEnv';
import './setupDb';

import fs from 'fs';
import path from 'path';

import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  DRAFTER_FACT_REPAIR_SYSTEM_PROMPT,
  DRAFTER_GUIDED_SYSTEM_PROMPT,
  DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT,
  DRAFTER_LEDGER_SYSTEM_PROMPT,
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import { blanksInContent, contentToHtml } from '../services/pdf-export.service';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  replacePlaceholders,
} from '../services/template-engine.service';
import { encrypt } from '../utils/encryption';
import { missingAsBlanks } from '../utils/missingAsBlanks';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

jest.setTimeout(30_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994391a1';
const INTAKE_MODEL = 'claude-haiku-4-5-20251001';
const DRAFT_MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const INTAKE_ID = '66666666-6666-4666-8666-666666666666';

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

// ── a ───────────────────────────────────────────────────────────────────────
const matchFor = (id: string, court: boolean) =>
  JSON.stringify({
    template_id: id,
    confidence: 'high',
    alternatives: [],
    is_legal_drafting: true,
    is_court_document: court,
    label: id,
    category: 'other',
  });
const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });

describe('T-471 a: respondent_name typing is the s.138 pack only (Priya)', () => {
  beforeEach(async () => {
    _clearAppSettingsCache();
    await redis.flushall();
    await AppSetting.create({ key: 'ai.intake_model', value: INTAKE_MODEL });
    await AppSetting.create({ key: 'ai.drafting_model', value: DRAFT_MODEL });
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
    for (const m of [INTAKE_MODEL, DRAFT_MODEL]) {
      await AppSetting.create({
        key: `ai.rates.${m}`,
        value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
      });
    }
    await Court.create({
      courtId: COURT_ID,
      name: 'District & Sessions Court, Patna',
      designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
      courtType: 'sessions',
      state: 'Bihar',
      stateId: 'bihar',
      city: 'Patna',
      formattingRulesRef: 'bihar_district',
    });
    await User.create({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** One /intake/brief run: match, read, extraction. Returns the response and the extraction prompt. */
  async function intake(packId: string, court: boolean, description: string, span: string) {
    mockMessagesStream.mockReset();
    for (const c of [
      matchFor(packId, court),
      EMPTY_READ,
      // 0.7: above the text floor (0.6), below the person-name floor (0.8)
      JSON.stringify({ facts: [{ key: 'respondent_name', span, confidence: 0.7 }] }),
    ]) {
      mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
    }
    const res = await request(app)
      .post('/intake/brief')
      .set(headers())
      .send({ description, intake_id: INTAKE_ID });
    const extractUser = (mockMessagesStream.mock.calls[2][0] as SdkStreamParams).messages[0]
      .content;
    return { res, extractUser };
  }

  it('legal_notice_s138: respondent_name is a text fact and "Gupta Electricals" is kept', async () => {
    const { res, extractUser } = await intake(
      'legal_notice_s138',
      false,
      'Mere client ko Gupta Electricals ne cheque diya tha, jo bounce ho gaya.',
      'Gupta Electricals',
    );
    expect(res.status).toBe(200);
    expect(extractUser).toMatch(/^respondent_name \| .* \| text$/m);
    expect(extractUser).not.toMatch(/^respondent_name \| .* \| person name$/m);
    const fact = res.body.ledger.facts.find((f: { key: string }) => f.key === 'respondent_name');
    expect(fact).toBeTruthy();
    expect(fact.display).toContain('Gupta Electricals');
    expect(fact.type).toBe('text');
  });

  it('maintenance_bnss_144: respondent_name is still a person name, held to the 0.8 floor', async () => {
    const { res, extractUser } = await intake(
      'maintenance_bnss_144',
      true,
      'Meri client ke pati Gupta Electricals ne kharcha dena band kar diya.',
      'Gupta Electricals',
    );
    expect(res.status).toBe(200);
    expect(extractUser).toMatch(/^respondent_name \| .* \| person name$/m);
    expect(extractUser).not.toMatch(/^respondent_name \| .* \| text$/m);
    const keys = res.body.ledger.facts.map((f: { key: string }) => f.key);
    expect(keys).not.toContain('respondent_name'); // 0.7 is under the person-name floor
  });
});

// ── b ───────────────────────────────────────────────────────────────────────
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
function sections(form: Record<string, unknown>): Record<string, string> {
  clearConfigCache();
  const config = loadTemplateConfig('legal_notice_s138')!;
  const ctx = buildPlaceholderContext(config, { ...BASE, ...form });
  const out: Record<string, string> = {};
  for (const s of config.document_structure.sections) {
    if (s.type === 'template') out[s.section_id] = replacePlaceholders(s.template as string, ctx);
  }
  return out;
}
const toBlock = (header: string) => /To,\n([\s\S]*?)\n\nFrom,/.exec(header)![1];

describe('T-471 b: proprietorship with no proprietor named (Ajay, c5887591)', () => {
  const SIGNED = '[To be confirmed: name of the proprietor], proprietor of Demo Traders';
  const FORM_BLANK =
    '[To be confirmed: name of the proprietor (if the drawer is a proprietorship firm)]';
  const LEDGER_BLANK =
    '{{MISSING: Name of the proprietor (if the drawer is a proprietorship firm)}}';

  it.each([
    ['not given at all', {}],
    ['an empty string', { drawer_proprietor: '' }],
    ['the form blank', { drawer_proprietor: FORM_BLANK }],
    ['the ledger blank', { drawer_proprietor: LEDGER_BLANK }],
  ])(
    '%s: the notice is addressed as signed, never to the firm alone, with no s.141',
    (_n, extra) => {
      const s = sections({ respondent_type: 'proprietorship', ...extra });
      expect(toBlock(s.header)).toBe(`${SIGNED}\n5 Lajpat Nagar, Delhi`);
      const all = Object.values(s).join('\n');
      expect(all).not.toContain('141');
      expect(all).not.toContain('Noticee No.');
    },
  );

  it('a proprietor named is still "Anil Gupta, proprietor of Demo Traders"', () => {
    const s = sections({ respondent_type: 'proprietorship', drawer_proprietor: 'Anil Gupta' });
    expect(toBlock(s.header)).toBe('Anil Gupta, proprietor of Demo Traders\n5 Lajpat Nagar, Delhi');
  });

  it('a drawer that is not a proprietorship never gets the proprietor blank', () => {
    for (const t of ['company', 'partnership', 'individual']) {
      const s = sections({ respondent_type: t });
      expect(Object.values(s).join('\n')).not.toContain('name of the proprietor');
    }
  });
});

// ── c ───────────────────────────────────────────────────────────────────────
describe('T-471 c: the dishonour_details fallback (Ajay, 722c548a)', () => {
  const SIGNED_TAIL =
    'bank memo reference number (if not given: [To be confirmed: bank memo reference number])';

  it('is exactly the signed description', () => {
    const file = path.join(__dirname, '../config/document-rules/legal_notice_s138.json');
    const raw = fs.readFileSync(file, 'utf8');
    const pack = JSON.parse(raw);
    const found: Array<{ id?: string; description?: string }> = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (o.id === 'dishonour_details') found.push(o as { id: string; description?: string });
        Object.values(o).forEach(walk);
      }
    };
    walk(pack);
    const withDesc = found.filter((f) => typeof f.description === 'string');
    expect(withDesc).toHaveLength(1);
    expect(withDesc[0].description).toBe(
      `Date of dishonour, reason for dishonour as the return memo gives it, ${SIGNED_TAIL}`,
    );
    expect(raw.split(SIGNED_TAIL)).toHaveLength(2);
  });
});

// ── d ───────────────────────────────────────────────────────────────────────
describe('T-471 d: the six drafter prompts carry the signed rule-4 sentence once (722c548a, acbec79f)', () => {
  const BLANK =
    'Never write that a fact is missing, not given or not stated in the brief, the facts or the instructions; print only its blank in the form [To be confirmed: …].';
  const PLACEHOLDER =
    'Never write that a fact is missing, not given or not stated in the brief, the facts or the instructions; print only its placeholder in the form {{MISSING: …}}.';

  it.each([
    ['DRAFTER_PACK_SYSTEM_PROMPT', DRAFTER_PACK_SYSTEM_PROMPT, BLANK, PLACEHOLDER],
    ['DRAFTER_REPAIR_SYSTEM_PROMPT', DRAFTER_REPAIR_SYSTEM_PROMPT, BLANK, PLACEHOLDER],
    ['DRAFTER_GUIDED_SYSTEM_PROMPT', DRAFTER_GUIDED_SYSTEM_PROMPT, BLANK, PLACEHOLDER],
    ['DRAFTER_LEDGER_SYSTEM_PROMPT', DRAFTER_LEDGER_SYSTEM_PROMPT, PLACEHOLDER, BLANK],
    [
      'DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT',
      DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT,
      PLACEHOLDER,
      BLANK,
    ],
    ['DRAFTER_FACT_REPAIR_SYSTEM_PROMPT', DRAFTER_FACT_REPAIR_SYSTEM_PROMPT, PLACEHOLDER, BLANK],
  ])('%s', (_name, prompt, own, other) => {
    expect(prompt.split(own)).toHaveLength(2);
    expect(prompt).not.toContain(other); // the brief prompts say "blank", the ledger prompts "placeholder"
    expect(prompt).toContain(`. ${own}`); // appended to a rule, not a rule of its own
    // the ellipsis is U+2026, not three dots
    expect(own.includes('…')).toBe(true);
    expect(own.includes('...')).toBe(false);
  });
});

// ── e ───────────────────────────────────────────────────────────────────────
describe('T-471 e: no {{MISSING: ...}} survives to the user (Ajay, acbec79f)', () => {
  const LABELS = [
    'bank memo reference number',
    'Name of the proprietor (if the drawer is a proprietorship firm)',
    'relation and name of parent or spouse',
  ];
  const DRAFT = [
    `1. That the cheque was dishonoured, memo no. {{MISSING: ${LABELS[0]}}}.`,
    `2. That the notice is addressed to {{ MISSING : ${LABELS[1]} }}, proprietor of Demo Traders.`,
    `3. That the client, {{missing: ${LABELS[2]}}}, says so; again {{MISSING: ${LABELS[0]}}}.`,
  ].join('\n\n');
  const EXPECTED = [LABELS[0], LABELS[1], LABELS[2], LABELS[0]].map(
    (l) => `[To be confirmed: ${l}]`,
  );

  const noneLeft = (text: string) => {
    expect(text).not.toMatch(/\{\{\s*MISSING/i);
    expect(text).not.toContain('{{');
    for (const e of EXPECTED) expect(text).toContain(e);
    expect(text.split('[To be confirmed:')).toHaveLength(EXPECTED.length + 1);
  };

  it('missingAsBlanks', () => {
    noneLeft(missingAsBlanks(DRAFT));
  });

  it('the PDF export path: contentToHtml (with and without blank highlighting) and blanksInContent', () => {
    noneLeft(contentToHtml(DRAFT, false));
    noneLeft(contentToHtml(DRAFT.replace(/\n\n/g, '\r\n\r\n'), false));
    const blanks = blanksInContent(DRAFT);
    expect(blanks).toHaveLength(EXPECTED.length);
  });

  it('the review link renders the same text', async () => {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'Ledger draft',
      docType: 'bail_application',
      generatedContent: encrypt(DRAFT),
    });
    await ReviewToken.create({
      token: 'round5-missing-token',
      documentId: doc._id,
      assignedTo: 'Adv. Kumar',
      expiresAt: new Date(Date.now() + 86_400_000),
      createdBy: USER_ID,
    });
    const res = await request(app).get('/review/round5-missing-token');
    expect(res.status).toBe(200);
    noneLeft(res.body.document.content);

    // an edited draft (finalContent) is converted the same way
    await LawieDocument.updateOne({ _id: doc._id }, { $set: { finalContent: encrypt(DRAFT) } });
    const res2 = await request(app).get('/review/round5-missing-token');
    noneLeft(res2.body.document.content);
  });
});
