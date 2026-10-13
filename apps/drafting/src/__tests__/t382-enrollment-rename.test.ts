/**
 * T-382 (folded into T-365; Ajay approved a key-only rename) - the pack field for the advocate's
 * bar enrolment number is `advocate_enrollment` (was `advocate_enrolment`) in seven packs.
 * A stored draft or a brief item that still carries the old key reads as the new key
 * (applyFieldAliases: old -> new only when new is absent, never mutating). Preflight F4
 * (vakalatnama) reads the new key. Puppeteer is mocked, as in t311.
 */
import './setupEnv';
import './setupDb';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

/* eslint-disable import/order */
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildAnnexuresPack } from '../services/annexures.service';
import { formDataFromBrief } from '../services/brief-drafter';
import { Brief, buildBrief, buildChecklist } from '../services/intake-brief';
import { preflightCheck } from '../services/preflight.service';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  loadTemplateConfig,
  renderTemplateSection,
  TemplateConfig,
} from '../services/template-engine.service';
import { readFormInputs } from '../utils/case-details';
import { encrypt } from '../utils/encryption';
/* eslint-enable import/order */

jest.setTimeout(60_000);

const PACKS = [
  'bail_before_magistrate',
  'bail_cancellation',
  'default_bail',
  'interim_bail',
  'surrender_application',
  'suspension_of_sentence',
  'vakalatnama',
] as const;
const NEW = 'advocate_enrollment';
const OLD = 'advocate_enrolment';
const NUM = 'BIH/4321/2012';
const OLD_NUM = 'OLD/1/2001';
const RULES = join(__dirname, '..', 'config', 'document-rules');

function config(id: string): TemplateConfig {
  const c = loadTemplateConfig(id);
  if (!c) throw new Error(`${id} template missing`);
  return c;
}

// ── The packs ────────────────────────────────────────────────────────────────

describe.each(PACKS)('T-382 pack file %s', (pack) => {
  const raw = readFileSync(join(RULES, `${pack}.json`), 'utf8');

  it('declares advocate_enrollment and no longer says advocate_enrolment', () => {
    expect(raw).toContain(`"name": "${NEW}"`);
    expect(raw).not.toContain(OLD);
  });

  it('the rule pack loads the new key in its checklist and not the old one', () => {
    const keys = buildChecklist(loadRulePack(pack)!).map((i) => i.key);
    expect(keys).toContain(NEW);
    expect(keys).not.toContain(OLD);
  });
});

describe('T-382 vakalatnama prose is unchanged', () => {
  it('"Bar Council enrolment format" is still in the validation text', () => {
    const raw = readFileSync(join(RULES, 'vakalatnama.json'), 'utf8');
    expect(raw).toContain('Bar Council enrolment format');
    expect(raw).toContain('advocate_enrollment must follow Bar Council enrolment format');
  });
});

// ── readFormInputs ───────────────────────────────────────────────────────────

describe('T-382 readFormInputs reads an old-key draft as the new key', () => {
  const enc = (o: unknown) => ({ formInputsEnc: encrypt(JSON.stringify(o)) });
  const plain = (o: unknown) => ({ formInputs: o });
  const shapes: Array<[string, (o: unknown) => Parameters<typeof readFormInputs>[0]]> = [
    ['encrypted', enc],
    ['plain', plain],
  ];

  describe.each(shapes)('%s row', (_n, mk) => {
    it('only the old key: the new key is filled, the old one stays', () => {
      const out = readFormInputs(mk({ applicant_name: 'R', [OLD]: OLD_NUM }))!;
      expect(out[NEW]).toBe(OLD_NUM);
      expect(out[OLD]).toBe(OLD_NUM);
      expect(out.applicant_name).toBe('R');
    });
    it('both keys: the new key wins', () => {
      const out = readFormInputs(mk({ [OLD]: OLD_NUM, [NEW]: NUM }))!;
      expect(out[NEW]).toBe(NUM);
    });
    it('only the new key: unchanged', () => {
      expect(readFormInputs(mk({ [NEW]: NUM }))).toEqual({ [NEW]: NUM });
    });
    it('an empty object stays empty', () => {
      expect(readFormInputs(mk({}))).toEqual({});
    });
  });

  it('null and empty carriers are unchanged', () => {
    expect(readFormInputs({})).toBeNull();
    expect(readFormInputs({ formInputs: null })).toBeNull();
    expect(readFormInputs({ formInputsEnc: null, formInputs: undefined })).toBeNull();
    expect(readFormInputs({ formInputsEnc: '', formInputs: null })).toBeNull();
    expect(readFormInputs({ formInputsEnc: '', formInputs: { a: 1 } })).toEqual({ a: 1 });
  });

  it('the stored plain object is not mutated', () => {
    const stored = { [OLD]: OLD_NUM };
    const out = readFormInputs({ formInputs: stored })!;
    expect(out).not.toBe(stored);
    expect(stored).toEqual({ [OLD]: OLD_NUM });
    expect(NEW in stored).toBe(false);
  });
});

