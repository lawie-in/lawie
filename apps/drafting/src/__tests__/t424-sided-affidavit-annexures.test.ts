/**
 * T-424 (Part B) - counter and rejoinder affidavit packs: the annexures render.
 *
 * Rule: handoff/legal/T-381-annexures-button-signed.md Addendum 5 (the Memo prints each party
 * under its own role; the client is never "applicant"), T-424 44bf8a5 (deponent designation:
 * counter "the above-named Respondent", rejoinder "the above-named Petitioner"; an explicit
 * deponent_designation wins), ad5aeb3 (on these two packs the Memo labels are always
 * "Petitioner" and "Respondent" whatever the court rule; one "the" on every pack; the
 * Synopsis stays as is).
 *
 * Path: mapPartyFields -> applyPartyFields -> buildAnnexuresPack's HTML (the real resolver and
 * renderer; only the PDF renderer is stubbed). Allahabad HC is used throughout because its rule
 * says "Applicant", which proves the labels ignore the court rule. The 422 refusals are in
 * t424-sided-affidavit-parties.test.ts.
 */
import './setupEnv';

const mockRender = jest.fn();
jest.mock('../services/pdf-export.service', () => ({
  renderPdf: (html: string) => {
    mockRender(html);
    return Promise.resolve(Buffer.from('%PDF'));
  },
}));

// eslint-disable-next-line import/order
import { buildAnnexuresPack } from '../services/annexures.service';
import { applyPartyFields, mapPartyFields } from '../services/brief-party-fields';

type Side = 'petitioner' | 'respondent';
type PackId = 'counter_affidavit' | 'rejoinder_affidavit';
const other = (s: Side): Side => (s === 'petitioner' ? 'respondent' : 'petitioner');

const PACKS: Array<{ id: PackId; rowSide: Side }> = [
  { id: 'counter_affidavit', rowSide: 'respondent' },
  { id: 'rejoinder_affidavit', rowSide: 'petitioner' },
];

const NITA = {
  name: 'Nita Lal',
  age: '41',
  father: 'Shri Ram Lal',
  address: '1 Petitioner Road, Lucknow',
};
const MOHAN = {
  name: 'Mohan Lal',
  age: '52',
  father: 'Shri Hari Lal',
  address: '9 Respondent Lane, Prayagraj',
};
const PERSON: Record<Side, typeof NITA> = { petitioner: NITA, respondent: MOHAN };

/** Raw brief values: both parties with their own role-keyed details. */
function rawBrief(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    petitioner_name: NITA.name,
    petitioner_age: NITA.age,
    petitioner_father_name: NITA.father,
    petitioner_address: NITA.address,
    respondent_name: MOHAN.name,
    respondent_age: MOHAN.age,
    respondent_father_name: MOHAN.father,
    respondent_address: MOHAN.address,
    ...extra,
  };
}

/** Stale flat values that must never print on these packs. */
const STALE = {
  applicant_name: 'Stale Applicant',
  applicant_age: '77',
  applicant_address: '77 Stale Street',
  father_name: 'Stale Father',
  age: '66',
  address: '66 Generic Avenue',
};
const STALE_RE = /Stale|77 Stale|Generic Avenue/;

interface Rendered {
  html: string;
  memo: string;
  synopsis: string;
  index: string;
  vakalatnama: string;
  affidavit: string;
}

/**
 * T-689c: the annexure with this heading, from its label to the next annexure's label
 * (or the end); '' when it is not attached. Found by heading, not by letter, since the
 * Synopsis (Annexure B when attached) moves the letters of the rest.
 */
function sectionOf(html: string, heading: string): string {
  const m = new RegExp(`class="annexure-label">ANNEXURE [A-Z]</div>\\s*<h2>${heading}</h2>`).exec(
    html,
  );
  if (!m) return '';
  const next = html.indexOf('class="annexure-label"', m.index + 1);
  return html.slice(m.index, next === -1 ? undefined : next);
}

/**
 * The pack id and court type default to what the route passes: the form's template_id
 * and court_type. `pack` overrides them (T-689c).
 */
