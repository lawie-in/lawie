/**
 * T-689b — the pack-derived document type label in the documents list (GET /documents) and
 * the dashboard summary (byTypeLabelled). The stored docType enum is never changed.
 * Real rule packs and a real in-memory Mongo (setupDb); the pack loader is spied on only to
 * count lookups or to make it throw.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import { getDashboardSummary, labelTypeRows } from '../services/dashboard-summary.service';
import { GUIDED_PACK_ID, docTypeLabelForPackId, humaniseDocType } from '../services/doc-type-label';
import * as rulePacks from '../services/rule-pack.service';
import { encrypt } from '../utils/encryption';
import { seedVerifiedUsers } from './verifiedUser';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const OWNER = '507f1f77bcf86cd799439b91';
const OTHER = '507f1f77bcf86cd799439b92';
const NOW = new Date('2026-10-17T06:00:00Z');
const IN_OCT = new Date('2026-10-10T10:00:00Z');

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
    title: 'T-689b doc',
    docType: 'petition',
    generatedContent: encrypt('Body of the draft.'),
    createdAt: IN_OCT,
    ...extra,
  });
}

const list = (userId = OWNER) => request(app).get('/').set(headers(userId));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('docTypeLabelForPackId', () => {
  it('the real written_statement pack gives "Written Statement"', () => {
    expect(docTypeLabelForPackId('written_statement')).toBe('Written Statement');
  });

  it('a bracketed non-statute segment is kept', () => {
    expect(docTypeLabelForPackId('divorce_hma')).toBe('Divorce Petition (HMA, contested)');
    expect(docTypeLabelForPackId('x', () => ({ name: 'Thing (HMA, contested)' }))).toBe(
      'Thing (HMA, contested)',
    );
  });

  it.each([
    ['the guided id', GUIDED_PACK_ID],
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['a number', 123],
    ['an object', {}],
    ['an unknown pack id', 'no_such_pack'],
    ['an id with path characters', '../etc/passwd'],
  ])('%s -> null', (_n, id) => {
    expect(docTypeLabelForPackId(id)).toBeNull();
  });

  it('the guided id never calls the loader', () => {
    const load = jest.fn(() => ({ name: 'Guided Thing' }));
    expect(docTypeLabelForPackId('guided', load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('a pack with no name gives null', () => {
    expect(docTypeLabelForPackId('p', () => ({}))).toBeNull();
    expect(docTypeLabelForPackId('p', () => ({ name: '  ' }))).toBeNull();
    expect(docTypeLabelForPackId('p', () => null)).toBeNull();
  });

  it('a loader that throws gives null, never throws, and logs only err.name', () => {
    const errLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = () => {
      throw new rulePacks.RulePackError('p', 'SECRET-DISK-PATH /var/x');
    };
    let out: string | null = 'unset';
    expect(() => {
      out = docTypeLabelForPackId('p', load);
    }).not.toThrow();
    expect(out).toBeNull();
    const logged = JSON.stringify(errLog.mock.calls);
    expect(logged).not.toContain('SECRET-DISK-PATH');
    expect(logged).toContain('RulePackError');
  });

  it('a loader that throws a non-Error gives null and logs UnknownError', () => {
    const errLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'SECRET-STRING';
    };
    expect(docTypeLabelForPackId('p', load)).toBeNull();
    const logged = JSON.stringify(errLog.mock.calls);
    expect(logged).toContain('UnknownError');
    expect(logged).not.toContain('SECRET-STRING');
  });
});

describe('humaniseDocType', () => {
  it.each([
    ['bail_regular', 'Bail regular'],
    ['petition', 'Petition'],
    ['writ_petition', 'Writ petition'],
    ['criminal_complaint', 'Criminal complaint'],
    ['plaint_civil', 'Plaint civil'],
    ['_x_', 'X'],
    ['', ''],
    ['___', ''],
  ])('%j -> %j', (input, want) => {
    expect(humaniseDocType(input)).toBe(want);
  });
});

describe('labelTypeRows', () => {
  const fake = (m: Record<string, string | null>) => (id: unknown) =>
    typeof id === 'string' && id in m ? m[id] : null;

  it('a written statement stored as petition is separate from a real petition', () => {
    const rows = [
      { _id: { docType: 'petition', rulePackId: 'written_statement' }, n: 2 },
      { _id: { docType: 'petition', rulePackId: 'divorce_hma' }, n: 1 },
      { _id: { docType: 'petition' }, n: 3 },
    ];
    expect(labelTypeRows(rows)).toEqual([
      { key: 'petition', label: 'Petition', n: 3 },
      { key: 'written_statement', label: 'Written Statement', n: 2 },
      { key: 'divorce_hma', label: 'Divorce Petition (HMA, contested)', n: 1 },
    ]);
  });

  it('rows with the same label merge and keep the smallest key, in any input order', () => {
    const labelFor = fake({ pack_b: 'Same', pack_a: 'Same', pack_c: 'Same' });
    const rows = [
      { _id: { docType: 'petition', rulePackId: 'pack_b' }, n: 1 },
      { _id: { docType: 'petition', rulePackId: 'pack_c' }, n: 2 },
      { _id: { docType: 'affidavit', rulePackId: 'pack_a' }, n: 4 },
    ];
    const want = [{ key: 'pack_a', label: 'Same', n: 7 }];
    expect(labelTypeRows(rows, labelFor)).toEqual(want);
    expect(labelTypeRows([...rows].reverse(), labelFor)).toEqual(want);
    expect(labelTypeRows([rows[1], rows[2], rows[0]], labelFor)).toEqual(want);
  });

  it('a pack row and a pack-less row with the same label merge; key is the smaller id', () => {
    const labelFor = fake({ zz_pack: 'Petition' });
    const rows = [
      { _id: { docType: 'petition', rulePackId: 'zz_pack' }, n: 1 },
      { _id: { docType: 'petition' }, n: 1 },
    ];
    expect(labelTypeRows(rows, labelFor)).toEqual([{ key: 'petition', label: 'Petition', n: 2 }]);
    expect(labelTypeRows([...rows].reverse(), labelFor)).toEqual([
      { key: 'petition', label: 'Petition', n: 2 },
    ]);
  });

  it('orders by n desc then label, whatever the input order', () => {
    const rows = [
      { _id: { docType: 'b_type' }, n: 2 },
      { _id: { docType: 'a_type' }, n: 2 },
      { _id: { docType: 'c_type' }, n: 5 },
    ];
    const want = ['C type', 'A type', 'B type'];
    expect(labelTypeRows(rows).map((r) => r.label)).toEqual(want);
    expect(labelTypeRows([...rows].reverse()).map((r) => r.label)).toEqual(want);
  });

  it('leaves out an empty/missing docType and n <= 0', () => {
    const rows = [
      { _id: { docType: '' }, n: 3 },
      { _id: { docType: null }, n: 3 },
      { _id: {}, n: 3 },
      { _id: null, n: 3 },
      { _id: { docType: 'affidavit' }, n: 0 },
      { _id: { docType: 'plaint' }, n: -1 },
      { _id: { docType: 'bail_regular' }, n: 2 },
    ];
    expect(labelTypeRows(rows)).toEqual([{ key: 'bail_regular', label: 'Bail regular', n: 2 }]);
  });

  it('its counts add up to the input total', () => {
    const rows = [
      { _id: { docType: 'petition', rulePackId: 'written_statement' }, n: 2 },
      { _id: { docType: 'petition', rulePackId: 'plaint_recovery' }, n: 3 },
      { _id: { docType: 'petition' }, n: 4 },
      { _id: { docType: 'affidavit' }, n: 1 },
    ];
    const total = labelTypeRows(rows).reduce((s, r) => s + r.n, 0);
    expect(total).toBe(10);
  });

  it.each([
    ['writ_petition', 'Writ petition'],
    ['criminal_complaint', 'Criminal complaint'],
    ['plaint_civil', 'Plaint civil'],
  ])('real pack id %s has no file: falls back to the humanised docType', (id, label) => {
    expect(rulePacks.loadRulePack(id)).toBeNull();
    expect(labelTypeRows([{ _id: { docType: id, rulePackId: id }, n: 1 }])).toEqual([
      { key: id, label, n: 1 },
    ]);
  });

  it('a lookup that returns the same pack id twice is made once', () => {
    const labelFor = jest.fn(() => 'Written Statement');
    labelTypeRows(
      [
        { _id: { docType: 'petition', rulePackId: 'written_statement' }, n: 1 },
        { _id: { docType: 'plaint', rulePackId: 'written_statement' }, n: 1 },
      ],
      labelFor,
    );
    expect(labelFor).toHaveBeenCalledTimes(1);
  });

  it('an empty list gives []', () => {
    expect(labelTypeRows([])).toEqual([]);
  });
});

describe('GET /documents list: docTypeLabel', () => {
  it('a written statement stored as petition returns "Written Statement"; docType unchanged; rulePackId not leaked', async () => {
    await makeDoc({ rulePackId: 'written_statement', docType: 'petition' });
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    const row = res.body.documents[0];
    expect(row.docTypeLabel).toBe('Written Statement');
    expect(row.docType).toBe('petition');
    expect(row).not.toHaveProperty('rulePackId');
    expect(JSON.stringify(res.body)).not.toContain('written_statement');
  });

  it('keeps the existing list fields', async () => {
    await makeDoc({ rulePackId: 'plaint_recovery', courtName: 'Patna High Court' });
    const row = (await list()).body.documents[0];
    expect(row).toEqual(
      expect.objectContaining({
        title: 'T-689b doc',
        docType: 'petition',
        courtName: 'Patna High Court',
        status: 'draft',
        docTypeLabel: 'Plaint for Recovery of Money',
      }),
    );
    expect(row.courtLabel).toBeDefined();
    expect(row._id).toBeDefined();
    expect(row.createdAt).toBeDefined();
  });

  it.each([
    ['the guided id', { rulePackId: 'guided', docType: 'guided' }],
    ['no rulePackId', {}],
    ['an empty rulePackId', { rulePackId: '' }],
    ['an unknown pack', { rulePackId: 'no_such_pack' }],
    ['a pack with no file (criminal_complaint)', { rulePackId: 'criminal_complaint' }],
    ['a pack with no file (plaint_civil)', { rulePackId: 'plaint_civil' }],
    ['a pack with no file (writ_petition)', { rulePackId: 'writ_petition' }],
  ])('%s -> docTypeLabel null, row still listed', async (_n, extra) => {
    await makeDoc(extra);
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.documents[0].docTypeLabel).toBeNull();
    expect(res.body.documents[0]).not.toHaveProperty('rulePackId');
  });

  it('a throwing pack does not fail the request; the other rows keep their label', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const real = rulePacks.loadRulePack;
    jest.spyOn(rulePacks, 'loadRulePack').mockImplementation((id: string) => {
      if (id === 'plaint_recovery') throw new rulePacks.RulePackError(id, 'SECRET-DISK-PATH');
      return real(id);
    });
    await makeDoc({ rulePackId: 'plaint_recovery', title: 'broken' });
    await makeDoc({ rulePackId: 'written_statement', title: 'fine' });
    const res = await list();
    expect(res.status).toBe(200);
    const byTitle = Object.fromEntries(
      res.body.documents.map((d: { title: string; docTypeLabel: string | null }) => [
        d.title,
        d.docTypeLabel,
      ]),
    );
    expect(byTitle).toEqual({ broken: null, fine: 'Written Statement' });
    expect(JSON.stringify(res.body)).not.toContain('SECRET-DISK-PATH');
  });

  it('looks each distinct rulePackId up once', async () => {
    const spy = jest.spyOn(rulePacks, 'loadRulePack');
    await makeDoc({ rulePackId: 'written_statement' });
    await makeDoc({ rulePackId: 'written_statement' });
    await makeDoc({ rulePackId: 'written_statement' });
    await makeDoc({ rulePackId: 'plaint_recovery' });
    await makeDoc({ rulePackId: 'guided', docType: 'guided' });
    const res = await list();
    expect(res.status).toBe(200);
    const asked = spy.mock.calls.map((c) => c[0]).filter((id) => id !== undefined);
    expect(asked.filter((id) => id === 'written_statement')).toHaveLength(1);
    expect(asked.filter((id) => id === 'plaint_recovery')).toHaveLength(1);
    expect(asked).not.toContain('guided');
  });

  it("never lists another user's documents", async () => {
    await makeDoc({ rulePackId: 'written_statement' }, OTHER);
    const res = await list();
    expect(res.body.documents).toEqual([]);
  });

  it('does not change what is stored', async () => {
    const d = await makeDoc({ rulePackId: 'written_statement', docType: 'petition' });
    await list();
    const stored = await LawieDocument.findById(d._id).lean();
    expect(stored?.docType).toBe('petition');
    expect(stored?.rulePackId).toBe('written_statement');
    expect(stored).not.toHaveProperty('docTypeLabel');
  });
});

describe('getDashboardSummary: byTypeLabelled', () => {
  it('byType is unchanged; a written statement is separate from a real petition pack row', async () => {
    await makeDoc({ rulePackId: 'written_statement', docType: 'petition' });
    await makeDoc({ rulePackId: 'written_statement', docType: 'petition' });
    await makeDoc({ rulePackId: 'divorce_hma', docType: 'petition' });
    await makeDoc({ docType: 'petition' });
    await makeDoc({ rulePackId: 'criminal_complaint', docType: 'complaint' });
    await makeDoc({ rulePackId: 'plaint_civil', docType: 'plaint' });
    await makeDoc({ rulePackId: 'guided', docType: 'guided' });
    const s = await getDashboardSummary(OWNER, NOW);

    expect(s.byType).toEqual({ petition: 4, complaint: 1, plaint: 1, guided: 1 });

    const labels = Object.fromEntries(s.byTypeLabelled.map((r) => [r.label, r.n]));
    expect(labels).toEqual({
      'Written Statement': 2,
      'Divorce Petition (HMA, contested)': 1,
      Petition: 1,
      Complaint: 1,
      Plaint: 1,
      Guided: 1,
    });
    expect(s.byTypeLabelled.find((r) => r.label === 'Written Statement')?.key).toBe(
      'written_statement',
    );
    // counts add up to byType's
    const total = s.byTypeLabelled.reduce((a, r) => a + r.n, 0);
    expect(total).toBe(Object.values(s.byType).reduce((a, n) => a + n, 0));
    // sorted n desc
    expect(s.byTypeLabelled[0]).toEqual({
      key: 'written_statement',
      label: 'Written Statement',
      n: 2,
    });
    for (let i = 1; i < s.byTypeLabelled.length; i += 1) {
      expect(s.byTypeLabelled[i - 1].n).toBeGreaterThanOrEqual(s.byTypeLabelled[i].n);
    }
  });

  it('is [] for an empty user, and byType stays {}', async () => {
    const s = await getDashboardSummary(OWNER, NOW);
    expect(s.byTypeLabelled).toEqual([]);
    expect(s.byType).toEqual({});
  });

  it('is month-scoped and own-user-only like byType', async () => {
    await makeDoc({ rulePackId: 'written_statement', createdAt: new Date('2026-09-10T10:00:00Z') });
    await makeDoc({ rulePackId: 'written_statement' }, OTHER);
    const s = await getDashboardSummary(OWNER, NOW);
    expect(s.byType).toEqual({});
    expect(s.byTypeLabelled).toEqual([]);
  });

  it('GET /dashboard/summary sends byTypeLabelled and no rulePackId', async () => {
    await makeDoc({ rulePackId: 'written_statement', docType: 'petition', createdAt: new Date() });
    const res = await request(app).get('/dashboard/summary').set(headers());
    expect(res.status).toBe(200);
    expect(res.body.byTypeLabelled).toEqual([
      { key: 'written_statement', label: 'Written Statement', n: 1 },
    ]);
    expect(res.body.byType).toEqual({ petition: 1 });
  });
});
