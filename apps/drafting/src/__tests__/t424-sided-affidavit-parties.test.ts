/**
 * T-424 (Part A) — counter and rejoinder affidavit packs: each party under its own role.
 *
 * Rule: handoff/legal/T-381-annexures-button-signed.md Addendum 5.
 *   counter_affidavit: client = respondent_name, counterpart = petitioner_name, client side Respondent.
 *   rejoinder_affidavit: mirror (client petitioner, counterpart respondent).
 *   An answered client_role (petitioner/respondent) overrides the row. The client is never printed
 *   as applicant. Where the side cannot be told: 422 party_details_missing, never a guess.
 *
 * Covers the resolver (services/brief-party-fields.ts) and the route refusal. The Memo and
 * affidavit render for these packs is Part B (annexures.service.ts) and is not tested here.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub(() => undefined),
);

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { applyPartyFields, mapPartyFields } from '../services/brief-party-fields';
import { sealFormInputs } from '../utils/case-details';
import { encrypt } from '../utils/encryption';

type Side = 'petitioner' | 'respondent';
const other = (s: Side): Side => (s === 'petitioner' ? 'respondent' : 'petitioner');

const PACKS: Array<{ id: 'counter_affidavit' | 'rejoinder_affidavit'; rowSide: Side }> = [
  { id: 'counter_affidavit', rowSide: 'respondent' },
  { id: 'rejoinder_affidavit', rowSide: 'petitioner' },
];

/** The two parties under their own role fields. */
const PEOPLE = { petitioner_name: 'Nita Lal', respondent_name: 'Mohan Lal' };

/** The exact mapped output when `client` is the client and the details are filled. */
function expected(client: Side, extra: Record<string, string> = {}) {
  return {
    petitioner_name: PEOPLE.petitioner_name,
    respondent_name: PEOPLE.respondent_name,
    deponent_name: PEOPLE[`${client}_name`],
    client_side: client,
    ...extra,
  };
}

function expectNoApplicantKeys(fields: Record<string, string>) {
  for (const k of Object.keys(fields)) {
    expect(k).not.toMatch(/^applicant_/);
  }
  expect(fields).not.toHaveProperty('father_name');
}

describe('T-424 AC1/AC3: both packs on both sides', () => {
  describe.each(PACKS)('$id', ({ id, rowSide }) => {
    it(`the row: the client is the ${rowSide}`, () => {
      const r = mapPartyFields(id, { ...PEOPLE });
      expect(r.fields).toEqual(expected(rowSide));
      expect(r.clientSide).toBe(rowSide);
      expect(r.clientName).toBe(PEOPLE[`${rowSide}_name`]);
      expect(r.counterpartName).toBe(PEOPLE[`${other(rowSide)}_name`]);
      expect(r.basis).toBe('table');
      expect(r.missing).toEqual([]);
      expectNoApplicantKeys(r.fields);
    });

    it(`the row, dotted parties.* keys, details from the client role's own fields`, () => {
      const r = mapPartyFields(id, {
        'parties.petitioner_name': PEOPLE.petitioner_name,
        'parties.respondent_name': PEOPLE.respondent_name,
        [`parties.${rowSide}_address`]: '1 Own Road',
        [`parties.${rowSide}_age`]: '41',
        [`parties.${rowSide}_father_name`]: 'Shri Own Father',
        'deponent.deponent_address': '9 Deponent Lane',
        'deponent.deponent_age': '52',
      });
      // the client role's own field first, then deponent_*
      expect(r.fields).toEqual(
        expected(rowSide, {
          deponent_address: '1 Own Road',
          deponent_age: '41',
          deponent_father_name: 'Shri Own Father',
        }),
      );
      expectNoApplicantKeys(r.fields);
    });

    it('the row, details from deponent_address / deponent_age when the role has none', () => {
      const r = mapPartyFields(id, {
        ...PEOPLE,
        deponent_address: '9 Deponent Lane',
        deponent_age: 52,
      });
      expect(r.fields).toEqual(
        expected(rowSide, { deponent_address: '9 Deponent Lane', deponent_age: '52' }),
      );
    });

    it('the father comes from <role>_parentage when there is no <role>_father_name', () => {
      const r = mapPartyFields(id, { ...PEOPLE, [`${rowSide}_parentage`]: 'Shri Parent' });
      expect(r.fields.deponent_father_name).toBe('Shri Parent');
    });

    it(`client_role=${other(rowSide)} overrides the row: the client is the ${other(rowSide)}`, () => {
      const side = other(rowSide);
      const r = mapPartyFields(id, { ...PEOPLE, client_role: side });
      expect(r.fields).toEqual(expected(side));
      expect(r.clientSide).toBe(side);
      expect(r.clientName).toBe(PEOPLE[`${side}_name`]);
      expect(r.counterpartName).toBe(PEOPLE[`${other(side)}_name`]);
      expect(r.basis).toBe('client_role');
      expect(r.missing).toEqual([]);
      expectNoApplicantKeys(r.fields);
    });

    it(`client_role=${rowSide} (same as the row) gives the same sides`, () => {
      const r = mapPartyFields(id, { ...PEOPLE, client_role: rowSide });
      expect(r.fields).toEqual(expected(rowSide));
      expect(r.clientSide).toBe(rowSide);
    });

    it('a client_role label (capitalised) is folded to its id', () => {
      const side = other(rowSide);
      const r = mapPartyFields(id, {
        ...PEOPLE,
        client_role: side === 'petitioner' ? 'Petitioner' : 'Respondent',
      });
      expect(r.clientSide).toBe(side);
    });
  });
});

