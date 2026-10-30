/**
 * T-689 — GET /documents/:id carries docTypeLabel: the rule pack's name for the document
 * type, or null (no pack, empty id, the guided id, an unknown or unreadable pack).
 * The stored docType and every other field are unchanged; a pack read error never fails
 * the request.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import { seedVerifiedUsers } from './verifiedUser';
import * as rulePacks from '../services/rule-pack.service';
import { encrypt } from '../utils/encryption';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const OWNER = '507f1f77bcf86cd799439691';
const OTHER = '507f1f77bcf86cd799439692';

seedVerifiedUsers(OWNER, OTHER);

function headers(userId = OWNER) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

async function makeDoc(extra: Record<string, unknown> = {}, userId = OWNER) {
  return LawieDocument.create({
    userId,
    title: 'T-689 doc',
    docType: 'petition',
    generatedContent: encrypt('Body of the draft.'),
    ...extra,
  });
}

const get = (id: unknown, userId = OWNER) =>
  request(app)
    .get(`/${String(id)}`)
    .set(headers(userId));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /documents/:id docTypeLabel', () => {
  it('written_statement: "Written Statement", docType stays petition', async () => {
    const doc = await makeDoc({ rulePackId: 'written_statement' });
    const res = await get(doc._id);
    expect(res.status).toBe(200);
    expect(res.body.docTypeLabel).toBe('Written Statement');
    expect(res.body.docType).toBe('petition');
    expect(res.body.rulePackId).toBe('written_statement');
  });

  it('plaint_recovery: its pack name', async () => {
    const doc = await makeDoc({ rulePackId: 'plaint_recovery', docType: 'petition' });
    const res = await get(doc._id);
    expect(res.status).toBe(200);
    expect(res.body.docTypeLabel).toBe('Plaint for Recovery of Money');
  });

  it('the label matches the pack for each type with a court document', async () => {
    const want: Record<string, string> = {
      written_statement: 'Written Statement',
      plaint_recovery: 'Plaint for Recovery of Money',
      interim_application: 'Interim Application (IA) for Interim Relief During Pendency',
      divorce_hma: 'Divorce Petition (HMA, contested)',
      legal_notice_s138: 'Legal Notice under Section 138 NI Act (Cheque Bounce)',
      bail_regular: 'Regular Bail Application',
    };
    for (const [id, label] of Object.entries(want)) {
      const doc = await makeDoc({ rulePackId: id });
      const res = await get(doc._id);
      expect({ id, label: res.body.docTypeLabel }).toEqual({ id, label });
    }
  });

  it.each([
    ['an unknown pack id', { rulePackId: 'no_such_pack' }],
    ['no rulePackId', {}],
    ['the guided id', { rulePackId: 'guided' }],
    ['an empty rulePackId', { rulePackId: '' }],
  ])('%s -> null and 200', async (_n, extra) => {
    const doc = await makeDoc(extra);
    const res = await get(doc._id);
    expect(res.status).toBe(200);
    expect(res.body.docTypeLabel).toBeNull();
    expect(res.body.docType).toBe('petition');
  });

  it('the guided id never reads a pack', async () => {
    const spy = jest.spyOn(rulePacks, 'loadRulePack');
    const doc = await makeDoc({ rulePackId: 'guided' });
    const res = await get(doc._id);
    expect(res.body.docTypeLabel).toBeNull();
    expect(spy.mock.calls.filter((c) => c[0] === 'guided')).toEqual([]);
  });

  it('a pack that throws: 200, label null, docType unchanged, nothing leaked in the log', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(rulePacks, 'loadRulePack').mockImplementation((id: string) => {
      if (id === 'written_statement') throw new rulePacks.RulePackError(id, 'SECRET-DISK-PATH');
      return null;
    });
    const doc = await makeDoc({ rulePackId: 'written_statement' });
    const res = await get(doc._id);
    expect(res.status).toBe(200);
    expect(res.body.docTypeLabel).toBeNull();
    expect(res.body.docType).toBe('petition');
    expect(res.body.content).toBe('Body of the draft.');
    const logged = JSON.stringify(err.mock.calls);
    expect(logged).toContain(String(doc._id));
    expect(logged).not.toContain('SECRET-DISK-PATH');
  });

  it('every other field is unchanged', async () => {
    const doc = await makeDoc({ rulePackId: 'written_statement' });
    const res = await get(doc._id);
    expect(res.status).toBe(200);
    const KEYS = [
      '_id',
      'title',
      'docType',
      'docTypeLabel',
      'courtLabel',
      'content',
      'status',
      'filingChecklist',
      'checklistState',
      'version',
      'rulePackId',
      'startingDraft',
      'startingDraftLabel',
      'startingDraftFooter',
      'disclaimer',
      'courtDocument',
      'hasParty',
      'createdAt',
      'updatedAt',
    ];
    expect(Object.keys(res.body)).toEqual(expect.arrayContaining(KEYS));
    expect(res.body.title).toBe('T-689 doc');
    expect(res.body.status).toBe('draft');
    expect(res.body.content).toBe('Body of the draft.');
    expect(res.body.startingDraft).toBe(false);
  });

  it("another user's document is still 404", async () => {
    const doc = await makeDoc({ rulePackId: 'written_statement' }, OTHER);
    const res = await get(doc._id, OWNER);
    expect(res.status).toBe(404);
    expect(res.body.docTypeLabel).toBeUndefined();
  });
});
