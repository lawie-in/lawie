import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import * as pdfService from '../services/invoice-pdf.service';
import { recordInvoiceForPayment } from '../services/invoice.service';

import { headers, makeIssued, seedUser, withGstEnv } from './t436-helpers';

// T-436 AC10: GET /invoices, GET /invoices/:id/pdf, GET /public/supplier.

afterEach(() => jest.restoreAllMocks());

const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('GET /invoices', () => {
  it('needs the internal headers', async () => {
    expect((await request(app).get('/invoices')).status).toBe(401);
  });

  it("lists only the caller's issued rows, newest first, with no seller block", async () => {
    const me = await seedUser();
    const other = await seedUser();
    const old = await makeIssued(me, { seq: 1, issuedAt: new Date('2026-08-01T00:00:00Z') });
    const mid = await makeIssued(me, { seq: 2, issuedAt: new Date('2026-09-01T00:00:00Z') });
    const cn = await makeIssued(me, {
      kind: 'credit_note',
      seq: 1,
      issuedAt: new Date('2026-10-01T00:00:00Z'),
      refundId: 'rfnd_1',
      originalInvoiceId: mid._id,
      originalInvoiceNumber: mid.number,
      originalInvoiceDate: mid.issuedAt,
    });
    await makeIssued(other, { seq: 3 });
    // An unissued row of mine must not show.
    await recordInvoiceForPayment({
      paymentId: 'pay_unissued',
      userId: String(me),
      amount: 100,
      paidAt: new Date(),
      description: 'd',
      source: 'backfill',
    });

    const res = await request(app)
      .get('/invoices')
      .set(headers(String(me)));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([
      String(cn._id),
      String(mid._id),
      String(old._id),
    ]);
    const first = res.body.data[0];
    expect(first).toMatchObject({
      number: 'LCN/2026-27/0001',
      kind: 'credit_note',
      price: 79900,
      total: 79900,
      originalInvoiceId: String(mid._id),
      originalInvoiceNumber: mid.number,
    });
    expect(res.body.data[1].originalInvoiceId).toBeNull();
    for (const row of res.body.data) {
      expect(row).not.toHaveProperty('seller');
      expect(row).not.toHaveProperty('draft');
      expect(row).not.toHaveProperty('userId');
    }
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('20AAAAA0000A1Z5');
    expect(text).not.toContain('Test Road');
  });

  it('returns an empty list for a user with none, and for a non-ObjectId user id', async () => {
    const me = await seedUser();
    expect(
      (
        await request(app)
          .get('/invoices')
          .set(headers(String(me)))
      ).body.data,
    ).toEqual([]);
    const res = await request(app).get('/invoices').set(headers('not-an-id'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('500 with a fixed body and only the error name logged when the database fails', async () => {
    const me = await seedUser();
    const error = jest.spyOn(logger, 'error');
    jest.spyOn(Invoice, 'find').mockImplementation((() => {
      throw Object.assign(new Error('Zorblax detail'), { name: 'MongoNetworkError' });
    }) as never);
    const res = await request(app)
      .get('/invoices')
      .set(headers(String(me)));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to list invoices' });
    expect(JSON.stringify(error.mock.calls)).toContain('MongoNetworkError');
    expect(JSON.stringify(error.mock.calls)).not.toContain('Zorblax');
  });
});

describe('GET /invoices/:id/pdf', () => {
  const get = (id: string, userId: string, role: 'Admin' | 'Client' = 'Client') =>
    request(app).get(`/invoices/${id}/pdf`).set(headers(userId, role)).buffer(true).parse(binary);

  it('needs the internal headers', async () => {
    const me = await seedUser();
    const inv = await makeIssued(me);
    expect((await request(app).get(`/invoices/${inv._id}/pdf`)).status).toBe(401);
  });

  it('the owner gets the PDF as an attachment, not cached', async () => {
    const me = await seedUser();
    const inv = await makeIssued(me, { seq: 12 });
    const res = await get(String(inv._id), String(me));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="LAW-2026-27-0012.pdf"');
    expect(res.headers['cache-control']).toBe('private, no-store');
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.headers['content-length']).toBe(String(body.length));
  });

  it("an Admin may fetch anyone's invoice", async () => {
    const me = await seedUser();
    const admin = await seedUser();
    const inv = await makeIssued(me);
    const res = await get(String(inv._id), String(admin), 'Admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  });

  it('another client gets 404, the same as for an unknown id', async () => {
    const me = await seedUser();
    const stranger = await seedUser();
    const inv = await makeIssued(me);
    const a = await get(String(inv._id), String(stranger));
    const b = await get(String(new mongoose.Types.ObjectId()), String(stranger));
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.headers['content-type']).toMatch(/json/);
  });

  it('a malformed id is 404', async () => {
    const me = await seedUser();
    const res = await get('not-an-object-id', String(me));
    expect(res.status).toBe(404);
  });

  it('an unissued row is 404 even for its owner and for an Admin', async () => {
    const me = await seedUser();
    const row = await recordInvoiceForPayment({
      paymentId: 'pay_unissued',
      userId: String(me),
      amount: 100,
      paidAt: new Date(),
      description: 'd',
      source: 'backfill',
    });
    expect((await get(String(row!._id), String(me))).status).toBe(404);
    expect((await get(String(row!._id), String(me), 'Admin')).status).toBe(404);
  });

  it('a credit note renders too', async () => {
    const me = await seedUser();
    const cn = await makeIssued(me, {
      kind: 'credit_note',
      refundId: 'rfnd_pdf',
      originalInvoiceNumber: 'LAW/2026-27/0001',
      originalInvoiceDate: new Date('2026-10-05T06:00:00Z'),
    });
    const res = await get(String(cn._id), String(me));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('LCN-2026-27-0001.pdf');
  });

  it('a render failure is a 500 with a fixed body; only ids and the error name are logged', async () => {
    const me = await seedUser();
    const inv = await makeIssued(me);
    const error = jest.spyOn(logger, 'error');
    jest
      .spyOn(pdfService, 'renderInvoicePdf')
      .mockRejectedValue(
        Object.assign(new Error('Asha Verma at Test Road'), { name: 'RenderBoom' }),
      );
    const res = await request(app)
      .get(`/invoices/${inv._id}/pdf`)
      .set(headers(String(me)));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to render invoice' });
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain('RenderBoom');
    expect(logged).not.toContain('Asha');
    expect(logged).not.toContain('Test Road');
  });
});

describe('GET /public/supplier (AC10)', () => {
  it('needs no auth; returns the five public fields and no address; cached for an hour', async () => {
    const res = await request(app).get('/public/supplier');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      legalName: 'Test Proprietor',
      tradeName: 'Lawie',
      gstin: '20AAAAA0000A1Z5',
      stateCode: '20',
      stateName: 'Jharkhand',
    });
    expect(Object.keys(res.body).sort()).toEqual([
      'gstin',
      'legalName',
      'stateCode',
      'stateName',
      'tradeName',
    ]);
    expect(res.text).not.toContain('Test Road');
    expect(res.text.toLowerCase()).not.toContain('address');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it.each([
    'GST_GSTIN',
    'GST_LEGAL_NAME',
    'GST_TRADE_NAME',
    'GST_ADDRESS',
    'GST_STATE_CODE',
  ] as const)('503 when %s is missing (GST_ADDRESS included), not cached', async (key) => {
    const restore = withGstEnv({ [key]: '' });
    try {
      const res = await request(app).get('/public/supplier');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({});
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).not.toContain('Test Proprietor');
    } finally {
      restore();
    }
  });

  it('503 when GST_STATE_CODE is not one of the 36 codes', async () => {
    const restore = withGstEnv({ GST_STATE_CODE: '99' });
    try {
      expect((await request(app).get('/public/supplier')).status).toBe(503);
    } finally {
      restore();
    }
  });

  it('works while GST_EFFECTIVE_FROM is unset (it is not one of the five)', async () => {
    const restore = withGstEnv({ GST_EFFECTIVE_FROM: '' });
    try {
      expect((await request(app).get('/public/supplier')).status).toBe(200);
    } finally {
      restore();
    }
  });
});
