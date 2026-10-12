/**
 * T-311 - drafting reads the advocate's enrolment number from the profile.
 * Ajay's pairing rule (12 Oct 2026): a typed number always prints (a "[To be confirmed: ...]"
 * placeholder included); else the profile number, only when the printed advocate name came from
 * the profile; else the blank. Same rule in the draft, the annexures and the legacy route.
 * Typed sources: the declared advocate_enrollment (draft, annexures), the body advocateEnrollment
 * (legacy). A client enrollment_number is never read.
 * Puppeteer is mocked, as in annexures.test.ts.
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
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as aiService from '../services/ai.service';
import { buildAnnexuresPack } from '../services/annexures.service';
import {
  buildPlaceholderContext,
  loadTemplateConfig,
  renderTemplateSection,
  resolveEnrollmentNumber,
  TemplateConfig,
} from '../services/template-engine.service';
import { sdkAnswer } from './sdkStream';
/* eslint-enable import/order */

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(60_000);

function config(id: string): TemplateConfig {
  const c = loadTemplateConfig(id);
  if (!c) throw new Error(`${id} template missing`);
  return c;
}

const PROFILE_NAME = 'Adv. Profile Name';
const TYPED_NAME = 'Adv. Typed Name';
const PROFILE_NUM = 'PROF/111/2010';
const TYPED_NUM = 'TYPED/222/2015';
const TBC = '[To be confirmed: enrolment number]';
const DRAFT_BLANK = '____________________';
const ANNEX_BLANK = '___________';
const FORGED = 'ZZ-FORGED-ENR-9137';

const EMPTY: Array<[string, unknown]> = [
  ['empty', ''],
  ['whitespace', '  \t '],
  ['null', null],
  ['missing', undefined],
];

describe('resolveEnrollmentNumber', () => {
  it('typed wins, with or without a profile name', () => {
    expect(resolveEnrollmentNumber(TYPED_NUM, PROFILE_NUM, true)).toBe(TYPED_NUM);
    expect(resolveEnrollmentNumber(TYPED_NUM, PROFILE_NUM, false)).toBe(TYPED_NUM);
    expect(resolveEnrollmentNumber(TBC, PROFILE_NUM, true)).toBe(TBC);
  });
  it.each(EMPTY)('%s typed: the profile number only when the name is the profile’s', (_l, v) => {
    expect(resolveEnrollmentNumber(v, PROFILE_NUM, true)).toBe(PROFILE_NUM);
    expect(resolveEnrollmentNumber(v, PROFILE_NUM, false)).toBeUndefined();
    expect(resolveEnrollmentNumber(v, undefined, true)).toBeUndefined();
    expect(resolveEnrollmentNumber(v, '   ', true)).toBeUndefined();
  });
});

// ── Draft context ────────────────────────────────────────────────────────────

