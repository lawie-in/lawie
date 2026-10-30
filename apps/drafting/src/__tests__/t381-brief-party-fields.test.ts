/**
 * T-381 — the annexures pack names the right client and opposite party.
 *
 * A: the mapper (services/brief-party-fields.ts) by Ajay's signed rule
 *    (handoff/legal/T-381-annexures-button-signed.md, Addenda 1-4):
 *    client_role first, then the per-pack table, then blanks (a refusal).
 * B: a brief draft seals the party inputs, court_type and (State rows only) state.
 * C: POST /documents/:id/annexures-pack: names in Annexure A and E (AC3), the
 *    fall-back for older drafts, the 422 refusal, and the State rows unchanged.
 * D: GET /documents/:id: courtDocument and hasParty.
 *
 * Puppeteer is mocked and captures the HTML; the model is a fixture.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import logger from '../config/logger';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import {
  applyPartyFields,
  CLIENT_ROLE_TABLE,
  CLIENT_ROLES,
  flattenPartyValues,
  hasPartyInputs,
  mapPartyFields,
  partyInputKeys,
  pickPartyInputs,
  readStoredBrief,
  SIDED_PACKS,
  storesState,
} from '../services/brief-party-fields';
import { buildAnnexuresPack } from '../services/annexures.service';
import { loadRulePack } from '../services/rule-pack.service';
import { readFormInputs, sealFormInputs } from '../utils/case-details';
import { decrypt, encrypt } from '../utils/encryption';
import { sdkAnswer } from './sdkStream';

// ── A: the mapper ───────────────────────────────────────────────────────────

const ROW_IDS = Object.keys(CLIENT_ROLE_TABLE);
/** The five signed rows with no client field: blanks unless client_role is answered. */
const AMBIGUOUS = [
  'affidavit_in_support',
  'divorce_mutual_consent',
  'list_of_dates',
  'synopsis',
  'memo_of_parties',
];
/** Addendum 3: the only rows where the generic address, age and father_name are the client's. */
const GENERIC_ROWS = ['bail_regular', 'bail_anticipatory', 'consumer_complaint'];
/** Addendum 4: the rows whose counterpart is the State (storesState). */
const STATE_ROWS = [
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'surrender_application',
  'discharge_application',
  'suspension_of_sentence',
  'fir_quashing',
  'quashing_528_bnss',
];

describe('T-381 A: the signed table is real', () => {
  it('has the 60 court packs of Addendum 3', () => {
    expect(ROW_IDS).toHaveLength(60);
  });

  it.each(ROW_IDS)('%s: its fields exist in the pack', (id) => {
    const pack = loadRulePack(id);
    expect(pack).not.toBeNull();
    const names = new Set(pack!.facts.map((f) => f.name));
    const row = CLIENT_ROLE_TABLE[id];
    if (row.client !== null) expect(names.has(row.client)).toBe(true);
    if (row.counterpart.kind === 'field') {
      for (const f of row.counterpart.fields) expect(names.has(f)).toBe(true);
    }
    if (row.caveat) {
      expect(names.has(row.caveat.field)).toBe(true);
      const fact = pack!.facts.find((f) => f.name === row.caveat!.field)!;
      expect(fact.option_ids ?? []).toContain(row.caveat.value);
    }
  });

  it('the four signed detail fields exist in their packs', () => {
    const has = (id: string, name: string) => loadRulePack(id)!.facts.some((f) => f.name === name);
    expect(has('cat_oa', 'applicant_office_address')).toBe(true);
    expect(has('mact_claim', 'victim_age_at_accident')).toBe(true);
    for (const id of ['counter_affidavit', 'rejoinder_affidavit']) {
      expect(has(id, 'deponent_age')).toBe(true);
      expect(has(id, 'deponent_address')).toBe(true);
    }
  });

  it('every ambiguous row has no client field', () => {
    for (const id of AMBIGUOUS) {
      expect(CLIENT_ROLE_TABLE[id].client).toBeNull();
      expect(CLIENT_ROLE_TABLE[id].counterpart).toEqual({ kind: 'none' });
    }
  });
});

