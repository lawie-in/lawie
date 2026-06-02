/**
 * Seed Indian Courts — populates the courts collection from indian-courts.json.
 *
 * Run: npx ts-node src/scripts/seed-courts.ts
 * Idempotent: uses upsert on courtId, safe to run multiple times.
 */
import fs from 'fs';
import path from 'path';

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({
  path: path.resolve(__dirname, `../../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});

import { Court } from '../models/Court.model';

interface CourtSeedData {
  courtId: string;
  name: string;
  designation: string;
  courtType: string;
  state: string;
  stateId: string;
  city: string;
  formattingRulesRef: string;
  caseNomenclature: string;
  supportedLanguages: string[];
}

interface SeedFile {
  states: { id: string; name: string }[];
  court_types: { id: string; label: string }[];
  courts: CourtSeedData[];
}

async function seed() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB: ${mongoose.connection.host}`);

  const seedPath = path.resolve(__dirname, '../config/courts/indian-courts.json');
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const data: SeedFile = JSON.parse(raw);

  console.log(`Seeding ${data.courts.length} courts across ${data.states.length} states...`);

  let upserted = 0;
  let updated = 0;

  for (const court of data.courts) {
    const result = await Court.updateOne(
      { courtId: court.courtId },
      { $set: court },
      { upsert: true },
    );
    if (result.upsertedCount > 0) upserted++;
    else if (result.modifiedCount > 0) updated++;
  }

  console.log(
    `Done: ${upserted} inserted, ${updated} updated, ${data.courts.length - upserted - updated} unchanged`,
  );

  await mongoose.disconnect();
  console.log('Disconnected.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
