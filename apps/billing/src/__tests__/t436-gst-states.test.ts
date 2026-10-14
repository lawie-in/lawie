import './setupDb';
import './setupEnv';
import { GST_STATES, findGstState, isGstStateCode } from '@lawie/shared';

import { Invoice } from '../models/Invoice.model';
import { issueInvoice, recordInvoiceForPayment } from '../services/invoice.service';

import { seedUser } from './t436-helpers';

// T-436 AC12 (Vikram): 36 State/UT codes; code 20 gives CGST+SGST, every other code gives IGST.

describe('GST_STATES (AC12)', () => {
  it('has exactly 36 entries: 28 States and 8 UTs', () => {
    expect(GST_STATES).toHaveLength(36);
    expect(GST_STATES.filter((s) => s.kind === 'state')).toHaveLength(28);
    expect(GST_STATES.filter((s) => s.kind === 'ut')).toHaveLength(8);
  });

  it('every code is a 2-digit string and codes and names are unique', () => {
    for (const s of GST_STATES) {
      expect(typeof s.code).toBe('string');
      expect(s.code).toMatch(/^\d{2}$/);
      expect(s.name.length).toBeGreaterThan(0);
    }
    expect(new Set(GST_STATES.map((s) => s.code)).size).toBe(36);
    expect(new Set(GST_STATES.map((s) => s.name)).size).toBe(36);
  });

  it("has Vikram's traps right: AP 37, DNH&DD 26, Ladakh 38, J&K 01 (a UT), no 97 or 99", () => {
    expect(findGstState('37')).toMatchObject({ name: 'Andhra Pradesh', kind: 'state' });
    expect(findGstState('28')).toBeUndefined();
    expect(findGstState('26')).toMatchObject({
      name: 'Dadra and Nagar Haveli and Daman and Diu',
      kind: 'ut',
    });
    expect(findGstState('25')).toBeUndefined();
    expect(findGstState('38')).toMatchObject({ name: 'Ladakh', kind: 'ut' });
    expect(findGstState('01')).toMatchObject({ name: 'Jammu and Kashmir', kind: 'ut' });
    expect(findGstState('97')).toBeUndefined();
    expect(findGstState('99')).toBeUndefined();
    expect(findGstState('20')).toMatchObject({ name: 'Jharkhand', kind: 'state' });
  });

  it('matches the full list from the ticket', () => {
    const expected: Record<string, string> = {
      '37': 'Andhra Pradesh',
      '12': 'Arunachal Pradesh',
      '18': 'Assam',
      '10': 'Bihar',
      '22': 'Chhattisgarh',
      '30': 'Goa',
      '24': 'Gujarat',
      '06': 'Haryana',
      '02': 'Himachal Pradesh',
      '20': 'Jharkhand',
      '29': 'Karnataka',
      '32': 'Kerala',
      '23': 'Madhya Pradesh',
      '27': 'Maharashtra',
      '14': 'Manipur',
      '17': 'Meghalaya',
      '15': 'Mizoram',
      '13': 'Nagaland',
      '21': 'Odisha',
      '03': 'Punjab',
      '08': 'Rajasthan',
      '11': 'Sikkim',
      '33': 'Tamil Nadu',
      '36': 'Telangana',
      '16': 'Tripura',
      '09': 'Uttar Pradesh',
      '05': 'Uttarakhand',
      '19': 'West Bengal',
      '35': 'Andaman and Nicobar Islands',
      '04': 'Chandigarh',
      '26': 'Dadra and Nagar Haveli and Daman and Diu',
      '07': 'Delhi',
      '01': 'Jammu and Kashmir',
      '38': 'Ladakh',
      '31': 'Lakshadweep',
      '34': 'Puducherry',
    };
    expect(Object.fromEntries(GST_STATES.map((s) => [s.code, s.name]))).toEqual(expected);
  });

  it('findGstState / isGstStateCode accept only the exact 2-digit strings', () => {
    expect(isGstStateCode('27')).toBe(true);
    for (const bad of [27, 1, '1', '7', ' 27', '027', '', null, undefined, {}, '00', '98']) {
      expect(findGstState(bad)).toBeUndefined();
      expect(isGstStateCode(bad)).toBe(false);
    }
  });
});

describe('tax split by place of supply, through the real issue path (AC12)', () => {
  it('code 20 gives CGST+SGST; each of the other 35 codes gives IGST', async () => {
    let n = 0;
    for (const state of GST_STATES) {
      n += 1;
      const userId = await seedUser({ gstStateCode: state.code });
      const row = await recordInvoiceForPayment({
        paymentId: `pay_state_${state.code}`,
        userId: String(userId),
        amount: 79900,
        paidAt: new Date('2026-10-01T00:00:00Z'),
        description: 'x',
        source: 'subscription.charged',
      });
      expect(await issueInvoice(row!._id as never)).toBe('issued');
      const inv = (await Invoice.findById(row!._id).lean())!;
      expect(inv.placeOfSupply).toEqual({ code: state.code, name: state.name, source: 'user' });
      expect(inv.customer!.stateCode).toBe(state.code);
      expect((inv.cgst ?? 0) + (inv.sgst ?? 0) + (inv.igst ?? 0) + inv.taxable!).toBe(79900);
      if (state.code === '20') {
        expect(inv.cgst).toBeGreaterThan(0);
        expect(inv.sgst).toBeGreaterThan(0);
        expect(inv.igst).toBe(0);
      } else {
        expect(inv.cgst).toBe(0);
        expect(inv.sgst).toBe(0);
        expect(inv.igst).toBe(12188);
      }
      expect(inv.seq).toBe(n);
    }
  }, 60_000);
});