describe('T-381 A: one pack per row group (Addendum 3)', () => {
  it('bail (State): the applicant is the client; the State is the opposite party, no respondent field', () => {
    const r = mapPartyFields('bail_regular', {
      applicant_name: 'Asha Rao',
      respondent_name: 'Somebody Else',
    });
    expect(r.clientName).toBe('Asha Rao');
    expect(r.counterpart).toBe('state');
    expect(r.counterpartName).toBe('');
    expect(r.basis).toBe('table');
    expect(r.missing).toEqual([]);
    expect(r.fields).toEqual({ applicant_name: 'Asha Rao' });
  });

  it('suspension of sentence (State): the appellant is the client', () => {
    const r = mapPartyFields('suspension_of_sentence', { appellant_name: 'Convict One' });
    expect(r).toMatchObject({ clientName: 'Convict One', counterpart: 'state', missing: [] });
    expect(r.fields).toEqual({ applicant_name: 'Convict One' });
  });

  it('application: applicant against respondent', () => {
    const r = mapPartyFields('amendment_of_pleadings', {
      applicant_name: 'Bina Shah',
      respondent_name: 'Chand Traders',
    });
    expect(r.fields).toEqual({ applicant_name: 'Bina Shah', respondent_name: 'Chand Traders' });
    expect(r.counterpart).toBe('field');
    expect(r.missing).toEqual([]);
  });

  it('interim application: the opposite party is non_applicant_name', () => {
    const r = mapPartyFields('interim_application', {
      applicant_name: 'Bina Shah',
      non_applicant_name: 'Dev Pal',
    });
    expect(r.fields).toEqual({ applicant_name: 'Bina Shah', respondent_name: 'Dev Pal' });
  });

  it('petition: petitioner against respondent', () => {
    const r = mapPartyFields('divorce_hma', {
      petitioner_name: 'Esha Roy',
      respondent_name: 'Farid Roy',
    });
    expect(r.fields).toEqual({ applicant_name: 'Esha Roy', respondent_name: 'Farid Roy' });
  });

  it('writ against an authority: respondent_authority is the opposite party', () => {
    const r = mapPartyFields('mandamus', {
      petitioner_name: 'Esha Roy',
      respondent_authority: 'The Collector',
    });
    expect(r.fields).toEqual({ applicant_name: 'Esha Roy', respondent_name: 'The Collector' });
  });

  it('writ with no counterpart field: no opposite party, nothing raised', () => {
    const r = mapPartyFields('writ_petition_civil', { petitioner_name: 'Esha Roy' });
    expect(r).toMatchObject({ counterpart: 'none', counterpartName: '', missing: [] });
    expect(r.fields).toEqual({ applicant_name: 'Esha Roy' });
  });

  it('appeal: appellant against respondent', () => {
    const r = mapPartyFields('criminal_appeal', {
      appellant_name: 'Gita Nair',
      respondent_name: 'The State',
    });
    expect(r.fields).toEqual({ applicant_name: 'Gita Nair', respondent_name: 'The State' });
  });

  it('complaint: the complainant against the respondent', () => {
    const r = mapPartyFields('posh_complaint', {
      complainant_name: 'Hema Das',
      respondent_name: 'Ila Jain',
    });
    expect(r.fields).toEqual({ applicant_name: 'Hema Das', respondent_name: 'Ila Jain' });
  });

  it('suit: plaintiff against defendant', () => {
    const r = mapPartyFields('plaint_recovery', {
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
    });
    expect(r.fields).toEqual({ applicant_name: 'Jai Mehta', respondent_name: 'Kiran Bose' });
  });

  it('suit with no counterpart field (partition)', () => {
    const r = mapPartyFields('plaint_partition', { plaintiff_name: 'Jai Mehta' });
    expect(r).toMatchObject({ counterpart: 'none', missing: [] });
  });

  it('written statement: the defendant is the client, no counterpart field', () => {
    const r = mapPartyFields('written_statement', { defendant_name: 'Lata Sen' });
    expect(r).toMatchObject({
      clientName: 'Lata Sen',
      counterpart: 'none',
      counterpartName: '',
      missing: [],
    });
    expect(r.fields).toEqual({ applicant_name: 'Lata Sen' });
  });

  it('restoration application reads dotted parties.* keys', () => {
    const r = mapPartyFields('restoration_application', {
      'parties.plaintiff_name': 'Jai Mehta',
      'parties.defendant_name': 'Kiran Bose',
    });
    expect(r.fields).toEqual({ applicant_name: 'Jai Mehta', respondent_name: 'Kiran Bose' });
  });

  it('counter affidavit: parties.respondent_name is the client, parties.petitioner_name the counterpart', () => {
    const r = mapPartyFields('counter_affidavit', {
      'parties.respondent_name': 'Mohan Lal',
      'parties.petitioner_name': 'Nita Lal',
    });
    // T-424 (Addendum 5): each party under its own role; the client is also the deponent.
    expect(r.fields).toEqual({
      respondent_name: 'Mohan Lal',
      petitioner_name: 'Nita Lal',
      deponent_name: 'Mohan Lal',
      client_side: 'respondent',
    });
    expect(r.clientName).toBe('Mohan Lal');
    expect(r.counterpartName).toBe('Nita Lal');
  });

  it('rejoinder affidavit: parties.petitioner_name is the client, parties.respondent_name the counterpart', () => {
    const r = mapPartyFields('rejoinder_affidavit', {
      'parties.petitioner_name': 'Nita Lal',
      'parties.respondent_name': 'Mohan Lal',
    });
    expect(r.fields).toEqual({
      petitioner_name: 'Nita Lal',
      respondent_name: 'Mohan Lal',
      deponent_name: 'Nita Lal',
      client_side: 'petitioner',
    });
  });

  it('consumer complaint: applicant_name is the complainant, respondent_name the Opposite Party', () => {
    const r = mapPartyFields('consumer_complaint', {
      applicant_name: 'Om Puri',
      respondent_name: 'Quick Mart Ltd',
    });
    expect(r.clientName).toBe('Om Puri');
    expect(r.counterpartName).toBe('Quick Mart Ltd');
    expect(r.fields).toEqual({ applicant_name: 'Om Puri', respondent_name: 'Quick Mart Ltd' });
  });

  it('mact claim: owner and insurer are both printed', () => {
    const r = mapPartyFields('mact_claim', {
      victim_name: 'Pia Singh',
      owner_name: 'Ravi Owner',
      insurer_name: 'Safe Insurance',
    });
    expect(r.clientName).toBe('Pia Singh');
    expect(r.counterpartName).toBe('Ravi Owner, Safe Insurance');
    expect(r.fields.respondent_name).toBe('Ravi Owner, Safe Insurance');
  });

  it('quashing: the complainant is the counterpart field; the State is added by the form (withState)', () => {
    const r = mapPartyFields('fir_quashing', {
      petitioner_name: 'Qadir Ali',
      complainant_name: 'Rita Ghosh',
    });
    expect(r.fields).toEqual({ applicant_name: 'Qadir Ali', respondent_name: 'Rita Ghosh' });
    expect(r.missing).toEqual([]);
  });

  it('vakalatnama: client_name is the client', () => {
    const r = mapPartyFields('vakalatnama', { client_name: 'Sunil Kapoor' });
    expect(r).toMatchObject({ clientName: 'Sunil Kapoor', counterpart: 'none', missing: [] });
  });
});

describe('T-381 A: Addendum 1 signed cases', () => {
  it('a complaint with both names: the complainant is the client, never the accused', () => {
    const r = mapPartyFields('posh_complaint', {
      accused_name: 'Accused Person',
      complainant_name: 'Complainant Person',
      respondent_name: 'Respondent Person',
    });
    expect(r.clientName).toBe('Complainant Person');
    expect(r.fields.applicant_name).toBe('Complainant Person');
    expect(r.counterpartName).toBe('Respondent Person');
    expect(JSON.stringify(r.fields)).not.toContain('Accused Person');
  });

  it('a written statement with both names: the defendant is the client, never the plaintiff', () => {
    const r = mapPartyFields('written_statement', {
      plaintiff_name: 'Plaintiff Person',
      petitioner_name: 'Petitioner Person',
      defendant_name: 'Defendant Person',
    });
    expect(r.clientName).toBe('Defendant Person');
    expect(r.fields).toEqual({ applicant_name: 'Defendant Person' });
  });

  it('a pack with no row and no role: refused, no applicant_name', () => {
    const r = mapPartyFields('a_future_court_pack', {
      applicant_name: 'Some One',
      petitioner_name: 'Some Two',
      plaintiff_name: 'Some Three',
      respondent_name: 'Some Four',
    });
    expect(r.basis).toBe('no_row');
    expect(r.missing).toEqual(['client_role']);
    expect(r.clientName).toBe('');
    expect(r.counterpartName).toBe('');
    expect(r.fields).not.toHaveProperty('applicant_name');
    expect(r.fields).not.toHaveProperty('respondent_name');
  });

  it('an empty pack id has no row either', () => {
    expect(mapPartyFields('', { applicant_name: 'X Y' }).missing).toEqual(['client_role']);
  });

  it('a prototype key is not a row', () => {
    const r = mapPartyFields('constructor', { applicant_name: 'X Y' });
    expect(r.basis).toBe('no_row');
    expect(r.missing).toEqual(['client_role']);
  });
});

describe('T-381 A: the three caveat rows give blanks, never a swap (Addendum 3)', () => {
  const cases: Array<[string, string, string, string]> = [
    ['bail_cancellation', 'party_role', 'Accused (for variation of conditions)', 'label'],
    ['bail_cancellation', 'party_role', 'accused_for_variation_of_conditions', 'id'],
    ['rera_complaint', 'complainant_type', 'promoter_against_allottee', 'id'],
    ['mact_claim', 'claim_type', 'death_claim_by_legal_heirs', 'id'],
  ];

  it.each(cases)(
    '%s with %s = %s (%s): client_role is missing, nobody becomes the client',
    (id, k, v) => {
      const row = CLIENT_ROLE_TABLE[id];
      const values: Record<string, unknown> = {
        [k]: v,
        [row.client!]: 'Named Client',
        petitioner_name: 'Named Petitioner',
        respondent_name: 'Named Respondent',
        promoter_name: 'Named Promoter',
        owner_name: 'Named Owner',
      };
      const r = mapPartyFields(id, values);
      expect(r.basis).toBe('caveat');
      expect(r.missing).toEqual(['client_role']);
      expect(r.clientName).toBe('');
      expect(r.counterpartName).toBe('');
      expect(r.fields).not.toHaveProperty('applicant_name');
      expect(r.fields).not.toHaveProperty('respondent_name');
    },
  );

  it('another answer to the same question keeps the signed row', () => {
    const r = mapPartyFields('rera_complaint', {
      complainant_type: 'allottee',
      complainant_name: 'Allottee One',
      promoter_name: 'Builder Ltd',
    });
    expect(r.basis).toBe('table');
    expect(r.fields).toEqual({ applicant_name: 'Allottee One', respondent_name: 'Builder Ltd' });
    expect(r.missing).toEqual([]);
  });

  it('a caveat answered on another pack means nothing', () => {
    const r = mapPartyFields('posh_complaint', {
      complainant_type: 'promoter_against_allottee',
      complainant_name: 'Hema Das',
      respondent_name: 'Ila Jain',
    });
    expect(r.basis).toBe('table');
    expect(r.missing).toEqual([]);
  });
});