describe('T-424 AC2: where the side cannot be told, refuse', () => {
  describe.each(PACKS)('$id', ({ id, rowSide }) => {
    it('the client name is missing -> client_name', () => {
      const r = mapPartyFields(id, { [`${other(rowSide)}_name`]: 'Only Other' });
      expect(r.missing).toEqual(['client_name']);
      expect(r.clientName).toBe('');
    });

    it('the other side is missing -> opposite_party_name', () => {
      const r = mapPartyFields(id, { [`${rowSide}_name`]: 'Only Client' });
      expect(r.missing).toEqual(['opposite_party_name']);
      expect(r.counterpartName).toBe('');
    });

    it('both missing -> client_name and opposite_party_name', () => {
      expect(mapPartyFields(id, {}).missing).toEqual(['client_name', 'opposite_party_name']);
    });

    it('client_role names the other side but only the row side is filled -> never a guess', () => {
      const side = other(rowSide);
      // client_role says the client is `side`, but that side's name is empty: the
      // row's party is not promoted to the client.
      const r = mapPartyFields(id, { client_role: side, [`${rowSide}_name`]: 'Row Side Person' });
      expect(r.missing).toEqual(['client_name']);
      expect(r.clientName).toBe('');
      expect(r.fields).not.toHaveProperty('deponent_name');
      expect(r.fields[`${rowSide}_name`]).toBe('Row Side Person');
    });

    it.each(['plaintiff', 'defendant', 'applicant', 'appellant', 'accused', 'Not A Role'])(
      'an unusable client_role %p -> client_role, no guess',
      (role) => {
        const r = mapPartyFields(id, { ...PEOPLE, client_role: role });
        // Ajay T-424 44bf8a5: any client_role other than petitioner/respondent is refused.
        // A string that is not a client_role option id at all is not an answer, so the row decides
        // (pinned as built; reported to the lead).
        if (role === 'Not A Role') {
          // not an option id: not "answered", so the row decides
          expect(r.clientSide).toBe(rowSide);
          expect(r.missing).toEqual([]);
        } else {
          expect(r.missing).toEqual(['client_role']);
          expect(r.clientSide).toBeNull();
          expect(r.clientName).toBe('');
          expect(r.fields).not.toHaveProperty('deponent_name');
          expect(r.fields).not.toHaveProperty('petitioner_name');
          expect(r.fields).not.toHaveProperty('respondent_name');
          expect(r.fields).not.toHaveProperty('client_side');
        }
      },
    );
  });

  it('counter_affidavit, client_role=respondent, no petitioner -> [opposite_party_name]', () => {
    const r = mapPartyFields('counter_affidavit', {
      client_role: 'respondent',
      respondent_name: 'Mohan Lal',
    });
    expect(r.missing).toEqual(['opposite_party_name']);
    expect(r.clientSide).toBe('respondent');
    expect(r.fields).toEqual({
      respondent_name: 'Mohan Lal',
      deponent_name: 'Mohan Lal',
      client_side: 'respondent',
    });
  });

  it('client_name with a client_role is the client, under that role', () => {
    const r = mapPartyFields('rejoinder_affidavit', {
      client_role: 'respondent',
      client_name: 'Typed Client',
      petitioner_name: 'Nita Lal',
    });
    expect(r.fields).toEqual({
      respondent_name: 'Typed Client',
      petitioner_name: 'Nita Lal',
      deponent_name: 'Typed Client',
      client_side: 'respondent',
    });
    expect(r.missing).toEqual([]);
  });
});

