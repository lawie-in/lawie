import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { getOffenceRow, resolveBnsKey } from '../services/bns-offence-resolver';

// T-290 — POST /sections/read (Arjun's spec + Addendums 1 and 2). No DB needed.

type Item = { code: string | null; number: string; title: string | null };
const entriesOf = (res: request.Response): Item[][] =>
  (res.body.entries as Array<{ read: Item[] }>).map((e) => e.read);
const pairs = (items: Item[]) => items.map((i) => [i.code, i.number]);
const titleOf = (n: string) => {
  const hit = resolveBnsKey(n);
  return hit ? (getOffenceRow(hit.key)?.title ?? null) : null;
};

describe('POST /sections/read', () => {
  describe('values', () => {
    it('reads bare numbers as BNS, one entry per value, with the signed title', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['303', '351'] });
      expect(res.status).toBe(200);
      const e = entriesOf(res);
      expect(e).toHaveLength(2);
      expect(pairs(e[0])).toEqual([['BNS', '303']]);
      expect(pairs(e[1])).toEqual([['BNS', '351']]);
      expect(e[0][0].title).toBe(titleOf('303'));
      expect(e[1][0].title).toBe(titleOf('351'));
      expect(e[0][0].title).toBeTruthy();
      expect(e[1][0].title).toBeTruthy();
    });

    it('does not de-duplicate across entries', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['303', '303 BNS'] });
      expect(res.status).toBe(200);
      const e = entriesOf(res);
      expect(e).toHaveLength(2);
      expect(pairs(e[0])).toEqual([['BNS', '303']]);
      expect(pairs(e[1])).toEqual([['BNS', '303']]);
    });

    it('reads one value with two sections as one entry with two items', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['103, 105'] });
      expect(res.status).toBe(200);
      const e = entriesOf(res);
      expect(e).toHaveLength(1);
      expect(pairs(e[0])).toEqual([
        ['BNS', '103'],
        ['BNS', '105'],
      ]);
    });

    it('an explicit code wins over the BNS default', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['302 IPC'] });
      expect(pairs(entriesOf(res)[0])).toEqual([['IPC', '302']]);
    });

    it('an empty values array gives empty entries', async () => {
      const res = await request(app).post('/sections/read').send({ values: [] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ entries: [] });
    });

    it('accepts exactly 30 entries and a 100-character entry', async () => {
      const thirty = Array.from({ length: 30 }, () => '303');
      const r1 = await request(app).post('/sections/read').send({ values: thirty });
      expect(r1.status).toBe(200);
      expect(r1.body.entries).toHaveLength(30);
      const r2 = await request(app)
        .post('/sections/read')
        .send({ values: ['x'.repeat(100)] });
      expect(r2.status).toBe(200);
      expect(r2.body.entries).toHaveLength(1);
    });

    it('gives an entry with no section an empty read list', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['abc'] });
      expect(res.status).toBe(200);
      expect(entriesOf(res)).toEqual([[]]);
    });
  });

  describe('text', () => {
    it('reads a plain string with no default: bare numbers stay null', async () => {
      const res = await request(app).post('/sections/read').send({ text: '103, 105' });
      expect(res.status).toBe(200);
      const e = entriesOf(res);
      expect(e).toHaveLength(1);
      expect(pairs(e[0])).toEqual([
        [null, '103'],
        [null, '105'],
      ]);
      expect(e[0].every((i) => i.title === null)).toBe(true);
    });

    it('reads codes, sub-sections and a parenthesised list', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ text: 'BNS 64, 115(2) (IPC 376, 323)' });
      expect(res.status).toBe(200);
      const e = entriesOf(res);
      expect(e).toHaveLength(1);
      expect(pairs(e[0])).toEqual([
        ['BNS', '64'],
        ['BNS', '115(2)'],
        ['IPC', '376'],
        ['IPC', '323'],
      ]);
    });

    it('accepts a 500-character text', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ text: 'a'.repeat(500) });
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
    });
  });

  describe('titles', () => {
    it('BNS titles equal the signed table title via resolveBnsKey', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['303', '103', '64', 'BNS 351'] });
      for (const [i, n] of ['303', '103', '64', '351'].entries()) {
        const item = entriesOf(res)[i][0];
        expect(item.code).toBe('BNS');
        expect(item.title).toBe(titleOf(n));
      }
    });

    it('literal titles copied from the signed table (bns-offences.json)', async () => {
      const literal: Array<[string, string]> = [
        ['303', 'Theft'],
        ['351', 'Criminal intimidation'],
        ['103', 'Punishment for murder'],
        ['64', 'Punishment for rape'],
        ['115', 'Voluntarily causing hurt'],
      ];
      const res = await request(app)
        .post('/sections/read')
        .send({ values: literal.map(([n]) => n) });
      expect(res.status).toBe(200);
      literal.forEach(([n, title], i) => {
        const item = entriesOf(res)[i][0];
        expect(item.number).toBe(n);
        expect(item.title).toBe(title);
      });
    });

    it('303(2) gives the literal 303 title', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['303(2)'] });
      expect(entriesOf(res)[0][0].title).toBe('Theft');
    });

    it('a sub-section shows its parent title (303(2) gives the 303 title)', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['303(2)', '303'] });
      const e = entriesOf(res);
      expect(e[0][0].number).toBe('303(2)');
      expect(e[0][0].title).toBe(titleOf('303'));
      expect(e[0][0].title).toBe(e[1][0].title);
      expect(e[0][0].title).toBeTruthy();
    });

    it('a BNS number not in the table has title null', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['999'] });
      const item = entriesOf(res)[0][0];
      expect(item.code).toBe('BNS');
      expect(item.title).toBeNull();
    });

    it('non-BNS codes and bare numbers never carry a title', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: ['IPC 302', 'CrPC 41', 'BNSS 480', 'BSA 63', 'NDPS Act 20'] });
      expect(res.status).toBe(200);
      const items = entriesOf(res).flat();
      expect(items.length).toBeGreaterThanOrEqual(5);
      expect(items.every((i) => i.title === null)).toBe(true);
      const bare = await request(app).post('/sections/read').send({ text: '303' });
      expect(entriesOf(bare)[0][0]).toEqual({ code: null, number: '303', title: null });
    });
  });

  describe('400 invalid_input, no echo', () => {
    const secret = 'FIR 123/2024 u/s BNS 303';
    const cases: Array<[string, unknown]> = [
      ['both keys', { values: [secret], text: secret }],
      ['neither key', { other: secret }],
      ['empty object', {}],
      ['31 entries', { values: Array.from({ length: 31 }, () => secret) }],
      ['a 101-character entry', { values: [secret + 'x'.repeat(101 - secret.length)] }],
      ['a 501-character text', { text: secret + 'x'.repeat(501 - secret.length) }],
      ['values of the wrong type', { values: secret }],
      ['a non-string entry', { values: [secret, 303] }],
      ['text of the wrong type', { text: [secret] }],
      ['an array body', [secret]],
    ];
    it.each(cases)('%s', async (_name, body) => {
      const res = await request(app)
        .post('/sections/read')
        .send(body as object);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_input' });
      expect(res.text).not.toContain('FIR');
      expect(res.text).not.toContain('123/2024');
    });
  });

  describe('no log line and no response field contains the input', () => {
    const input = 'FIR 123/2024 u/s BNS 303';
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
    const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    let spies: jest.SpyInstance[] = [];

    beforeEach(() => {
      spies = [
        ...levels.map((l) => jest.spyOn(logger, l).mockImplementation(() => undefined)),
        ...consoleMethods.map((m) => jest.spyOn(console, m).mockImplementation(() => undefined)),
      ];
    });
    afterEach(() => jest.restoreAllMocks());

    const logged = () => JSON.stringify(spies.flatMap((s) => s.mock.calls));

    it('values: 200 response and logs hold no fragment of the input', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: [input] });
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      for (const frag of ['FIR', '123/2024', 'u/s', input]) {
        expect(body).not.toContain(frag);
      }
      expect(logged()).not.toContain('123/2024');
      expect(logged()).not.toContain('FIR');
    });

    it('text: 200 response and logs hold no fragment of the input', async () => {
      const res = await request(app).post('/sections/read').send({ text: input });
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('123/2024');
      expect(JSON.stringify(res.body)).not.toContain('FIR');
      expect(logged()).not.toContain('123/2024');
    });

    it('400 path: response and logs hold no fragment of the input', async () => {
      const res = await request(app)
        .post('/sections/read')
        .send({ values: [input], text: input });
      expect(res.status).toBe(400);
      expect(res.text).not.toContain('123/2024');
      expect(logged()).not.toContain('123/2024');
    });
  });
});
