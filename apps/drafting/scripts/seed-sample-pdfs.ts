/**
 * One-time script: generate and upload all 4 sample PDFs into MongoDB.
 *
 * All 4 documents are now generated via the template engine (no disk reads).
 * Re-run this script whenever samples need to be refreshed.
 *
 *   yarn workspace @lawie/drafting seed:sample-pdfs
 */
/* eslint-disable import/order, import/first */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..', '..', '..');
for (const candidate of ['.env.production', '.env.development', '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    console.info(`→ Loaded env from ${p}`);
    break;
  }
}

import mongoose from 'mongoose';
import type { Response } from 'express';

import { env } from '../src/config/env';
import { StaticAsset } from '../src/models/StaticAsset.model';
import { loadTemplateConfig } from '../src/services/template-engine.service';
import { streamGenerateFromTemplate } from '../src/services/ai.service';
import { contentToHtml, renderPdf } from '../src/services/pdf-export.service';
/* eslint-enable import/order, import/first */

// ── Minimal mock response (satisfies the SSE write interface) ─────────────────
function makeMockResponse(): Response {
  const obj = {
    setHeader: () => obj,
    write: () => true,
    end: () => {},
    headersSent: false,
  };
  return obj as unknown as Response;
}

// ── Template form data ────────────────────────────────────────────────────────

// Fix 1.1 (CLO 22-Jun): court_name now carries the full designation so the AI
// builds the correct header even without a DB court record match.
const BAIL_FORM: Record<string, unknown> = {
  fir_number: '42/2025',
  fir_date: '2025-03-15',
  police_station: 'Kotwali',
  sections_charged: '115(2) BNS',
  currently_in_custody: 'Yes',
  custody_since: '2025-03-16',
  state: 'Bihar',
  court_type: 'District Court',
  court_name: 'ADDITIONAL SESSIONS JUDGE, FAST TRACK COURT-I, PATNA',
  applicant_name: 'Rahul Kumar',
  father_name: 'Ramesh Kumar',
  applicant_age: '28',
  address: 'Village Barh, Dist. Patna, Bihar – 803213',
  language: 'English',
  facts_narrative:
    'The applicant is a first-time offender with no prior criminal history. He is the sole breadwinner of his family. The alleged offence arose out of a civil dispute over land. The co-accused have already been granted bail by this court.',
  grounds_for_bail: ['first_time_offender', 'investigation_complete', 'civil_dispute'],
  additional_context:
    'The case is being heard before the Additional Sessions Judge, Fast Track Court-I, Patna. The court heading in the document must read: IN THE COURT OF THE ADDITIONAL SESSIONS JUDGE, FAST TRACK COURT-I, PATNA.',
};

