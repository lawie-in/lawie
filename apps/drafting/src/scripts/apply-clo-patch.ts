/**
 * CLO Notes Patch — applies Ajay's review notes to the SectionMapping collection.
 *
 * Actions:
 * 1. UPDATE_NOTE rows: update the notes field matching on oldCode + oldSection
 * 2. FIX_MAPPING (IEA 32): change newSection from "26" to "32", update newTitle
 * 3. NEW_ROW (IPC 416): insert a new mapping document
 * 4. Bulk update: validatedBy → "Ajay - CLO", validatedAt → now, on ALL rows
 *
 * Run: npx ts-node src/scripts/apply-clo-patch.ts
 * Idempotent: safe to run multiple times.
 */
import path from 'path';

import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(__dirname, `../../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});
import mongoose from 'mongoose';

import { SectionMapping } from '../models/SectionMapping.model';

// ── Patch data parsed from /docs/clo_notes_patch.csv ────────────────────────

interface PatchRow {
  oldCode: string;
  oldSection: string;
  newCode: string;
  newSection: string;
  cloNote: string;
  action: string;
}

const PATCH_ROWS: PatchRow[] = [
  {
    oldCode: 'IPC',
    oldSection: '6',
    newCode: 'BNS',
    newSection: '6(1)',
    cloNote:
      "IPC 6 defined only 'offence'. BNS 6 consolidated into a broader definitions section. Sub-section 6(1) retains the offence definition but the scope of the section is now wider.",
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '7',
    newCode: 'BNS',
    newSection: '6(2)',
    cloNote:
      'IPC 7 (Sense of expression once explained) merged into BNS 6(2). No longer a standalone section — now a sub-section under the consolidated Definitions provision.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '12',
    newCode: 'BNS',
    newSection: '2(6)',
    cloNote:
      "IPC 12 (definition of 'Public') merged into BNS 2(6). BNS consolidates scattered IPC definitions into a single S.2 definitions clause.",
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '40',
    newCode: 'BNS',
    newSection: '2(8)',
    cloNote:
      "IPC 40 (definition of 'Offence') merged into BNS 2(8). Now part of the master definitions section instead of a standalone provision.",
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '43',
    newCode: 'BNS',
    newSection: '2(5)',
    cloNote:
      "IPC 43 ('Illegal' / 'Legally bound to do') merged into BNS 2(5). Definition substance unchanged, only relocated to consolidated definitions.",
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '44',
    newCode: 'BNS',
    newSection: '2(4)',
    cloNote:
      "IPC 44 (definition of 'Injury') merged into BNS 2(4). Substance unchanged. Now in BNS S.2 master definitions.",
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '55',
    newCode: 'BNS',
    newSection: '5(b)',
    cloNote:
      'IPC 55 (Commutation of life imprisonment) merged into BNS 5(b). BNS consolidates commutation provisions under a single section with sub-clauses.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '57',
    newCode: 'BNS',
    newSection: '6(3)',
    cloNote:
      'IPC 57 (Fractions of terms of punishment) merged into BNS 6(3). Now a sub-section under the consolidated provision. Calculation method unchanged.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '320',
    newCode: 'BNS',
    newSection: '114(2)',
    cloNote:
      'IPC 320 (Grievous hurt definition) merged into BNS 114(2). BNS combines the definition and its sub-categories into a single section. The 8 kinds of grievous hurt remain the same.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '341',
    newCode: 'BNS',
    newSection: '126(2)',
    cloNote:
      'IPC 341 (Punishment for wrongful restraint) merged into BNS 126(2). BNS combines the offence definition and punishment into one section with sub-sections.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '342',
    newCode: 'BNS',
    newSection: '127(2)',
    cloNote:
      'IPC 342 (Punishment for wrongful confinement) merged into BNS 127(2). Same pattern — definition + punishment consolidated.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '349',
    newCode: 'BNS',
    newSection: '130(1)',
    cloNote:
      "IPC 349 (Force) merged into BNS 130(1). Definition of 'force' now a sub-section under the combined criminal force provision.",
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '352',
    newCode: 'BNS',
    newSection: '131(2)',
    cloNote:
      'IPC 352 (Punishment for assault/criminal force) merged into BNS 131(2). Offence and punishment in one section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '365',
    newCode: 'BNS',
    newSection: '140(3)',
    cloNote:
      'IPC 365 (Kidnapping to secretly confine) merged into BNS 140(3). BNS consolidates all kidnapping aggravated forms under S.140 with sub-sections.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '366',
    newCode: 'BNS',
    newSection: '140(4)',
    cloNote:
      'IPC 366 (Kidnapping woman to compel marriage) merged into BNS 140(4). Now a sub-section under the consolidated kidnapping provision.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '379',
    newCode: 'BNS',
    newSection: '303(2)',
    cloNote:
      'IPC 379 (Punishment for theft) merged into BNS 303(2). BNS combines theft definition (S.303(1) from IPC 378) and punishment into one section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '384',
    newCode: 'BNS',
    newSection: '308(2)',
    cloNote:
      'IPC 384 (Punishment for extortion) merged into BNS 308(2). Definition and punishment consolidated into single section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '390',
    newCode: 'BNS',
    newSection: '309(2)',
    cloNote:
      'IPC 390 (Definition of robbery) merged into BNS 309(2). BNS consolidates robbery definition and punishment together.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '391',
    newCode: 'BNS',
    newSection: '310(2)',
    cloNote:
      'IPC 391 (Definition of dacoity) merged into BNS 310(2). Five or more persons committing robbery remains the threshold.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '392',
    newCode: 'BNS',
    newSection: '309(3)',
    cloNote:
      'IPC 392 (Punishment for robbery) merged into BNS 309(3). Now a sub-section — cite BNS 309(3) for the punishment provision specifically.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '395',
    newCode: 'BNS',
    newSection: '310(3)',
    cloNote:
      'IPC 395 (Punishment for dacoity) merged into BNS 310(3). Punishment provision is now a sub-section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '396',
    newCode: 'BNS',
    newSection: '310(4)',
    cloNote:
      'IPC 396 (Dacoity with murder) merged into BNS 310(4). Death penalty provision retained as sub-section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '406',
    newCode: 'BNS',
    newSection: '316(2)',
    cloNote:
      'IPC 406 (Punishment for CBT) merged into BNS 316(2). BNS consolidates all CBT provisions (IPC 405-409) under S.316 with sub-sections for each aggravated form.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '407',
    newCode: 'BNS',
    newSection: '316(3)',
    cloNote:
      'IPC 407 (CBT by carrier/wharfinger) merged into BNS 316(3). Aggravated form now a sub-section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '408',
    newCode: 'BNS',
    newSection: '316(4)',
    cloNote:
      'IPC 408 (CBT by clerk/servant) merged into BNS 316(4). Aggravated form now a sub-section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '409',
    newCode: 'BNS',
    newSection: '316(5)',
    cloNote:
      'IPC 409 (CBT by public servant/banker/merchant) merged into BNS 316(5). Most commonly cited aggravated form — now cite 316(5) specifically.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '413',
    newCode: 'BNS',
    newSection: '317(3)',
    cloNote:
      'IPC 413 (Habitually dealing in stolen property) merged into BNS 317(3). Now a sub-section under consolidated stolen property provisions.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '417',
    newCode: 'BNS',
    newSection: '318(2)',
    cloNote:
      'IPC 417 (Punishment for cheating) merged into BNS 318(2). BNS consolidates all cheating provisions (IPC 415-420) under S.318-319.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '418',
    newCode: 'BNS',
    newSection: '318(3)',
    cloNote:
      'IPC 418 (Cheating with knowledge of wrongful loss) merged into BNS 318(3). Aggravated form now a sub-section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '420',
    newCode: 'BNS',
    newSection: '318(4)',
    cloNote:
      'IPC 420 (Cheating + dishonest inducement) merged into BNS 318(4). Most commonly charged cheating offence — now cite 318(4). Punishment unchanged: up to 7 years + fine.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '426',
    newCode: 'BNS',
    newSection: '324(2)',
    cloNote:
      'IPC 426 (Punishment for mischief) merged into BNS 324(2). Definition and punishment consolidated.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '427',
    newCode: 'BNS',
    newSection: '324(3)',
    cloNote:
      'IPC 427 (Mischief causing damage above Rs.50) merged into BNS 324(3). Threshold amount may be outdated — practitioners should check for any notification updates.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '442',
    newCode: 'BNS',
    newSection: '329(2)',
    cloNote:
      'IPC 442 (House-trespass definition) merged into BNS 329(2). Definition now a sub-section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '447',
    newCode: 'BNS',
    newSection: '329(3)',
    cloNote:
      'IPC 447 (Punishment for criminal trespass) merged into BNS 329(3). Consolidated with related provisions.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '448',
    newCode: 'BNS',
    newSection: '329(4)',
    cloNote:
      'IPC 448 (Punishment for house-trespass) merged into BNS 329(4). Aggravated trespass form as sub-section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '465',
    newCode: 'BNS',
    newSection: '336(2)',
    cloNote:
      'IPC 465 (Punishment for forgery) merged into BNS 336(2). Punishment provision now a sub-section under consolidated forgery section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '498',
    newCode: 'BNS',
    newSection: '84',
    cloNote:
      "IPC 498 dealt with enticing/detaining a married woman. BNS 84 retains the substance but uses gender-neutral language ('spouse') in parts and is restructured alongside S.85 (cruelty). Practitioners must cite both if applicable.",
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '500',
    newCode: 'BNS',
    newSection: '356(2)',
    cloNote:
      'IPC 500 (Punishment for defamation) merged into BNS 356(2). Defamation remains a criminal offence under BNS. Punishment unchanged: up to 2 years or fine or both.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '506',
    newCode: 'BNS',
    newSection: '351(2)',
    cloNote:
      'IPC 506 (Punishment for criminal intimidation) merged into BNS 351(2). Both simple and aggravated forms consolidated.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '507',
    newCode: 'BNS',
    newSection: '351(3)',
    cloNote:
      'IPC 507 (Criminal intimidation by anonymous communication) merged into BNS 351(3). Now a sub-section under consolidated provision.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '120B',
    newCode: 'BNS',
    newSection: '61(2)',
    cloNote:
      'IPC 120B (Punishment for criminal conspiracy) merged into BNS 61(2). Punishment provision now a sub-section. Conspiracy to commit offence punishable with death/life = same punishment as the offence.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '364A',
    newCode: 'BNS',
    newSection: '140(2)',
    cloNote:
      'IPC 364A (Kidnapping for ransom) merged into BNS 140(2). Punishment unchanged — death or life imprisonment. Now sub-section under consolidated S.140.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '376DA',
    newCode: 'BNS',
    newSection: '70(2)',
    cloNote:
      'IPC 376DA (Gang rape on woman under 16) merged into BNS 70(2). BNS consolidates aggravated gang rape provisions. Note: both IPC 376DA and 376DB map to same BNS 70(2) — BNS uses a single sub-section covering all minor victims.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IPC',
    oldSection: '376DB',
    newCode: 'BNS',
    newSection: '70(2)',
    cloNote:
      'IPC 376DB (Gang rape on woman under 12) merged into BNS 70(2). Previously a separate section with enhanced punishment — now consolidated with 376DA into single BNS 70(2). Punishment for under-12 victim remains life imprisonment or death.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'CrPC',
    oldSection: '41A',
    newCode: 'BNSS',
    newSection: '35(3)',
    cloNote:
      'CrPC 41A (Notice of appearance before police officer) merged into BNSS 35(3). The mandatory notice requirement before arrest in cases with up to 7 years punishment is retained as a sub-section. Key safeguard for advocates to cite in anticipatory bail arguments.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'CrPC',
    oldSection: '41C',
    newCode: 'BNSS',
    newSection: '37(2)',
    cloNote:
      'CrPC 41C (Control room at districts) merged into BNSS 37(2). Administrative provision — now a sub-section.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IEA',
    oldSection: '3',
    newCode: 'BSA',
    newSection: '2(1)',
    cloNote:
      'IEA 3 (Interpretation clause) merged into BSA 2(1). All core definitions (Court, Fact, Document, Evidence, Proved, Disproved, Not proved) consolidated under BSA S.2. Practitioners should cite BSA 2 generally for definitions.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IEA',
    oldSection: '101',
    newCode: 'BSA',
    newSection: '104',
    cloNote:
      'IEA 101 (Burden of proof) is partially mapped to BSA 104. BNS restructures burden of proof provisions — BSA 104 covers the general rule, but specific burden provisions are now spread across BSA 104-114. Practitioners should check the full range for specific contexts.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IEA',
    oldSection: '65A',
    newCode: 'BSA',
    newSection: '62(2)',
    cloNote:
      'IEA 65A (Special provisions for electronic evidence) merged into BSA 62(2). Now a sub-section under the consolidated electronic records provision.',
    action: 'UPDATE_NOTE',
  },
  {
    oldCode: 'IEA',
    oldSection: '65B',
    newCode: 'BSA',
    newSection: '63(4)',
    cloNote:
      'IEA 65B (Admissibility of electronic records) merged into BSA 63(4). CRITICAL for practitioners — the Arjun Panditrao Khotkar (2020) SC ruling on mandatory S.65B certificate compliance remains applicable. Now cite BSA 63(4) with certificate under BSA 63(4)(a)-(d).',
    action: 'UPDATE_NOTE',
  },
];

// Special rows
const IEA_32_FIX = {
  oldCode: 'IEA',
  oldSection: '32',
  cloNote:
    'IMPORTANT: This mapping is INCORRECT in the current data. IEA 32 (Dying declaration and other statements by dead/unavailable persons) should map to BSA 32, NOT BSA 26. BSA 26 corresponds to IEA 27 (discovery statements). Fix required before shipping.',
  newSectionCorrect: '32',
  newTitleCorrect:
    'Cases in which statement of relevant fact by person who is dead or cannot be found etc. is relevant',
};

const IPC_416_NEW = {
  oldCode: 'IPC',
  oldCodeFull: 'Indian Penal Code, 1860',
  newCode: 'BNS',
  newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
  oldSection: '416',
  newSection: '319',
  oldTitle: 'Cheating by personation',
  newTitle: 'Cheating by personation',
  mappingType: 'direct' as const,
  notes:
    'IPC 416 (Cheating by personation) maps directly to BNS 319. Commonly cited alongside IPC 419/420 in fraud cases.',
  effectiveDate: new Date('2024-07-01'),
  isActive: true,
  isNewProvision: false,
};

async function applyPatch() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  let notesUpdated = 0;
  let fixedMappings = 0;
  let newRows = 0;

  // ── Step 1: UPDATE_NOTE rows ──────────────────────────────────────────────
  for (const row of PATCH_ROWS) {
    const result = await SectionMapping.updateOne(
      { oldCode: row.oldCode, oldSection: row.oldSection, isNewProvision: false },
      { $set: { notes: row.cloNote } },
    );
    if (result.modifiedCount > 0) {
      notesUpdated++;
    } else if (result.matchedCount === 0) {
      console.warn(`  WARN: No match for ${row.oldCode} ${row.oldSection}`);
    }
  }
  console.log(`Step 1: Updated notes on ${notesUpdated}/${PATCH_ROWS.length} rows`);

  // ── Step 2: FIX_MAPPING — IEA 32 ─────────────────────────────────────────
  const fixResult = await SectionMapping.updateOne(
    { oldCode: IEA_32_FIX.oldCode, oldSection: IEA_32_FIX.oldSection, isNewProvision: false },
    {
      $set: {
        newSection: IEA_32_FIX.newSectionCorrect,
        newTitle: IEA_32_FIX.newTitleCorrect,
        notes: IEA_32_FIX.cloNote,
      },
    },
  );
  if (fixResult.modifiedCount > 0) {
    fixedMappings++;
    console.log(`Step 2: Fixed IEA 32 → BSA ${IEA_32_FIX.newSectionCorrect} (was BSA 26)`);
  } else {
    console.warn('  WARN: IEA 32 mapping not found or already fixed');
  }

  // ── Step 3: NEW_ROW — IPC 416 ────────────────────────────────────────────
  const existing416 = await SectionMapping.findOne({
    oldCode: 'IPC',
    oldSection: '416',
    isNewProvision: false,
  });
  if (!existing416) {
    await SectionMapping.create(IPC_416_NEW);
    newRows++;
    console.log('Step 3: Inserted IPC 416 → BNS 319');
  } else {
    console.log('Step 3: IPC 416 already exists — skipped');
  }

  // ── Step 4: Bulk validate all rows ────────────────────────────────────────
  const now = new Date();
  const bulkResult = await SectionMapping.updateMany(
    { isActive: true },
    {
      $set: {
        validatedBy: 'Ajay - CLO',
        validatedAt: now,
      },
    },
  );
  console.log(
    `Step 4: Bulk validated ${bulkResult.modifiedCount} rows (validatedBy → "Ajay - CLO")`,
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n--- PATCH SUMMARY ---');
  console.log(`  Notes updated: ${notesUpdated}`);
  console.log(`  Mappings fixed: ${fixedMappings}`);
  console.log(`  New rows inserted: ${newRows}`);
  console.log(`  Bulk validated: ${bulkResult.modifiedCount}`);

  await mongoose.disconnect();
  console.log('Done');
}

applyPatch().catch((err) => {
  console.error('Patch failed:', err);
  process.exit(1);
});
