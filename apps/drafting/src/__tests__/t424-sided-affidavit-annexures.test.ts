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

async function render(formData: Record<string, unknown>): Promise<Rendered> {
  mockRender.mockClear();
  await buildAnnexuresPack({ formData, bodyParaCount: 5, advocateName: 'Adv. Test' });
  const html = String(mockRender.mock.calls[0][0]);
  const at = (l: string) => html.indexOf(`ANNEXURE ${l}`);
  return {
    html,
    memo: html.slice(at('A'), at('B')),
    synopsis: html.slice(at('B'), at('C')),
    index: html.slice(at('D'), at('E')),
    vakalatnama: html.slice(at('E'), at('F')),
    affidavit: html.slice(at('G')),
  };
}

/** Through the real resolver, as the route does, then the pack. */
async function renderPack(
  id: PackId,
  raw: Record<string, unknown>,
  base: Record<string, unknown> = {},
  courtId = 'allahabad_hc',
): Promise<Rendered> {
  const mapped = mapPartyFields(id, raw);
  expect(mapped.missing).toEqual([]);
  const formData = applyPartyFields(
    { template_id: id, court_id: courtId, court_type: 'high_court', ...base },
    mapped,
  );
  return render(formData);
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

describe('T-424 B: affidavit, both packs on both sides', () => {
  const CASES = PACKS.flatMap(({ id, rowSide }) => [
    { id, client: rowSide, raw: rawBrief() },
    { id, client: other(rowSide), raw: rawBrief({ client_role: other(rowSide) }) },
  ]);
  const LABEL: Record<Side, string> = { petitioner: 'Petitioner', respondent: 'Respondent' };

  describe.each(CASES)('$id, client $client', ({ id, client, raw }) => {
    it("the deponent is the client with the client's details", async () => {
      const { affidavit } = await renderPack(id, raw);
      const p = PERSON[client];
      expect(affidavit).toContain(`AFFIDAVIT OF ${p.name.toUpperCase()}`);
      expect(affidavit).toContain(`I, <strong>${p.name}</strong>`);
      expect(affidavit).toContain(`aged about ${p.age} years`);
      expect(affidavit).toContain(p.father);
      expect(affidavit).toContain(p.address);
      expect(affidavit).toContain(`<p>${p.name}</p>`);
      const o = PERSON[other(client)];
      expect(affidavit).not.toContain(o.name);
      expect(affidavit).not.toContain(o.address);
      expect(affidavit).not.toContain(o.father);
    });

    it(`the designation is "the above-named ${LABEL[client]}" with a single "the"`, async () => {
      const { affidavit } = await renderPack(id, raw);
      expect(affidavit).toContain(
        `1. That I am the above-named ${LABEL[client]} in the accompanying matter`,
      );
      expect(affidavit).not.toMatch(/the the/i);
      expect(affidavit).not.toMatch(/applicant/i);
      expect(affidavit).not.toContain(`above-named ${LABEL[other(client)]}`);
    });

    it('the verification uses the client name, not the counterpart or a stale applicant', async () => {
      const { affidavit } = await renderPack(id, { ...raw, ...STALE });
      const verification = affidavit.slice(
        affidavit.indexOf('5. That this affidavit'),
        affidavit.indexOf('DEPONENT'),
      );
      expect(verification).toContain(PERSON[client].name);
      expect(verification).not.toContain(PERSON[other(client)].name);
      expect(verification).not.toMatch(STALE_RE);
      expect(verification).not.toMatch(/\{deponent_name\}|\{designation\}/);
      expect(affidavit).not.toMatch(STALE_RE);
    });

    it('an explicit deponent_designation wins', async () => {
      const { affidavit } = await renderPack(id, raw, {
        deponent_designation: 'the authorised signatory of the above-named Company',
      });
      expect(affidavit).toContain(
        '1. That I am the authorised signatory of the above-named Company in the accompanying matter',
      );
      expect(affidavit).not.toContain(`above-named ${LABEL[client]}`);
      expect(affidavit).not.toMatch(/the the/i);
    });
  });
});

describe('T-424 B: vakalatnama, index and synopsis', () => {
  describe.each(
    PACKS.flatMap(({ id, rowSide }) => [
      { id, client: rowSide, raw: rawBrief() },
      { id, client: other(rowSide), raw: rawBrief({ client_role: other(rowSide) }) },
    ]),
  )('$id, client $client', ({ id, client, raw }) => {
    it('the vakalatnama names the client and the client address', async () => {
      const { vakalatnama } = await renderPack(id, { ...raw, ...STALE });
      expect(vakalatnama).toContain(`<strong>${PERSON[client].name}</strong>`);
      expect(vakalatnama).toContain(PERSON[client].address);
      expect(vakalatnama).not.toContain(PERSON[other(client)].name);
      expect(vakalatnama).not.toMatch(STALE_RE);
    });

    it('the index lists "Affidavit of <client>"', async () => {
      const { index } = await renderPack(id, { ...raw, ...STALE });
      expect(index).toContain(`Affidavit of ${PERSON[client].name}`);
      expect(index).not.toContain(PERSON[other(client)].name);
      expect(index).not.toMatch(STALE_RE);
    });

    it('the synopsis keeps its wording and reads the petitioner', async () => {
      const { synopsis } = await renderPack(id, { ...raw, ...STALE });
      expect(synopsis).toContain(`Applicant/Petitioner: ${NITA.name}`);
      expect(synopsis).not.toMatch(STALE_RE);
    });
  });
});

describe('T-424 B: other packs keep their wording (single "the")', () => {
  it('bail_regular still says "the above-named Applicant/Petitioner"', async () => {
    const { affidavit, memo } = await render({
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
    expect(affidavit).toContain('I, <strong>Bail Person</strong>');
    expect(memo).toContain('<strong>Bail Person</strong>');
    expect(memo).toContain('Age: 30 years');
  });

  it.each(['plaint_recovery', 'written_statement', 'vakalatnama', 'fir_quashing'])(
    '%s: single "the" in the designation line',
    async (templateId) => {
      const { affidavit } = await render({
        template_id: templateId,
        court_id: 'delhi_district',
        court_type: 'district_court',
        applicant_name: 'Some Person',
        respondent_name: 'Other Person',
      });
      expect(affidavit).toContain('1. That I am the above-named Applicant/Petitioner in ');
      expect(affidavit).not.toMatch(/the the/i);
    },
  );

  it('counter_affidavit without client_side is the old non-sided render', async () => {
    const { affidavit, memo } = await render({
      template_id: 'counter_affidavit',
      court_id: 'allahabad_hc',
      court_type: 'high_court',
      applicant_name: 'Plain Applicant',
      respondent_name: 'Plain Respondent',
    });
    expect(affidavit).toContain('1. That I am the above-named Applicant/Petitioner in ');
    expect(affidavit).toContain('<strong>Plain Applicant</strong>');
    expect(memo).toContain('Plain Respondent');
  });
});
