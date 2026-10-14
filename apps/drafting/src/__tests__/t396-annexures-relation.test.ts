/**
 * T-396 - Memo of parties (Annexure A) and affidavit (Annexure G) follow the
 * relation rule (T-359 AC6 Addendum, T-393): the relation as given, else
 * Ajay's blank; never a default S/o, never inferred from sex. Also: wider party
 * keys, State line only when the counterpart is the State, State id -> name,
 * and the Annexure A footer.
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

const DISCLAIMER =
  'Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.';
const BLANK_FULL = '[To be confirmed: relation and name of parent or spouse]';
const BLANK_REL = '[To be confirmed: relation]';

async function build(form: Record<string, unknown>): Promise<{
  html: string;
  memo: string;
  affidavit: string;
}> {
  mockRender.mockClear();
  await buildAnnexuresPack({
    formData: { court_id: 'bihar_district', court_type: 'district_court', ...form },
    bodyParaCount: 5,
    advocateName: 'Adv. Test',
  });
  const html = String(mockRender.mock.calls[0][0]);
  const a = html.indexOf('ANNEXURE A');
  const b = html.indexOf('ANNEXURE B');
  const g = html.indexOf('ANNEXURE G');
  return { html, memo: html.slice(a, b), affidavit: html.slice(g) };
}

const WOMAN = {
  template_id: 'bail_regular',
  applicant_name: 'Sunita Devi',
  applicant_age: 30,
  applicant_address: '12 Station Road, Patna',
  father_name: 'Mohan Lal',
  state: 'bihar',
};

describe('T-396 AC1/AC3: relation in memo and affidavit', () => {
  it.each([
    ['W/o', 'W/o'],
    ['D/o', 'D/o'],
    ['H/o', 'H/o'],
    ['S/o', 'S/o'],
    ['Wife of', 'W/o'],
  ])('relation %s with a name prints %s <name>', async (given, printed) => {
    const { memo, affidavit } = await build({ ...WOMAN, applicant_relation: given });
    expect(memo).toContain(`${printed} Mohan Lal`);
    expect(affidavit).toContain(`${printed} Mohan Lal`);
    expect(memo).not.toContain(BLANK_REL);
    expect(affidavit).not.toContain(BLANK_REL);
    if (printed !== 'S/o') {
      expect(memo).not.toContain('S/o');
      expect(affidavit).not.toContain('S/o');
    }
    expect(memo).not.toContain('S/o / D/o / W/o');
  });

  it('a woman with a husband name and W/o: W/o <husband>, no S/o anywhere', async () => {
    const { memo, affidavit } = await build({
      ...WOMAN,
      father_name: undefined,
      applicant_parentage: 'Rakesh Singh',
      relation_type: 'W/o',
    });
    expect(memo).toContain('W/o Rakesh Singh');
    expect(affidavit).toContain('W/o Rakesh Singh');
    expect(memo + affidavit).not.toContain('S/o');
  });

  it('a placeholder father_name is skipped for the real name in applicant_parentage', async () => {
    const { memo, affidavit } = await build({
      ...WOMAN,
      father_name: BLANK_FULL,
      applicant_parentage: 'Mohan Lal',
      applicant_relation: 'W/o',
    });
    for (const part of [memo, affidavit]) {
      expect(part).toContain('W/o Mohan Lal');
      expect(part).not.toContain('[To be confirmed');
    }
  });

  it('a placeholder parent_name (father_name absent) is skipped for applicant_father_name', async () => {
    const { memo, affidavit } = await build({
      ...WOMAN,
      father_name: undefined,
      parent_name: '[to be confirmed: name of parent or spouse]',
      applicant_father_name: 'Mohan Lal',
      applicant_relation: 'W/o',
    });
    for (const part of [memo, affidavit]) {
      expect(part).toContain('W/o Mohan Lal');
      expect(part).not.toContain('[To be confirmed');
    }
  });

  it('a woman with a name but no relation: the relation blank, no guess from sex', async () => {
    const { memo, affidavit } = await build(WOMAN);
    expect(memo).toContain(`${BLANK_REL} Mohan Lal`);
    expect(affidavit).toContain(`${BLANK_REL} Mohan Lal`);
    expect(memo + affidavit).not.toContain('S/o');
    expect(memo + affidavit).not.toContain('D/o');
    expect(memo + affidavit).not.toContain('W/o');
  });

  it('a man with no relation does not get S/o', async () => {
    const { memo, affidavit } = await build({
      ...WOMAN,
      applicant_name: 'Ramesh Kumar',
      sex: 'male',
      gender: 'male',
    });
    expect(memo).toContain(`${BLANK_REL} Mohan Lal`);
    expect(memo + affidavit).not.toContain('S/o');
  });

  it('neither relation nor name: the full blank in both', async () => {
    const { memo, affidavit } = await build({ ...WOMAN, father_name: undefined });
    expect(memo).toContain(BLANK_FULL);
    expect(affidavit).toContain(BLANK_FULL);
  });

  it('a blank-string name falls through to the full blank', async () => {
    const { memo } = await build({ ...WOMAN, father_name: '   ' });
    expect(memo).toContain(BLANK_FULL);
  });
});

describe('T-396: wider party keys', () => {
  it('plaintiff/defendant pack: plaintiff_name is the applicant, defendant_name the respondent', async () => {
    const { memo } = await build({
      template_id: 'plaint_recovery',
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
    });
    expect(memo).toContain('<strong>Jai Mehta</strong>');
    expect(memo).toContain('<strong>Kiran Bose</strong>');
  });

  it('complainant/accused keys fill the applicant when the pack has no such client field', async () => {
    const { memo } = await build({ template_id: 'plaint_recovery', complainant_name: 'Asha Rao' });
    expect(memo).toContain('<strong>Asha Rao</strong>');
    const { memo: m2 } = await build({ template_id: 'plaint_recovery', accused_name: 'Vikas Rao' });
    expect(m2).toContain('<strong>Vikas Rao</strong>');
  });

  it('fir_quashing: the complainant is the respondent, never the applicant', async () => {
    const { memo } = await build({
      template_id: 'fir_quashing',
      petitioner_name: 'Amit Roy',
      complainant_name: 'Neha Das',
      state: 'bihar',
    });
    const applicantCell = memo.slice(memo.indexOf('<strong>Amit Roy</strong>'));
    expect(memo).toContain('<strong>Amit Roy</strong>');
    expect(memo).toContain('<strong>Neha Das</strong>');
    expect(memo.indexOf('Amit Roy')).toBeLessThan(memo.indexOf('Neha Das'));
    expect(applicantCell).toContain('Neha Das');
  });

  it('fir_quashing with no petitioner: complainant is not printed as the applicant', async () => {
    const { memo } = await build({ template_id: 'fir_quashing', complainant_name: 'Neha Das' });
    const start = memo.indexOf('<strong>');
    const applicantCell = memo.slice(start, memo.indexOf('</td>', start));
    expect(applicantCell).not.toContain('Neha Das');
    expect(applicantCell).toContain('<strong>___________</strong>');
    expect(memo).toContain('<strong>Neha Das</strong>');
  });

  it('petitioner_address and petitioner_age are read', async () => {
    const { memo } = await build({
      template_id: 'divorce_hma',
      petitioner_name: 'Pooja Jha',
      petitioner_address: '9 Lake View, Ranchi',
      petitioner_age: 41,
    });
    expect(memo).toContain('9 Lake View, Ranchi');
    expect(memo).toContain('Age: 41 years');
  });
});

describe('T-396 AC (Addendum 4 point 1): State line only when the counterpart is the State', () => {
  it('a State pack with state bihar prints the State line with the name', async () => {
    const { memo } = await build({ ...WOMAN, template_id: 'bail_regular', state: 'bihar' });
    expect(memo).toContain('State of Bihar, through the concerned authority');
  });

  it('a multi-word state id prints the court record name: uttar_pradesh -> Uttar Pradesh', async () => {
    const { memo } = await build({ ...WOMAN, state: 'uttar_pradesh' });
    expect(memo).toContain('State of Uttar Pradesh, through the concerned authority');
    expect(memo).not.toContain('uttar_pradesh');
    expect(memo).not.toContain('Uttar_Pradesh');
  });

  it('a State pack with no state prints the blank, not a made-up State', async () => {
    const { memo } = await build({ ...WOMAN, state: undefined });
    expect(memo).not.toContain('State of');
    expect(memo).toContain('___________');
  });

  it('an unknown state id passes through as given', async () => {
    const { memo } = await build({ ...WOMAN, state: 'atlantis' });
    expect(memo).toContain('State of atlantis, through the concerned authority');
  });

  it.each(['plaint_recovery', 'divorce_hma'])(
    'private pack %s with state set prints no State line',
    async (template_id) => {
      const { memo } = await build({
        template_id,
        plaintiff_name: 'Jai Mehta',
        petitioner_name: 'Jai Mehta',
        defendant_name: 'Kiran Bose',
        respondent_name: 'Kiran Bose',
        state: 'bihar',
      });
      expect(memo).not.toContain('State of');
      expect(memo).not.toContain('through the concerned authority');
    },
  );
});

describe('T-396 (T-317 Addendum 5): Annexure A footer', () => {
  it('Annexure A ends with the disclaimer, and the pack has it once per annexure (7)', async () => {
    const { html, memo } = await build(WOMAN);
    expect(memo.split(DISCLAIMER).length - 1).toBe(1);
    expect(memo.indexOf(DISCLAIMER)).toBeGreaterThan(memo.indexOf('Bar Enrolment No.'));
    expect(html.split(DISCLAIMER).length - 1).toBe(7);
  });
});