describe('T-381 A: ambiguous rows', () => {
  it.each(AMBIGUOUS)('%s: blanks, refused with client_role, whatever names are present', (id) => {
    const r = mapPartyFields(id, {
      applicant_name: 'A One',
      petitioner_name: 'P Two',
      respondent_name: 'R Three',
      client_name: 'C Four',
    });
    expect(r.basis).toBe('blank_row');
    expect(r.missing).toEqual(['client_role']);
    expect(r.clientName).toBe('');
    expect(r.fields).toEqual({});
  });
});

describe('T-381 A: an answered client_role beats the table (rule 1)', () => {
  it('written statement answered as plaintiff: the plaintiff is the client, the defendant the counterpart', () => {
    const r = mapPartyFields('written_statement', {
      client_role: 'plaintiff',
      plaintiff_name: 'Plaintiff Person',
      defendant_name: 'Defendant Person',
    });
    expect(r.basis).toBe('client_role');
    expect(r.clientName).toBe('Plaintiff Person');
    expect(r.counterpartName).toBe('Defendant Person');
    expect(r.fields).toEqual({
      applicant_name: 'Plaintiff Person',
      respondent_name: 'Defendant Person',
    });
    expect(r.missing).toEqual([]);
  });

  it('an ambiguous row resolves', () => {
    const r = mapPartyFields('synopsis', {
      client_role: 'petitioner',
      petitioner_name: 'Pia Nair',
      respondent_name: 'Rao Co',
    });
    expect(r.missing).toEqual([]);
    expect(r.fields).toEqual({ applicant_name: 'Pia Nair', respondent_name: 'Rao Co' });
  });

  it('a caveat row resolves', () => {
    const r = mapPartyFields('bail_cancellation', {
      party_role: 'accused_for_variation_of_conditions',
      client_role: 'petitioner',
      petitioner_name: 'Pia Nair',
      respondent_name: 'Rao Co',
    });
    expect(r.basis).toBe('client_role');
    expect(r.clientName).toBe('Pia Nair');
    expect(r.missing).toEqual([]);
  });

  it('a no-row pack resolves', () => {
    const r = mapPartyFields('a_future_court_pack', {
      client_role: 'defendant',
      defendant_name: 'Dee Fend',
      plaintiff_name: 'Pla In',
    });
    expect(r.clientName).toBe('Dee Fend');
    expect(r.counterpartName).toBe('Pla In');
  });

  it('an option label is folded to its id', () => {
    const r = mapPartyFields('synopsis', {
      client_role: ' Petitioner ',
      petitioner_name: 'Pia Nair',
    });
    expect(r.basis).toBe('client_role');
    expect(r.clientName).toBe('Pia Nair');
  });

  it('client_name is used first, with the role for the counterpart', () => {
    const r = mapPartyFields('vakalatnama', {
      client_role: 'applicant',
      client_name: 'Chosen Client',
      applicant_name: 'Other Applicant',
      respondent_name: 'The Other Side',
    });
    expect(r.clientName).toBe('Chosen Client');
    expect(r.fields.respondent_name).toBe('The Other Side');
  });

  it('respondent and accused roles have no counterpart field: the signed blank, not a refusal', () => {
    for (const role of ['respondent', 'accused']) {
      const r = mapPartyFields('synopsis', {
        client_role: role,
        [`${role}_name`]: 'Named Side',
        petitioner_name: 'Not Me',
        applicant_name: 'Not Me Either',
      });
      expect(r.clientName).toBe('Named Side');
      expect(r.counterpart).toBe('none');
      expect(r.counterpartName).toBe('');
      expect(r.missing).toEqual([]);
      expect(r.fields).toEqual({ applicant_name: 'Named Side' });
    }
  });

  it('an answered role whose name is empty: client_name is missing', () => {
    const r = mapPartyFields('synopsis', { client_role: 'petitioner' });
    expect(r.missing).toEqual(['client_name']);
  });

  it('knows the seven roles', () => {
    expect([...CLIENT_ROLES]).toEqual([
      'petitioner',
      'applicant',
      'plaintiff',
      'defendant',
      'respondent',
      'accused',
      'appellant',
    ]);
  });
});

describe('T-381 A: an invalid client_role is ignored', () => {
  it('the row applies', () => {
    const r = mapPartyFields('written_statement', {
      client_role: 'judge',
      defendant_name: 'Dee Fend',
      plaintiff_name: 'Pla In',
    });
    expect(r.basis).toBe('table');
    expect(r.clientName).toBe('Dee Fend');
  });

  it('no row: still refused with client_role', () => {
    const r = mapPartyFields('a_future_court_pack', {
      client_role: 'judge',
      petitioner_name: 'Pia Nair',
    });
    expect(r.missing).toEqual(['client_role']);
  });

  it('a number, an empty value or an unknown word is ignored too', () => {
    for (const v of [7, '', '   ', null, 'judge']) {
      const r = mapPartyFields('synopsis', { client_role: v, petitioner_name: 'Pia Nair' });
      expect(r.basis).toBe('blank_row');
      expect(r.missing).toEqual(['client_role']);
    }
  });
});

describe('T-381 A: client_name vs opposite_party_name vs client_role', () => {
  it('client name empty: client_name', () => {
    expect(mapPartyFields('plaint_recovery', { defendant_name: 'Kiran Bose' }).missing).toEqual([
      'client_name',
    ]);
  });

  it('opposite party empty: opposite_party_name', () => {
    expect(mapPartyFields('plaint_recovery', { plaintiff_name: 'Jai Mehta' }).missing).toEqual([
      'opposite_party_name',
    ]);
  });

  it('both empty: both, client first', () => {
    expect(mapPartyFields('plaint_recovery', {}).missing).toEqual([
      'client_name',
      'opposite_party_name',
    ]);
  });

  it('white space is empty', () => {
    expect(
      mapPartyFields('plaint_recovery', { plaintiff_name: '   ', defendant_name: '\n' }).missing,
    ).toEqual(['client_name', 'opposite_party_name']);
  });

  it('mact: one of owner or insurer is enough', () => {
    expect(
      mapPartyFields('mact_claim', { victim_name: 'Pia Singh', insurer_name: 'Safe Insurance' })
        .missing,
    ).toEqual([]);
    expect(mapPartyFields('mact_claim', { victim_name: 'Pia Singh' }).missing).toEqual([
      'opposite_party_name',
    ]);
  });

  it('the side is unknown (no row, ambiguous, caveat): client_role, never client_name', () => {
    expect(mapPartyFields('nope', {}).missing).toEqual(['client_role']);
    expect(mapPartyFields('synopsis', {}).missing).toEqual(['client_role']);
    expect(
      mapPartyFields('rera_complaint', { complainant_type: 'promoter_against_allottee' }).missing,
    ).toEqual(['client_role']);
  });

  it('a State row with no applicant: client_name only', () => {
    expect(mapPartyFields('bail_regular', {}).missing).toEqual(['client_name']);
  });
});

describe('T-381 A: State and no-field rows never raise opposite_party_name', () => {
  const noField = ROW_IDS.filter((id) => {
    const cp = CLIENT_ROLE_TABLE[id].counterpart;
    return CLIENT_ROLE_TABLE[id].client !== null && cp.kind !== 'field';
  });

  it('there are State rows and no-field rows to check', () => {
    expect(noField).toEqual(
      expect.arrayContaining(['bail_regular', 'cat_oa', 'written_statement', 'slp', 'replication']),
    );
  });

  it.each(noField)('%s: only the client name is asked for', (id) => {
    const client = CLIENT_ROLE_TABLE[id].client!;
    expect(mapPartyFields(id, { [client]: 'Named Client' }).missing).toEqual([]);
    expect(mapPartyFields(id, {}).missing).toEqual(['client_name']);
  });
});

