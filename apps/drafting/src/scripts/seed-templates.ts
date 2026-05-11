/**
 * Seed script — inserts 5 CLO-validated starter templates.
 * Run: npx ts-node src/scripts/seed-templates.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV ?? 'development'}` });
import mongoose from 'mongoose';

import { Template } from '../models/Template.model';

const SEED_TEMPLATES = [
  {
    name: 'Anticipatory Bail Application — Sessions Court',
    slug: 'anticipatory-bail-sessions',
    category: 'criminal' as const,
    docType: 'bail_application',
    courtType: 'district_court',
    description:
      'Pre-arrest bail application under BNSS Section 482 before Sessions Court. Covers apprehension of arrest, grounds for bail, and surety undertaking.',
    promptTemplate: `Draft an anticipatory bail application under Section 482 of Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 before the Sessions Court.

Court: {{courtName}}
Applicant: {{petitioner}}
Respondent: {{respondent}}

Facts: {{keyFacts}}

Prayer: {{reliefPrayer}}

Use BNS/BNSS sections only. Include verification clause.`,
    planAccess: 'free' as const,
    reviewedBy: 'Ajay — CLO',
    reviewedAt: new Date('2026-04-24'),
    isActive: true,
  },
  {
    name: 'Legal Notice — Recovery of Dues',
    slug: 'legal-notice-recovery',
    category: 'civil' as const,
    docType: 'legal_notice',
    courtType: 'district_court',
    description:
      'Demand notice for recovery of money owed, with 15-day statutory period for response before filing civil suit.',
    promptTemplate: `Draft a legal notice for recovery of dues.

Sender (Advocate for): {{petitioner}}
Recipient: {{respondent}}

Facts: {{keyFacts}}

Demand: {{reliefPrayer}}

Include 15-day notice period, consequences of non-compliance, and intention to file civil suit.`,
    planAccess: 'free' as const,
    reviewedBy: 'Ajay — CLO',
    reviewedAt: new Date('2026-04-24'),
    isActive: true,
  },
  {
    name: 'Criminal Complaint to Magistrate — BNSS 223',
    slug: 'criminal-complaint-magistrate',
    category: 'criminal' as const,
    docType: 'complaint',
    courtType: 'district_court',
    description:
      'Private criminal complaint under BNSS Section 223 before Judicial Magistrate. For cognizable and non-cognizable offences when police refuse to register FIR.',
    promptTemplate: `Draft a criminal complaint under Section 223 of Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023.

Court: {{courtName}}
Complainant: {{petitioner}}
Accused: {{respondent}}

Facts: {{keyFacts}}

Prayer: {{reliefPrayer}}

Use BNS sections for offences. Include list of witnesses and documents.`,
    planAccess: 'free' as const,
    reviewedBy: 'Ajay — CLO',
    reviewedAt: new Date('2026-04-24'),
    isActive: true,
  },
  {
    name: 'Residential Rent Agreement — Standard 11-month',
    slug: 'rent-agreement-residential',
    category: 'civil' as const,
    docType: 'plaint',
    courtType: 'district_court',
    description:
      'Standard 11-month residential rent agreement with security deposit, maintenance, and termination clauses. Suitable for most Indian states.',
    promptTemplate: `Draft an 11-month residential rent agreement.

Landlord: {{petitioner}}
Tenant: {{respondent}}

Property details and terms: {{keyFacts}}

Special conditions: {{reliefPrayer}}

Include standard clauses: rent escalation, security deposit, maintenance, termination notice, lock-in period, and stamp duty note.`,
    planAccess: 'free' as const,
    reviewedBy: 'Ajay — CLO',
    reviewedAt: new Date('2026-04-24'),
    isActive: true,
  },
  {
    name: 'Writ Petition — Article 226 High Court',
    slug: 'writ-petition-high-court',
    category: 'criminal' as const,
    docType: 'petition',
    courtType: 'high_court',
    description:
      'Writ petition under Article 226 of the Constitution of India before the High Court. For enforcement of fundamental rights against state action.',
    promptTemplate: `Draft a writ petition under Article 226 of the Constitution of India.

Court: {{courtName}}
Petitioner: {{petitioner}}
Respondent: {{respondent}}

Facts: {{keyFacts}}

Prayer: {{reliefPrayer}}

Include memo of parties, synopsis, list of dates, grounds, and prayer with interim relief.`,
    planAccess: 'pro' as const,
    reviewedBy: 'Ajay — CLO',
    reviewedAt: new Date('2026-04-24'),
    isActive: true,
  },
];

async function seed() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  for (const tpl of SEED_TEMPLATES) {
    const existing = await Template.findOne({ slug: tpl.slug });
    if (existing) {
      console.log(`  SKIP: ${tpl.slug} (already exists)`);
      continue;
    }
    await Template.create(tpl);
    console.log(`  CREATED: ${tpl.slug}`);
  }

  console.log('Seed complete');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
