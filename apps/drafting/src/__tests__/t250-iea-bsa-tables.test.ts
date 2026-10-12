/**
 * T-250 - corrected IEA to BSA table, new_provisions, pack citations.
 * Legal sign-off: Ajay (CLO), 12 Oct 2026:
 *   handoff/legal/T-250-iea-to-bsa-corrected-signed.md (sections A, B, C)
 *   handoff/legal/T-250-followup-citations-signed.md (items 1-8)
 * Expected values below are copied from the signed documents, not computed
 * from the data files under test.
 */
import './setupEnv';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import { SectionMapping } from '../models/SectionMapping.model';
import { validateBnsSections } from '../services/ai.service';

const CONFIG = path.join(__dirname, '..', 'config');
const read = (...p: string[]): string => fs.readFileSync(path.join(CONFIG, ...p), 'utf-8');
const json = <T = any>(...p: string[]): T => JSON.parse(read(...p)) as T; // eslint-disable-line @typescript-eslint/no-explicit-any

const IEA_SHA = '19a2e8c3276919fdb842c393acf8158a4ff34be976d8206a26c2d9cbefbf8f0b';

describe('T-250 AC1: iea-to-bsa.json is the signed table (section A)', () => {
  const iea = json('sections', 'iea-to-bsa.json');

  it('is byte for byte the signed block (SHA-256)', () => {
    const sha = createHash('sha256')
      .update(fs.readFileSync(path.join(CONFIG, 'sections', 'iea-to-bsa.json')))
      .digest('hex');
    expect(sha).toBe(IEA_SHA);
  });

  it('has 185 rows and the signed meta', () => {
    expect(Object.keys(iea.mappings)).toHaveLength(185);
    expect(iea.meta.old_code).toBe('IEA');
    expect(iea.meta.new_code).toBe('BSA');
    expect(iea.meta.validated_by).toContain('2026-10-12');
  });

  // [IEA, BSA] from the signed table
  const pairs: [string, string][] = [
    ['1', '1'],
    ['3', '2(1)'],
    ['4', '2(1)'],
    ['5', '3'],
    ['27', '23(2)'],
    ['32', '26'],
    ['45', '39(1)'],
    ['61', '56'],
    ['62', '57'],
    ['63', '58'],
    ['64', '59'],
    ['65', '60'],
    ['65A', '62'],
    ['65B', '63'],
    ['74', '74(1)'],
    ['100', '103'],
    ['113A', '117'],
    ['113B', '118'],
    ['114A', '120'],
    ['167', '169'],
  ];
  it.each(pairs)('IEA %s maps to BSA %s', (old, bsa) => {
    expect(iea.mappings[old]).toBeDefined();
    expect(iea.mappings[old].new).toBe(bsa);
  });

  it('IEA 32 and 45 are not the old wrong targets', () => {
    expect(iea.mappings['32'].new).not.toBe('32');
    expect(iea.mappings['45'].new).not.toBe('44');
    expect(iea.mappings['100'].type).not.toBe('repealed');
  });

  it('has no row for the non-existent BSA 170A', () => {
    expect(JSON.stringify(iea)).not.toContain('170A');
  });

  it.each(['2', '22A', '82', '88', '113', '166'])(
    'IEA %s is repealed_no_equivalent with no BSA section',
    (old) => {
      expect(iea.mappings[old].type).toBe('repealed_no_equivalent');
      expect(iea.mappings[old].new).toBeNull();
      expect(iea.mappings[old].new_title).toBeNull();
    },
  );

  it('only those six rows are repealed_no_equivalent', () => {
    const rows = Object.entries<{ type: string }>(iea.mappings)
      .filter(([, v]) => v.type === 'repealed_no_equivalent')
      .map(([k]) => k)
      .sort();
    expect(rows).toEqual(['113', '166', '2', '22A', '82', '88'].sort());
  });
});

