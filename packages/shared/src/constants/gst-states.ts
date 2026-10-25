/**
 * T-436: GST State/UT codes for the place of supply on a tax invoice.
 *
 * Vikram's list (handoff/tickets/T-436-gst-tax-invoice.md, 14 Oct 2026):
 * 36 entries = 28 States + 8 UTs. The code is the 2-digit GST state code as a
 * string ("01", not 1). Andhra Pradesh is 37 (not the pre-2014 28), merged
 * Dadra and Nagar Haveli and Daman and Diu is 26 (not 25), Ladakh is 38, and
 * Jammu and Kashmir is a UT that keeps 01. 97 (Other Territory) and 99
 * (Centre Jurisdiction) are deliberately left out.
 */
export interface GstState {
  code: string;
  name: string;
  kind: 'state' | 'ut';
}

export const GST_STATES: readonly GstState[] = [
  // States
  { code: '37', name: 'Andhra Pradesh', kind: 'state' },
  { code: '12', name: 'Arunachal Pradesh', kind: 'state' },
  { code: '18', name: 'Assam', kind: 'state' },
  { code: '10', name: 'Bihar', kind: 'state' },
  { code: '22', name: 'Chhattisgarh', kind: 'state' },
  { code: '30', name: 'Goa', kind: 'state' },
  { code: '24', name: 'Gujarat', kind: 'state' },
  { code: '06', name: 'Haryana', kind: 'state' },
  { code: '02', name: 'Himachal Pradesh', kind: 'state' },
  { code: '20', name: 'Jharkhand', kind: 'state' },
  { code: '29', name: 'Karnataka', kind: 'state' },
  { code: '32', name: 'Kerala', kind: 'state' },
  { code: '23', name: 'Madhya Pradesh', kind: 'state' },
  { code: '27', name: 'Maharashtra', kind: 'state' },
  { code: '14', name: 'Manipur', kind: 'state' },
  { code: '17', name: 'Meghalaya', kind: 'state' },
  { code: '15', name: 'Mizoram', kind: 'state' },
  { code: '13', name: 'Nagaland', kind: 'state' },
  { code: '21', name: 'Odisha', kind: 'state' },
  { code: '03', name: 'Punjab', kind: 'state' },
  { code: '08', name: 'Rajasthan', kind: 'state' },
  { code: '11', name: 'Sikkim', kind: 'state' },
  { code: '33', name: 'Tamil Nadu', kind: 'state' },
  { code: '36', name: 'Telangana', kind: 'state' },
  { code: '16', name: 'Tripura', kind: 'state' },
  { code: '09', name: 'Uttar Pradesh', kind: 'state' },
  { code: '05', name: 'Uttarakhand', kind: 'state' },
  { code: '19', name: 'West Bengal', kind: 'state' },
  // Union Territories
  { code: '35', name: 'Andaman and Nicobar Islands', kind: 'ut' },
  { code: '04', name: 'Chandigarh', kind: 'ut' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', kind: 'ut' },
  { code: '07', name: 'Delhi', kind: 'ut' },
  { code: '01', name: 'Jammu and Kashmir', kind: 'ut' },
  { code: '38', name: 'Ladakh', kind: 'ut' },
  { code: '31', name: 'Lakshadweep', kind: 'ut' },
  { code: '34', name: 'Puducherry', kind: 'ut' },
];

/** The entry for a 2-digit code, or undefined if it is not one of the 36. */
export function findGstState(code: unknown): GstState | undefined {
  if (typeof code !== 'string') return undefined;
  return GST_STATES.find((s) => s.code === code);
}

/** True if `code` is one of the 36 GST State/UT codes. */
export function isGstStateCode(code: unknown): code is string {
  return findGstState(code) !== undefined;
}
