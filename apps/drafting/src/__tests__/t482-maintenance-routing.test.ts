/**
 * T-482 (Ajay 9ad6a8f1, 656332c9): maintenance_bnss_144 is found by natural requests.
 *
 * C  the pack's description and match terms equal Ajay's signed text (parsed from the T-245 file)
 * D  the match prompt carries the terms, uncut; the system prompt has the divorce/DV/HAMA rule
 * E  POST /intake with a mocked model: a high match reaches the pack; medium lists the packs side by side
 *
 * No real model call.
 */
import './setupDb';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

import { createHash } from 'crypto';

import request from 'supertest';

import app from '../app';
import { seedVerifiedUsers } from './verifiedUser';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { getCatalogue } from '../services/intake.service';
import { buildMatchUserPrompt, MATCH_SYSTEM_PROMPT } from '../services/intake.prompts';
import { loadTemplateConfig } from '../services/template-engine.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const MAINT = 'maintenance_bnss_144';
const SIGNED_FILE = 'handoff/legal/T-245-old-new-law-switch-signed.md';
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const RULE = JSON.parse(
  readFileSync(join(__dirname, '..', 'config', 'document-rules', `${MAINT}.json`), 'utf8'),
) as { _meta: { description: string; match_terms: string[] } };

const SHORT_DESCRIPTION =
  'Maintenance application under Section 144 BNSS (old s.125 CrPC) by a wife, child or parent unable to maintain themselves.';
const TERMS_25 = [
  'maintenance',
  'monthly maintenance',
  'interim maintenance',
  'Section 144 BNSS',
  'Section 125 CrPC',
  'bharan-poshan',
  'bharan poshan',
  'guzara bhatta',
  'guzara',
  'kharcha',
  'kharcha-pani',
  'wife',
  'patni',
  'child',
  'children',
  'bachcha',
  'bachche',
  'parents',
  'mata-pita',
  'maa-baap',
  'भरण-पोषण',
  'गुजारा भत्ता',
  'पत्नी',
  'बच्चे',
  'माता-पिता',
];

function signedText(marker = 'T-482 byte-check points'): string | null {
  const read = (): string => {
    try {
      return readFileSync(join(REPO_ROOT, SIGNED_FILE), 'utf8');
    } catch {
      return '';
    }
  };
  let text = read();
  if (!text.includes(marker)) {
    try {
      text = execFileSync(
        'git',
        ['-C', REPO_ROOT, 'show', `origin/develop_staging:${SIGNED_FILE}`],
        {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
        },
      );
    } catch {
      text = '';
    }
  }
  return text.includes(marker) ? text : null;
}

describe('T-482 C: pack content equals the signed text', () => {
  it('literal pins: the short description and the 25 terms', () => {
    expect(RULE._meta.description).toBe(SHORT_DESCRIPTION);
    expect(SHORT_DESCRIPTION).toHaveLength(121);
    expect(RULE._meta.match_terms).toEqual(TERMS_25);
    expect(TERMS_25).toHaveLength(25);
  });

  it('parsed from the signed file: row (4) description and the Match terms line, byte for byte', () => {
    const text = signedText();
    if (text === null) {
      // eslint-disable-next-line no-console
      console.warn(
        `T-482 signed-text check SKIPPED: "T-482 byte-check points" not found in ${SIGNED_FILE}.`,
      );
      return;
    }
    const row4 = /^\| \(4\) 140-character cut \|.*`(Maintenance application under[^`]+)`/m.exec(
      text,
    );
    expect(row4).not.toBeNull();
    expect(RULE._meta.description).toBe(row4![1]);
    const terms = /^Match terms: (.+)\.$/m.exec(text);
    expect(terms).not.toBeNull();
    expect(RULE._meta.match_terms).toEqual(terms![1].split(', '));
    // the withdrawn 9ad6a8f1 description must not be in the pack
    const withdrawn = /^Description: `([^`]+)`/m.exec(text);
    if (withdrawn) expect(RULE._meta.description).not.toBe(withdrawn[1]);
  });

  it('the promoted template and the catalogue carry them', () => {
    const cfg = loadTemplateConfig(MAINT)!;
    expect(cfg.description).toBe(SHORT_DESCRIPTION);
    const entry = getCatalogue().find((c) => c.template_id === MAINT)!;
    expect(entry.match_terms).toEqual(TERMS_25);
    expect(entry.description).toBe(SHORT_DESCRIPTION);
  });
});