async function render(
  formData: Record<string, unknown>,
  pack: { rulePackId?: string; courtType?: string } = {},
): Promise<Rendered> {
  mockRender.mockClear();
  await buildAnnexuresPack({
    formData,
    bodyParaCount: 5,
    advocateName: 'Adv. Test',
    rulePackId: typeof formData.template_id === 'string' ? formData.template_id : undefined,
    courtType: typeof formData.court_type === 'string' ? formData.court_type : undefined,
    ...pack,
  });
  const html = String(mockRender.mock.calls[0][0]);
  return {
    html,
    memo: sectionOf(html, 'Memo of Parties'),
    synopsis: sectionOf(html, 'Synopsis'),
    index: sectionOf(html, 'Index of Documents Annexed'),
    vakalatnama: sectionOf(html, 'Vakalatnama'),
    affidavit: sectionOf(html, 'Affidavit'),
  };
}

/** Through the real resolver, as the route does, then the pack. */
async function renderPack(
  id: PackId,
  raw: Record<string, unknown>,
  base: Record<string, unknown> = {},
  courtId = 'allahabad_hc',
  pack: { rulePackId?: string; courtType?: string } = {},
): Promise<Rendered> {
  const mapped = mapPartyFields(id, raw);
  expect(mapped.missing).toEqual([]);
  const formData = applyPartyFields(
    { template_id: id, court_id: courtId, court_type: 'high_court', ...base },
    mapped,
  );
  return render(formData, pack);
}

/** The two Memo rows as [label, cell text]. */
function memoRows(memo: string): Array<{ label: string; cell: string }> {
  const rows = [...memo.matchAll(/<tr>\s*<td>([^<]*)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)];
  return rows.map((m) => ({ label: m[1].trim(), cell: m[2] }));
}

function expectOnlyName(cell: string, person: typeof NITA) {
  expect(cell).toContain(`<strong>${person.name}</strong>`);
  expect(cell).not.toContain(person.age);
  expect(cell).not.toContain(person.father);
  expect(cell).not.toContain(person.address);
  expect(cell).not.toContain('Age:');
  expect(cell).not.toContain('<br>');
}

function expectClientRow(cell: string, person: typeof NITA) {
  expect(cell).toContain(`<strong>${person.name}</strong>`);
  expect(cell).toContain(`Age: ${person.age} years`);
  expect(cell).toContain(person.father);
  expect(cell).toContain(person.address);
}

