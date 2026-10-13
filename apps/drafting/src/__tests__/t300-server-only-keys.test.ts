/**
 * T-300 - client formData keys the server sets must not overwrite server-computed values.
 *
 * AC2: for each class of server-set key, a client-sent value leaves the output unchanged
 * compared with the same request without the key. Rulings (12 Oct 2026):
 *   - Ajay: a declared, typed value wins (advocate_name, court_designation, jail); a
 *     "[To be confirmed: ...]" advocate name stays as typed; the profile name fills only a
 *     missing, null or whitespace-only value.
 *   - Arjun: list A is never client-settable even if declared; list B is client-settable only
 *     where the template declares the field; enrollment_number is list A in the placeholder
 *     context only (annexures advocate_enrollment is unchanged, follow-up T-311).
 *
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
import logger from '../config/logger';
import { buildAnnexuresPack } from '../services/annexures.service';
import {
  buildAIUserPrompt,
  buildPlaceholderContext,
  chosenCourtHeading,
  clientFormData,
  CourtLookupData,
  GOVERNING_PROVISION_BLANK,
  loadCourtRule,
  loadTemplateConfig,
  renderTemplateSection,
  resolveAdvocateName,
  SECTIONS_CHARGED_READ_KEY,
  TemplateConfig,
} from '../services/template-engine.service';
/* eslint-enable import/order */

function config(id: string): TemplateConfig {
  const c = loadTemplateConfig(id);
  if (!c) throw new Error(`${id} template missing`);
  return c;
}

const regular = config('bail_regular');
const defaultBail = config('default_bail');
const magistrate = config('bail_before_magistrate');

const FORGED = 'ZZ-FORGED-VALUE-9137';

const BASE = {
  applicant_name: 'Ramesh Kumar',
  fir_number: '214/2026',
  police_station: 'Kotwali',
  facts_narrative: 'Facts.',
};

const court: CourtLookupData = {
  designation: 'SESSIONS COURT, GAYA',
  city: 'Gaya',
  caseNomenclature: 'Bail Application No. ___ of {year}',
  formattingRulesRef: 'sessions_generic',
  courtType: 'sessions',
  state: 'Bihar',
  courtRule: loadCourtRule('sessions_generic') ?? undefined,
};

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
});
afterEach(() => {
  warn.mockRestore();
});

/** The context with and without the client-sent key(s), same everything else. */
function pair(
  cfg: TemplateConfig,
  attack: Record<string, unknown>,
  form: Record<string, unknown> = BASE,
  extra?: Parameters<typeof buildPlaceholderContext>[2],
  courtData?: CourtLookupData,
) {
  return {
    clean: buildPlaceholderContext(cfg, { ...form }, extra, courtData),
    attacked: buildPlaceholderContext(cfg, { ...form, ...attack }, extra, courtData),
  };
}