describe('T-381 A: client details come only from the matching role (Addendum 1 and 3)', () => {
  const GENERIC = { address: 'GENERIC ADDRESS', father_name: 'GENERIC FATHER', age: '99' };

  it.each(ROW_IDS.filter((id) => CLIENT_ROLE_TABLE[id].client !== null))(
    '%s: generic address, age and father_name are the client only on the signed rows',
    (id) => {
      const client = CLIENT_ROLE_TABLE[id].client!;
      const r = mapPartyFields(id, { [client]: 'Named Client', ...GENERIC });
      if (id in SIDED_PACKS) {
        // T-424: the client under its own role and as the deponent; no generic value, no applicant_* key.
        expect(r.fields).toEqual({
          [client]: 'Named Client',
          deponent_name: 'Named Client',
          client_side: SIDED_PACKS[id],
        });
      } else if (GENERIC_ROWS.includes(id)) {
        expect(r.fields).toEqual({
          applicant_name: 'Named Client',
          applicant_address: 'GENERIC ADDRESS',
          applicant_age: '99',
          father_name: 'GENERIC FATHER',
        });
      } else {
        expect(r.fields).toEqual({ applicant_name: 'Named Client' });
      }
    },
  );

  it('the generic values never reach the counterpart', () => {
    for (const id of GENERIC_ROWS) {
      const r = mapPartyFields(id, { ...GENERIC });
      expect(r.fields).not.toHaveProperty('respondent_name');
      expect(r.counterpartName).toBe('');
    }
    const r = mapPartyFields('consumer_complaint', {
      applicant_name: 'Om Puri',
      respondent_name: 'Quick Mart Ltd',
      ...GENERIC,
    });
    expect(r.fields.respondent_name).toBe('Quick Mart Ltd');
    expect(r.fields.respondent_name).not.toContain('GENERIC');
  });

  it("the counterpart's own address, age and parentage never fill the client", () => {
    const r = mapPartyFields('plaint_recovery', {
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
      defendant_address: 'DEFENDANT ADDRESS',
      defendant_age: '61',
      defendant_father_name: 'DEFENDANT FATHER',
      respondent_address: 'RESPONDENT ADDRESS',
    });
    expect(r.fields).toEqual({ applicant_name: 'Jai Mehta', respondent_name: 'Kiran Bose' });
  });

  it("the client's own role fields do fill the client", () => {
    const r = mapPartyFields('plaint_recovery', {
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
      plaintiff_address: '12 Lake Road',
      plaintiff_age: 44,
      plaintiff_father_name: 'Late Shri Mehta',
    });
    expect(r.fields).toEqual({
      applicant_name: 'Jai Mehta',
      respondent_name: 'Kiran Bose',
      applicant_address: '12 Lake Road',
      applicant_age: '44',
      father_name: 'Late Shri Mehta',
    });
  });

  it('a <role>_parentage is accepted for father_name', () => {
    const r = mapPartyFields('divorce_hma', {
      petitioner_name: 'Esha Roy',
      respondent_name: 'Farid Roy',
      petitioner_parentage: 'Daughter of Shri Roy',
    });
    expect(r.fields.father_name).toBe('Daughter of Shri Roy');
  });

  it('a role answered by client_role: only its own details, never the generic ones', () => {
    const r = mapPartyFields('bail_regular', {
      client_role: 'petitioner',
      petitioner_name: 'Pia Nair',
      petitioner_address: 'PETITIONER ADDRESS',
      ...GENERIC,
    });
    expect(r.fields).toEqual({
      applicant_name: 'Pia Nair',
      applicant_address: 'PETITIONER ADDRESS',
    });
  });
});

describe('T-381 A: the four signed detail rows (Addendum 4)', () => {
  it('cat_oa: the client address is applicant_office_address', () => {
    const r = mapPartyFields('cat_oa', {
      applicant_name: 'Uma Das',
      applicant_office_address: 'Room 4, Secretariat',
    });
    expect(r.fields).toEqual({
      applicant_name: 'Uma Das',
      applicant_address: 'Room 4, Secretariat',
    });
    expect(r.missing).toEqual([]);
  });

  it('mact_claim: the client age is victim_age_at_accident', () => {
    const r = mapPartyFields('mact_claim', {
      victim_name: 'Pia Singh',
      owner_name: 'Ravi Owner',
      victim_age_at_accident: 29,
    });
    expect(r.fields).toEqual({
      applicant_name: 'Pia Singh',
      respondent_name: 'Ravi Owner',
      applicant_age: '29',
    });
  });

  it.each(['counter_affidavit', 'rejoinder_affidavit'])(
    '%s: age and address come from deponent_age and deponent_address (dotted keys too)',
    (id) => {
      const client = CLIENT_ROLE_TABLE[id].client!;
      const cp = CLIENT_ROLE_TABLE[id].counterpart;
      const other = cp.kind === 'field' ? cp.fields[0] : '';
      const r = mapPartyFields(id, {
        [`parties.${client}`]: 'Deponent One',
        [`parties.${other}`]: 'Other Side',
        'deponent.deponent_age': '52',
        'deponent.deponent_address': '9 Court Lane',
      });
      // T-424: the detail rows fill deponent_age / deponent_address; each party under its own role.
      const clientSide = SIDED_PACKS[id];
      const otherSide = clientSide === 'respondent' ? 'petitioner' : 'respondent';
      expect(r.fields).toEqual({
        [`${clientSide}_name`]: 'Deponent One',
        [`${otherSide}_name`]: 'Other Side',
        deponent_name: 'Deponent One',
        deponent_age: '52',
        deponent_address: '9 Court Lane',
        client_side: clientSide,
      });
    },
  );

  it('the detail fields are not read on other rows', () => {
    const r = mapPartyFields('plaint_recovery', {
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
      applicant_office_address: 'X',
      victim_age_at_accident: '5',
      deponent_age: '6',
      deponent_address: 'Y',
    });
    expect(r.fields).toEqual({ applicant_name: 'Jai Mehta', respondent_name: 'Kiran Bose' });
  });
});

describe('T-381 A: advocate values pass through', () => {
  it('advocate_name and enrolment are kept when typed, trimmed', () => {
    const r = mapPartyFields('plaint_recovery', {
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
      advocate_name: '  Adv. Rao ',
      advocate_enrollment: 'D/1/2020',
      enrollment_number: 'D/2/2021',
    });
    expect(r.fields).toMatchObject({
      advocate_name: 'Adv. Rao',
      advocate_enrollment: 'D/1/2020',
      enrollment_number: 'D/2/2021',
    });
  });

  it('is kept even when the pack is refused', () => {
    const r = mapPartyFields('nope', { advocate_name: 'Adv. Rao' });
    expect(r.fields).toEqual({ advocate_name: 'Adv. Rao' });
  });
});

describe('T-381 A: storesState (Addendum 4)', () => {
  it('is true for exactly the State rows', () => {
    expect(ROW_IDS.filter((id) => storesState(id)).sort()).toEqual([...STATE_ROWS].sort());
  });

  it.each(['plaint_declaration', 'plaint_recovery', 'written_statement', 'criminal_revision'])(
    'is false for %s',
    (id) => {
      expect(storesState(id)).toBe(false);
    },
  );

  it('is false for guided, a no-row pack, an empty id and a prototype key', () => {
    for (const id of ['guided', 'a_future_court_pack', '', 'constructor', 'toString']) {
      expect(storesState(id)).toBe(false);
    }
  });
});