describe('T-424 B: Memo of Parties, both packs on both sides', () => {
  const CASES = PACKS.flatMap(({ id, rowSide }) => [
    { id, client: rowSide, how: 'the row decides', raw: rawBrief() },
    {
      id,
      client: other(rowSide),
      how: 'client_role overrides the row',
      raw: rawBrief({ client_role: other(rowSide) }),
    },
  ]);

  describe.each(CASES)('$id, client $client ($how)', ({ id, client, raw }) => {
    it('row 1 is the petitioner under "Petitioner", row 2 the respondent under "Respondent"', async () => {
      const { memo } = await renderPack(id, raw);
      const rows = memoRows(memo);
      expect(rows).toHaveLength(2);
      expect(rows[0].label).toBe('Petitioner');
      expect(rows[0].cell).toContain(`<strong>${NITA.name}</strong>`);
      expect(rows[1].label).toBe('Respondent');
      expect(rows[1].cell).toContain(`<strong>${MOHAN.name}</strong>`);
    });

    it("the client's age, relation and address are on the client's row only", async () => {
      const { memo } = await renderPack(id, raw);
      const rows = memoRows(memo);
      const clientIdx = client === 'petitioner' ? 0 : 1;
      expectClientRow(rows[clientIdx].cell, PERSON[client]);
      expectOnlyName(rows[1 - clientIdx].cell, PERSON[other(client)]);
      // the other party's own details never appear anywhere in the Memo
      const o = PERSON[other(client)];
      expect(memo).not.toContain(o.age);
      expect(memo).not.toContain(o.father);
      expect(memo).not.toContain(o.address);
    });

    it('"Applicant" / "applicant" is in no Memo label, and the court rule says Applicant', async () => {
      const { memo } = await renderPack(id, raw);
      for (const r of memoRows(memo)) expect(r.label).not.toMatch(/applicant/i);
      expect(memo).not.toMatch(/applicant/i);
      // proof the court rule would otherwise have said Applicant: a non-sided pack on the same court
      const bail = await render({
        template_id: 'bail_regular',
        court_id: 'allahabad_hc',
        court_type: 'high_court',
        applicant_name: 'Bail Person',
        respondent_name: 'State',
      });
      expect(memoRows(bail.memo)[0].label).toMatch(/applicant/i);
    });

    it('stale raw applicant_* / father_name / age / address never print, even if left in the form', async () => {
      const r = await renderPack(id, { ...raw, ...STALE });
      expect(r.html).not.toMatch(STALE_RE);
      // and when the stale keys survive into the pack input itself
      const mapped = mapPartyFields(id, raw);
      const formData = applyPartyFields(
        { template_id: id, court_id: 'allahabad_hc', court_type: 'high_court' },
        mapped,
      );
      const r2 = await render({ ...formData, ...STALE });
      expect(r2.html).not.toMatch(STALE_RE);
    });
  });

  it('the label is "Petitioner"/"Respondent" on another court too (the rule never leaks)', async () => {
    for (const courtId of ['delhi_hc', 'bihar_district', 'sessions_generic']) {
      for (const { id } of PACKS) {
        const { memo } = await renderPack(id, rawBrief(), { court_type: undefined }, courtId);
        expect(memoRows(memo).map((r) => r.label)).toEqual(['Petitioner', 'Respondent']);
      }
    }
  });

  it('a missing relation field prints the T-393 placeholder on the client row only', async () => {
    const raw = rawBrief();
    delete raw.respondent_father_name;
    const { memo } = await renderPack('counter_affidavit', raw);
    const rows = memoRows(memo);
    expect(rows[1].cell).toContain('[To be confirmed: relation');
    expect(rows[0].cell).not.toContain('[To be confirmed');
  });
});

// T-700 (AJ-700 (3), AJ-700a (1)): a counter or rejoinder affidavit is itself an affidavit, so
// the pack attaches NO separate affidavit and NO Vakalatnama annexure. It is the Memo of Parties
// (the sided labels, above) and the Index; Vakalatnama is an Index row only; no court fee row.
describe('T-424 B / T-700: no separate affidavit, both packs on both sides', () => {
  const CASES = PACKS.flatMap(({ id, rowSide }) => [
    { id, client: rowSide, raw: rawBrief() },
    { id, client: other(rowSide), raw: rawBrief({ client_role: other(rowSide) }) },
  ]);

  describe.each(CASES)('$id, client $client', ({ id, client, raw }) => {
    it('attaches no Affidavit annexure and prints no affidavit text', async () => {
      const r = await renderPack(id, { ...raw, ...STALE });
      expect(r.affidavit).toBe('');
      expect(r.html).not.toContain('<h2>Affidavit</h2>');
      expect(r.html).not.toContain('AFFIDAVIT OF');
      expect(r.html).not.toContain('That I am the above-named');
      expect(r.html).not.toContain('DEPONENT');
      expect(r.html).not.toContain('BEFORE ME');
    });

    it('attaches no Vakalatnama annexure; Vakalatnama is an Index row only', async () => {
      const r = await renderPack(id, { ...raw, ...STALE });
      expect(r.vakalatnama).toBe('');
      expect(r.html).not.toContain('<h2>Vakalatnama</h2>');
      expect(r.index).toContain('<td>Vakalatnama</td><td>___________</td>');
      expect(r.index).not.toContain('Annexure D');
    });

    it('the Index has no "Affidavit of <client>" row, no court fee row, no stale values', async () => {
      const r = await renderPack(id, { ...raw, ...STALE });
      expect(r.index).not.toContain('Affidavit of');
      expect(r.index).not.toMatch(/court fee/i);
      expect(r.index).not.toContain(PERSON[other(client)].name);
      expect(r.index).not.toMatch(STALE_RE);
      expect(r.html).not.toMatch(/Court Fee Paid Statement/);
    });

    it('is Memo of Parties (A) and Index (B) only, no Synopsis, even before a High Court', async () => {
      const r = await renderPack(id, { ...raw, ...STALE });
      expect(r.synopsis).toBe('');
      expect(r.html).not.toContain('>Synopsis</h2>');
      expect(r.html).not.toContain('As required by High Court Practice');
      expect(r.html).toMatch(/ANNEXURE A<\/div>\s*<h2>Memo of Parties<\/h2>/);
      expect(r.html).toMatch(/ANNEXURE B<\/div>\s*<h2>Index of Documents Annexed<\/h2>/);
      expect(r.html).not.toContain('ANNEXURE C');
    });

    it('rule 0: no FIR, arrest or Applicant text anywhere', async () => {
      const r = await renderPack(id, { ...raw, ...STALE });
      expect(r.html).not.toMatch(/\bFIR\b|arrest|applicant/i);
    });
  });

  it('Nature of matter is the first line of the Index', async () => {
    const r = await renderPack('counter_affidavit', rawBrief());
    expect(r.index).toMatch(
      /<h2>Index of Documents Annexed<\/h2>\s*<br>\s*<p><strong>Nature of matter:<\/strong> [^<]+<\/p>\s*<table>/,
    );
  });

  it('the rejoinder Memo roles stay Petitioner / Respondent on a trial court too', async () => {
    const r = await renderPack(
      'rejoinder_affidavit',
      rawBrief(),
      { court_type: undefined },
      'bihar_district',
      {
        rulePackId: 'rejoinder_affidavit',
        courtType: 'district_court',
      },
    );
    expect(memoRows(r.memo).map((x) => x.label)).toEqual(['Petitioner', 'Respondent']);
    expect(r.affidavit).toBe('');
  });
});