describe('T-311 draft context (buildPlaceholderContext)', () => {
  const declares = config('criminal_revision'); // declares advocate_name and advocate_enrollment
  const undeclared = config('default_bail'); // declares advocate_name only
  const BASE = { applicant_name: 'Ramesh Kumar' };

  const num = (
    cfg: TemplateConfig,
    form: Record<string, unknown>,
    extra: { advocateName?: string; enrollmentNumber?: string },
  ) => buildPlaceholderContext(cfg, { ...BASE, ...form }, extra).enrollment_number;

  describe('pack declares advocate_enrollment', () => {
    it('name from the profile, typed number: typed prints, never the profile’s', () => {
      const n = num(
        declares,
        { advocate_enrollment: TYPED_NUM },
        { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM },
      );
      expect(n).toBe(TYPED_NUM);
    });
    it.each(EMPTY)('name from the profile, number %s: the profile number', (_l, v) => {
      expect(
        num(
          declares,
          { advocate_enrollment: v },
          { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM },
        ),
      ).toBe(PROFILE_NUM);
    });
    it('name from the profile, number empty, no profile number or lookup failed: the blank', () => {
      expect(num(declares, {}, { advocateName: PROFILE_NAME })).toBe(DRAFT_BLANK);
      expect(num(declares, {}, { advocateName: PROFILE_NAME, enrollmentNumber: '  ' })).toBe(
        DRAFT_BLANK,
      );
    });
    it('typed name, typed number: typed prints', () => {
      expect(
        num(
          declares,
          { advocate_name: TYPED_NAME, advocate_enrollment: TYPED_NUM },
          { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM },
        ),
      ).toBe(TYPED_NUM);
    });
    it.each(EMPTY)('typed name, number %s: the blank, never the profile’s', (_l, v) => {
      const ctx = buildPlaceholderContext(
        declares,
        { ...BASE, advocate_name: TYPED_NAME, advocate_enrollment: v },
        { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM },
      );
      expect(ctx.advocate_name).toBe(TYPED_NAME);
      expect(ctx.enrollment_number).toBe(DRAFT_BLANK);
    });
    it('"[To be confirmed: ...]" name counts as typed: no profile number', () => {
      expect(
        num(
          declares,
          { advocate_name: '[To be confirmed: name of advocate]' },
          { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM },
        ),
      ).toBe(DRAFT_BLANK);
    });
    it('no name at all: typed number prints, empty is the blank', () => {
      expect(num(declares, { advocate_enrollment: TYPED_NUM }, {})).toBe(TYPED_NUM);
      expect(num(declares, {}, { enrollmentNumber: PROFILE_NUM })).toBe(DRAFT_BLANK);
      expect(num(declares, { advocate_enrollment: ' ' }, {})).toBe(DRAFT_BLANK);
    });
    it('a "[To be confirmed: ...]" number stays as typed', () => {
      const extra = { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM };
      expect(num(declares, { advocate_enrollment: TBC }, extra)).toBe(TBC);
      expect(num(declares, { advocate_name: TYPED_NAME, advocate_enrollment: TBC }, extra)).toBe(
        TBC,
      );
    });
  });

  describe('pack does not declare advocate_enrollment (default_bail)', () => {
    it('profile name and profile number: the profile number', () => {
      expect(
        num(undeclared, {}, { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM }),
      ).toBe(PROFILE_NUM);
    });
    it('profile name, no profile number: the blank', () => {
      expect(num(undeclared, {}, { advocateName: PROFILE_NAME })).toBe(DRAFT_BLANK);
    });
    it('typed name (declared for advocate_name): no profile number, the blank', () => {
      expect(
        num(
          undeclared,
          { advocate_name: TYPED_NAME },
          { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM },
        ),
      ).toBe(DRAFT_BLANK);
    });
    it('a client advocate_enrollment is ignored: the profile number or the blank', () => {
      const extra = { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM };
      expect(num(undeclared, { advocate_enrollment: FORGED }, extra)).toBe(PROFILE_NUM);
      expect(num(undeclared, { advocate_enrollment: FORGED }, {})).toBe(DRAFT_BLANK);
    });
  });

  describe('a client enrollment_number never prints (list A)', () => {
    it.each([
      ['declaring pack', declares],
      ['non-declaring pack', undeclared],
    ])('%s', (_l, cfg) => {
      const withProfile = buildPlaceholderContext(
        cfg,
        { ...BASE, enrollment_number: FORGED },
        { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM },
      );
      expect(withProfile.enrollment_number).toBe(PROFILE_NUM);
      const none = buildPlaceholderContext(cfg, { ...BASE, enrollment_number: FORGED }, {});
      expect(none.enrollment_number).toBe(DRAFT_BLANK);
      expect(JSON.stringify([withProfile, none])).not.toContain(FORGED);
    });
  });

  describe('legal_notice_s138 and _s80 print {advocate_enrollment}', () => {
    it.each(['legal_notice_s138', 'legal_notice_s80'])('%s', (id) => {
      const cfg = config(id);
      const extra = { advocateName: PROFILE_NAME, enrollmentNumber: PROFILE_NUM };
      const text = (form: Record<string, unknown>, e: typeof extra | object) => {
        const ctx = buildPlaceholderContext(cfg, { ...BASE, ...form }, e);
        return {
          ctx,
          text: cfg.document_structure.sections
            .filter((s) => s.type === 'template' && s.template)
            .map((s) => renderTemplateSection(s, ctx).content)
            .join('\n'),
        };
      };
      const profile = text({}, extra);
      expect(profile.ctx.advocate_enrollment).toBe(PROFILE_NUM);
      expect(profile.text).toContain(PROFILE_NUM);

      const typed = text({ advocate_enrollment: TYPED_NUM }, extra);
      expect(typed.ctx.advocate_enrollment).toBe(TYPED_NUM);
      expect(typed.text).toContain(TYPED_NUM);
      expect(typed.text).not.toContain(PROFILE_NUM);

      const typedName = text({ advocate_name: TYPED_NAME }, extra);
      expect(typedName.text).not.toContain(PROFILE_NUM);
    });
  });
});

