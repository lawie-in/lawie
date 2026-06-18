/**
 * One-time script: upload sample PDFs into the static_assets MongoDB collection.
 *
 * Reads the consumer complaint PDF from disk, generates 3 more PDFs by calling
 * streamGenerateFromTemplate directly, then upserts all 4 as StaticAssets.
 *
 *   yarn workspace @lawie/drafting seed:sample-pdfs [path-to-consumer-complaint.pdf]
 *
 * Defaults consumer complaint path to ~/Downloads/Consumer Complaint District Commission  patnahc.pdf
 * if not provided.
 */
/* eslint-disable import/order, import/first */
import { config as loadDotenv } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
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
    // Express uses these for type-checking; seed script never calls them
    headersSent: false,
  };
  return obj as unknown as Response;
}

// ── Template form data for each sample ───────────────────────────────────────

const BAIL_FORM: Record<string, unknown> = {
  fir_number: '42/2025',
  fir_date: '2025-03-15',
  police_station: 'Kotwali',
  sections_charged: '115(2) BNS, 3(5) BNS',
  currently_in_custody: 'Yes',
  custody_since: '2025-03-16',
  state: 'Bihar',
  court_type: 'District Court',
  court_name: '',
  applicant_name: 'Rahul Kumar',
  father_name: 'Ramesh Kumar',
  applicant_age: '28',
  address: 'Village Barh, Dist. Patna, Bihar – 803213',
  language: 'English',
  facts_narrative:
    'The applicant is a first-time offender with no prior criminal history. He is the sole breadwinner of his family. The alleged offence arose out of a civil dispute over land. The co-accused have already been granted bail by this court.',
  grounds_for_bail: ['first_time_offender', 'investigation_complete', 'civil_dispute'],
  additional_context: '',
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
    'The cheque was issued towards repayment of a personal loan of Rs. 2,50,000 taken by the Respondent from the Applicant.',
};

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
  permitted_use: 'Residential only',
  maintenance_responsibility: 'Minor repairs by Tenant; structural repairs by Landlord',
  facts_narrative: '',
};

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

async function main(): Promise<void> {
  console.info('→ Connecting to MongoDB…');
  await mongoose.connect(env.MONGO_URI);

  // ── Consumer complaint — read from disk ──────────────────────────────────────
  const ccPath =
    process.argv[2] ??
    join(
      process.env['HOME'] ?? '/root',
      'Downloads',
      'Consumer Complaint District Commission  patnahc.pdf',
    );

  if (!existsSync(ccPath)) {
    console.error(`✗ Consumer complaint PDF not found at: ${ccPath}`);
    console.error('  Pass the path as the first argument:');
    console.error(
      '  yarn workspace @lawie/drafting seed:sample-pdfs /path/to/consumer-complaint.pdf',
    );
    process.exit(1);
  }

  const ccBuffer = readFileSync(ccPath);
  await upsertAsset(
    'consumer-complaint',
    'Consumer Complaint Sample.pdf',
    'application/pdf',
    ccBuffer,
  );

  // ── Generate the other 3 via the template engine ─────────────────────────────
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