describe('T-300 AC2: list A keys, a client value changes nothing', () => {
  it.each(['current_date', 'current_year'])('%s', (key) => {
    const { clean, attacked } = pair(regular, { [key]: FORGED });
    expect(attacked[key]).toBe(clean[key]);
    expect(attacked[key]).not.toBe(FORGED);
    expect(attacked).toEqual(clean);
  });

  it('current_year: the forged value does not reach a rendered court-rule line either', () => {
    const { clean, attacked } = pair(regular, { current_year: FORGED }, BASE, {}, court);
    expect(attacked).toEqual(clean);
    expect(JSON.stringify(attacked)).not.toContain(FORGED);
  });

  it('enrollment_number: the server (profile) value is kept', () => {
    const { clean, attacked } = pair(regular, { enrollment_number: FORGED }, BASE, {
      advocateName: 'Adv. Profile', // T-311: the number pairs with a profile name
      enrollmentNumber: 'BR/1234/2015',
    });
    expect(clean.enrollment_number).toBe('BR/1234/2015');
    expect(attacked.enrollment_number).toBe('BR/1234/2015');
    expect(attacked).toEqual(clean);
  });

  it('enrollment_number: with no profile value, the blank, never the client value', () => {
    const { clean, attacked } = pair(regular, { enrollment_number: FORGED });
    expect(attacked.enrollment_number).toBe('____________________');
    expect(attacked).toEqual(clean);
  });

  it('__sections_charged_read: a forged pre-read is dropped, the labels come from the real sections', () => {
    const body = regular.document_structure.sections.find((s) => s.section_id === 'body')!;
    const form = { ...BASE, sections_charged: ['BNS 303', 'BNS 115(2)'] };
    const forged = JSON.stringify([{ code: 'BNS', number: '103' }]);
    const clean = buildPlaceholderContext(regular, form, {});
    const attacked = buildPlaceholderContext(
      regular,
      { ...form, [SECTIONS_CHARGED_READ_KEY]: forged },
      {},
    );
    expect(attacked[SECTIONS_CHARGED_READ_KEY]).toBe(clean[SECTIONS_CHARGED_READ_KEY]);
    expect(attacked[SECTIONS_CHARGED_READ_KEY]).not.toBe(forged);
    expect(JSON.parse(attacked[SECTIONS_CHARGED_READ_KEY])).toEqual(
      JSON.parse(clean[SECTIONS_CHARGED_READ_KEY]),
    );
    const cleanPrompt = buildAIUserPrompt(body, clean);
    const attackedPrompt = buildAIUserPrompt(body, attacked);
    expect(attackedPrompt).toBe(cleanPrompt);
    expect(cleanPrompt).toContain('BAILABILITY CLASSIFICATION');
  });

  it('any other __ key is dropped too', () => {
    const { clean, attacked } = pair(regular, { __anything: FORGED, __proto_like: FORGED });
    expect(attacked).toEqual(clean);
    expect(Object.keys(attacked)).not.toContain('__anything');
  });

  it('party_label_petitioner with no court rule: the default label', () => {
    const { clean, attacked } = pair(regular, {
      party_label_petitioner: FORGED,
      party_label_respondent: FORGED,
      party_label_petitioner_upper: FORGED,
    });
    expect(attacked.party_label_petitioner).toBe('Petitioner');
    expect(attacked.party_label_respondent).toBe('Respondent');
    expect(attacked.party_label_petitioner_upper).toBe('PETITIONER');
    expect(attacked).toEqual(clean);
  });

  it('party_label_* with a court rule: the rule decides', () => {
    const { clean, attacked } = pair(regular, { party_label_applicant: FORGED }, BASE, {}, court);
    expect(attacked).toEqual(clean);
  });

  it('governing_provision on default_bail: the blank, not the client value', () => {
    const { clean, attacked } = pair(defaultBail, { governing_provision: FORGED });
    expect(attacked.governing_provision).toBe(GOVERNING_PROVISION_BLANK);
    expect(attacked).toEqual(clean);
  });

  it('governing_provision on another pack: unset', () => {
    const { clean, attacked } = pair(regular, { governing_provision: FORGED });
    expect(attacked.governing_provision).toBeUndefined();
    expect(attacked).toEqual(clean);
  });

  it('governing_provision: the server value (extra) wins over the client value', () => {
    const { attacked } = pair(defaultBail, { governing_provision: FORGED }, BASE, {
      governingProvision: 'Section 187(3) of the BNSS',
    });
    expect(attacked.governing_provision).toBe('Section 187(3) of the BNSS');
  });

  it('caseNomenclature (an alias) and case_nomenclature', () => {
    const { clean, attacked } = pair(
      regular,
      { caseNomenclature: FORGED, case_nomenclature: FORGED },
      BASE,
      {},
      court,
    );
    expect(attacked.caseNomenclature).toBe(clean.caseNomenclature);
    expect(attacked.caseNomenclature).not.toBe(FORGED);
    expect(attacked).toEqual(clean);
  });

  it.each(['courtDesignation', 'courtHeader', 'courtPlace', 'place', 'advocateName', 'applicant'])(
    'alias %s',
    (alias) => {
      const { clean, attacked } = pair(regular, { [alias]: FORGED }, BASE, {}, court);
      expect(attacked).toEqual(clean);
      expect(attacked[alias]).not.toBe(FORGED);
    },
  );

  it.each(['lastParagraph', 'body_para_count'])('%s', (key) => {
    const { clean, attacked } = pair(regular, { [key]: FORGED });
    expect(attacked.lastParagraph).toBe('{body_para_count}');
    expect(attacked).toEqual(clean);
    expect(Object.keys(attacked).includes('body_para_count')).toBe(
      Object.keys(clean).includes('body_para_count'),
    );
  });

  it('custody_clause: not set by the client, follows the custody answer', () => {
    const none = pair(regular, { custody_clause: FORGED });
    expect(none.attacked.custody_clause).toBe('');
    expect(none.attacked).toEqual(none.clean);

    const judicial = pair(
      regular,
      { custody_clause: FORGED },
      { ...BASE, currently_in_custody: 'yes_judicial' },
    );
    expect(judicial.attacked.custody_clause).toContain('currently in judicial custody at');
    expect(judicial.attacked).toEqual(judicial.clean);
  });

  it.each(['state_respondent', 'prayer_opening', 'prayer_closing', 'verification_text'])(
    '%s',
    (key) => {
      const withoutCourt = pair(regular, { [key]: FORGED });
      expect(withoutCourt.attacked).toEqual(withoutCourt.clean);
      const withCourt = pair(regular, { [key]: FORGED }, BASE, {}, court);
      expect(withCourt.attacked).toEqual(withCourt.clean);
    },
  );

  it('one computed id from a real template: bail_section in bail_regular', () => {
    expect(Object.keys(regular.computed_fields ?? {})).toContain('bail_section');
    const { clean, attacked } = pair(regular, { bail_section: FORGED, bail_type_label: FORGED });
    expect(attacked.bail_section).toBe(clean.bail_section);
    expect(attacked.bail_section).not.toBe(FORGED);
    expect(attacked).toEqual(clean);
  });

  it('the rendered body is identical with every forged key at once', () => {
    const forgedAll = Object.fromEntries(
      [
        'current_date',
        'current_year',
        'enrollment_number',
        '__sections_charged_read',
        'party_label_petitioner',
        'governing_provision',
        'caseNomenclature',
        'lastParagraph',
        'body_para_count',
        'custody_clause',
        'bail_section',
      ].map((k) => [k, FORGED]),
    );
    const render = (ctx: ReturnType<typeof buildPlaceholderContext>) =>
      regular.document_structure.sections
        .filter((s) => s.type === 'template' && s.template)
        .map((s) => renderTemplateSection(s, ctx).content);
    const { clean, attacked } = pair(regular, forgedAll, BASE, { enrollmentNumber: 'BR/1' }, court);
    expect(render(attacked)).toEqual(render(clean));
    expect(render(clean).length).toBeGreaterThan(0);
    expect(render(attacked).join('\n')).not.toContain(FORGED);
  });
});