describe('T-381 A: flatten, pick, apply', () => {
  it('flattenPartyValues: last segment; undotted beats dotted; a non-empty beats an empty; first on a tie', () => {
    expect(
      flattenPartyValues({
        'a.x': 'dotted',
        x: 'plain',
        'b.y': '',
        'c.y': 'second',
        'd.y': 'third',
      }),
    ).toEqual({ x: 'plain', y: 'second' });
  });

  it('flattenPartyValues: reads the brief value list and ignores bad items', () => {
    expect(
      flattenPartyValues([
        { key: 'parties.plaintiff_name', value: 'Jai' },
        { key: 7, value: 'x' },
        null,
        'str',
        { key: 'age', value: 3 },
      ]),
    ).toEqual({ plaintiff_name: 'Jai', age: 3 });
    expect(flattenPartyValues(null)).toEqual({});
    expect(flattenPartyValues('x')).toEqual({});
  });

  it('pickPartyInputs: the pack own role fields and client_role only, non-empty, trimmed', () => {
    const picked = pickPartyInputs('plaint_recovery', [
      { key: 'plaintiff_name', value: ' Jai Mehta ' },
      { key: 'defendant_name', value: 'Kiran Bose' },
      { key: 'plaintiff_age', value: 44 },
      { key: 'client_role', value: 'plaintiff' },
      { key: 'defendant_address', value: '' },
      { key: 'facts_narrative', value: 'A long private narrative' },
      { key: 'principal_amount', value: '500000' },
      { key: 'sections_charged', value: ['318'] },
    ]);
    expect(picked).toEqual({
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
      plaintiff_age: '44',
      client_role: 'plaintiff',
    });
  });

  it('pickPartyInputs: the caveat answer and the signed detail fields are kept', () => {
    expect(
      pickPartyInputs('mact_claim', [
        { key: 'victim_name', value: 'Pia Singh' },
        { key: 'claim_type', value: 'death_claim_by_legal_heirs' },
        { key: 'victim_age_at_accident', value: '29' },
      ]),
    ).toEqual({
      victim_name: 'Pia Singh',
      claim_type: 'death_claim_by_legal_heirs',
      victim_age_at_accident: '29',
    });
    expect(pickPartyInputs('cat_oa', { applicant_office_address: 'Room 4' })).toEqual({
      applicant_office_address: 'Room 4',
    });
    expect(
      pickPartyInputs('counter_affidavit', {
        'parties.respondent_name': 'M',
        'parties.petitioner_name': 'N',
        deponent_age: '5',
        deponent_address: 'A',
      }),
    ).toEqual({
      respondent_name: 'M',
      petitioner_name: 'N',
      deponent_age: '5',
      deponent_address: 'A',
    });
  });

  it('partyInputKeys: includes the row fields, and nothing from a no-row pack beyond the role fields', () => {
    expect(partyInputKeys('bail_regular').has('applicant_name')).toBe(true);
    expect(partyInputKeys('bail_regular').has('father_name')).toBe(true);
    expect(partyInputKeys('a_future_court_pack').has('client_role')).toBe(true);
    expect(partyInputKeys('a_future_court_pack').has('fir_number')).toBe(false);
    expect(partyInputKeys('bail_regular').has('fir_number')).toBe(false);
  });

  it('hasPartyInputs', () => {
    expect(hasPartyInputs('plaint_recovery', [{ key: 'plaintiff_name', value: 'Jai' }])).toBe(true);
    expect(hasPartyInputs('plaint_recovery', [{ key: 'principal_amount', value: '5' }])).toBe(
      false,
    );
    expect(hasPartyInputs('plaint_recovery', [])).toBe(false);
    expect(hasPartyInputs('plaint_recovery', undefined)).toBe(false);
  });

  it('the pack mapping of the picked inputs equals the mapping of the full brief', () => {
    const brief = [
      { key: 'plaintiff_name', value: 'Jai Mehta' },
      { key: 'defendant_name', value: 'Kiran Bose' },
      { key: 'facts_narrative', value: 'x' },
    ];
    expect(mapPartyFields('plaint_recovery', pickPartyInputs('plaint_recovery', brief))).toEqual(
      mapPartyFields('plaint_recovery', flattenPartyValues(brief)),
    );
  });

  it('applyPartyFields: clears the fall-back keys, then the mapped keys win', () => {
    const mapped = mapPartyFields('plaint_recovery', {
      plaintiff_name: 'Jai Mehta',
      defendant_name: 'Kiran Bose',
    });
    const out = applyPartyFields(
      {
        template_id: 'plaint_recovery',
        court_type: 'district_court',
        petitioner_name: 'Wrong Petitioner',
        party_name: 'Wrong Party',
        address: 'GENERIC ADDRESS',
        age: '99',
        father_name: 'GENERIC FATHER',
        parent_name: 'GENERIC PARENT',
        applicant_address: 'WRONG',
        applicant_age: '1',
        opposite_party: 'Wrong Opposite',
        respondent_name: 'Wrong Respondent',
      },
      mapped,
    );
    expect(out).toEqual({
      template_id: 'plaint_recovery',
      court_type: 'district_court',
      applicant_name: 'Jai Mehta',
      respondent_name: 'Kiran Bose',
    });
  });

  it('applyPartyFields: a State row keeps the form respondent keys', () => {
    const mapped = mapPartyFields('bail_regular', { applicant_name: 'Asha Rao' });
    const out = applyPartyFields(
      { respondent_name: 'State of Bihar', opposite_party: 'The State', state: 'Bihar' },
      mapped,
    );
    expect(out).toEqual({
      respondent_name: 'State of Bihar',
      opposite_party: 'The State',
      state: 'Bihar',
      applicant_name: 'Asha Rao',
    });
  });

  it('applyPartyFields: a no-field row clears a stale respondent', () => {
    const mapped = mapPartyFields('written_statement', { defendant_name: 'Lata Sen' });
    const out = applyPartyFields({ respondent_name: 'Stale', opposite_party: 'Stale' }, mapped);
    expect(out).toEqual({ applicant_name: 'Lata Sen' });
  });

  it('readStoredBrief: values, and court_document only when it is a boolean', () => {
    expect(readStoredBrief('{"values":[1],"court_document":true}')).toEqual({
      values: [1],
      courtDocument: true,
    });
    expect(readStoredBrief('{"values":[],"court_document":"yes"}')).toEqual({ values: [] });
    expect(readStoredBrief('{}')).toEqual({ values: [] });
    expect(readStoredBrief('[1,2]')).toEqual({ values: [] });
    expect(readStoredBrief('null')).toEqual({ values: [] });
    expect(() => readStoredBrief('not json')).toThrow();
  });
});

