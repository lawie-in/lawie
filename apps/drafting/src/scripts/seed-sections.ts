/**
 * Seed script — populates SectionMapping collection from JSON files.
 * Run: npx ts-node src/scripts/seed-sections.ts
 *
 * Idempotent: skips existing mappings (matched by oldCode + oldSection + isNewProvision).
 * Use --force to drop and re-seed all mappings.
 */
import path from 'path';

import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(__dirname, `../../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});
import mongoose from 'mongoose';

import crpcToBnss from '../config/sections/crpc-to-bnss.json';
import ieaToBsa from '../config/sections/iea-to-bsa.json';
import ipcToBns from '../config/sections/ipc-to-bns.json';
import { SectionMapping } from '../models/SectionMapping.model';

interface JsonMapping {
  meta: {
    old_code: string;
    old_code_full: string;
    new_code: string;
    new_code_full: string;
    effective_date: string;
    validated_by: string;
  };
  mappings: Record<
    string,
    {
      new: string | null;
      old_title: string;
      new_title: string | null;
      type: string;
      notes?: string;
    }
  >;
  new_provisions: Record<string, { title: string; notes: string }>;
}

const JSON_FILES: JsonMapping[] = [
  ipcToBns as unknown as JsonMapping,
  crpcToBnss as unknown as JsonMapping,
  ieaToBsa as unknown as JsonMapping,
];

async function seed() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  const force = process.argv.includes('--force');

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  if (force) {
    const deleted = await SectionMapping.deleteMany({});
    console.log(`  FORCE: Deleted ${deleted.deletedCount} existing mappings`);
  }

  let created = 0;
  let skipped = 0;

  for (const file of JSON_FILES) {
    const { meta } = file;
    console.log(`\nProcessing ${meta.old_code} → ${meta.new_code}...`);

    // Seed regular mappings
    for (const [oldSection, mapping] of Object.entries(file.mappings)) {
      const existing = await SectionMapping.findOne({
        oldCode: meta.old_code,
        oldSection,
        isNewProvision: false,
      });

      if (existing) {
        skipped++;
        continue;
      }

      await SectionMapping.create({
        oldCode: meta.old_code,
        oldCodeFull: meta.old_code_full,
        newCode: meta.new_code,
        newCodeFull: meta.new_code_full,
        oldSection,
        newSection: mapping.new,
        oldTitle: mapping.old_title,
        newTitle: mapping.new_title,
        mappingType: mapping.type,
        notes: mapping.notes ?? '',
        effectiveDate: new Date(meta.effective_date),
        validatedBy: meta.validated_by,
        isNewProvision: false,
      });
      created++;
    }

    // Seed new provisions
    for (const [newSection, provision] of Object.entries(file.new_provisions)) {
      const existing = await SectionMapping.findOne({
        newCode: meta.new_code,
        newSection,
        isNewProvision: true,
      });

      if (existing) {
        skipped++;
        continue;
      }

      await SectionMapping.create({
        oldCode: meta.old_code,
        oldCodeFull: meta.old_code_full,
        newCode: meta.new_code,
        newCodeFull: meta.new_code_full,
        oldSection: `NEW-${newSection}`,
        newSection,
        oldTitle: 'No equivalent in old code',
        newTitle: provision.title,
        mappingType: 'direct',
        notes: provision.notes,
        effectiveDate: new Date(meta.effective_date),
        validatedBy: meta.validated_by,
        isNewProvision: true,
      });
      created++;
    }

    console.log(`  ${meta.old_code} → ${meta.new_code}: done`);
  }

  console.log(`\nSeed complete: ${created} created, ${skipped} skipped`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
