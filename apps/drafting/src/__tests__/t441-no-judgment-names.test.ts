/**
 * T-441: judgment names removed from the drafting prompts of criminal_revision,
 * bail_cancellation, interim_bail and the bail_anticipatory twin (docs/templates).
 *
 * Signed: handoff/legal/T-245-old-new-law-switch-signed.md, Addendum 2 #8 and
 * Addendum 8 (Ajay, 15 Oct 2026): rules R1-R7 and the sentence S.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// S, byte-exact (U+2014 dash), Addendum 8.
const S =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const TWIN_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'templates',
  'bail_anticipatory.json',
);

const load = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const rule = (id: string) => load(join(RULES_DIR, `${id}.json`));

// The regex from t148-no-case-law.test.ts, plus the names removed by T-441.
const JUDGMENT =
  /Sushila|Chidambaram|Morgan Stanley|Anand Prasad|Faqir Chand|Mohan Lal|\d+\s+SCC\s+\d+|AIR\s+\d{4}\s+SC/;
const REMOVED_NAMES = [
  'Dolat Ram',
  'Bhagirathsinh',
  'Lal Kamlendra',
  'Sushila Aggarwal',
  'Madhu Limaye',
  'Amar Nath',
  'Rajendra Kumar Sitaram Pande',
  'Krishnaveni',
  'Kaptan Singh',
  'Namboodiri',
  'Sanjay Kumar Rai',
  'Bhushan Kumar',
  'Asim Shariff',
  'Som Nath Thapa',
];

/** Everything the model can see: the pack minus key_citations, key_precedents and _meta (R6). */
const modelVisible = (pack: Record<string, unknown>): string => {
  const copy = { ...pack };
  delete copy.key_citations;
  delete copy.key_precedents;
  delete copy._meta;
  return JSON.stringify(copy);
};

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const PACKS: Array<[string, () => Record<string, any>]> = [
  ['criminal_revision', () => rule('criminal_revision')],
  ['bail_cancellation', () => rule('bail_cancellation')],
  ['interim_bail', () => rule('interim_bail')],
  ['bail_anticipatory (twin, docs/templates)', () => load(TWIN_PATH)],
];

const instructionsOf = (id: string): string[] => {
  const p = rule(id);
  return id === 'criminal_revision' ? p.prompt_context.promptInstructions : p.promptInstructions;
};

describe('T-441: the no-judgment sentence S (Addendum 8, R3)', () => {
  it('S in this file is the signed text, with the U+2014 dash', () => {
    expect(S).toContain('—');
    expect(S).toBe(
      'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].',
    );
  });

  it.each(['criminal_revision', 'bail_cancellation', 'interim_bail'])(
    '%s: S is the last promptInstructions entry and appears exactly once in the pack',
    (id) => {
      const ins = instructionsOf(id);
      expect(ins[ins.length - 1]).toBe(S);
      expect(ins.filter((e) => e === S)).toHaveLength(1);
      expect(count(JSON.stringify(rule(id)), S)).toBe(1);
    },
  );

  it('bail_anticipatory twin: S is inline in the body prompt_context, exactly once in the file', () => {
    const raw = readFileSync(TWIN_PATH, 'utf8');
    expect(count(JSON.stringify(JSON.parse(raw)), S)).toBe(1);
    const walk = (v: any, out: string[]) => {
      if (typeof v === 'string') {
        if (v.includes(S)) out.push(v);
      } else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, out));
      return out;
    };
    const hits = walk(load(TWIN_PATH), []);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(
      /^Generate 8-12 numbered paragraphs for an Anticipatory Bail application/,
    );
    expect(hits[0]).toContain(`${S} Do NOT generate the prayer clause or verification`);
  });
});

describe('T-441: no judgment name in any model-visible field (R1, R2)', () => {
  it.each(PACKS)('%s: JUDGMENT regex finds nothing', (_id, get) => {
    expect(modelVisible(get())).not.toMatch(JUDGMENT);
  });

  it.each(PACKS)('%s: none of the removed names appears', (_id, get) => {
    const text = modelVisible(get());
    for (const name of REMOVED_NAMES) expect(text).not.toContain(name);
  });

  it.each(PACKS)('%s: no "v." case citation pattern or reporter citation', (_id, get) => {
    const text = modelVisible(get());
    expect(text).not.toMatch(/\bv\.\s+(State|Union|[A-Z][a-z]+)\b.*\(\d{4}\)/);
    expect(text).not.toMatch(/\(\d{4}\)\s+\d+\s+(SCC|SCR)\b/);
  });

  it.each(['criminal_revision', 'bail_cancellation', 'interim_bail'])(
    '%s: promptInstructions entries are named-judgment-free and none is a bare "Cite ..." line',
    (id) => {
      for (const e of instructionsOf(id)) {
        expect(e).not.toMatch(JUDGMENT);
        expect(e).not.toMatch(/^Cite [A-Z][\w.]* v\./);
      }
    },
  );
});