describe('T-381 A: nothing is logged by the mapper (the values are PII)', () => {
  it('no console or logger call while mapping, picking and applying', () => {
    const spies = [
      ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
        jest.spyOn(console, m).mockImplementation(() => undefined),
      ),
      ...(['info', 'warn', 'error', 'debug', 'trace', 'fatal'] as const).map((m) =>
        jest.spyOn(logger, m).mockImplementation(() => undefined),
      ),
    ];
    try {
      const brief = [
        { key: 'plaintiff_name', value: 'Secret Plaintiff' },
        { key: 'defendant_name', value: 'Secret Defendant' },
      ];
      for (const id of [...ROW_IDS, 'a_future_court_pack']) {
        mapPartyFields(id, flattenPartyValues(brief));
        pickPartyInputs(id, brief);
        storesState(id);
      }
      applyPartyFields({}, mapPartyFields('plaint_recovery', flattenPartyValues(brief)));
      try {
        readStoredBrief('{bad');
      } catch {
        // the caller handles it
      }
      for (const s of spies) expect(s).not.toHaveBeenCalled();
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

// ── B, C, D: routes ─────────────────────────────────────────────────────────

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994393a1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const COURT = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-email': 'test@test.com',
    'x-user-id': userId,
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

interface MockPage {
  setContent: jest.Mock;
  pdf: jest.Mock;
}

let html = '';
let page: MockPage;

beforeEach(async () => {
  _clearAppSettingsCache();
  mockMessagesStream.mockReset();
  const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
  page = (await (await puppeteer.launch()).newPage()) as MockPage;
  page.setContent.mockReset();
  page.pdf.mockReset();
  html = '';
  page.setContent.mockImplementation((h: string) => {
    html = h;
    return Promise.resolve(undefined);
  });
  page.pdf.mockResolvedValue(Buffer.from('%PDF'));

  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.template_civil_plaint', value: 'on' });
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
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

const rawDocs = () => mongoose.connection.db!.collection('documents');

/** The model's answer for a pack: a numbered body and the clause report. */
function drafterAnswer(packId: string, body: string): string {
  const ids = loadRulePack(packId)!.mandatoryClauses.map((c) => c.id);
  return `${body}\n\n${CLAUSES_MARKER}\n${ids.map((id) => `${id}: 1`).join('\n')}`;
}

const BAIL_VALUES = [
  { key: 'applicant_name', value: 'Ram Kumar' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'facts_narrative', value: 'A private narrative about the incident.' },
];
const BAIL_BODY = [
  '1. That the applicant Ram Kumar is a law-abiding citizen.',
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
].join('\n\n');

const PLAINT_VALUES = [
  { key: 'plaintiff_name', value: 'Jai Mehta' },
  { key: 'plaintiff_father_name', value: 'Shri Mehta Senior' },
  { key: 'plaintiff_age', value: '44' },
  { key: 'plaintiff_address', value: '12 Lake Road, Patna' },
  { key: 'defendant_name', value: 'Kiran Bose' },
  { key: 'defendant_address', value: '7 Hill Street, Gaya' },
  { key: 'principal_amount', value: '500000' },
  { key: 'address', value: 'GENERIC ADDRESS NOT FOR THE PLAINTIFF' },
];
const PLAINT_BODY = [
  '1. That the plaintiff Jai Mehta seeks recovery of the money from the defendant.',
  '2. That the cause of action arose within the jurisdiction of this Court.',
].join('\n\n');

async function generateFromBrief(
  kind: string,
  values: unknown[],
  body: string,
  court: Record<string, string> = COURT,
): Promise<string> {
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(drafterAnswer(kind, body), 4000, 800));
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind, values, court, paragraphs: 12 });
  expect(`${res.status} ${res.text.slice(0, 300)}`).toMatch(/^200 /);
  const block = res.text
    .split('\n\n')
    .filter((b) => b.startsWith('event: done\n'))
    .pop()!;
  return (JSON.parse(block.split('\ndata: ')[1]) as { docId: string }).docId;
}

const packPost = (id: string) => request(app).post(`/${id}/annexures-pack`).set(headers());
const docGet = (id: string) => request(app).get(`/${id}`).set(headers());

/** The HTML of one annexure, from its label to the next one. */
// T-689c: found by heading, since the letters depend on whether the Synopsis is attached.
function annexure(heading: string): string {
  const m = new RegExp(
    `<div class="annexure-label">ANNEXURE [A-Z]</div>\\s*<h2>${heading}</h2>`,
  ).exec(html);
  expect(m).not.toBeNull();
  const from = m!.index;
  const to = html.indexOf('<div class="annexure-label">', from + 1);
  return html.slice(from, to === -1 ? undefined : to);
}
const memo = () => annexure('Memo of Parties');
const vakalatnama = () => annexure('Vakalatnama');

/** A document row as the collection holds it, with the pieces a test overrides. */
async function insertDoc(fields: Record<string, unknown>): Promise<string> {
  const now = new Date();
  const ins = await rawDocs().insertOne({
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

const briefJson = (values: unknown[], extra: Record<string, unknown> = {}) =>
  encrypt(JSON.stringify({ kind: 'x', values, ...extra }));

describe('T-381 B: a brief draft seals the party data', () => {
  it('bail_regular: party inputs, court_type and state; nothing else of the brief', async () => {
    const docId = await generateFromBrief(
      'bail_regular',
      [...BAIL_VALUES, { key: 'client_role', value: 'applicant' }],
      BAIL_BODY,
    );
    const row = (await rawDocs().findOne({ _id: new mongoose.Types.ObjectId(docId) }))!;
    expect(row).not.toHaveProperty('formInputs');
    expect(readFormInputs(row as never)).toEqual({
      template_id: 'bail_regular',
      source: 'brief',
      applicant_name: 'Ram Kumar',
      father_name: 'Shri Hari Kumar',
      applicant_age: '32',
      address: '123 Main St, Patna',
      // T-423 AC1: state is the Court row's display name. AC2: the raw client_role sent
      // above is not a bail_regular brief item, so it is not sealed (the table row fixes the client).
      court_type: 'sessions',
      state: 'Bihar',
    });
    // The encrypted value holds none of it in the clear.
    expect(String(row.formInputsEnc)).not.toContain('Ram Kumar');
    expect(
      JSON.stringify({ ...row, brief: 0, generatedContent: 0, formInputsEnc: 0 }),
    ).not.toContain('Ram Kumar');
  });

  it('plaint_recovery (not a State row): the role fields and court_type, no state', async () => {
    const docId = await generateFromBrief('plaint_recovery', PLAINT_VALUES, PLAINT_BODY);
    const row = (await rawDocs().findOne({ _id: new mongoose.Types.ObjectId(docId) }))!;
    const sealed = readFormInputs(row as never)!;
    expect(sealed).toEqual({
      template_id: 'plaint_recovery',
      source: 'brief',
      plaintiff_name: 'Jai Mehta',
      plaintiff_father_name: 'Shri Mehta Senior',
      plaintiff_age: '44',
      plaintiff_address: '12 Lake Road, Patna',
      defendant_name: 'Kiran Bose',
      defendant_address: '7 Hill Street, Gaya',
      court_type: 'sessions',
    });
    expect(sealed).not.toHaveProperty('state');
    // the generic address is not a plaintiff field, so it is not kept
    expect(JSON.stringify(sealed)).not.toContain('GENERIC ADDRESS');
  });
});

describe('T-381 C: POST /documents/:id/annexures-pack from a brief draft (AC3)', () => {
  it('a bail brief with parties: 200 PDF; the client in Annexure A and E', async () => {
    const docId = await generateFromBrief('bail_regular', BAIL_VALUES, BAIL_BODY);
    const res = await packPost(docId);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/_annexures\.pdf"$/);

    const a = memo();
    expect(a).toContain('Memo of Parties');
    expect(a).toContain('<strong>Ram Kumar</strong>');
    expect(a).toContain('Age: 32 years');
    expect(a).toContain('[To be confirmed: relation] Shri Hari Kumar');
    expect(a).toContain('123 Main St, Patna');

    const e = vakalatnama();
    expect(e).toContain('Vakalatnama');
    expect(e).toContain('I/We, <strong>Ram Kumar</strong>, resident of 123 Main St, Patna,');
    expect(e).toContain('<p>Ram Kumar</p>');

    // recorded once
    const row = await LawieDocument.findById(docId).lean();
    expect(row!.exportedAs).toEqual(['annexures']);
    expect(await Event.countDocuments({ type: 'draft.exported', docId })).toBe(1);
  });

  it('a plaint brief: both names in Annexure A, the client in E, no generic address, no State line', async () => {
    const docId = await generateFromBrief('plaint_recovery', PLAINT_VALUES, PLAINT_BODY);
    const res = await packPost(docId);
    expect(res.status).toBe(200);

    const a = memo();
    expect(a).toContain('<strong>Jai Mehta</strong>');
    expect(a).toContain('Age: 44 years');
    expect(a).toContain('[To be confirmed: relation] Shri Mehta Senior');
    expect(a).toContain('12 Lake Road, Patna');
    expect(a).toContain('<strong>Kiran Bose</strong>');
    expect(a).not.toContain('State of');
    expect(html).not.toContain('GENERIC ADDRESS');

    const e = vakalatnama();
    expect(e).toContain('I/We, <strong>Jai Mehta</strong>, resident of 12 Lake Road, Patna,');
  });

  it('a draft made before T-381 (template_id and source only; names only in doc.brief) falls back and renders names', async () => {
    const docId = await insertDoc({
      rulePackId: 'plaint_recovery',
      courtType: 'sessions',
      formInputsEnc: sealFormInputs({ template_id: 'plaint_recovery', source: 'brief' }),
      brief: briefJson([
        { key: 'plaintiff_name', value: 'Old Plaintiff' },
        { key: 'defendant_name', value: 'Old Defendant' },
        { key: 'plaintiff_address', value: '1 Old Road' },
      ]),
    });
    const res = await packPost(docId);
    expect(res.status).toBe(200);
    expect(memo()).toContain('<strong>Old Plaintiff</strong>');
    expect(memo()).toContain('<strong>Old Defendant</strong>');
    expect(vakalatnama()).toContain(
      'I/We, <strong>Old Plaintiff</strong>, resident of 1 Old Road,',
    );
  });

  it('a pre-T-381 draft without a stored brief is refused, not blank', async () => {
    const docId = await insertDoc({
      rulePackId: 'plaint_recovery',
      formInputsEnc: sealFormInputs({ template_id: 'plaint_recovery', source: 'brief' }),
    });
    const res = await packPost(docId);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'party_details_missing',
      missing: ['client_name', 'opposite_party_name'],
    });
  });

  it('sealed party inputs win over the brief (the brief is not read)', async () => {
    const docId = await insertDoc({
      rulePackId: 'plaint_recovery',
      formInputsEnc: sealFormInputs({
        template_id: 'plaint_recovery',
        source: 'brief',
        plaintiff_name: 'Sealed Plaintiff',
        defendant_name: 'Sealed Defendant',
      }),
      brief: 'not decryptable',
    });
    const res = await packPost(docId);
    expect(res.status).toBe(200);
    expect(memo()).toContain('<strong>Sealed Plaintiff</strong>');
  });

  it('an unreadable stored brief on an old draft is a 500, not a blank pack', async () => {
    const docId = await insertDoc({
      rulePackId: 'plaint_recovery',
      formInputsEnc: sealFormInputs({ template_id: 'plaint_recovery', source: 'brief' }),
      brief: 'not decryptable',
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await packPost(docId);
      expect(res.status).toBe(500);
      expect(page.setContent).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe('T-381 C: POST annexures-pack refuses when parties are missing', () => {
  async function expectRefused(docId: string, missing: string[]) {
    const res = await packPost(docId);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'party_details_missing', missing });
    // no render, no record, no event
    expect(page.setContent).not.toHaveBeenCalled();
    expect(page.pdf).not.toHaveBeenCalled();
    expect(res.headers['content-type']).not.toMatch(/pdf/);
    const row = await LawieDocument.findById(docId).lean();
    expect(row!.exportedAs).toEqual([]);
    expect(await Event.countDocuments({})).toBe(0);
  }

  it('client name missing on a State row', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({ template_id: 'bail_regular', source: 'brief' }),
      brief: briefJson([{ key: 'fir_number', value: '1/2026' }]),
    });
    await expectRefused(docId, ['client_name']);
  });

  it('opposite party missing', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({
        template_id: 'plaint_recovery',
        source: 'brief',
        plaintiff_name: 'Jai Mehta',
      }),
    });
    await expectRefused(docId, ['opposite_party_name']);
  });

  it('both missing', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({ template_id: 'plaint_recovery', source: 'brief' }),
      brief: briefJson([]),
    });
    await expectRefused(docId, ['client_name', 'opposite_party_name']);
  });

  it('a pack with no row: the client role', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({
        template_id: 'a_future_court_pack',
        applicant_name: 'Some One',
        respondent_name: 'Some Two',
      }),
    });
    await expectRefused(docId, ['client_role']);
  });

  it('an ambiguous row: the client role', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({ template_id: 'synopsis', applicant_name: 'Some One' }),
    });
    await expectRefused(docId, ['client_role']);
  });

  it('a caveat answer: the client role', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({
        template_id: 'rera_complaint',
        complainant_name: 'Allottee',
        promoter_name: 'Builder',
        complainant_type: 'promoter_against_allottee',
      }),
    });
    await expectRefused(docId, ['client_role']);
  });

  it('a draft with no form inputs at all', async () => {
    const docId = await insertDoc({});
    await expectRefused(docId, ['client_role']);
  });

  it('with client_role answered, the same ambiguous draft goes through', async () => {
    const docId = await insertDoc({
      formInputsEnc: sealFormInputs({
        template_id: 'synopsis',
        client_role: 'petitioner',
        petitioner_name: 'Pia Nair',
        respondent_name: 'Rao Co',
      }),
    });
    const res = await packPost(docId);
    expect(res.status).toBe(200);
    expect(memo()).toContain('<strong>Pia Nair</strong>');
    expect(memo()).toContain('<strong>Rao Co</strong>');
  });
});

