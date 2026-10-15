import './setupDb';
import './setupEnv';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import { csvField, INVOICE_CSV_COLUMNS } from '../services/invoice-export.service';

import { headers, makeIssued, recordForTest, seedUser } from './t436-helpers';

// T-436 AC10 (admin CSV): GET /admin/billing/invoices.csv?month=YYYY-MM — admin only, IST month,
// credit notes negative, rupees with 2 decimals, formula-injection guard.

afterEach(() => jest.restoreAllMocks());

const ADMIN = '507f1f77bcf86cd799439011';
const csv = (month?: string, role: 'Admin' | 'Client' = 'Admin') =>
  request(app)
    .get(`/admin/billing/invoices.csv${month === undefined ? '' : `?month=${month}`}`)
    .set(headers(ADMIN, role));

describe('who may call it', () => {
  it('401 without the internal headers, 403 for a Client', async () => {
    expect((await request(app).get('/admin/billing/invoices.csv?month=2026-10')).status).toBe(401);
    expect((await csv('2026-10', 'Client')).status).toBe(403);
  });

  it('a Client never gets rows even with data present', async () => {
    const u = await seedUser();
    await makeIssued(u);
    const res = await csv('2026-10', 'Client');
    expect(res.text).not.toContain('LAW/');
  });
});

describe('month validation', () => {
  it.each(['', '2026', '2026-13', '2026-00', '26-10', '2026-10-01', 'abc'])(
    '400 for month=%p',
    async (m) => {
      expect((await csv(m)).status).toBe(400);
    },
  );
  it('400 with no month at all', async () => {
    expect((await csv()).status).toBe(400);
  });
});