describe('T-441: pinned wording (R1 keeps the proposition word for word)', () => {
  // The signed file approves these "as proposed" (Addendum 8 (a)) but does not print them
  // byte for byte; the strings below are the developer's reported text, pending Ajay's byte-check.
  it('bail_cancellation prompt_context: names and citations removed, proposition kept', () => {
    const pc: string = rule('bail_cancellation').prompt_context;
    expect(pc).toContain(
      'Cancellation grounds are well-established: (1) tampering with evidence; (2) threatening or influencing witnesses;',
    );
    expect(pc).not.toMatch(/well-established \(/);
  });

  it('bail_cancellation: the "Cite ... on grounds for cancellation" entry is deleted (R2)', () => {
    expect(
      instructionsOf('bail_cancellation').some((e) => /on grounds for cancellation/.test(e)),
    ).toBe(false);
  });

  it('interim_bail: prompt_context carries no judgment name', () => {
    expect(rule('interim_bail').prompt_context).not.toMatch(/Kamlendra|Lal\b.*v\./);
  });

  it('bail_anticipatory twin: the (ii)/(iii) list is reduced to the kept proposition', () => {
    const text = JSON.stringify(load(TWIN_PATH));
    expect(text).toContain('{governing_provision}');
    expect(text).toContain(
      'Include reference to: (i) Article 21 of Constitution, (ii) that custodial interrogation is not necessary as applicant is willing to join investigation. ' +
        S +
        ' Do NOT generate the prayer clause or verification',
    );
  });

  const REVISION_PINNED = [
    'Test for interlocutory: orders that decide important rights or affect ends of trial are NOT interlocutory; orders of pure procedural nature ARE interlocutory.',
    'Order of cognizance / summons is NOT interlocutory (revisable).',
    'Bar of second revision under S.397(3) CrPC (now S.438(3) BNSS — bar to apply to both HC and Sessions in same case); HC can still exercise inherent jurisdiction.',
    'Revisional court has limited scope; cannot re-appreciate evidence like appellate court.',
    'Perversity threshold for interference with factual findings in revision.',
    // Ajay approved the criminal_revision lines as built (8d740cc) and the Para 8 must-fix.
    'Para 4: Nature of impugned order — confirm it is NOT interlocutory.',
    'Para 8: Grounds of revision — itemise each ground.',
    'Para 10: Where lower court took cognizance / framed charge: cognizance / summoning orders, judicial mind required.',
    'Para 11: Where Magistrate erred in framing charges: charge framing principles.',
  ];

  it.each(REVISION_PINNED)(
    'criminal_revision promptInstructions contains, byte-exact: %s',
    (line) => {
      expect(instructionsOf('criminal_revision')).toContain(line);
    },
  );

  it('criminal_revision: the cite-only lines (Amar Nath, Sanjay Kumar Rai) are deleted (R2)', () => {
    const ins = instructionsOf('criminal_revision');
    expect(ins.some((e) => /^Cite\b.*\bv\./.test(e))).toBe(false);
  });
});

describe('T-441: criminal_revision Para 8 asks for no precedent', () => {
  it('"precedent" does not appear in the model-visible text', () => {
    expect(modelVisible(rule('criminal_revision'))).not.toMatch(/precedent/i);
  });
  it('the old Para 8 wording is gone', () => {
    expect(instructionsOf('criminal_revision')).not.toContain(
      'Para 8: Grounds of revision — itemise each ground with relevant precedent.',
    );
  });
});

describe('T-441: key_citations is left alone (R6)', () => {
  it('criminal_revision still has a non-empty key_citations', () => {
    const p = rule('criminal_revision');
    expect(p.key_citations).toBeDefined();
    expect(
      Array.isArray(p.key_citations) ? p.key_citations.length : Object.keys(p.key_citations).length,
    ).toBeGreaterThan(0);
  });

  it('key_citations is not part of what the model sees (so names there do not count)', () => {
    const p = rule('criminal_revision');
    expect(modelVisible(p)).not.toContain('"key_citations"');
  });
});