// Fix 2.1/2.2/2.3 (CLO 22-Jun): Consumer complaint now template-generated (not
// read from disk). Address corrected, amounts corrected to proportionate values.
const CONSUMER_COMPLAINT_FORM: Record<string, unknown> = {
  state: 'Bihar',
  court_type: 'Consumer Commission',
  court_name: 'DISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION, PATNA',
  applicant_name: 'Smt. Meena Devi',
  father_name: 'Rajesh Kumar',
  relation_type: 'W/o',
  applicant_age: '35',
  address: '45, Boring Road, Patna – 800001',
  respondent_name:
    'M/s Cool Beverages Pvt. Ltd., Plot No. 12, Industrial Area, Patna – 800010 (through its Managing Director)',
  language: 'English',
  deficiency_details:
    'On 15.01.2025, the Complainant purchased one bottle of "CoolDrink" Cola (500 ml, MRP Rs. 23/-) from M/s Raj Kirana Store, Boring Road, Patna vide Cash Memo No. RKS/0042 dated 15.01.2025. Upon opening the sealed bottle at home, the Complainant discovered a sharp metallic fragment approximately 2 cm in length inside the beverage. The Complainant was on the verge of consuming the beverage when she noticed the foreign object. The presence of such a hazardous foreign material in a sealed, factory-packed branded beverage constitutes a clear defect in goods under Section 2(10) and deficiency in service under Section 2(11) of the Consumer Protection Act, 2019, on the part of the Opposite Party. The Complainant immediately approached the retailer, who refused to accept responsibility and directed her to contact the manufacturer. A written complaint was dispatched to the Opposite Party by registered post on 20.01.2025 (Registered Post No. PTA20250120). Despite receipt, the Opposite Party neither acknowledged the complaint nor provided any relief. This act of the Opposite Party amounts to an unfair trade practice and deficiency in service.',
  consideration_amount: 23,
  purchase_date: '2025-01-15',
  invoice_number: 'RKS/0042',
  payment_mode: 'Cash',
  compensation_claimed: 50000,
  litigation_cost: 10000,
  territorial_basis:
    "The Opposite Party manufactures and distributes its products within the territorial jurisdiction of this Hon'ble District Commission. The cause of action arose at Boring Road, Patna, which falls within the jurisdiction of the District Consumer Disputes Redressal Commission, Patna.",
  pecuniary_basis:
    'The total claim amounts to Rs. 23/- (refund) + Rs. 50,000/- (compensation for mental agony and harassment) + Rs. 10,000/- (litigation costs) = Rs. 60,023/-. This is well within the pecuniary jurisdiction of the District Consumer Disputes Redressal Commission (up to Rs. 50,00,000/- as per the Consumer Protection (Jurisdiction) Rules, 2021).',
  limitation_basis:
    'The cause of action first arose on 15.01.2025. The present complaint is being filed within two years thereof and is therefore within the limitation prescribed under Section 69 of the Consumer Protection Act, 2019.',
};

const LEGAL_NOTICE_FORM: Record<string, unknown> = {
  state: 'Bihar',
  applicant_name: 'Smt. Priya Sharma',
  applicant_address: 'Flat 4B, Shree Apartments, Boring Road, Patna – 800001',
  respondent_name: 'Sh. Manoj Tiwari',
  respondent_address: '12, Rajendra Nagar, Patna – 800016',
  respondent_type: 'individual',
  language: 'English',
  advocate_name: 'Adv. Ravi Shankar Singh',
  advocate_address: 'Chamber No. 15, Bar Association Building, Patna High Court Campus, Patna',
  advocate_enrollment: 'J/845/2012',
  cheque_number: '005382',
  cheque_date: '2025-01-10',
  cheque_amount: '2,50,000',
  amount_in_words: 'Two Lakh Fifty Thousand',
  drawee_bank: 'State Bank of India',
  drawee_branch: 'Boring Road Branch, Patna',
  presentation_date: '2025-01-15',
  dishonour_date: '2025-01-17',
  dishonour_reason: 'Insufficient Funds',
  underlying_liability:
    'The cheque was issued towards repayment of a personal loan of Rs. 2,50,000/- (Rupees Two Lakh Fifty Thousand Only) taken by the Respondent from the Applicant.',
};