describe('T-482 D: the prompts', () => {
  const matchLine = (): string => {
    const prompt = buildMatchUserPrompt(
      'Wife ke liye maintenance chahiye, Bihar, Gaya',
      getCatalogue(),
    );
    return prompt.split('\n').find((l) => l.startsWith(`${MAINT} |`))!;
  };

  it('the maintenance line is uncut and ends with the 25 terms', () => {
    const line = matchLine();
    expect(line).toBe(
      `${MAINT} | Maintenance Application (s.144 BNSS) | family | ${SHORT_DESCRIPTION} | match terms: ${TERMS_25.join(', ')}`,
    );
    expect(line).toContain('bharan-poshan');
    expect(line).toContain('भरण-पोषण');
  });

  it('no cut ellipsis in the maintenance match line or its description', () => {
    expect(matchLine()).not.toMatch(/…|\.\.\./);
    expect(loadTemplateConfig(MAINT)!.description).not.toMatch(/…|\.\.\./);
  });

  it('a pack with no match terms has no "match terms" column (other lines unchanged)', () => {
    const lines = buildMatchUserPrompt('x', getCatalogue())
      .split('\n')
      .filter((l) => l.includes(' | ') && !l.startsWith(MAINT));
    expect(lines.length).toBeGreaterThan(50);
    for (const l of lines) expect(l).not.toContain('match terms:');
  });

  const SIGNED_SENTENCE =
    '- A catalogue line may end with "match terms": those terms alone are not enough to choose that template when the description also has divorce, Domestic Violence Act (DV Act), Hindu Adoptions and Maintenance Act (HAMA), custody or guardianship words; in that case use confidence "medium" and list it together with those templates in alternatives, so the advocate chooses.';

  it('the system prompt has the signed sentence (59d26051) once, and without it is the prompt before this line (T-610 bail lines included)', () => {
    const line = `${SIGNED_SENTENCE}\n`;
    expect(MATCH_SYSTEM_PROMPT.split(line)).toHaveLength(2);
    // the old wording ("... (DV Act) or Hindu Adoptions ...") is gone
    expect(MATCH_SYSTEM_PROMPT).not.toContain('(DV Act) or Hindu');
    expect(MATCH_SYSTEM_PROMPT).toContain('custody or guardianship words');
    expect(createHash('sha256').update(MATCH_SYSTEM_PROMPT.replace(line, '')).digest('hex')).toBe(
      '8b3e0e769825f31bad96e0495e18db3e27d459151d86fadbc63eda3aa9cb70f3',
    );
  });

  it('the sentence equals the signed text byte for byte (parsed from the T-245 signed file)', () => {
    const text = signedText('## T-482 intake prompt line');
    if (text === null) {
      // eslint-disable-next-line no-console
      console.warn(
        `T-482 signed-sentence check SKIPPED: signed file not readable (${SIGNED_FILE}).`,
      );
      return;
    }
    const section = text.split('## T-482 intake prompt line')[1];
    expect(section).toBeDefined();
    const signed = /^`(- A catalogue line may end with[^\n]+)`$/m.exec(section.split('\n## ')[0]);
    expect(signed).not.toBeNull();
    expect(signed![1]).toBe(SIGNED_SENTENCE);
    expect(MATCH_SYSTEM_PROMPT).toContain(`${signed![1]}\n`);
    expect(Buffer.from(signed![1], 'utf8').equals(Buffer.from(SIGNED_SENTENCE, 'utf8'))).toBe(true);
  });
});

describe('T-482 E: POST /intake routing, mocked model', () => {
  const USER_ID = '507f1f77bcf86cd799439072';
  const MODEL = 'claude-haiku-4-5-20251001';
  const headers = () => ({
    'x-internal-secret': process.env.INTERNAL_SECRET!,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  });
  const DESC =
    'Wife ke liye maintenance chahiye. Bihar, Gaya. Pati ne chhod diya, bharan-poshan nahi de raha.';
  const reply = (o: Record<string, unknown>) =>
    JSON.stringify({
      alternatives: [],
      is_legal_drafting: true,
      is_court_document: true,
      category: 'family',
      ...o,
    });

  beforeEach(async () => {
    mockMessagesStream.mockReset();
    _clearAppSettingsCache();
    await redis.flushall();
    await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
    });
  });

  it('the match call sends the maintenance line with the terms and the new rule', async () => {
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer(reply({ template_id: MAINT, confidence: 'high' }), 900, 100))
      .mockResolvedValue(sdkAnswer(JSON.stringify({ fields: [] }), 900, 100));
    await request(app).post('/intake').set(headers()).send({ description: DESC, language: 'en' });
    const p = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
    const user = p.messages.map((m) => m.content).join('\n');
    expect(user).toContain(DESC);
    expect(user).toContain(
      `${MAINT} | Maintenance Application (s.144 BNSS) | family | ${SHORT_DESCRIPTION} | match terms: `,
    );
    expect(user).toContain('bharan-poshan');
    expect(user).toContain('भरण-पोषण');
    expect(p.system).toContain('Hindu Adoptions and Maintenance Act (HAMA)');
  });

  it('a high-confidence maintenance match reaches the pack', async () => {
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer(reply({ template_id: MAINT, confidence: 'high' }), 900, 100))
      .mockResolvedValue(sdkAnswer(JSON.stringify({ fields: [] }), 900, 100));
    const res = await request(app).post('/intake').set(headers()).send({ description: DESC });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('matched');
    expect(res.body.template_id).toBe(MAINT);
  });

  it('medium with alternatives: the packs are offered side by side, maintenance among them', async () => {
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        reply({
          template_id: MAINT,
          confidence: 'medium',
          alternatives: ['dv_act_complaint', 'divorce_mutual_consent', 'not_a_template'],
        }),
        900,
        100,
      ),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: `${DESC} Divorce bhi chahiye, DV Act bhi.` });
    expect(res.body.outcome).toBe('needs_choice');
    const choices = res.body.choices.map((c: { template_id: string }) => c.template_id);
    expect(choices[0]).toBe(MAINT);
    expect(choices).toEqual([MAINT, 'dv_act_complaint', 'divorce_mutual_consent']);
    expect(choices).not.toContain('not_a_template');
    expect(res.body.template_id).toBeUndefined();
  });
});

seedVerifiedUsers('507f1f77bcf86cd799439072');
