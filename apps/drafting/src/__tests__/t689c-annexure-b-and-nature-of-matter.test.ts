/**
 * T-689c (Ajay, AJ-689c-a): the Synopsis annexure (B) and its "Nature of matter".
 *
 *   1. "Nature of matter" prints the RAW catalogue displayName, byte for byte; none:
 *      exactly "[To be confirmed: Nature of matter]".
 *   2. No Annexure B for written_statement, replication, counter_affidavit,
 *      rejoinder_affidavit, memo_of_parties, list_of_dates, synopsis, vakalatnama,
 *      affidavit_identity, affidavit_in_support, production_of_documents.
 *   3. B goes ONLY when the court type is high_court, high_court_bench or supreme_court;
 *      unknown or missing means no B.
 *   4. When B is dropped the rest renumber with no gap; the index annexure is built from
 *      the same list, so its letters always match.
 *
 * Expectations are typed by hand from the ruling, not captured from the code. The
 * ids and display names come from the real rule packs (config/document-rules).
 * Pure: buildAnnexuresHtml does not need Chromium or a database.
 *
 * Also: the doc-type-label negative cache (docTypeLabelForPackId, _resetDocTypeLabelCache).
 */
import './setupEnv';

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  NATURE_OF_MATTER_PLACEHOLDER,
  NO_SYNOPSIS_PACK_IDS,
  SYNOPSIS_COURT_TYPES,
  annexureBApplies,
  synopsisClientSide,
  buildAnnexuresHtml,
  natureOfMatter,
} from '../services/annexures.service';
import { _resetDocTypeLabelCache, docTypeLabelForPackId } from '../services/doc-type-label';
import { RULE_PACKS_DIR, loadRulePack } from '../services/rule-pack.service';

const DENIED = [
  'written_statement',
  'replication',
  'counter_affidavit',
  'rejoinder_affidavit',
  'memo_of_parties',
  'list_of_dates',
  'synopsis',
  'vakalatnama',
  'affidavit_identity',
  'affidavit_in_support',
  'production_of_documents',
];
const SYNOPSIS_COURTS = ['high_court', 'high_court_bench', 'supreme_court'];
const OTHER_COURTS = [
  'sessions',
  'district_court',
  'family_court',
  'tribunal',
  'consumer_commission',
  '',
  undefined,
  null,
  'HIGH_COURT',
  ' high_court',
  'high_court ',
  'High Court',
  'supreme court',
];
const ALLOWED_PACKS = ['quashing_528_bnss', 'bail_regular'];

const PLACEHOLDER = '[To be confirmed: Nature of matter]';

// ── a) annexureBApplies ──────────────────────────────────────────────────────

describe('T-689c a: annexureBApplies', () => {
  it('the deny set is exactly the 12 ids of the ruling (the 11 packs plus guided, AJ-689c-d 3)', () => {
    expect([...NO_SYNOPSIS_PACK_IDS].sort()).toEqual([...DENIED, 'guided'].sort());
    expect(NO_SYNOPSIS_PACK_IDS.size).toBe(12);
    expect(NO_SYNOPSIS_PACK_IDS.has('guided')).toBe(true);
  });

  it.each(SYNOPSIS_COURTS)('guided is false before %s (AJ-689c-d 3)', (court) => {
    expect(annexureBApplies({ rulePackId: 'guided', courtType: court })).toBe(false);
    expect(
      annexureBApplies({ rulePackId: 'guided', courtType: court, clientSide: 'petitioner' }),
    ).toBe(false);
  });

  it('guided is not a rule pack file: the deny list, not a file check, is what blocks it', () => {
    expect(fs.existsSync(path.join(RULE_PACKS_DIR, 'guided.json'))).toBe(false);
  });

  it('the court set is exactly high_court, high_court_bench, supreme_court', () => {
    expect([...SYNOPSIS_COURT_TYPES].sort()).toEqual([...SYNOPSIS_COURTS].sort());
    expect(SYNOPSIS_COURT_TYPES.size).toBe(3);
  });

  it.each(DENIED)('all 11 denied ids exist as real rule packs: %s', (id) => {
    expect(fs.existsSync(path.join(RULE_PACKS_DIR, `${id}.json`))).toBe(true);
    expect(loadRulePack(id)).not.toBeNull();
  });

  it.each(DENIED)('%s is false before a High Court', (id) => {
    expect(annexureBApplies({ rulePackId: id, courtType: 'high_court' })).toBe(false);
  });

  it.each(DENIED.flatMap((id) => SYNOPSIS_COURTS.map((c) => [id, c] as const)))(
    '%s is false before %s',
    (id, court) => {
      expect(annexureBApplies({ rulePackId: id, courtType: court })).toBe(false);
    },
  );

  it.each(ALLOWED_PACKS.flatMap((id) => SYNOPSIS_COURTS.map((c) => [id, c] as const)))(
    '%s is true before %s',
    (id, court) => {
      expect(annexureBApplies({ rulePackId: id, courtType: court })).toBe(true);
    },
  );

  it.each(ALLOWED_PACKS.flatMap((id) => OTHER_COURTS.map((c) => [id, c] as const)))(
    '%s is false before %p',
    (id, court) => {
      expect(annexureBApplies({ rulePackId: id, courtType: court })).toBe(false);
    },
  );

  it.each([undefined, null, ''])('a missing or empty pack id (%p) is false', (id) => {
    for (const court of SYNOPSIS_COURTS) {
      expect(annexureBApplies({ rulePackId: id, courtType: court })).toBe(false);
    }
  });

  it('no argument fields at all is false', () => {
    expect(annexureBApplies({})).toBe(false);
  });

  it('the match is exact: no trim, no case folding on the pack id', () => {
    expect(annexureBApplies({ rulePackId: ' bail_regular', courtType: 'high_court' })).toBe(true);
    // a padded or recased denied id is a different id, so it is not on the list (documented)
    expect(annexureBApplies({ rulePackId: 'Written_Statement', courtType: 'high_court' })).toBe(
      true,
    );
  });
});