// ── Annexures ────────────────────────────────────────────────────────────────

async function annexuresHtml(
  formData: Record<string, unknown>,
  advocateName?: string,
  enrollmentNumber?: string,
): Promise<string> {
  const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
  const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
  let html = '';
  page.setContent.mockImplementation((h: string) => {
    html = h;
    return Promise.resolve(undefined);
  });
  await buildAnnexuresPack({ formData, bodyParaCount: 8, advocateName, enrollmentNumber });
  return html;
}

const count = (html: string, s: string) => html.split(s).length - 1;

describe('T-311 annexures (Memo of Parties and Vakalatnama)', () => {
  const form = (extra: Record<string, unknown> = {}) => ({
    template_id: 'criminal_revision',
    applicant_name: 'Ramesh Kumar',
    ...extra,
  });

  /** The number appears at least in the Memo of Parties and the Vakalatnama. */
  const printedTwice = (html: string, n: string) =>
    expect(count(html, n)).toBeGreaterThanOrEqual(2);

  it('profile name, typed number: typed prints in both, not the profile’s', async () => {
    const html = await annexuresHtml(
      form({ advocate_enrollment: TYPED_NUM }),
      PROFILE_NAME,
      PROFILE_NUM,
    );
    printedTwice(html, TYPED_NUM);
    expect(html).not.toContain(PROFILE_NUM);
  });
  it.each(EMPTY)('profile name, number %s: the profile number in both', async (_l, v) => {
    const html = await annexuresHtml(form({ advocate_enrollment: v }), PROFILE_NAME, PROFILE_NUM);
    printedTwice(html, PROFILE_NUM);
  });
  it('profile name, no profile number: the blank in both', async () => {
    const html = await annexuresHtml(form(), PROFILE_NAME);
    expect(html).toContain(`Bar Enrolment No.: ${ANNEX_BLANK}`);
    expect(html).not.toContain(PROFILE_NUM);
  });
  it('typed name, typed number: typed prints in both', async () => {
    const html = await annexuresHtml(
      form({ advocate_name: TYPED_NAME, advocate_enrollment: TYPED_NUM }),
      PROFILE_NAME,
      PROFILE_NUM,
    );
    printedTwice(html, TYPED_NUM);
    expect(html).not.toContain(PROFILE_NUM);
  });
  it('typed name, empty number: the blank, never the profile’s', async () => {
    const html = await annexuresHtml(
      form({ advocate_name: TYPED_NAME, advocate_enrollment: '  ' }),
      PROFILE_NAME,
      PROFILE_NUM,
    );
    expect(html).toContain(TYPED_NAME);
    expect(html).toContain(`Bar Enrolment No.: ${ANNEX_BLANK}`);
    expect(html).not.toContain(PROFILE_NUM);
  });
  it('no name, typed number prints; empty number is the blank', async () => {
    printedTwice(
      await annexuresHtml(form({ advocate_enrollment: TYPED_NUM }), undefined, PROFILE_NUM),
      TYPED_NUM,
    );
    const blank = await annexuresHtml(form(), undefined, PROFILE_NUM);
    expect(blank).toContain(`Bar Enrolment No.: ${ANNEX_BLANK}`);
    expect(blank).not.toContain(PROFILE_NUM);
  });
  it('a "[To be confirmed: ...]" number stays as typed', async () => {
    const html = await annexuresHtml(form({ advocate_enrollment: TBC }), PROFILE_NAME, PROFILE_NUM);
    expect(html).toContain('[To be confirmed: enrolment number]');
    expect(html).not.toContain(PROFILE_NUM);
  });
  it('a client enrollment_number is never read, declared or not', async () => {
    for (const templateId of ['criminal_revision', 'default_bail']) {
      const html = await annexuresHtml(
        { template_id: templateId, applicant_name: 'Ramesh Kumar', enrollment_number: FORGED },
        PROFILE_NAME,
        PROFILE_NUM,
      );
      expect(html).not.toContain(FORGED);
      expect(html).toContain(PROFILE_NUM);
    }
  });
  it('enrollment_number empty but advocate_enrollment typed: the typed one prints', async () => {
    const html = await annexuresHtml(
      form({ enrollment_number: '', advocate_enrollment: TYPED_NUM }),
      PROFILE_NAME,
      PROFILE_NUM,
    );
    printedTwice(html, TYPED_NUM);
  });
  it('a pack that does not declare advocate_enrollment: a typed one is ignored, the profile pairs', async () => {
    const html = await annexuresHtml(
      { template_id: 'default_bail', applicant_name: 'R', advocate_enrollment: FORGED },
      PROFILE_NAME,
      PROFILE_NUM,
    );
    expect(html).not.toContain(FORGED);
    printedTwice(html, PROFILE_NUM);
  });
});