describe('T-300 list B: dropped unless this template declares the field', () => {
  it('court_designation in a pack that does NOT declare it: dropped', () => {
    expect(regular.form_schema.steps.flatMap((s) => s.fields).map((f) => f.field_id)).not.toContain(
      'court_designation',
    );
    const noCourt = pair(regular, { court_designation: FORGED, court_header: FORGED });
    expect(noCourt.attacked).toEqual(noCourt.clean);
    expect(noCourt.attacked.court_designation).not.toBe(FORGED);
    const withCourt = pair(regular, { court_designation: FORGED }, BASE, {}, court);
    expect(withCourt.attacked).toEqual(withCourt.clean);
  });

  it('court_city and court_header in a pack that does not declare them: dropped', () => {
    const { clean, attacked } = pair(regular, { court_city: FORGED, court_header: FORGED });
    expect(attacked).toEqual(clean);
  });

  describe('court_designation in a pack that DOES declare it (default_bail)', () => {
    it('no court chosen: the typed value prints', () => {
      const ctx = buildPlaceholderContext(defaultBail, {
        ...BASE,
        court_designation: 'IN THE COURT OF THE CJM, PATNA',
      });
      expect(ctx.court_designation).toBe('IN THE COURT OF THE CJM, PATNA');
    });

    it('a court chosen: the court’s value', () => {
      const ctx = buildPlaceholderContext(
        defaultBail,
        { ...BASE, court_designation: 'IN THE COURT OF THE CJM, PATNA' },
        undefined,
        court,
      );
      expect(ctx.court_designation).toBe(chosenCourtHeading(court)!.designation);
      expect(ctx.court_designation).not.toContain('PATNA');
    });
  });

  describe('jail', () => {
    const JUDICIAL = 'Yes — Judicial custody';
    const form = {
      ...BASE,
      applicant_parentage: 'Suresh Kumar',
      applicant_age: '34',
      state: 'bihar',
      fir_date: '2026-09-01',
      currently_in_custody: JUDICIAL,
    };
    const verification = (extra: Record<string, unknown>) => {
      const ctx = buildPlaceholderContext(
        magistrate,
        { ...form, ...extra },
        { advocateName: 'Adv. A' },
      );
      const s = magistrate.document_structure.sections.find(
        (x) => x.section_id === 'verification',
      )!;
      return { ctx, text: renderTemplateSection(s, ctx).content };
    };

    it('declared (bail_before_magistrate): it flows', () => {
      const { ctx, text } = verification({ jail: 'Beur Jail, Patna' });
      expect(ctx.jail).toBe('Beur Jail, Patna');
      expect(text).toContain('currently in judicial custody at Beur Jail, Patna');
    });

    it('not declared (bail_regular): dropped, the blank prints', () => {
      const { clean, attacked } = pair(regular, { jail: FORGED });
      expect(attacked.jail).toBe('[To be confirmed: name of jail]');
      expect(attacked).toEqual(clean);
    });
  });

  it('a declared normal field (police_station) still flows', () => {
    const ctx = buildPlaceholderContext(regular, { ...BASE, police_station: 'Chanho' });
    expect(ctx.police_station).toBe('Chanho');
    expect(ctx.applicant_name).toBe('Ramesh Kumar');
  });

  it('a field outside any list (an undeclared custom key) still flows', () => {
    const ctx = buildPlaceholderContext(regular, { ...BASE, some_custom_note: 'kept' });
    expect(ctx.some_custom_note).toBe('kept');
  });
});