describe('T-424: a flat key never beats the role fields', () => {
  it.each(PACKS)(
    '$id: applicant_name / a disagreeing flat petitioner_name do not win',
    ({ id, rowSide }) => {
      const r = mapPartyFields(id, {
        ...PEOPLE,
        applicant_name: 'Flat Applicant',
        party_name: 'Flat Party',
        opposite_party: 'Flat Opposite',
        applicant_address: 'Flat Address',
        applicant_age: '1',
        father_name: 'Flat Father',
        address: 'GENERIC ADDRESS',
        age: '99',
      });
      expect(r.fields).toEqual(expected(rowSide));
      expect(JSON.stringify(r)).not.toMatch(/Flat|GENERIC|99/);
    },
  );

  it('counter_affidavit: a flat petitioner_name is the counterpart, not the client', () => {
    // The dotted parties.petitioner_name loses to an undotted one by flatten rules, but the
    // petitioner is the counterpart on this pack either way: it is never the client.
    const r = mapPartyFields('counter_affidavit', {
      'parties.respondent_name': 'Mohan Lal',
      petitioner_name: 'Nita Lal',
      applicant_name: 'Someone Else',
    });
    expect(r.clientName).toBe('Mohan Lal');
    expect(r.fields.deponent_name).toBe('Mohan Lal');
    expect(r.fields.petitioner_name).toBe('Nita Lal');
    expect(r.clientSide).toBe('respondent');
  });
});

describe('T-424: applyPartyFields', () => {
  const STALE = {
    deponent_name: 'Stale Deponent',
    deponent_address: 'Stale Address',
    deponent_age: '88',
    deponent_father_name: 'Stale Father',
    client_side: 'respondent',
  };

  it('stale deponent_* / client_side are cleared on a non-sided pack', () => {
    const mapped = mapPartyFields('plaint_recovery', {
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
    });
    const out = applyPartyFields({ ...STALE, court_type: 'sessions' }, mapped);
    expect(out).toEqual({
      court_type: 'sessions',
      applicant_name: 'Jai Mehta',
      respondent_name: 'Kiran Bose',
    });
  });

  it("plaint_recovery's mapped output is unchanged", () => {
    const r = mapPartyFields('plaint_recovery', {
      plaintiff_name: 'Jai Mehta',
      plaintiff_address: '12 Lake Road',
      plaintiff_age: 44,
      plaintiff_father_name: 'Shri Senior',
      defendant_name: 'Kiran Bose',
      deponent_age: '6',
      deponent_address: 'Y',
    });
    expect(r.fields).toEqual({
      applicant_name: 'Jai Mehta',
      applicant_address: '12 Lake Road',
      applicant_age: '44',
      father_name: 'Shri Senior',
      respondent_name: 'Kiran Bose',
    });
    expect(r.clientSide).toBeNull();
  });

  it('every non-sided result has clientSide null', () => {
    expect(mapPartyFields('bail_regular', { applicant_name: 'A' }).clientSide).toBeNull();
    expect(
      mapPartyFields('vakalatnama', { client_role: 'petitioner', client_name: 'C' }).clientSide,
    ).toBeNull();
    expect(mapPartyFields('a_future_court_pack', {}).clientSide).toBeNull();
    expect(mapPartyFields('synopsis', {}).clientSide).toBeNull();
  });

  it('on a sided pack the stale form values are replaced by the mapped ones', () => {
    const mapped = mapPartyFields('counter_affidavit', { ...PEOPLE });
    const out = applyPartyFields(
      { ...STALE, client_side: 'petitioner', applicant_name: 'Stale', father_name: 'Stale' },
      mapped,
    );
    expect(out).toEqual(expected('respondent'));
  });
});

