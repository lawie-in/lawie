/**
 * T-705 — shared fixtures for the revision tests (tests only). The jest.mock of the
 * Anthropic SDK stays in each test file; everything else a revision test needs is here.
 */
import fs from 'fs';
import path from 'path';

import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

import { sdkAnswer } from './sdkStream';
import { createVerifiedUser } from './verifiedUser';

export const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
export const MODEL = 'claude-sonnet-4-5-20250929';
export const COURT_ID = 'district_sessions_patna';

export function headersFor(userId: string) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const PACK = loadRulePack('bail_regular')!;
export const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const FIRST_GROUND = buildChecklist(PACK).find((i) => i.key === 'grounds_for_bail')!.options[0];

export const COURT = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

export const VALUES = [
  {
    key: 'applicant_name',
    value: 'Ram Kumar',
    source: 'description',
    quote: 'My client Ram Kumar',
  },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  {
    key: 'facts_narrative',
    value:
      'The applicant was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

const BODY_PARAS = [
  '1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen. He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.',
  '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
  '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
];

/** The first draft's body. */
export const BODY = [
  ...BODY_PARAS,
  '4. That the applicant has deep roots in society and will not flee from justice.',
].join('\n\n');

/** The body a revision returns: the same facts, paragraph 4 reworded. */
export function revisedBody(n = 1): string {
  return [
    ...BODY_PARAS,
    `4. That the applicant has deep roots in society, revision ${n}, and will not flee from justice.`,
  ].join('\n\n');
}

export function drafterAnswer(body = BODY): string {
  return `${body}\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((id) => `${id}: 1`).join('\n')}`;
}

/** The last `event: name` payload in an SSE response body. */
export function sseEvent(text: string, name: string): Record<string, unknown> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}

/** The repo root of this workspace's worktree (apps/drafting/src/__tests__ is 4 levels down). */
const REPO_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Ajay's signed drafter block, read from his sign-off file: the first blockquote
 * under "(a) Drafter instruction block", with the "> " stripped.
 */
export function signedRevisionBlock(): string {
  const md = fs.readFileSync(
    path.join(REPO_ROOT, 'handoff/legal/T-703-T-705-signoff-ajay.md'),
    'utf8',
  );
  const after = md.split('**(a) Drafter instruction block')[1];
  const line = after.split('\n').find((l) => l.startsWith('> '));
  if (!line) throw new Error('signed block not found');
  return line.slice(2);
}

/** The app settings, the court and a verified user holding `topup` units of Ink (2 units = 1 Ink). */
export async function seedWorld(userId: string, topup = 2000): Promise<void> {
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.revisions', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
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
  await createVerifiedUser({
    _id: userId,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: topup,
  });
}

export interface RawUser {
  inkSub: number;
  inkAnnualCarry: number;
  inkTopup: number;
  inkHolds: Array<{
    runId: string;
    runSequence: number;
    units: number;
    reason?: string;
  }>;
}

export async function rawUser(userId: string): Promise<RawUser> {
  return (await User.collection.findOne({
    _id: new mongoose.Types.ObjectId(userId),
  })) as unknown as RawUser;
}

export function inkLedger(userId: string) {
  return mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: new mongoose.Types.ObjectId(userId) })
    .sort({ createdAt: 1, runSequence: 1 })
    .toArray();
}

export type ModelMock = jest.Mock;

/**
 * Make a delivered draft through the real route (stubbed model) and return its ids.
 * `mock` is the test file's SDK stream mock.
 */
export async function makeDraft(
  mock: ModelMock,
  userId: string,
  extra: Record<string, unknown> = {},
): Promise<{ docId: string; runId: string }> {
  mock.mockReset();
  mock.mockResolvedValueOnce(sdkAnswer(drafterAnswer(), 4000, 800));
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headersFor(userId))
    .send({ kind: 'bail_regular', values: VALUES, court: COURT, ...extra });
  const done = sseEvent(res.text, 'done');
  if (res.status !== 200 || !done) throw new Error(`draft did not finish: ${res.status}`);
  return { docId: String(done.docId), runId: String(done.runId) };
}

/** POST /:id/revise with the next model answer(s) queued. */
export async function revise(
  mock: ModelMock,
  userId: string,
  docId: string,
  body: Record<string, unknown>,
  answers: Array<string | Error> = [drafterAnswer(revisedBody())],
  usage: { input: number; output: number } = { input: 4000, output: 800 },
) {
  mock.mockReset();
  for (const a of answers) {
    if (a instanceof Error) mock.mockRejectedValueOnce(a);
    else mock.mockResolvedValueOnce(sdkAnswer(a, usage.input, usage.output));
  }
  return request(app).post(`/${docId}/revise`).set(headersFor(userId)).send(body);
}

export const NOTE = 'Make the last paragraph stronger please';