describe('T-250 AC1: crpc-to-bnss.json new_provisions (section B)', () => {
  const np = json('sections', 'crpc-to-bnss.json').new_provisions;

  it('has exactly the nine signed entries', () => {
    expect(Object.keys(np).sort()).toEqual(
      ['173(1)', '173(3)', '176(3)', '187(3)', '193(3)', '356', '398', '413', '530'].sort(),
    );
  });

  it('173(1) is the e-FIR', () => {
    expect(np['173(1)'].title).toBe(
      'Information in cognizable cases may be given orally or by electronic communication (e-FIR)',
    );
    expect(np['173(1)'].notes).toBe(
      'New: information given by electronic communication is taken on record on being signed within three days by the person giving it',
    );
  });

  it('173(3) is the preliminary enquiry, not e-FIR', () => {
    expect(np['173(3)'].title).toBe(
      'Preliminary enquiry within fourteen days for offences punishable with three years or more but less than seven years',
    );
    expect(np['173(3)'].notes).toBe(
      'New: with the prior permission of an officer not below the rank of Deputy Superintendent of Police',
    );
    expect(np['173(3)'].title).not.toMatch(/e-FIR|electronic/i);
  });

  it('193(3) is the ninety-day duty to inform, not a filing limit', () => {
    expect(np['193(3)'].title).toBe(
      'Report of the police officer on completion of investigation; the police officer informs the progress of the investigation to the informant or victim within ninety days',
    );
    expect(np['193(3)'].notes).toBe(
      'New: the ninety-day duty to inform the informant or victim is in 193(3)(ii). It is not a limit for filing the report',
    );
    expect(np['193(3)'].title).not.toMatch(/180 days|extendable/);
  });

  it('176(2) is gone, 176(3) is the forensic visit', () => {
    expect(np['176(2)']).toBeUndefined();
    expect(np['176(3)'].title).toBe(
      'Forensic expert to visit the scene of crime for offences punishable with seven years or more',
    );
  });

  it('187(3) is carried over, not new', () => {
    expect(np['187(3)'].notes).toBe('Carried over from CrPC 167(2); not a new rule');
  });

  it('398 is the witness protection scheme and the victim appeal is 413', () => {
    expect(np['398'].title).toBe('Witness protection scheme');
    expect(np['413'].title).toBe(
      "Victim's right of appeal against acquittal, conviction for a lesser offence or inadequate compensation",
    );
    expect(np['413'].notes).toBe(
      'Proviso to section 413; replaces the label wrongly placed at 398',
    );
  });

  it('356 and 530 are as signed', () => {
    expect(np['356']).toEqual({
      title: 'Trial in absentia of proclaimed offenders',
      notes: 'New: permits trial to proceed where accused absconds',
    });
    expect(np['530']).toEqual({
      title: 'Trials, inquiries and proceedings to be held in electronic mode',
      notes: 'New: enables virtual court proceedings',
    });
  });
});