describe('contents', () => {
  it('a month with no rows is just the header, CRLF terminated', async () => {
    const res = await csv('2026-10');
    expect(res.status).toBe(200);
    expect(res.text).toBe(`${INVOICE_CSV_COLUMNS.join(',')}\r\n`);
  });

  it('is a csv attachment, never cached', async () => {
    const res = await csv('2026-10');
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="invoices-2026-10.csv"');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('has the GSTR-1 columns incl. place-of-supply source, and rupees with 2 decimals', async () => {
    const u = await seedUser();
    await makeIssued(u, {
      seq: 1,
      issuedAt: new Date('2026-10-05T06:00:00Z'),
      placeOfSupply: { code: '27', name: 'Maharashtra', source: 'fallback' },
      customer: {
        name: 'Asha Verma',
        email: 'a@example.com',
        stateCode: '27',
        stateName: 'Maharashtra',
      },
      taxable: 67712,
      cgst: 0,
      sgst: 0,
      igst: 12188,
      total: 79900,
    });
    const res = await csv('2026-10');
    const [head, row] = res.text.split('\r\n');
    expect(head.split(',')).toEqual([
      'number',
      'kind',
      'issuedAt',
      'customerName',
      'customerGstin',
      'placeOfSupplyCode',
      'placeOfSupplyName',
      'placeOfSupplySource',
      'taxable',
      'cgst',
      'sgst',
      'igst',
      'total',
      'originalInvoiceNumber',
    ]);
    expect(row).toBe(
      'LAW/2026-27/0001,invoice,2026-10-05 11:30:00,Asha Verma,,27,Maharashtra,fallback,677.12,0.00,0.00,121.88,799.00,',
    );
    expect(res.text).not.toContain('a@example.com'); // no email in the GSTR-1 export
  });

  it('credit notes carry negative amounts and the original number', async () => {
    const u = await seedUser();
    await makeIssued(u, {
      kind: 'credit_note',
      seq: 1,
      refundId: 'rfnd_csv',
      issuedAt: new Date('2026-10-06T06:00:00Z'),
      originalInvoiceNumber: 'LAW/2026-27/0001',
      taxable: 67712,
      cgst: 6094,
      sgst: 6094,
      igst: 0,
    });
    const row = (await csv('2026-10')).text.split('\r\n')[1].split(',');
    expect(row[0]).toBe('LCN/2026-27/0001');
    expect(row[1]).toBe('credit_note');
    expect(row.slice(8, 13)).toEqual(['-677.12', '-60.94', '-60.94', '0.00', '-799.00']);
    expect(row[13]).toBe('LAW/2026-27/0001');
  });

  it('the month is the IST month by issue date: 00:30 IST on 1 Oct is October, 23:59 IST on 30 Sep is September', async () => {
    const u = await seedUser();
    await makeIssued(u, { seq: 1, issuedAt: new Date('2026-09-30T18:29:59Z') }); // 23:59:59 IST 30 Sep
    await makeIssued(u, { seq: 2, issuedAt: new Date('2026-09-30T18:30:00Z') }); // 00:00 IST 1 Oct
    await makeIssued(u, { seq: 3, issuedAt: new Date('2026-10-31T18:29:59Z') }); // 23:59:59 IST 31 Oct
    await makeIssued(u, { seq: 4, issuedAt: new Date('2026-10-31T18:30:00Z') }); // Nov
    const nums = async (m: string) =>
      (await csv(m)).text
        .split('\r\n')
        .slice(1)
        .filter(Boolean)
        .map((r) => r.split(',')[0]);
    expect(await nums('2026-09')).toEqual(['LAW/2026-27/0001']);
    expect(await nums('2026-10')).toEqual(['LAW/2026-27/0002', 'LAW/2026-27/0003']);
    expect(await nums('2026-11')).toEqual(['LAW/2026-27/0004']);
  });

  it('lists only issued rows, oldest first, invoices before credit notes on the same instant', async () => {
    const u = await seedUser();
    await recordForTest(u); // an issuing row
    const t = new Date('2026-10-10T06:00:00Z');
    await makeIssued(u, { kind: 'credit_note', seq: 1, refundId: 'r1', issuedAt: t });
    await makeIssued(u, { seq: 2, issuedAt: t });
    await makeIssued(u, { seq: 1, issuedAt: new Date('2026-10-09T06:00:00Z') });
    const nums = (await csv('2026-10')).text
      .split('\r\n')
      .slice(1)
      .filter(Boolean)
      .map((r) => r.split(',')[0]);
    expect(nums).toEqual(['LAW/2026-27/0001', 'LAW/2026-27/0002', 'LCN/2026-27/0001']);
  });

  it('guards formula injection and quotes commas, quotes and newlines in the customer name', async () => {
    const u = await seedUser();
    const names = [
      '=HYPERLINK("http://x")',
      '+1+1',
      '-2+3',
      '@SUM(A1)',
      '\tTAB',
      'Doe, John "JD"\nNext',
    ];
    let seq = 0;
    for (const name of names) {
      seq += 1;
      await makeIssued(u, {
        seq,
        issuedAt: new Date(`2026-10-${String(seq + 1).padStart(2, '0')}T06:00:00Z`),
        customer: { name, email: '', stateCode: '20', stateName: 'Jharkhand' },
      });
    }
    const text = (await csv('2026-10')).text;
    expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(text).toContain(",'+1+1,");
    expect(text).toContain(",'-2+3,");
    expect(text).toContain(",'@SUM(A1),");
    expect(text).toContain(",'\tTAB,");
    expect(text).toContain('"Doe, John ""JD""\nNext"');
    // no cell starts with a bare formula trigger
    for (const line of text.split('\r\n').slice(1)) {
      expect(line.startsWith('=')).toBe(false);
    }
  });

  it('negative money is not mangled by the guard (numbers are not text)', () => {
    expect(csvField('-799.00', false)).toBe('-799.00');
    expect(csvField('-799.00')).toBe("'-799.00");
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
  });
});

describe('failure', () => {
  it('500 with a fixed body; only the error name is logged', async () => {
    const error = jest.spyOn(logger, 'error');
    jest.spyOn(Invoice, 'find').mockImplementation((() => {
      throw Object.assign(new Error('Zorblax detail'), { name: 'MongoNetworkError' });
    }) as never);
    const res = await csv('2026-10');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to export invoices' });
    expect(JSON.stringify(error.mock.calls)).toContain('MongoNetworkError');
    expect(JSON.stringify(error.mock.calls)).not.toContain('Zorblax');
  });
});