// ── formDataFromBrief ────────────────────────────────────────────────────────

describe('T-382 formDataFromBrief', () => {
  const cfg = config('default_bail');
  const briefOf = (): Brief =>
    buildBrief({
      kind: { id: 'default_bail', name: 'default_bail', court_document: true },
      checklist: buildChecklist(loadRulePack('default_bail')!),
      values: [],
    }) as Brief;
  const withKey = (key: string, patch: Record<string, unknown>): Brief => {
    const b = briefOf();
    const item = b.items.find((i) => i.key === NEW)!;
    return {
      ...b,
      items: [...b.items.filter((i) => i.key !== NEW), { ...item, key, ...patch }],
    } as Brief;
  };

  it('a brief item keyed with the old name fills the new key', () => {
    const fd = formDataFromBrief(withKey(OLD, { value: OLD_NUM, unconfirmed: false }), cfg, 'en');
    expect(fd[NEW]).toBe(OLD_NUM);
  });
  it('an item keyed with the new name is kept as typed', () => {
    const fd = formDataFromBrief(withKey(NEW, { value: NUM, unconfirmed: false }), cfg, 'en');
    expect(fd[NEW]).toBe(NUM);
    expect(OLD in fd).toBe(false);
  });
  it('an empty enrollment item gets its placeholder under the new key', () => {
    const fd = formDataFromBrief(briefOf(), cfg, 'en');
    expect(typeof fd[NEW]).toBe('string');
    expect(String(fd[NEW])).toContain('[To be confirmed');
  });
  it('the empty advocate_name skip still works', () => {
    const fd = formDataFromBrief(briefOf(), cfg, 'en');
    expect('advocate_name' in fd).toBe(false);
  });
});

// ── Preflight F4 ─────────────────────────────────────────────────────────────

describe('T-382 preflight F4 (vakalatnama)', () => {
  const hits = async (formData: Record<string, unknown>) =>
    preflightCheck('vakalatnama', { applicant_name: 'R', ...formData });
  const expectHardF4 = (res: Awaited<ReturnType<typeof hits>>) => {
    expect(res._meta?.rule_hits).toContain('F4');
    expect(res.verdict).toBe('hard');
    expect(res.hardBlockReason).toContain('Bar enrolment number is missing');
  };
  const expectNoF4 = (res: Awaited<ReturnType<typeof hits>>) => {
    expect(res._meta?.rule_hits).not.toContain('F4');
    expect(res.hardBlockReason ?? '').not.toContain('Bar enrolment number is missing');
  };

  it('advocate_enrollment present: no F4', async () => {
    expectNoF4(await hits({ [NEW]: NUM }));
  });
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['missing', undefined],
  ])('%s: hard F4', async (_l, v) => {
    expectHardF4(await hits({ [NEW]: v }));
  });
  it('only the old key: no F4 (aliased)', async () => {
    expectNoF4(await hits({ [OLD]: OLD_NUM }));
  });
  it('advocate_enrolment_no alone: hard F4 (that read is gone)', async () => {
    expectHardF4(await hits({ advocate_enrolment_no: NUM }));
  });
});

// ── A typed number prints ────────────────────────────────────────────────────

describe.each(PACKS)('T-382 a typed advocate_enrollment prints, %s', (pack) => {
  it('in the draft (enrollment_number in the placeholder context, T-311 path)', () => {
    const cfg = config(pack);
    const ctx = buildPlaceholderContext(
      cfg,
      { applicant_name: 'Ramesh Kumar', advocate_name: 'Adv. Typed', [NEW]: NUM },
      { advocateName: 'Adv. Profile', enrollmentNumber: 'PROF/9/2000' },
    );
    expect(ctx.enrollment_number).toBe(NUM);
    const all = cfg.document_structure.sections
      .filter((s) => s.type === 'template')
      .map((s) => renderTemplateSection(s, ctx).content)
      .join('\n');
    expect(all).toContain(NUM);
    expect(all).not.toContain('PROF/9/2000');
  });
});

describe('T-382 annexures print a typed advocate_enrollment', () => {
  async function html(formData: Record<string, unknown>): Promise<string> {
    const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
    const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
    let out = '';
    page.setContent.mockImplementation((h: string) => {
      out = h;
      return Promise.resolve(undefined);
    });
    await buildAnnexuresPack({
      formData,
      bodyParaCount: 8,
      advocateName: 'Adv. Profile',
      enrollmentNumber: 'PROF/9/2000',
    });
    return out;
  }
  it.each(['default_bail', 'vakalatnama'])(
    '%s: the typed number prints, not the profile one',
    async (id) => {
      const out = await html({ template_id: id, applicant_name: 'R', [NEW]: NUM });
      expect(out.split(NUM).length - 1).toBeGreaterThanOrEqual(1);
      expect(out).not.toContain('PROF/9/2000');
    },
  );
});