describe('T-250 AC1: production_of_documents (section C and follow-up 1-3)', () => {
  const raw = read('document-rules', 'production_of_documents.json');
  const pack = JSON.parse(raw);
  const instructions: string[] = pack.prompt_context.promptInstructions;

  const PARA_7 =
    'Para 7: Documents not protected by privilege under the Bharatiya Sakshya Adhiniyam, 2023, which replaced the Indian Evidence Act, 1872. Privileges the advocate should check before listing a document: communications during marriage (BSA 128, IEA 122); evidence as to affairs of State (BSA 129, IEA 123); official communications (BSA 130, IEA 124); professional communications (BSA 132, IEA 126); confidential communications with legal advisers (BSA 134, IEA 129); production of title-deeds of a witness who is not a party (BSA 135, IEA 130). The advocate decides which, if any, applies.';

  it('Para 7 equals the signed text exactly, once', () => {
    const paras = instructions.filter((s) => s.startsWith('Para 7:'));
    expect(paras).toEqual([PARA_7]);
  });

  it('government-held documents line cites S.129-130 BSA', () => {
    expect(instructions).toContain(
      'Where document held by government / public office: S.129-130 BSA (formerly S.123-124 IEA) — state privilege; production by way of certified copy if not privileged.',
    );
  });

  it('BSA relevantActs provisions are the signed numbers', () => {
    const act = pack.relevantActs.find((a: { act: string }) => a.act.includes('Bharatiya Sakshya'));
    expect(act).toBeDefined();
    const byNumber = Object.fromEntries(
      act.sections.map((s: { number: string; description: string }) => [s.number, s.description]),
    );
    expect(byNumber).toEqual({
      'S.128': 'Communications during marriage — privilege',
      'S.129': 'Affairs of state — privilege',
      'S.135': 'Production of title-deeds — witness not bound to produce',
      'S.130': 'Official communications — privilege',
      'S.132': 'Professional communications — legal adviser (replaces S.126 IEA)',
    });
  });

  it('key_citations says S.129 BSA for S.123 IEA; old-code references stay', () => {
    expect(raw).toContain('Privilege under S.123 IEA (now S.129 BSA)');
    expect(raw).toContain('S.123-124 IEA');
    expect(raw).toContain('replaces S.126 IEA');
  });

  it.each([
    'S.137-138 BSA',
    'now S.134 BSA',
    '"S.134"',
    '"S.136"',
    '"S.137"',
    '"S.139"',
    'S.132 BSA',
    'S.139 BSA',
  ])('old wrong string %s is gone', (old) => {
    expect(raw).not.toContain(old);
  });

  it('S.132 now means professional communications, not spouses', () => {
    expect(raw).not.toMatch(/"S\.132",\s*"description": "Communications during marriage/);
  });
});

describe('T-250 follow-up 4 / r1 / r5: bns-mapping.json', () => {
  const bns = json('bns-mapping.json');

  it('has no iea_to_bsa key', () => {
    expect(bns).not.toHaveProperty('iea_to_bsa');
  });

  it('schema_note no longer mentions iea_to_bsa or ipc_to_bns (T-267) and still names crpc_to_bnss', () => {
    expect(bns._meta.schema_note).not.toContain('iea_to_bsa');
    expect(bns._meta.schema_note).not.toContain('ipc_to_bns');
    expect(bns).not.toHaveProperty('ipc_to_bns');
    expect(bns._meta.schema_note).toContain('crpc_to_bnss');
  });

  it('affidavit has no BSA and knows exactly the four signed sections', () => {
    expect(bns.affidavit.act).toBe(
      'Oaths Act, 1969 / Notaries Act, 1952 / Code of Civil Procedure, 1908',
    );
    expect(bns.affidavit.sections.map((s: { number: string }) => s.number)).toEqual([
      '3',
      '8',
      'Order XIX',
      'Order XIX Rule 3',
    ]);
    expect(JSON.stringify(bns.affidavit)).not.toMatch(/BSA|Sakshya/);
  });

  it("affidavit entry matches Ajay's signed text exactly (act, numbers, descriptions, per-section acts)", () => {
    expect(bns.affidavit).toEqual({
      act: 'Oaths Act, 1969 / Notaries Act, 1952 / Code of Civil Procedure, 1908',
      sections: [
        {
          number: '3',
          description: 'Power to administer oaths and affirmations',
          act: 'Oaths Act, 1969',
        },
        {
          number: '8',
          description: 'Functions of notaries',
          act: 'Notaries Act, 1952',
        },
        {
          number: 'Order XIX',
          description: 'Affidavits',
          act: 'Code of Civil Procedure, 1908',
        },
        {
          number: 'Order XIX Rule 3',
          description: 'Matters to which affidavits shall be confined',
          act: 'Code of Civil Procedure, 1908',
        },
      ],
    });
  });

  describe('validateBnsSections on affidavit (Ajay r1)', () => {
    it('does not flag "u/s 3 of the Oaths Act"', () => {
      expect(validateBnsSections('affidavit', 'Sworn u/s 3 of the Oaths Act')).toEqual([]);
    });
    it('does not flag "under Section 8 of the Notaries Act"', () => {
      expect(
        validateBnsSections('affidavit', 'Attested under Section 8 of the Notaries Act'),
      ).toEqual([]);
    });
    it('flags "Sworn under Section 85 BSA"', () => {
      expect(validateBnsSections('affidavit', 'Sworn under Section 85 BSA')).toEqual(['85']);
    });
  });
});

describe('T-250 follow-up 7: cjm_generic court rule', () => {
  const raw = read('court-rules', 'cjm_generic.json');
  const rule = JSON.parse(raw);

  it('jurisdictionNote has the signed sentence and keeps the rest', () => {
    expect(rule.jurisdictionNote).toBe(
      'Chief Judicial Magistrate (S.10 BNSS). May pass any sentence authorised by law except death, imprisonment for life or imprisonment for a term exceeding seven years (S.23 BNSS). Has powers of remand (S.187 BNSS), first bail hearing for non-bailable offences within CJM jurisdiction, and supervisory authority over JMFCs in the district.',
    );
  });

  it('carries the signed S.23 sentence in the rule list', () => {
    expect(JSON.stringify(rule)).toContain(
      'A CJM may pass any sentence authorised by law except death, imprisonment for life or imprisonment for a term exceeding seven years (S.23 BNSS).',
    );
  });

  it('no longer cites S.16 BNSS or the old 7-year jurisdiction line', () => {
    expect(raw).not.toContain('S.16 BNSS');
    expect(raw).not.toContain('CJM has jurisdiction over offences punishable up to 7 years');
    expect(raw).not.toContain('Tries offences punishable with imprisonment up to 7 years');
  });
});

describe('T-250 follow-up 8: indian-courts.json metropolitan notes', () => {
  const raw = read('courts', 'indian-courts.json');
  const TAIL =
    " The BNSS has no metropolitan areas; the designation of the city's criminal courts is as the State notification gives it.";
  const signed = [
    'Ahmedabad was a metropolitan area under the CrPC (proceedings pending before 1 July 2024), where the CMM exercises powers analogous to a CJM.' +
      TAIL,
    'Bengaluru was a metropolitan area under the CrPC (proceedings pending before 1 July 2024), where the CMM exercises powers analogous to a CJM.' +
      TAIL,
    'Chennai was a metropolitan area under the CrPC (proceedings pending before 1 July 2024), where the CMM Egmore exercises powers analogous to a CJM.' +
      TAIL,
  ];

  it.each(signed)('has jurisdictionNote: %s', (note) => {
    expect(raw).toContain(`"jurisdictionNote": ${JSON.stringify(note)}`);
  });

  it('no court note says a city is a metropolitan area under S.16 BNSS', () => {
    expect(raw).not.toContain('S.16 BNSS');
  });

  it('the Mumbai metropolitan note is unchanged (not on the signed list)', () => {
    expect(raw).toContain(
      '"jurisdictionNote": "Metropolitan area; CMM exercises powers analogous to a CJM in non-metropolitan districts. Esplanade is the principal CMM Court in Greater Mumbai."',
    );
  });
});

describe('T-250 AC3: no pack cites an old wrong number', () => {
  const dirs = ['document-rules', 'court-rules', 'courts'].map((d) => path.join(CONFIG, d));
  const files = dirs.flatMap((d) =>
    fs
      .readdirSync(d)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(d, f)),
  );

  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  const forbidden: [string, RegExp][] = [
    ['S.16 BNSS', /S\.\s?16 BNSS|BNSS\s+(S\.|section\s)?16\b/i],
    ['S.132 BSA (spouses)', /S\.132 BSA|BSA\s+(S\.)?132[^)]*(marriage|spous)/i],
    ['S.134 BSA (state)', /S\.134 BSA/],
    ['S.136 BSA', /S\.136 BSA/],
    ['S.139 BSA', /S\.139 BSA/],
    ['S.137-138 BSA', /S\.137-138 BSA/],
    ['BSA 168-170 as IEA 166-167 labels', /BSA\s+(S\.)?(168|169|170)\b/],
    ['BNSS 173(3) as e-FIR', /173\(3\)[^"]{0,80}(e-FIR|electronic)/i],
    [
      'BNSS 193(3) as filing limit',
      /193\(3\)[^"]{0,120}(filed within 90|charge ?sheet filing|within 90 days)/i,
    ],
    ['BNSS 176(2) as preliminary inquiry', /176\(2\)[^"]{0,80}(preliminary)/i],
    ['BNSS 398 as victim appeal', /398[^"]{0,60}victim/i],
  ];

  it.each(forbidden)('no file contains %s', (_label, re) => {
    const hits = files
      .filter((f) => re.test(fs.readFileSync(f, 'utf-8')))
      .map((f) => path.basename(f));
    expect(hits).toEqual([]);
  });

  it('every "S.n BSA" / "BSA n" cited in a pack is a target in the signed table or new_provisions', () => {
    const iea = json('sections', 'iea-to-bsa.json');
    const targets = new Set<string>();
    for (const m of Object.values<{ new: string | null }>(iea.mappings)) {
      if (m.new) targets.add(m.new.replace(/\(.*$/, ''));
    }
    for (const k of Object.keys(iea.new_provisions)) targets.add(k.replace(/\(.*$/, ''));

    const cited: { file: string; n: string }[] = [];
    const re = /S\.(\d+)(?:-(\d+))? BSA|BSA[ ,]+(?:S\.|[Ss]ection )?(\d+)/g;
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf-8');
      for (const m of text.matchAll(re)) {
        for (const n of [m[1], m[2], m[3]]) if (n) cited.push({ file: path.basename(f), n });
      }
    }
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((c) => !targets.has(c.n))).toEqual([]);
  });
});

describe('T-250: SectionMapping accepts repealed_no_equivalent', () => {
  const base = {
    oldCode: 'IEA',
    oldCodeFull: 'Indian Evidence Act, 1872',
    newCode: 'BSA',
    newCodeFull: 'Bharatiya Sakshya Adhiniyam, 2023',
    oldSection: '166',
    newSection: null,
    oldTitle: 'Power of jury or assessors to put questions',
    newTitle: null,
    effectiveDate: new Date('2024-07-01'),
  };

  it('validateSync accepts a repealed_no_equivalent row', () => {
    const doc = new SectionMapping({ ...base, mappingType: 'repealed_no_equivalent' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('still rejects an unknown mappingType', () => {
    const doc = new SectionMapping({ ...base, mappingType: 'bogus' });
    expect(doc.validateSync()?.errors.mappingType).toBeDefined();
  });

  it('every row of both signed tables validates as a SectionMapping', () => {
    const files = [
      { f: 'iea-to-bsa.json', oc: 'IEA', ocf: 'Indian Evidence Act, 1872', nc: 'BSA' },
      { f: 'crpc-to-bnss.json', oc: 'CrPC', ocf: 'Code of Criminal Procedure, 1973', nc: 'BNSS' },
    ];
    const failures: string[] = [];
    let n = 0;
    for (const { f, oc, ocf, nc } of files) {
      const j = json('sections', f);
      for (const [oldSection, m] of Object.entries<any>(j.mappings)) {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        n++;
        const err = new SectionMapping({
          oldCode: oc,
          oldCodeFull: ocf,
          newCode: nc,
          newCodeFull: j.meta.new_code_full,
          oldSection,
          newSection: m.new,
          oldTitle: m.old_title,
          newTitle: m.new_title,
          mappingType: m.type,
          notes: m.notes ?? m.note ?? '',
          effectiveDate: new Date(j.meta.effective_date),
          // Signed tables only (r3): the seed passes meta.validated_by / last_updated.
          validatedBy: j.meta.validated_by,
          validatedAt: new Date(j.meta.last_updated),
        }).validateSync();
        if (err) failures.push(`${oc} ${oldSection}`);
      }
    }
    expect(n).toBe(185 + 535);
    expect(failures).toEqual([]);
  });
});