// ── b) natureOfMatter ────────────────────────────────────────────────────────

describe('T-689c b: natureOfMatter', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 't689c-nature-'));
    const w = (id: string, body: string) => fs.writeFileSync(path.join(dir, `${id}.json`), body);
    w('only_title', JSON.stringify({ title: 'Only A Title' }));
    w('empty_display', JSON.stringify({ displayName: '', title: 'Title Used' }));
    w('both', JSON.stringify({ displayName: 'Display Wins', title: 'Title Loses' }));
    w('neither', JSON.stringify({ id: 'neither' }));
    w('not_json', 'this is { not json');
    w('is_array', '["displayName"]');
    w('is_null', 'null');
    w('number_name', JSON.stringify({ displayName: 42, title: 7 }));
    w('padded', JSON.stringify({ displayName: '  Padded  (S.1 Act) ' }));
    w('empty_both', JSON.stringify({ displayName: '', title: '' }));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('the placeholder constant is exactly the ruling text', () => {
    expect(NATURE_OF_MATTER_PLACEHOLDER).toBe(PLACEHOLDER);
  });

  it('written_statement is the raw displayName, brackets kept', () => {
    expect(natureOfMatter('written_statement')).toBe('Written Statement (Order VIII CPC)');
  });

  it('quashing_528_bnss is "Quashing Petition (S.528 BNSS)"', () => {
    expect(natureOfMatter('quashing_528_bnss')).toBe('Quashing Petition (S.528 BNSS)');
  });

  it('bail_regular is "Regular Bail Application"', () => {
    expect(natureOfMatter('bail_regular')).toBe('Regular Bail Application');
  });

  it.each([
    'no_such_pack_zz',
    '',
    undefined,
    null,
    '../etc/passwd',
    'Bail_Regular',
    'a b',
    'x.json',
  ])('an unknown or invalid pack id (%p) is the placeholder', (id) => {
    expect(natureOfMatter(id as string | undefined | null)).toBe(PLACEHOLDER);
  });

  it('a path-traversal id never reads outside the pack directory', () => {
    const spy = jest.spyOn(fs, 'readFileSync');
    try {
      expect(natureOfMatter('../document-rules/bail_regular')).toBe(PLACEHOLDER);
      expect(natureOfMatter('..')).toBe(PLACEHOLDER);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('a pack with only a title gives the title', () => {
    expect(natureOfMatter('only_title', dir)).toBe('Only A Title');
  });

  it('an empty displayName falls to the title', () => {
    expect(natureOfMatter('empty_display', dir)).toBe('Title Used');
  });

  it('displayName wins over the title', () => {
    expect(natureOfMatter('both', dir)).toBe('Display Wins');
  });

  it.each([
    'neither',
    'not_json',
    'is_array',
    'is_null',
    'number_name',
    'empty_both',
    'missing_file',
  ])('a pack file "%s" with no usable name is the placeholder', (id) => {
    expect(natureOfMatter(id, dir)).toBe(PLACEHOLDER);
  });

  it('the name is byte for byte: no trim, no recasing, no bracket stripping', () => {
    expect(natureOfMatter('padded', dir)).toBe('  Padded  (S.1 Act) ');
  });

  it('the dir argument is honoured: a pack id in the real dir is not found in the temp dir', () => {
    expect(natureOfMatter('bail_regular', dir)).toBe(PLACEHOLDER);
  });
});

// ── c) buildAnnexuresHtml end to end ─────────────────────────────────────────

const BASE_FORM: Record<string, unknown> = {
  court_id: 'jharkhand_hc',
  applicant_name: 'Priya Devi',
  father_name: 'Mohan Lal',
  applicant_age: 28,
  applicant_address: 'HB-47 Harmu, Ranchi',
  respondent_name: 'State of Jharkhand',
  fir_number: '045/2025',
  fir_date: '20.01.2025',
  police_station: 'Ranchi Sadar PS',
  sections_charged: ['528'],
};

function build(rulePackId: string | undefined, courtType: string | undefined, extra = {}) {
  return buildAnnexuresHtml({
    formData: { ...BASE_FORM, ...extra },
    bodyParaCount: 8,
    advocateName: 'Adv. Test',
    ...(rulePackId !== undefined ? { rulePackId } : {}),
    ...(courtType !== undefined ? { courtType } : {}),
  });
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const labelsOf = (b: ReturnType<typeof build>) => b.parts.map((p) => p.label);
const labelsUpTo = (n: number) => LETTERS.slice(0, n).map((l) => `ANNEXURE ${l}`);
/** T-700 (AJ-700 (2)): the Index annexure, and its first line (Nature of matter, AJ-689c-a bytes). */
const indexHtmlOf = (b: ReturnType<typeof build>) =>
  b.parts.find((p) => p.heading === 'Index of Documents Annexed')!.html;
const NATURE_LINE = (v: string) => `<p><strong>Nature of matter:</strong> ${v}</p>`;
const INDEX_HEAD = '<h2>Index of Documents Annexed</h2>\n  <br>\n  ';
const headingsOf = (b: ReturnType<typeof build>) => b.parts.map((p) => p.heading);

const SYNOPSIS_HEAD =
  '<h2>Synopsis</h2>\n  <p style="text-align:center">(As required by High Court Practice)</p>\n  <br>\n  <p><strong>Nature of matter:</strong> ';
// The fixed text of the Synopsis, byte for byte as it was before T-689c.
const SYNOPSIS_FIXED =
  '<p>The petitioner has approached this Hon\'ble Court seeking relief as set out in the accompanying petition/application. The facts are briefly summarised hereunder for the convenience of this Hon\'ble Court.</p>\n  <p><em>[Advocate to insert 3–5 sentence summary of the factual background before filing.]</em></p>\n  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>';

describe('T-689c c: the pack with and without the Synopsis', () => {
  it('(i) a written statement before a High Court: no Synopsis, the civil set A to D (T-700), Nature on the Index', () => {
    const b = build('written_statement', 'high_court');
    expect(labelsOf(b)).toEqual(labelsUpTo(4));
    expect(b.html).not.toContain('Synopsis');
    expect(b.html).not.toContain('As required by High Court Practice');
    expect(b.html).not.toContain('ANNEXURE E');
    expect(headingsOf(b)).toEqual([
      'Memo of Parties',
      'List of Dates and Chronology of Events',
      'Index of Documents Annexed',
      'VERIFICATION',
    ]);
    // AJ-700 (2): Nature of matter is the first line of the Index, once, nowhere else
    expect(indexHtmlOf(b)).toContain(
      `${INDEX_HEAD}${NATURE_LINE('Written Statement (Order VIII CPC)')}\n  <table>`,
    );
    expect(b.html.split('Nature of matter').length - 1).toBe(1);
  });

  it('(ii) a s.528 BNSS quashing petition before a High Court: Synopsis with the raw displayName, A to G', () => {
    const b = build('quashing_528_bnss', 'high_court');
    expect(labelsOf(b)).toEqual(labelsUpTo(7));
    const syn = b.parts[1];
    expect(syn.heading).toBe('Synopsis');
    expect(syn.label).toBe('ANNEXURE B');
    expect(syn.html).toContain(`${SYNOPSIS_HEAD}Quashing Petition (S.528 BNSS)</p>`);
    expect(syn.html).toContain("The petitioner has approached this Hon'ble Court seeking relief");
    expect(syn.html).toContain(SYNOPSIS_FIXED);
    expect(b.html).not.toContain('QUASHING 528 BNSS');
  });

  it('(iii) a bail application before sessions: no Synopsis, A to F', () => {
    const b = build('bail_regular', 'sessions');
    expect(labelsOf(b)).toEqual(labelsUpTo(6));
    expect(b.html).not.toContain('Synopsis');
  });

  it('(iv) a bail application before a district court: no Synopsis', () => {
    const b = build('bail_regular', 'district_court');
    expect(labelsOf(b)).toEqual(labelsUpTo(6));
    expect(b.html).not.toContain('As required by High Court Practice');
  });

  it.each(['high_court_bench', 'supreme_court'])(
    '(v) a non-denied pack before %s gets the Synopsis, A to G',
    (court) => {
      const b = build('bail_regular', court);
      expect(labelsOf(b)).toEqual(labelsUpTo(7));
      expect(b.parts[1].heading).toBe('Synopsis');
      expect(b.parts[1].html).toContain(`${SYNOPSIS_HEAD}Regular Bail Application</p>`);
      expect(b.parts[1].html).toContain(SYNOPSIS_FIXED);
    },
  );

  it('(vi) no rulePackId: no Synopsis, even before a High Court (fails closed); Memo + Index only (T-700)', () => {
    const b = build(undefined, 'high_court');
    expect(labelsOf(b)).toEqual(labelsUpTo(2));
    expect(b.html).not.toContain('>Synopsis</h2>');
    expect(indexHtmlOf(b)).toContain(`${INDEX_HEAD}${NATURE_LINE(PLACEHOLDER)}`);
  });

  it('(vi) no courtType: the court rule type decides (AJ-700a (4)): a High Court rule brings the Synopsis', () => {
    // BASE_FORM's court_id is jharkhand_hc, whose rule says high_court
    const b = build('quashing_528_bnss', undefined);
    expect(labelsOf(b)).toEqual(labelsUpTo(7));
    expect(b.parts[1].heading).toBe('Synopsis');
  });

  it('(vi) no courtType and a trial-court rule: no Synopsis (the helper never invents a High Court)', () => {
    const b = build('quashing_528_bnss', undefined, { court_id: 'sessions_generic' });
    expect(labelsOf(b)).toEqual(labelsUpTo(6));
    expect(b.html).not.toContain('>Synopsis</h2>');
  });

  it('(vi) neither: no Synopsis, and the form court_type alone does not bring it back', () => {
    const b = build(undefined, undefined, {
      court_type: 'high_court',
      template_id: 'bail_regular',
    });
    expect(labelsOf(b)).toEqual(labelsUpTo(6));
    expect(b.html).not.toContain('Synopsis');
  });

  it('(vi) an unknown non-blank court type string: no Synopsis (taken as given, never trimmed)', () => {
    for (const c of ['HIGH_COURT', ' high_court', 'sessions']) {
      expect(labelsOf(build('bail_regular', c))).toEqual(labelsUpTo(6));
    }
  });

  it('(vi) an empty court type string falls through to the court rule type (AJ-700a (4))', () => {
    // it was "no Synopsis" before T-700; the helper skips a blank and the rule says high_court
    expect(labelsOf(build('bail_regular', ''))).toEqual(labelsUpTo(7));
  });

  // T-700: written_statement and replication are the pleading set (A to D); the rest of the
  // list is Memo + Index (A to B). None has a Synopsis.
  it.each(DENIED)('(ix) %s before a High Court never has a Synopsis', (id) => {
    const b = build(id, 'high_court');
    expect(labelsOf(b)).toEqual(
      labelsUpTo(id === 'written_statement' || id === 'replication' ? 4 : 2),
    );
    expect(b.html).not.toContain('>Synopsis</h2>');
    expect(b.html).not.toContain('As required by High Court Practice');
  });

  it('a pack with no catalogue name prints the placeholder, byte for byte, unescaped', () => {
    const spy = jest.spyOn(fs, 'readFileSync');
    spy.mockImplementation(((p: unknown, ...rest: unknown[]) => {
      if (typeof p === 'string' && p.endsWith(`${path.sep}t689c_unnamed_pack.json`)) {
        return JSON.stringify({ id: 't689c_unnamed_pack' });
      }
      return (jest.requireActual('fs') as typeof fs).readFileSync(
        p as string,
        ...(rest as [BufferEncoding]),
      );
    }) as typeof fs.readFileSync);
    try {
      // T-700: an unknown pack is a civil pack with no signed Synopsis wording (AJ-700b (E)),
      // so its Nature of matter prints on the Index (AJ-700 (2)).
      const b = build('t689c_unnamed_pack', 'high_court');
      expect(headingsOf(b)).not.toContain('Synopsis');
      expect(indexHtmlOf(b)).toContain(`${INDEX_HEAD}${NATURE_LINE(PLACEHOLDER)}`);
      expect(b.html).toContain('[To be confirmed: Nature of matter]');
      expect(b.html).not.toContain('&amp;#');
      expect(b.html).not.toContain('&#91;');
      expect(b.html).not.toContain('&lbrack;');
    } finally {
      spy.mockRestore();
    }
  });

  it('(x) a displayName with & < > is escaped exactly once', () => {
    const spy = jest.spyOn(fs, 'readFileSync');
    spy.mockImplementation(((p: unknown, ...rest: unknown[]) => {
      if (typeof p === 'string' && p.endsWith(`${path.sep}t689c_escape_pack.json`)) {
        return JSON.stringify({ displayName: 'Tom & Jerry <Order> (S.1 Act)' });
      }
      return (jest.requireActual('fs') as typeof fs).readFileSync(
        p as string,
        ...(rest as [BufferEncoding]),
      );
    }) as typeof fs.readFileSync);
    try {
      const b = build('t689c_escape_pack', 'high_court');
      const html = indexHtmlOf(b);
      expect(html).toContain(NATURE_LINE('Tom &amp; Jerry &lt;Order&gt; (S.1 Act)'));
      expect(html).not.toContain('&amp;amp;');
      expect(html).not.toContain('&amp;lt;');
      expect(html).not.toContain('Tom & Jerry');
    } finally {
      spy.mockRestore();
    }
  });
});

// ── AJ-689c-d: guided briefs and the title fallback ──────────────────────────

describe('T-689c AJ-689c-d (3): no Annexure B for a guided brief', () => {
  it.each(SYNOPSIS_COURTS)(
    'guided before %s: no Synopsis, Memo + Index (A to B), Nature placeholder on the Index',
    (court) => {
      const b = build('guided', court);
      expect(labelsOf(b)).toEqual(labelsUpTo(2));
      expect(b.html).not.toContain('>Synopsis</h2>');
      expect(b.html).not.toContain('As required by High Court Practice');
      // AJ-700a (6): a guided brief prints the AJ-689c-a placeholder, on the Index only
      expect(indexHtmlOf(b)).toContain(`${INDEX_HEAD}${NATURE_LINE(PLACEHOLDER)}`);
      // the label once, plus the placeholder's own words once
      expect(b.html.split('Nature of matter').length - 1).toBe(2);
      expect(b.parts.map((p) => p.heading)).not.toContain('Synopsis');
    },
  );

  it('control: the same build with a non-denied pack gets the Synopsis (the guided case is not a broken build)', () => {
    expect(labelsOf(build('quashing_528_bnss', 'high_court'))).toEqual(labelsUpTo(7));
  });
});

describe('T-689c AJ-689c-d (2): Nature of matter falls back to the rule file title', () => {
  const rawTitleOf = (id: string): string => {
    const file = JSON.parse(fs.readFileSync(path.join(RULE_PACKS_DIR, `${id}.json`), 'utf-8'));
    return file.title as string;
  };

  it.each(['quo_warranto', 'curative_petition', 'interim_application', 'restoration_application'])(
    '%s has a title and no displayName, and prints the title byte for byte',
    (id) => {
      const file = JSON.parse(fs.readFileSync(path.join(RULE_PACKS_DIR, `${id}.json`), 'utf-8'));
      expect(file.displayName).toBeUndefined();
      expect(typeof file.title).toBe('string');
      expect(file.title.length).toBeGreaterThan(0);
      expect(natureOfMatter(id)).toBe(rawTitleOf(id));
      expect(natureOfMatter(id)).not.toBe(PLACEHOLDER);
    },
  );

  it('a title is printed with its dash and brackets unchanged (hand-typed expectation)', () => {
    expect(natureOfMatter('quo_warranto')).toBe('Writ Petition — Quo Warranto (Article 226/32)');
    expect(natureOfMatter('interim_application')).toBe(
      'Interim Application (IA) for Interim Relief During Pendency',
    );
  });

  it('a pack that has both: the displayName wins (real file)', () => {
    const file = JSON.parse(
      fs.readFileSync(path.join(RULE_PACKS_DIR, 'quashing_528_bnss.json'), 'utf-8'),
    );
    expect(typeof file.displayName).toBe('string');
    expect(typeof file.title).toBe('string');
    expect(natureOfMatter('quashing_528_bnss')).toBe(file.displayName);
    expect(natureOfMatter('quashing_528_bnss')).not.toBe(file.title);
  });

  const withFile = (id: string, body: unknown, run: () => void) => {
    const spy = jest.spyOn(fs, 'readFileSync');
    spy.mockImplementation(((p: unknown, ...rest: unknown[]) => {
      if (typeof p === 'string' && p.endsWith(`${path.sep}${id}.json`)) return JSON.stringify(body);
      return (jest.requireActual('fs') as typeof fs).readFileSync(
        p as string,
        ...(rest as [BufferEncoding]),
      );
    }) as typeof fs.readFileSync);
    try {
      run();
    } finally {
      spy.mockRestore();
    }
  };

  it('end to end: a title-only pack prints its title on the Index', () => {
    withFile('t689c_title_only', { title: 'Writ of Mandamus (Art. 226)' }, () => {
      const b = build('t689c_title_only', 'high_court');
      expect(indexHtmlOf(b)).toContain(NATURE_LINE('Writ of Mandamus (Art. 226)'));
      expect(b.html).not.toContain(PLACEHOLDER);
    });
  });

  it('end to end: displayName wins when both exist', () => {
    withFile('t689c_both', { displayName: 'Shown Name', title: 'Hidden Title' }, () => {
      const b = build('t689c_both', 'high_court');
      expect(indexHtmlOf(b)).toContain(NATURE_LINE('Shown Name'));
      expect(b.html).not.toContain('Hidden Title');
    });
  });

  it.each([
    ['neither key', {}],
    ['both empty strings', { displayName: '', title: '' }],
    ['non-string values', { displayName: 3, title: null }],
  ])('end to end: %s prints the placeholder only', (_n, body) => {
    withFile('t689c_none', body, () => {
      const b = build('t689c_none', 'high_court');
      expect(indexHtmlOf(b)).toContain(NATURE_LINE(PLACEHOLDER));
    });
  });

  it('end to end: an empty displayName falls to the title', () => {
    withFile('t689c_empty_dn', { displayName: '', title: 'Fallback Title' }, () => {
      expect(indexHtmlOf(build('t689c_empty_dn', 'high_court'))).toContain(
        NATURE_LINE('Fallback Title'),
      );
    });
  });

  it('end to end: a title with & < > is escaped exactly once', () => {
    withFile('t689c_title_esc', { title: 'Tom & Jerry <Order> (S.1 Act)' }, () => {
      const html = indexHtmlOf(build('t689c_title_esc', 'high_court'));
      expect(html).toContain(NATURE_LINE('Tom &amp; Jerry &lt;Order&gt; (S.1 Act)'));
      expect(html).not.toContain('&amp;amp;');
      expect(html).not.toContain('&amp;lt;');
      expect(html).not.toContain('Tom & Jerry');
    });
  });

  it('end to end with the real quo_warranto file: the title is in the Synopsis', () => {
    const b = build('quo_warranto', 'high_court');
    expect(b.parts[1].heading).toBe('Synopsis');
    expect(b.parts[1].html).toContain(
      `${SYNOPSIS_HEAD}Writ Petition — Quo Warranto (Article 226/32)</p>`,
    );
  });
});

// ── (vii) the index annexure ─────────────────────────────────────────────────

/** The index rows as [serial, document, reference]. */
function indexRows(b: ReturnType<typeof build>): Array<[string, string, string]> {
  const html = b.parts.find((p) => p.heading === 'Index of Documents Annexed')!.html;
  return [...html.matchAll(/<tr><td>(\d+)\.<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map(
    (m) => [m[1], m[2], m[3]],
  );
}

describe('T-689c c(vii): the index annexure matches what is attached', () => {
  const rowDocFor: Record<string, string> = {
    'Memo of Parties': 'Memo of Parties',
    Synopsis: 'Synopsis',
    'List of Dates and Chronology of Events': 'List of Dates and Chronology',
    'Index of Documents Annexed': 'Index of Documents Annexed',
    Vakalatnama: 'Vakalatnama',
    'Court Fee Paid Statement': 'Court Fee Paid Statement',
  };

  it('with the Synopsis (7 parts): serials 1-10, letters A-G, then H, I, "J onwards"', () => {
    const b = build('quashing_528_bnss', 'high_court');
    const rows = indexRows(b);
    expect(rows.map((r) => r[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(rows.slice(0, 7).map((r) => r[2])).toEqual([
      'Annexure A',
      'Annexure B',
      'Annexure C',
      'Annexure D (this document)',
      'Annexure E',
      'Annexure F',
      'Annexure G',
    ]);
    expect(rows[7][2]).toBe('Annexure H (to be annexed by advocate)');
    expect(rows[8][2]).toBe('Annexure I (to be annexed by advocate)');
    expect(rows[9][2]).toBe('Annexure J onwards (as applicable)');
    expect(rows[1][1]).toBe('Synopsis');
    expect(rows[6][1]).toMatch(/^Affidavit of /);
  });

  it('without the Synopsis (criminal, 6 parts): serials 1-9, letters A-F, then G, H, "I onwards"', () => {
    const b = build('bail_regular', 'sessions');
    const rows = indexRows(b);
    expect(rows.map((r) => r[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(rows.slice(0, 6).map((r) => r[2])).toEqual([
      'Annexure A',
      'Annexure B',
      'Annexure C (this document)',
      'Annexure D',
      'Annexure E',
      'Annexure F',
    ]);
    expect(rows[6][2]).toBe('Annexure G (to be annexed by advocate)');
    expect(rows[7][2]).toBe('Annexure H (to be annexed by advocate)');
    expect(rows[8][2]).toBe('Annexure I onwards (as applicable)');
    expect(rows.map((r) => r[1])).not.toContain('Synopsis');
  });

  it('T-700: a written statement (4 parts): the pleading row first, then A-D, then the rest (AJ-700b A order)', () => {
    const b = build('written_statement', 'high_court');
    const rows = indexRows(b);
    expect(rows.map((r) => r[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(rows.map((r) => r[1])).toEqual([
      'Written Statement (Order VIII CPC)',
      'Memo of Parties',
      'List of Dates and Chronology',
      'Index of Documents Annexed',
      'Verification',
      'List of documents relied on (Order VIII Rule 1A CPC)',
      'Documents as annexed by the advocate',
      'Vakalatnama',
      'Court fee',
    ]);
    expect(rows.map((r) => r[2])).toEqual([
      '___________',
      'Annexure A',
      'Annexure B',
      'Annexure C (this document)',
      'Annexure D',
      'Annexure E (to be annexed by advocate)',
      'Annexure F onwards (as applicable)',
      '___________',
      '___________',
    ]);
  });

  it.each([
    ['quashing_528_bnss', 'high_court'],
    ['bail_regular', 'supreme_court'],
    ['bail_regular', 'sessions'],
  ])('%p before %p: every attached row names the same letter as the part itself', (id, court) => {
    const b = build(id, court);
    const rows = indexRows(b);
    b.parts.forEach((p, i) => {
      const letter = p.label.replace('ANNEXURE ', '');
      expect(rows[i][2].startsWith(`Annexure ${letter}`)).toBe(true);
      expect(rows[i][1].startsWith(rowDocFor[p.heading] ?? 'Affidavit of')).toBe(true);
    });
    // the first advocate-annexed letter follows the last attached letter
    const last = b.parts[b.parts.length - 1].label.slice(-1);
    const next = String.fromCharCode(last.charCodeAt(0) + 1);
    expect(rows[b.parts.length][2].startsWith(`Annexure ${next} `)).toBe(true);
    expect(rows).toHaveLength(b.parts.length + 3);
  });
});

// ── (viii) every cross-reference resolves ────────────────────────────────────

/**
 * Every "Annexure <Letter>" mentioned anywhere in the generated HTML, other than in the
 * index's rows for documents the advocate annexes later (those letters are not attached).
 */
function mentionedLetters(html: string): string[] {
  const text = html
    .split('\n')
    .filter((l) => !/to be annexed by advocate|onwards \(as applicable\)/.test(l))
    .join('\n');
  return [...text.matchAll(/[Aa][Nn][Nn][Ee][Xx][Uu][Rr][Ee] ([A-Z])\b/g)].map((m) => m[1]);
}

describe('T-689c c(viii): every Annexure reference resolves to an attached annexure', () => {
  const CASES: Array<[string | undefined, string | undefined]> = [
    ['quashing_528_bnss', 'high_court'],
    ['bail_regular', 'high_court_bench'],
    ['bail_regular', 'supreme_court'],
    ['written_statement', 'high_court'],
    ['bail_regular', 'sessions'],
    ['counter_affidavit', 'high_court'],
    [undefined, undefined],
  ];

  it.each(CASES)('%p before %p', (id, court) => {
    const b = build(id, court);
    const attached = new Set(b.parts.map((p) => p.label.replace('ANNEXURE ', '')));
    const mentioned = mentionedLetters(b.html);
    expect(mentioned.length).toBeGreaterThanOrEqual(b.parts.length);
    for (const letter of mentioned) expect(attached.has(letter)).toBe(true);
    // and every attached letter is mentioned (its own label at least)
    for (const letter of attached) expect(mentioned).toContain(letter);
    // the labels are consecutive from A
    expect([...attached].join('')).toBe(LETTERS.slice(0, b.parts.length).join(''));
  });

  it('the checker catches a stray reference (it is not vacuous)', () => {
    const b = build('written_statement', 'high_court');
    expect(mentionedLetters(`${b.html}\nSee Annexure G above`)).toContain('G');
    expect(mentionedLetters(b.html)).not.toContain('G');
  });
});

// ── f) the doc-type-label negative cache ─────────────────────────────────────

describe('T-689c f: docTypeLabelForPackId negative cache', () => {
  const readsOf = (spy: jest.SpyInstance, id: string) =>
    spy.mock.calls.filter((c) => String(c[0]).endsWith(`${path.sep}${id}.json`)).length;

  beforeEach(() => _resetDocTypeLabelCache());

  it('_resetDocTypeLabelCache is exported and callable', () => {
    expect(typeof _resetDocTypeLabelCache).toBe('function');
    expect(() => _resetDocTypeLabelCache()).not.toThrow();
  });

  it('a pack-less id is read from disk once, then remembered', () => {
    const spy = jest.spyOn(fs, 'readFileSync');
    try {
      expect(docTypeLabelForPackId('t689c_no_such_pack')).toBeNull();
      expect(readsOf(spy, 't689c_no_such_pack')).toBe(1);
      expect(docTypeLabelForPackId('t689c_no_such_pack')).toBeNull();
      expect(docTypeLabelForPackId('t689c_no_such_pack')).toBeNull();
      expect(readsOf(spy, 't689c_no_such_pack')).toBe(1);
      // after a reset it is looked up again
      _resetDocTypeLabelCache();
      expect(docTypeLabelForPackId('t689c_no_such_pack')).toBeNull();
      expect(readsOf(spy, 't689c_no_such_pack')).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('a pack that exists keeps giving its label (it is cached by the loader, not here)', () => {
    expect(docTypeLabelForPackId('written_statement')).toBe('Written Statement');
    expect(docTypeLabelForPackId('written_statement')).toBe('Written Statement');
  });

  it('a custom loader never fills or reads the cache', () => {
    // a custom null for a real pack is not remembered for the default loader
    expect(docTypeLabelForPackId('written_statement', () => null)).toBeNull();
    expect(docTypeLabelForPackId('written_statement')).toBe('Written Statement');
    // a default miss does not hide the id from a custom loader
    expect(docTypeLabelForPackId('t689c_other_missing')).toBeNull();
    const custom = jest.fn(() => ({ name: 'Custom Name' }) as never);
    expect(docTypeLabelForPackId('t689c_other_missing', custom)).toBe('Custom Name');
    expect(custom).toHaveBeenCalledTimes(1);
  });

  it('a throwing loader is not cached: it succeeds on retry', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let calls = 0;
      const flaky = jest.fn(() => {
        calls += 1;
        if (calls === 1) throw new Error('disk hiccup');
        return { name: 'Recovered Name' } as never;
      });
      expect(docTypeLabelForPackId('t689c_flaky', flaky)).toBeNull();
      expect(docTypeLabelForPackId('t689c_flaky', flaky)).toBe('Recovered Name');
      expect(flaky).toHaveBeenCalledTimes(2);
    } finally {
      err.mockRestore();
    }
  });

  it('missing, empty, non-string and guided ids are null without a read', () => {
    const spy = jest.spyOn(fs, 'readFileSync');
    try {
      for (const id of [undefined, null, '', 'guided', 42 as unknown as string]) {
        expect(docTypeLabelForPackId(id as string | undefined | null)).toBeNull();
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('past 1000 remembered ids it does not throw and still returns null', () => {
    const spy = jest.spyOn(fs, 'readFileSync');
    try {
      for (let i = 0; i < 1100; i++) {
        expect(docTypeLabelForPackId(`t689c_cap_${i}`)).toBeNull();
      }
      // one inside the cap is remembered (no second read) ...
      expect(docTypeLabelForPackId('t689c_cap_5')).toBeNull();
      expect(readsOf(spy, 't689c_cap_5')).toBe(1);
      // ... one past it is just not kept (read again), and still null
      expect(docTypeLabelForPackId('t689c_cap_1099')).toBeNull();
      expect(docTypeLabelForPackId('t689c_cap_1099')).toBeNull();
      expect(readsOf(spy, 't689c_cap_1099')).toBe(3);
    } finally {
      spy.mockRestore();
    }
  });
});

// ── AJ-689c-b: a respondent-side client blocks Annexure B ────────────────────

describe('T-689c AJ-689c-b: annexureBApplies with the client side', () => {
  it.each(SYNOPSIS_COURTS)('quashing_528_bnss before %s: respondent blocks it', (court) => {
    expect(
      annexureBApplies({
        rulePackId: 'quashing_528_bnss',
        courtType: court,
        clientSide: 'respondent',
      }),
    ).toBe(false);
  });

  it.each(
    SYNOPSIS_COURTS.flatMap((c) =>
      (['petitioner', null, undefined] as const).map((s) => [c, s] as const),
    ),
  )('quashing_528_bnss before %s: client side %p attaches it', (court, side) => {
    expect(
      annexureBApplies({ rulePackId: 'quashing_528_bnss', courtType: court, clientSide: side }),
    ).toBe(true);
  });

  it.each(['respondent', 'petitioner', null, undefined] as const)(
    'before sessions: client side %p never attaches it',
    (side) => {
      expect(
        annexureBApplies({
          rulePackId: 'quashing_528_bnss',
          courtType: 'sessions',
          clientSide: side,
        }),
      ).toBe(false);
    },
  );

  it.each(DENIED)('a denied pack (%s) stays false with a petitioner-side client', (id) => {
    expect(
      annexureBApplies({ rulePackId: id, courtType: 'high_court', clientSide: 'petitioner' }),
    ).toBe(false);
  });

  it('a missing pack stays false whatever the side', () => {
    expect(annexureBApplies({ courtType: 'high_court', clientSide: 'petitioner' })).toBe(false);
  });
});

describe('T-689c AJ-689c-b: synopsisClientSide', () => {
  const side = (
    rulePackId: string | undefined,
    formData: Record<string, unknown>,
    partyValues?: Record<string, unknown>,
  ) => synopsisClientSide({ rulePackId, formData, ...(partyValues ? { partyValues } : {}) });

  it('1. an explicit client_side wins', () => {
    expect(side('plaint_recovery', { client_side: 'respondent' })).toBe('respondent');
    expect(side('counter_affidavit', { client_side: 'petitioner' })).toBe('petitioner');
    // even over an answered client_role and the table
    expect(
      side('quashing_528_bnss', { client_side: 'petitioner', client_role: 'respondent' }),
    ).toBe('petitioner');
  });

  it('1. an invalid client_side is ignored', () => {
    expect(side(undefined, { client_side: 'both' })).toBeNull();
  });

  it.each([
    ['respondent', 'respondent'],
    ['Respondent', 'respondent'],
    ['  RESPONDENT ', 'respondent'],
    ['defendant', 'respondent'],
    ['Defendant', 'respondent'],
    ['petitioner', 'petitioner'],
    ['applicant', 'petitioner'],
    ['plaintiff', 'petitioner'],
    ['appellant', 'petitioner'],
  ] as const)('2. client_role %p gives %p', (role, expected) => {
    expect(side('quashing_528_bnss', { client_role: role })).toBe(expected);
  });

  it('2. client_role overrides the pack table', () => {
    // plaint_recovery's client is the plaintiff (filing side) by the table
    expect(side('plaint_recovery', {})).toBe('petitioner');
    expect(side('plaint_recovery', { client_role: 'defendant' })).toBe('respondent');
    // written_statement's client is the defendant (respondent side) by the table
    expect(side('written_statement', {})).toBe('respondent');
    expect(side('written_statement', { client_role: 'plaintiff' })).toBe('petitioner');
  });

  it('2. an accused client has no side and the table is not read', () => {
    expect(side('quashing_528_bnss', { client_role: 'accused' })).toBeNull();
    expect(side('written_statement', { client_role: 'accused' })).toBeNull();
    expect(side('counter_affidavit', { client_role: 'accused' })).toBeNull();
  });

  it('2. an unknown or blank client_role falls through to the table', () => {
    expect(side('written_statement', { client_role: 'witness' })).toBe('respondent');
    expect(side('written_statement', { client_role: '' })).toBe('respondent');
    expect(side('quashing_528_bnss', { client_role: 42 })).toBe('petitioner');
    expect(side(undefined, { client_role: 'witness' })).toBeNull();
  });

  it('2. partyValues are read instead of the form (a brief keeps client_role there)', () => {
    expect(side('quashing_528_bnss', {}, { 'parties.client_role': 'respondent' })).toBe(
      'respondent',
    );
    expect(side('quashing_528_bnss', {}, { client_role: 'Defendant' })).toBe('respondent');
    // the form's client_role is not read when partyValues are given
    expect(
      side('quashing_528_bnss', { client_role: 'respondent' }, { client_role: 'petitioner' }),
    ).toBe('petitioner');
  });

  it('3. the table row: respondent_name and defendant_name clients are respondent side', () => {
    expect(side('counter_affidavit', {})).toBe('respondent');
    expect(side('written_statement', {})).toBe('respondent');
  });

  it.each([
    'quashing_528_bnss',
    'bail_regular',
    'plaint_recovery',
    'rejoinder_affidavit',
    'criminal_appeal',
    'posh_complaint',
  ])(
    '3. the table row of %s (any other client field) is "petitioner", i.e. not respondent side',
    (id) => {
      expect(side(id, {})).toBe('petitioner');
    },
  );

  it('3. client_name (vakalatnama), a blank row, no row, or no pack give null', () => {
    expect(side('vakalatnama', {})).toBeNull();
    expect(side('divorce_mutual_consent', {})).toBeNull();
    expect(side('memo_of_parties', {})).toBeNull();
    expect(side('t689c_no_such_pack', {})).toBeNull();
    expect(side('__proto__', {})).toBeNull();
    expect(side('constructor', {})).toBeNull();
    expect(side(undefined, {})).toBeNull();
    expect(synopsisClientSide({ rulePackId: null, formData: {} })).toBeNull();
  });

  it('empty formData and no pack is null', () => {
    expect(side(undefined, {})).toBeNull();
  });
});

describe('T-689c AJ-689c-b: the pack end to end', () => {
  const run = (
    formExtra: Record<string, unknown>,
    partyValues?: Record<string, unknown>,
    pack: string | undefined = 'quashing_528_bnss',
    court: string | undefined = 'high_court',
  ) =>
    buildAnnexuresHtml({
      formData: { ...BASE_FORM, ...formExtra },
      bodyParaCount: 8,
      advocateName: 'Adv. Test',
      ...(pack !== undefined ? { rulePackId: pack } : {}),
      ...(court !== undefined ? { courtType: court } : {}),
      ...(partyValues ? { partyValues } : {}),
    });

  it('client_side petitioner: Synopsis attached, A to G', () => {
    const b = run({ client_side: 'petitioner', petitioner_name: 'Priya Devi' });
    expect(labelsOf(b)).toEqual(labelsUpTo(7));
    expect(b.parts[1].heading).toBe('Synopsis');
  });

  it('client_side respondent: no Synopsis, A to F', () => {
    const b = run({ client_side: 'respondent' });
    expect(labelsOf(b)).toEqual(labelsUpTo(6));
    expect(b.html).not.toContain('>Synopsis</h2>');
    expect(b.html).not.toContain('As required by High Court Practice');
  });

  it.each(['Respondent', 'respondent', 'Defendant'])('client_role %p: no Synopsis', (role) => {
    const b = run({ client_role: role });
    expect(labelsOf(b)).toEqual(labelsUpTo(6));
    expect(b.html).not.toContain('>Synopsis</h2>');
  });

  it("partyValues {'parties.client_role': 'respondent'}: no Synopsis, and the index follows", () => {
    const b = run({}, { 'parties.client_role': 'respondent' });
    expect(labelsOf(b)).toEqual(labelsUpTo(6));
    expect(indexRows(b).map((r) => r[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(indexRows(b)[8][2]).toBe('Annexure I onwards (as applicable)');
  });

  it('client_role accused: the Synopsis is attached', () => {
    const b = run({ client_role: 'accused' });
    expect(labelsOf(b)).toEqual(labelsUpTo(7));
  });

  it('a respondent-side client before a Supreme Court and a bench: still no Synopsis', () => {
    for (const court of ['high_court_bench', 'supreme_court']) {
      expect(
        labelsOf(run({ client_role: 'respondent' }, undefined, 'bail_regular', court)),
      ).toEqual(labelsUpTo(6));
    }
  });

  it('a written statement (a defendant client by its table) before a High Court: no Synopsis either way', () => {
    expect(labelsOf(run({}, undefined, 'written_statement'))).toEqual(labelsUpTo(4));
  });

  it('with no side information a criminal pack keeps the court list; a civil pack gets no Synopsis (T-700, AJ-700b E)', () => {
    expect(labelsOf(run({}, undefined, 'bail_regular'))).toEqual(labelsUpTo(7));
    // family and unknown packs are civil_other: Memo + Index, no Synopsis
    expect(labelsOf(run({}, undefined, 'divorce_mutual_consent'))).toEqual(labelsUpTo(2));
    expect(labelsOf(run({}, undefined, 't689c_no_such_pack'))).toEqual(labelsUpTo(2));
  });

  it('the attached Synopsis block is byte-identical whichever way the petitioner side is known', () => {
    const viaTable = run({}).parts[1].html;
    const viaRole = run({ client_role: 'petitioner' }).parts[1].html;
    const viaValues = run({}, { 'parties.client_role': 'plaintiff' }).parts[1].html;
    const viaAccused = run({ client_role: 'accused' }).parts[1].html;
    expect(viaRole).toBe(viaTable);
    expect(viaValues).toBe(viaTable);
    expect(viaAccused).toBe(viaTable);
    expect(viaTable).toContain(`${SYNOPSIS_HEAD}Quashing Petition (S.528 BNSS)</p>`);
    expect(viaTable).toContain(SYNOPSIS_FIXED);
  });
});