describe('T-424 B: other packs keep their wording (single "the")', () => {
  it('bail_regular still says "the above-named Applicant/Petitioner" (criminal set unchanged)', async () => {
    const { affidavit, memo, synopsis } = await render({
      template_id: 'bail_regular',
      court_id: 'allahabad_hc',
      court_type: 'high_court',
      applicant_name: 'Bail Person',
      applicant_age: 30,
      applicant_address: '5 Bail Road',
      respondent_name: 'State of UP',
    });
    expect(affidavit).toContain(
      '1. That I am the above-named Applicant/Petitioner in the accompanying matter',
    );
    expect(affidavit).not.toMatch(/the the/i);
    expect(synopsis).toContain('Applicant/Petitioner: Bail Person');
    expect(affidavit).toContain('I, <strong>Bail Person</strong>');
    expect(memo).toContain('<strong>Bail Person</strong>');
    expect(memo).toContain('Age: 30 years');
  });

  it('fir_quashing (criminal): single "the" in the designation line', async () => {
    const { affidavit } = await render({
      template_id: 'fir_quashing',
      court_id: 'delhi_district',
      court_type: 'district_court',
      applicant_name: 'Some Person',
      respondent_name: 'Other Person',
    });
    expect(affidavit).toContain('1. That I am the above-named Applicant/Petitioner in ');
    expect(affidavit).not.toMatch(/the the/i);
  });

  it.each(['plaint_recovery', 'written_statement', 'vakalatnama'])(
    'T-700: %s is a civil pack: no affidavit page and no Applicant/Petitioner designation',
    async (templateId) => {
      const { affidavit, html } = await render({
        template_id: templateId,
        court_id: 'delhi_district',
        court_type: 'district_court',
        applicant_name: 'Some Person',
        respondent_name: 'Other Person',
      });
      expect(affidavit).toBe('');
      expect(html).not.toContain('That I am the above-named Applicant/Petitioner');
      expect(html).not.toContain('<h2>Affidavit</h2>');
    },
  );

  it('counter_affidavit without client_side: Memo from the court rule, no affidavit (T-700)', async () => {
    const { affidavit, memo, vakalatnama } = await render({
      template_id: 'counter_affidavit',
      court_id: 'allahabad_hc',
      court_type: 'high_court',
      applicant_name: 'Plain Applicant',
      respondent_name: 'Plain Respondent',
    });
    expect(affidavit).toBe('');
    expect(vakalatnama).toBe('');
    expect(memo).toContain('<strong>Plain Applicant</strong>');
    expect(memo).toContain('Plain Respondent');
  });
});