// ── Route ───────────────────────────────────────────────────────────────────

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994393a1';

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-email': 'test@test.com',
    'x-user-id': USER_ID,
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

interface MockPage {
  setContent: jest.Mock;
  pdf: jest.Mock;
}
let page: MockPage;

beforeEach(async () => {
  _clearAppSettingsCache();
  const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
  page = (await (await puppeteer.launch()).newPage()) as MockPage;
  page.setContent.mockReset();
  page.pdf.mockReset();
  page.setContent.mockResolvedValue(undefined);
  page.pdf.mockResolvedValue(Buffer.from('%PDF'));

  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

async function insertDoc(fields: Record<string, unknown>): Promise<string> {
  const now = new Date();
  const ins = await mongoose.connection.db!.collection('documents').insertOne({
    userId: new mongoose.Types.ObjectId(USER_ID),
    title: 'Draft',
    docType: 'bail_application',
    generatedContent: encrypt('Paragraph one.\n\nParagraph two.'),
    filingChecklist: [],
    checklistState: [],
    exportedAs: [],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    ...fields,
  });
  return String(ins.insertedId);
}

const packPost = (id: string) => request(app).post(`/${id}/annexures-pack`).set(headers());

describe('T-424 AC2: POST /documents/:id/annexures-pack refuses when the side cannot be told', () => {
  async function expectRefused(docId: string, missing: string[]) {
    const res = await packPost(docId);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'party_details_missing', missing });
    expect(page.setContent).not.toHaveBeenCalled();
    expect(page.pdf).not.toHaveBeenCalled();
    expect(res.headers['content-type']).not.toMatch(/pdf/);
    const row = await LawieDocument.findById(docId).lean();
    expect(row!.exportedAs).toEqual([]);
    expect(await Event.countDocuments({})).toBe(0);
  }

  it('counter_affidavit, client_role=respondent, no petitioner -> 422 [opposite_party_name], no export record', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({
        template_id: 'counter_affidavit',
        source: 'brief',
        client_role: 'respondent',
        respondent_name: 'Mohan Lal',
      }),
    });
    await expectRefused(docId, ['opposite_party_name']);
  });

  it('rejoinder_affidavit, client_role=petitioner, no respondent -> 422 [opposite_party_name]', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({
        template_id: 'rejoinder_affidavit',
        source: 'brief',
        client_role: 'petitioner',
        petitioner_name: 'Nita Lal',
      }),
    });
    await expectRefused(docId, ['opposite_party_name']);
  });

  it('counter_affidavit, client_role=accused -> 422 [client_role] (Ajay T-424 44bf8a5)', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({
        template_id: 'counter_affidavit',
        source: 'brief',
        client_role: 'accused',
        respondent_name: 'Mohan Lal',
        petitioner_name: 'Nita Lal',
      }),
    });
    await expectRefused(docId, ['client_role']);
  });

  it('the brief fallback: stored brief without the client name -> 422 [client_name]', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({ template_id: 'counter_affidavit', source: 'brief' }),
      brief: encrypt(
        JSON.stringify({ kind: 'x', values: [{ key: 'petitioner_name', value: 'Nita Lal' }] }),
      ),
    });
    await expectRefused(docId, ['client_name']);
  });
});