describe('T-300 round 2: jail aliases are list B (kept only where jail or the alias is declared)', () => {
  const ALIASES = ['jail_name', 'place_of_custody', 'custody_place', 'custody_location'];
  const JUDICIAL = 'Yes — Judicial custody';
  const SECRET = 'ALIAS-LEAK-VALUE-5521';
  const withCustody = { ...BASE, currently_in_custody: JUDICIAL };

  describe.each(['default_bail', 'suspension_of_sentence'])('%s', (id) => {
    const cfg = config(id);

    it('does not declare jail or the aliases', () => {
      const declared = new Set(
        cfg.form_schema.steps.flatMap((s) => s.fields).map((f) => f.field_id),
      );
      for (const k of ['jail', ...ALIASES]) expect(declared.has(k)).toBe(false);
    });

    it.each(ALIASES)('a client %s leaves {jail} and custody_clause unchanged', (alias) => {
      for (const form of [BASE, withCustody]) {
        const { clean, attacked } = pair(cfg, { [alias]: SECRET }, form);
        expect(attacked.jail).toBe(clean.jail);
        expect(attacked.custody_clause).toBe(clean.custody_clause);
        expect(attacked.jail).not.toContain(SECRET);
        expect(attacked.custody_clause).not.toContain(SECRET);
        expect(attacked).toEqual(clean);
      }
    });

    it('the blank prints, with a judicial-custody answer', () => {
      const { attacked } = pair(cfg, { place_of_custody: SECRET }, withCustody);
      expect(attacked.jail).toBe('[To be confirmed: name of jail]');
    });

    it('the aliases are in one warn’s droppedKeys, no values', () => {
      buildPlaceholderContext(cfg, {
        ...withCustody,
        ...Object.fromEntries(ALIASES.map((a) => [a, SECRET])),
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const [fields] = warn.mock.calls[0];
      expect(fields.templateId).toBe(id);
      expect([...fields.droppedKeys].sort()).toEqual([...ALIASES].sort());
      expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
    });
  });

  describe('bail_before_magistrate (declares jail): current behaviour pinned', () => {
    const run = (extra: Record<string, unknown>) =>
      buildPlaceholderContext(
        magistrate,
        { ...BASE, currently_in_custody: JUDICIAL, ...extra },
        {},
      );

    it('a typed jail still prints', () => {
      const ctx = run({ jail: 'Beur Jail, Patna' });
      expect(ctx.jail).toBe('Beur Jail, Patna');
      expect(ctx.custody_clause).toBe(', currently in judicial custody at Beur Jail, Patna');
    });

    it.each(ALIASES)('an alias %s still flows when no jail is typed', (alias) => {
      const ctx = run({ [alias]: 'Alias Jail' });
      expect(ctx.jail).toBe('Alias Jail');
      expect(ctx.custody_clause).toContain('Alias Jail');
      expect(warn).not.toHaveBeenCalled();
    });

    it('a typed jail wins over an alias', () => {
      expect(run({ jail: 'Beur Jail', place_of_custody: 'Alias Jail' }).jail).toBe('Beur Jail');
    });
  });
});

describe('T-300 clientFormData', () => {
  it('returns the kept form and the names of the dropped keys', () => {
    const { kept, dropped } = clientFormData(regular, {
      ...BASE,
      current_date: FORGED,
      bail_section: FORGED,
      advocate_name: FORGED,
    });
    expect(Object.keys(kept).sort()).toEqual(Object.keys(BASE).sort());
    expect(dropped.sort()).toEqual(['advocate_name', 'bail_section', 'current_date']);
  });

  it('null and undefined values are neither kept nor counted as dropped', () => {
    const { kept, dropped } = clientFormData(regular, {
      ...BASE,
      current_date: null,
      current_year: undefined,
    });
    expect(dropped).toEqual([]);
    expect(kept).not.toHaveProperty('current_date');
  });
});

describe('T-300 the warn', () => {
  const VALUE_A = 'LEAK-VALUE-ALPHA-4471';
  const VALUE_B = 'LEAK-VALUE-BETA-9920';

  it('carries the templateId and the key names, and no value', () => {
    buildPlaceholderContext(regular, {
      ...BASE,
      current_date: VALUE_A,
      bail_section: VALUE_B,
      [SECTIONS_CHARGED_READ_KEY]: VALUE_A,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const [fields] = warn.mock.calls[0];
    expect(fields.templateId).toBe('bail_regular');
    expect([...fields.droppedKeys].sort()).toEqual(
      ['__sections_charged_read', 'bail_section', 'current_date'].sort(),
    );
    const serialised = JSON.stringify(warn.mock.calls);
    expect(serialised).not.toContain(VALUE_A);
    expect(serialised).not.toContain(VALUE_B);
    expect(serialised).not.toContain('Ramesh Kumar');
  });

  it('fires once per call, not once per key', () => {
    buildPlaceholderContext(regular, {
      ...BASE,
      current_date: VALUE_A,
      current_year: VALUE_A,
      custody_clause: VALUE_A,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    buildPlaceholderContext(regular, { ...BASE, current_date: VALUE_A });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('logs nothing when nothing is dropped', () => {
    buildPlaceholderContext(regular, { ...BASE, sections_charged: ['BNS 303'] });
    buildPlaceholderContext(defaultBail, { ...BASE, court_designation: 'X', advocate_name: 'Y' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs nothing when the only server-set keys are null', () => {
    buildPlaceholderContext(regular, { ...BASE, current_date: null });
    expect(warn).not.toHaveBeenCalled();
  });
});

// ── Advocate name ────────────────────────────────────────────────────────────

async function annexuresHtml(
  formData: Record<string, unknown>,
  advocateName?: string,
): Promise<string> {
  const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
  const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
  let html = '';
  page.setContent.mockImplementation((h: string) => {
    html = h;
    return Promise.resolve(undefined);
  });
  await buildAnnexuresPack({ formData, bodyParaCount: 8, advocateName });
  return html;
}

const PROFILE = 'Adv. Profile Name';
const TYPED = 'Adv. Typed Name';
const TBC = '[To be confirmed: name of advocate]';

describe('T-300 advocate name (Ajay: a declared, typed value wins)', () => {
  const form = (adv: unknown) => ({
    template_id: 'default_bail',
    applicant_name: 'Ramesh Kumar',
    respondent_name: 'State of Bihar',
    ...(adv === undefined ? {} : { advocate_name: adv }),
  });
  const draft = (adv: unknown) =>
    buildPlaceholderContext(defaultBail, form(adv), { advocateName: PROFILE }).advocate_name;

  it('default_bail declares advocate_name', () => {
    expect(defaultBail.form_schema.steps.flatMap((s) => s.fields).map((f) => f.field_id)).toContain(
      'advocate_name',
    );
  });

  it('declared and typed: used by the draft context and the annexures', async () => {
    expect(draft(TYPED)).toBe(TYPED);
    const html = await annexuresHtml(form(TYPED), PROFILE);
    expect(html).toContain(TYPED);
    expect(html).not.toContain(PROFILE);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   \t '],
    ['null', null],
    ['missing', undefined],
  ])('declared but %s: the profile name, in both', async (_l, v) => {
    expect(draft(v)).toBe(PROFILE);
    const html = await annexuresHtml(form(v), PROFILE);
    expect(html).toContain(PROFILE);
  });

  it('declared as "[To be confirmed: name of advocate]": stays as typed, in both (Ajay)', async () => {
    expect(draft(TBC)).toBe(TBC);
    const html = await annexuresHtml(form(TBC), PROFILE);
    expect(html).toContain(TBC);
    expect(html).not.toContain(PROFILE);
  });

  it('declared, empty, no profile: the draft keeps its blank; the annexures print theirs', async () => {
    const ctx = buildPlaceholderContext(defaultBail, form('   '), {});
    expect(ctx.advocate_name).toBe("[To be confirmed: advocate's name]");
    const html = await annexuresHtml(form('   '));
    expect(html).toContain('[Advocate Name]');
  });

  it('not declared but sent by the client: the profile name, in both (bail_regular)', async () => {
    const ctx = buildPlaceholderContext(
      regular,
      { ...BASE, advocate_name: FORGED },
      { advocateName: PROFILE },
    );
    expect(ctx.advocate_name).toBe(PROFILE);
    expect(ctx.advocateName).toBe(PROFILE);
    const html = await annexuresHtml(
      { template_id: 'bail_regular', applicant_name: 'Ramesh Kumar', advocate_name: FORGED },
      PROFILE,
    );
    expect(html).toContain(PROFILE);
    expect(html).not.toContain(FORGED);
  });

  it('not declared, sent by the client, no profile: the client value is not printed', async () => {
    const ctx = buildPlaceholderContext(regular, { ...BASE, advocate_name: FORGED }, {});
    expect(ctx.advocate_name).toBe("[To be confirmed: advocate's name]");
    const html = await annexuresHtml({
      template_id: 'bail_regular',
      applicant_name: 'Ramesh Kumar',
      advocate_name: FORGED,
    });
    expect(html).not.toContain(FORGED);
  });

  it('annexures with no template_id: the typed name is not trusted, the profile name prints', async () => {
    const html = await annexuresHtml(
      { applicant_name: 'Ramesh Kumar', advocate_name: FORGED },
      PROFILE,
    );
    expect(html).toContain(PROFILE);
    expect(html).not.toContain(FORGED);
  });

  it('resolveAdvocateName: the draft and the annexures use the same rule', () => {
    expect(resolveAdvocateName({ advocate_name: TYPED }, { name: PROFILE }, defaultBail)).toBe(
      TYPED,
    );
    expect(resolveAdvocateName({ advocate_name: ' ' }, { name: PROFILE }, defaultBail)).toBe(
      PROFILE,
    );
    expect(resolveAdvocateName({ advocate_name: TBC }, { name: PROFILE }, defaultBail)).toBe(TBC);
    expect(resolveAdvocateName({ advocate_name: TYPED }, { name: PROFILE }, regular)).toBe(PROFILE);
    expect(resolveAdvocateName({ advocate_name: ' ' }, {}, defaultBail)).toBeUndefined();
    expect(resolveAdvocateName({ advocate_name: TYPED }, { name: PROFILE }, null)).toBe(PROFILE);
  });
});

describe('T-300/T-311 annexures: a client enrollment number is never read', () => {
  it('enrollment_number from the form does not print (list A), on a pack that declares advocate_enrollment', async () => {
    const html = await annexuresHtml(
      {
        template_id: 'bail_regular',
        applicant_name: 'Ramesh Kumar',
        enrollment_number: 'BAR/2018/1234',
      },
      PROFILE,
    );
    expect(html).not.toContain('BAR/2018/1234');
  });

  it('enrollment_number from the form does not print on a pack that does not declare it', async () => {
    const html = await annexuresHtml(
      {
        template_id: 'mandamus',
        applicant_name: 'Ramesh Kumar',
        enrollment_number: 'BAR/2018/1234',
        advocate_enrollment: 'LEG/77',
      },
      PROFILE,
    );
    expect(html).not.toContain('BAR/2018/1234');
    expect(html).not.toContain('LEG/77');
  });

  it('bail_regular declares advocate_enrollment (T-313): the typed one prints, enrollment_number still does not', async () => {
    const html = await annexuresHtml(
      {
        template_id: 'bail_regular',
        applicant_name: 'Ramesh Kumar',
        enrollment_number: 'BAR/2018/1234',
        advocate_enrollment: 'LEG/77',
      },
      PROFILE,
    );
    expect(html).toContain('LEG/77');
    expect(html).not.toContain('BAR/2018/1234');
  });
});