describe('T-381 C: POST annexures-pack from a form draft', () => {
  it('plaint_recovery with plaintiff_name and defendant_name: the Memo shows them (it printed blanks before)', async () => {
    const docId = await insertDoc({
      docType: 'plaint_recovery',
      formInputsEnc: sealFormInputs({
        template_id: 'plaint_recovery',
        plaintiff_name: 'Form Plaintiff',
        defendant_name: 'Form Defendant',
        plaintiff_address: '3 Form Street',
        address: 'GENERIC ADDRESS',
        father_name: 'GENERIC FATHER',
        age: '99',
      }),
    });
    const res = await packPost(docId);
    expect(res.status).toBe(200);
    const a = memo();
    expect(a).toContain('<strong>Form Plaintiff</strong>');
    expect(a).toContain('<strong>Form Defendant</strong>');
    expect(a).toContain('3 Form Street');
    expect(a).not.toContain('GENERIC');
    expect(a).not.toContain('Age: 99');
    expect(vakalatnama()).toContain(
      'I/We, <strong>Form Plaintiff</strong>, resident of 3 Form Street,',
    );
    expect(html).not.toContain('GENERIC');
  });

  it('legacy plain formInputs are mapped the same way', async () => {
    const docId = await insertDoc({
      formInputs: {
        template_id: 'written_statement',
        plaintiff_name: 'Not The Client',
        defendant_name: 'The Client',
      },
    });
    const res = await packPost(docId);
    expect(res.status).toBe(200);
    expect(memo()).toContain('<strong>The Client</strong>');
    expect(html).not.toContain('Not The Client');
  });

  it('a bail State row prints exactly what the pack printed before T-381', async () => {
    const form = {
      template_id: 'bail_regular',
      court_type: 'district_court',
      state: 'Bihar',
      applicant_name: 'Ramesh Kumar',
      father_name: 'Suresh Kumar',
      applicant_age: 35,
      applicant_address: 'Village Mirza, Patna, Bihar',
      respondent_name: 'State of Bihar',
      fir_number: '091/2024',
      fir_date: '15.06.2024',
      police_station: 'Kotwali PS',
      enrollment_number: 'BAR/2018/1234',
    };
    const docId = await insertDoc({ formInputsEnc: sealFormInputs(form) });
    const res = await packPost(docId);
    expect(res.status).toBe(200);
    const viaRoute = html;

    page.setContent.mockClear();
    await buildAnnexuresPack({
      formData: form,
      bodyParaCount: 1,
      advocateName: 'Test Advocate',
      enrollmentNumber: undefined,
    });
    expect(viaRoute).not.toBe('');
    expect(viaRoute).toBe(html);
    expect(memo()).toContain('<strong>State of Bihar</strong>');
    expect(memo()).toContain('State of Bihar, through the concerned authority');
  });
});