// ── Legacy POST /generate and the template route ─────────────────────────────

describe('T-311 routes', () => {
  const USER_ID = '507f1f77bcf86cd7994393a1';
  const OTHER_ID = '507f1f77bcf86cd7994393a2';
  const MODEL = 'claude-sonnet-4-5-20250929';
  const headers = (id = USER_ID) => ({
    'x-internal-secret': process.env.INTERNAL_SECRET!,
    'x-user-id': id,
    'x-user-email': 'test@test.com',
    'x-user-name': PROFILE_NAME,
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  });

  /** Auth owns the field and writes it; the raw collection stands in for auth. */
  const setProfileNumber = (id: string, n: string) =>
    User.collection.updateOne(
      { _id: new (jest.requireActual('mongoose').Types.ObjectId)(id) },
      { $set: { enrollmentNumber: n } },
    );

  let spy: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(async () => {
    _clearAppSettingsCache();
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementation(async () =>
      sdkAnswer('1. The petitioner submits.', 1000, 200),
    );
    await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
    });
    for (const _id of [USER_ID, OTHER_ID]) {
      await User.create({
        _id,
        plan: 'free',
        planTier: 'free',
        inkSub: 0,
        inkAnnualCarry: 0,
        inkTopup: 2000,
      });
    }
    spy = jest.spyOn(aiService, 'streamGenerateDocument');
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  });
  afterEach(() => {
    spy.mockRestore();
    warn.mockRestore();
    jest.restoreAllMocks();
  });

  describe('legacy POST /generate', () => {
    const body = (extra: Record<string, unknown> = {}) => ({
      docType: 'petition',
      courtName: 'Patna High Court',
      courtType: 'high_court',
      keyFacts: 'The petitioner was denied a ration card without reason.',
      reliefPrayer: 'Issue the ration card.',
      ...extra,
    });
    const post = (extra: Record<string, unknown>, id = USER_ID) =>
      request(app).post('/generate').set(headers(id)).send(body(extra));
    const sent = () =>
      spy.mock.calls[0][0] as { advocateName?: string; advocateEnrollment?: string };

    it('profile name, typed number: the body number prints in "Enrl. No."', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      const res = await post({ advocateEnrollment: TYPED_NUM });
      expect(res.status).toBe(200);
      expect(res.text).toContain(`Enrl. No. ${TYPED_NUM}`);
      expect(res.text).not.toContain(PROFILE_NUM);
    });
    it.each([
      ['empty', ''],
      ['whitespace', '   '],
      ['missing', undefined],
    ])('profile name, number %s: the profile number', async (_l, v) => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      const res = await post({ advocateEnrollment: v });
      expect(res.status).toBe(200);
      expect(sent().advocateName).toBe(PROFILE_NAME);
      expect(sent().advocateEnrollment).toBe(PROFILE_NUM);
      expect(res.text).toContain(`Enrl. No. ${PROFILE_NUM}`);
    });
    it('profile name, no profile number: no "Enrl. No." line, not refused', async () => {
      const res = await post({});
      expect(res.status).toBe(200);
      expect(sent().advocateEnrollment).toBeUndefined();
      expect(res.text).not.toContain('Enrl. No.');
    });
    it('typed name, typed number: typed prints', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      const res = await post({ advocateName: TYPED_NAME, advocateEnrollment: TYPED_NUM });
      expect(res.status).toBe(200);
      expect(res.text).toContain(`Enrl. No. ${TYPED_NUM}`);
    });
    it('typed name, empty number: no "Enrl. No." line, never the profile’s', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      const res = await post({ advocateName: TYPED_NAME, advocateEnrollment: '' });
      expect(res.status).toBe(200);
      expect(sent().advocateName).toBe(TYPED_NAME);
      expect(sent().advocateEnrollment).toBeUndefined();
      expect(res.text).not.toContain('Enrl. No.');
      expect(res.text).not.toContain(PROFILE_NUM);
    });
    it('a "[To be confirmed: ...]" number stays as typed', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      const res = await post({ advocateEnrollment: TBC });
      expect(res.status).toBe(200);
      expect(sent().advocateEnrollment).toBe(TBC);
    });
    it('lookup throws: not refused, treated as empty, warn has userId and error name only', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      failProfileLookup('MongoServerError');
      const res = await post({});
      expect(res.status).toBe(200);
      expect(sent().advocateEnrollment).toBeUndefined();
      expect(res.text).not.toContain('Enrl. No.');
      const call = warn.mock.calls.find((c) => String(c[1]).includes('T-311'));
      expect(call).toBeDefined();
      expect(call![0]).toEqual({ userId: USER_ID, error: 'MongoServerError' });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(PROFILE_NUM);
    });
    it('lookup throws with a typed number: the typed number still prints', async () => {
      failProfileLookup('CastError');
      const res = await post({ advocateEnrollment: TYPED_NUM });
      expect(res.status).toBe(200);
      expect(res.text).toContain(`Enrl. No. ${TYPED_NUM}`);
    });
    it('another user’s number never prints', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      await setProfileNumber(OTHER_ID, 'OTHER/999/2001');
      const a = await post({});
      expect(a.text).toContain(`Enrl. No. ${PROFILE_NUM}`);
      expect(a.text).not.toContain('OTHER/999/2001');
      spy.mockClear();
      const b = await post({}, OTHER_ID);
      expect(b.text).toContain('Enrl. No. OTHER/999/2001');
      expect(b.text).not.toContain(PROFILE_NUM);
    });
    it('a malformed sub (a real CastError): not refused by the lookup, treated as empty, warn names CastError', async () => {
      const real = User.findById.bind(User);
      jest.spyOn(User, 'findById').mockImplementation(((id: unknown, ...rest: unknown[]) => {
        const q = real(id as string, ...(rest as []));
        const select = q.select.bind(q);
        (q as { select: unknown }).select = (arg: unknown) =>
          arg === 'enrollmentNumber'
            ? real('not-an-object-id').select(arg as string)
            : select(arg as string);
        return q;
      }) as unknown as typeof User.findById);
      const res = await post({});
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('Enrl. No.');
      const call = warn.mock.calls.find((c) => String(c[1]).includes('T-311'));
      expect(call![0]).toEqual({ userId: USER_ID, error: 'CastError' });
    });
  });

  describe('POST /generate-from-template (lookup)', () => {
    const FORM = {
      fir_number: '124/2026',
      fir_date: '2026-03-15',
      police_station: 'Kotwali, Patna',
      sections_charged: ['103'],
      state: 'bihar',
      applicant_name: 'Ram Kumar',
      father_name: 'Shri Hari Kumar',
      applicant_age: '32',
      address: '123 Main St',
      language: 'en',
      currently_in_custody: 'yes_judicial',
      custody_since: '2026-03-15',
      court_type: 'sessions',
      court_name: 'district_sessions_patna',
      grounds_for_bail: ['false_implication', 'no_flight_risk'],
      facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
    };
    const gen = (id = USER_ID) =>
      request(app)
        .post('/generate-from-template')
        .set(headers(id))
        .send({ template_id: 'bail_regular', form_data: FORM });
    /** The enrollment number the route handed to the AI service. */
    const sentNumber = () =>
      (spy.mock.calls[0]?.[0] as { enrollmentNumber?: string } | undefined)?.enrollmentNumber;

    it('a seeded profile number is read and used (bail_regular: no typed name)', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      const res = await gen();
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      const calls = JSON.stringify(mockMessagesStream.mock.calls) + res.text;
      expect(calls + JSON.stringify(spy.mock.calls)).toContain(PROFILE_NUM);
    });
    it('no profile number: the draft succeeds with no number', async () => {
      const res = await gen();
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      expect(sentNumber()).toBeUndefined();
    });
    it('lookup throws: the draft still succeeds, warn has userId and error name, no number', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      failProfileLookup('MongoNetworkError');
      const res = await gen();
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      expect(sentNumber()).toBeUndefined();
      const call = warn.mock.calls.find((c) => String(c[1]).includes('T-311'));
      expect(call![0]).toEqual({ userId: USER_ID, error: 'MongoNetworkError' });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(PROFILE_NUM);
    });
    it('another user’s number never prints', async () => {
      await setProfileNumber(USER_ID, PROFILE_NUM);
      await setProfileNumber(OTHER_ID, 'OTHER/999/2001');
      const res = await gen();
      expect(res.status).toBe(200);
      const all =
        res.text + JSON.stringify(spy.mock.calls) + JSON.stringify(mockMessagesStream.mock.calls);
      expect(all).toContain(PROFILE_NUM);
      expect(all).not.toContain('OTHER/999/2001');
    });
  });

  /** Make only the route's `select('enrollmentNumber')` lookup throw; other User reads work. */
  function failProfileLookup(errorName: string) {
    const real = User.findById.bind(User);
    jest.spyOn(User, 'findById').mockImplementation(((...args: Parameters<typeof real>) => {
      const q = real(...args);
      const select = q.select.bind(q);
      (q as { select: unknown }).select = (arg: unknown) => {
        if (arg === 'enrollmentNumber') {
          const err = new Error('boom 12345 secret');
          err.name = errorName;
          throw err;
        }
        return select(arg as string);
      };
      return q;
    }) as unknown as typeof User.findById);
  }
});

// ── Model ────────────────────────────────────────────────────────────────────

describe('T-311 User.enrollmentNumber is read-only in drafting', () => {
  it('immutable: a change through the model is silently ignored; the stored value stays', async () => {
    const user = await User.create({
      plan: 'free',
      planTier: 'free',
      enrollmentNumber: 'A/1/2000',
    });
    user.set('enrollmentNumber', 'B/2/2001');
    await user.save();
    expect((await User.findById(user._id).lean())?.enrollmentNumber).toBe('A/1/2000');

    await User.updateOne({ _id: user._id }, { $set: { enrollmentNumber: 'C/3/2002' } });
    expect((await User.findById(user._id).lean())?.enrollmentNumber).toBe('A/1/2000');
  });
  it('no default: a user created without one has none stored', async () => {
    const user = await User.create({ plan: 'free', planTier: 'free' });
    const raw = await User.collection.findOne({ _id: user._id });
    expect(raw).not.toHaveProperty('enrollmentNumber');
  });
});