// Fix 4.1/4.2 (CLO 22-Jun): facts_narrative carries explicit party-role
// assignment and no-duplicate-preamble instruction for the AI. The template
// promptInstructions have also been updated to enforce this system-wide.
const RENT_AGREEMENT_FORM: Record<string, unknown> = {
  state: 'Jharkhand',
  execution_place: 'Ranchi',
  execution_date: '2025-06-01',
  applicant_name: 'Sh. Dinesh Agarwal',
  applicant_address: '5, Circular Road, Ranchi – 834001',
  applicant_pan: 'ABCDA1234Z',
  respondent_name: 'Sh. Ankit Verma',
  respondent_address: '22, Ashok Nagar, Ranchi – 834002',
  respondent_pan: 'XYZBA9876Y',
  language: 'English',
  property_address: 'Flat No. 301, Block C, Green Valley Apartments, Kanke Road, Ranchi – 834006',
  property_area_sqft: '950',
  property_type: 'Residential Flat',
  rent_amount: '12,000',
  rent_amount_words: 'Twelve Thousand',
  rent_due_date: '5th of each month',
  payment_mode: 'Bank Transfer / UPI',
  escalation_percent: '5',
  security_deposit: '24,000',
  security_deposit_words: 'Twenty-Four Thousand',
  tenure_months: '11',
  lease_start_date: '2025-06-01',
  lease_end_date: '2026-04-30',
  notice_period_months: '1',
  permitted_use: 'Residential only — for personal use by the Tenant and immediate family',
  maintenance_responsibility:
    'Minor day-to-day repairs (taps, switches, fixtures) by Tenant; structural repairs and major works by Landlord',
  facts_narrative:
    'PARTY ROLES (FIXED — do not alter): Sh. Dinesh Agarwal is the LANDLORD (Party of the First Part / Lessor). Sh. Ankit Verma is the TENANT (Party of the Second Part / Lessee). ' +
    'DRAFTING INSTRUCTION: Begin directly with CLAUSE 1. Do NOT write a title, preamble, or "THIS AGREEMENT OF TENANCY" section — the preamble is generated separately. Draft all clauses (property description, rent, security deposit, tenure, utilities, maintenance, sub-letting prohibition, termination, dispute resolution, and any other standard clauses) in numbered sequence.',
};

// ── Samples list ──────────────────────────────────────────────────────────────

const SAMPLES: Array<{
  slug: string;
  filename: string;
  templateId: string;
  formData: Record<string, unknown>;
}> = [
  {
    slug: 'bail-application',
    filename: 'Bail Application Sample.pdf',
    templateId: 'bail_regular',
    formData: BAIL_FORM,
  },
  {
    slug: 'consumer-complaint',
    filename: 'Consumer Complaint Sample.pdf',
    templateId: 'consumer_complaint',
    formData: CONSUMER_COMPLAINT_FORM,
  },
  {
    slug: 'legal-notice-s138',
    filename: 'Legal Notice S138 Sample.pdf',
    templateId: 'legal_notice_s138',
    formData: LEGAL_NOTICE_FORM,
  },
  {
    slug: 'rent-agreement',
    filename: 'Rent Agreement Sample.pdf',
    templateId: 'rent_agreement',
    formData: RENT_AGREEMENT_FORM,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generatePdf(templateId: string, formData: Record<string, unknown>): Promise<Buffer> {
  const templateConfig = loadTemplateConfig(templateId);
  if (!templateConfig) throw new Error(`Template not found: ${templateId}`);

  const mockRes = makeMockResponse();
  const result = await streamGenerateFromTemplate(
    { templateConfig, formData, advocateName: 'Adv. Ravi Shankar Singh' },
    mockRes,
  );

  const html = contentToHtml(result.fullText, false);
  return renderPdf(html);
}

async function upsertAsset(
  slug: string,
  filename: string,
  contentType: string,
  data: Buffer,
): Promise<void> {
  await StaticAsset.findOneAndUpdate(
    { slug },
    { slug, filename, contentType, data },
    { upsert: true, new: true },
  );
  console.info(`  ✓ Stored ${slug} (${Math.round(data.length / 1024)} KB)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.info('→ Connecting to MongoDB…');
  await mongoose.connect(env.MONGO_URI);

  for (const { slug, filename, templateId, formData } of SAMPLES) {
    console.info(`→ Generating ${slug} (${templateId})…`);
    const pdfBuffer = await generatePdf(templateId, formData);
    await upsertAsset(slug, filename, 'application/pdf', pdfBuffer);
  }

  console.info('\n✓ All sample PDFs seeded. Done.');
}

main()
  .catch((err) => {
    console.error('✗ Seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    mongoose.disconnect().catch(() => {});
  });