describe('T-381 D: GET /documents/:id adds courtDocument and hasParty', () => {
  const sealed = (over: Record<string, unknown>) => ({ formInputsEnc: sealFormInputs(over) });

  it('a court pack with a party: true and true', async () => {
    const docId = await insertDoc(
      sealed({ template_id: 'plaint_recovery', plaintiff_name: 'Jai Mehta' }),
    );
    const res = await docGet(docId);
    expect(res.status).toBe(200);
    expect(res.body.courtDocument).toBe(true);
    expect(res.body.hasParty).toBe(true);
  });

  it('only the opposite party named: hasParty is still true', async () => {
    const docId = await insertDoc(
      sealed({ template_id: 'plaint_recovery', defendant_name: 'Kiran Bose' }),
    );
    const res = await docGet(docId);
    expect(res.body).toMatchObject({ courtDocument: true, hasParty: true });
  });

  it('a court pack with no party: courtDocument true, hasParty false', async () => {
    const docId = await insertDoc(sealed({ template_id: 'plaint_recovery' }));
    const res = await docGet(docId);
    expect(res.body).toMatchObject({ courtDocument: true, hasParty: false });
  });

  it('a not_court pack (an agreement) with a name: courtDocument false', async () => {
    const docId = await insertDoc({
      docType: 'nda',
      ...sealed({ template_id: 'nda', applicant_name: 'Party One', client_role: 'applicant' }),
    });
    const res = await docGet(docId);
    expect(res.body.courtDocument).toBe(false);
  });

  it('no pack id: courtDocument false and hasParty false', async () => {
    const docId = await insertDoc({});
    const res = await docGet(docId);
    expect(res.status).toBe(200);
    expect(res.body.courtDocument).toBe(false);
    expect(res.body.hasParty).toBe(false);
  });

  it('a pack with no row and no role: courtDocument true, hasParty false', async () => {
    const docId = await insertDoc(
      sealed({ template_id: 'a_future_court_pack', applicant_name: 'Some One' }),
    );
    const res = await docGet(docId);
    expect(res.body).toMatchObject({ courtDocument: true, hasParty: false });
  });

  it('an older brief draft: the party is found in the stored brief', async () => {
    const docId = await insertDoc({
      rulePackId: 'plaint_recovery',
      ...sealed({ template_id: 'plaint_recovery', source: 'brief' }),
      brief: briefJson([{ key: 'plaintiff_name', value: 'Old Plaintiff' }]),
    });
    const res = await docGet(docId);
    expect(res.body).toMatchObject({ courtDocument: true, hasParty: true });
  });

  it('a guided brief: courtDocument follows the stored brief court_document', async () => {
    const values = [
      { key: 'client_role', value: 'petitioner' },
      { key: 'petitioner_name', value: 'Pia Nair' },
    ];
    const court = await insertDoc({
      ...sealed({ template_id: 'guided', source: 'brief' }),
      brief: briefJson(values, { court_document: true }),
    });
    const notCourt = await insertDoc({
      ...sealed({ template_id: 'guided', source: 'brief' }),
      brief: briefJson(values, { court_document: false }),
    });
    const unknown = await insertDoc({
      ...sealed({ template_id: 'guided', source: 'brief' }),
      brief: briefJson(values),
    });
    expect((await docGet(court)).body).toMatchObject({ courtDocument: true, hasParty: true });
    expect((await docGet(notCourt)).body.courtDocument).toBe(false);
    expect((await docGet(unknown)).body.courtDocument).toBe(false);
  });

  it('the editor still loads when the form inputs cannot be decrypted', async () => {
    const docId = await insertDoc({
      formInputsEnc: 'not:valid:ciphertext',
      rulePackId: 'plaint_recovery',
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await docGet(docId);
      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Paragraph one.\n\nParagraph two.');
      expect(res.body.courtDocument).toBe(false);
      expect(res.body.hasParty).toBe(false);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('the editor still loads when the stored brief cannot be decrypted', async () => {
    const docId = await insertDoc({
      rulePackId: 'plaint_recovery',
      ...sealed({ template_id: 'plaint_recovery', source: 'brief' }),
      brief: 'not decryptable',
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await docGet(docId);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ courtDocument: false, hasParty: false });
    } finally {
      errSpy.mockRestore();
    }
  });

  it('still answers 404 for another user and 500 only when the content cannot be read', async () => {
    const docId = await insertDoc({
      generatedContent: 'garbage',
      formInputsEnc: sealFormInputs({}),
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await docGet(docId)).status).toBe(500);
    } finally {
      errSpy.mockRestore();
    }
    const other = await request(app).get(`/${docId}`).set(headers('507f1f77bcf86cd7994393ff'));
    expect(other.status).toBe(404);
  });
});

describe('T-381 C/D: no party value is logged', () => {
  it('the pack, its refusal and an unreadable read log no names', async () => {
    const calls: string[] = [];
    const record = (...args: unknown[]) => {
      calls.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    const spies = [
      ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
        jest.spyOn(console, m).mockImplementation(record),
      ),
      ...(['info', 'warn', 'error', 'debug', 'trace', 'fatal'] as const).map((m) =>
        jest.spyOn(logger, m).mockImplementation(record as never),
      ),
    ];
    try {
      const ok = await insertDoc({
        formInputsEnc: sealFormInputs({
          template_id: 'plaint_recovery',
          plaintiff_name: 'Secretplaintiff Person',
          defendant_name: 'Secretdefendant Person',
        }),
      });
      const refused = await insertDoc({
        formInputsEnc: sealFormInputs({
          template_id: 'plaint_recovery',
          plaintiff_name: 'Secretplaintiff Other',
        }),
      });
      const unreadable = await insertDoc({
        rulePackId: 'plaint_recovery',
        formInputsEnc: sealFormInputs({ template_id: 'plaint_recovery', source: 'brief' }),
        brief: 'Secretplaintiff-garbage',
      });
      expect((await packPost(ok)).status).toBe(200);
      expect((await packPost(refused)).status).toBe(422);
      expect((await packPost(unreadable)).status).toBe(500);
      expect((await docGet(unreadable)).status).toBe(200);
    } finally {
      for (const s of spies) s.mockRestore();
    }
    expect(calls.join('\n')).not.toMatch(/Secret/);
    // the unreadable ones were logged by id and error name only
    expect(calls.some((c) => c.includes('could not read'))).toBe(true);
  });
});

describe('T-381: the brief stored by the route is the one the fallback reads', () => {
  it('decrypts to the values the user confirmed', async () => {
    const docId = await generateFromBrief('plaint_recovery', PLAINT_VALUES, PLAINT_BODY);
    const row = await LawieDocument.findById(docId).lean();
    const stored = JSON.parse(decrypt(row!.brief!)) as { values: Array<{ key: string }> };
    expect(stored.values.map((v) => v.key)).toContain('plaintiff_name');
  });
});
