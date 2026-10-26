// T-601 (a): the copy pin. Every `signed` row in landing-copy.ts equals the handoff text byte for
// byte (EN and HI): copy v2 + addendum (Madhuri), with Ajay's rulings as the authority where they
// changed a row. Plus the ruling overrides and the words the page must never carry.
import fs from 'fs';
import path from 'path';

import { ReadingDeskLanding } from '../ReadingDeskLanding';
import {
  CAPTIONS_HINDI_PART,
  CATEGORY_NAMES,
  LANDING_COPY_ROWS,
  LP,
  SAMPLE_SUMMARIES,
  captionsChip,
  type CopyRow,
} from '../landing-copy';
import { SAMPLE_ENTRIES } from '../landing-config';
import { FIXTURE, clearMatchMedia, norm, readHandoff } from './_helpers';

import { cleanupMounted, click, mount, qa } from '@/components/ui/__tests__/nl-test-utils';

const V2 = readHandoff('handoff/copy/T-584-landing-copy-v2.md', 'M-LP-15-06');
const ADD = readHandoff('handoff/copy/T-584-landing-copy-v2-addendum.md', 'M-LP-15-09b');
const FIXES = readHandoff('handoff/copy/T-584-landing-copy-v2-fixes.md', 'M-LP-15-16');
const RULINGS = readHandoff('handoff/legal/T-584-landing-copy-rulings-ajay.md', 'AJ-601-S9');

interface Text {
  en: string;
  hi: string;
}

/** Markdown table rows -> cells (trimmed). */
function tableRows(md: string): string[][] {
  return md
    .split('\n')
    .filter((l) => /^\|\s*M-LP-/.test(l))
    .map((l) =>
      l
        .replace(/^\|/, '')
        .replace(/\|\s*$/, '')
        .split(' | ')
        .map((c) => c.trim()),
    );
}

/** id -> {en,hi}: v2 sections 1, 3 and 5 (EN/HI columns differ by section) and the addendum. */
function parseCopy(): Map<string, Text> {
  const out = new Map<string, Text>();
  for (const md of [V2, ADD, FIXES]) {
    for (const cells of tableRows(md)) {
      const id = cells[0]
        .replace(/^\|\s*/, '')
        .trim()
        .split(/\s+/)[0];
      if (!id.startsWith('M-LP-') || / #\d/.test(cells[0])) continue;
      if (id.startsWith('M-LP-14-')) {
        // Section 3: id | EN | HI | claim | length. 14-05 and 14-T carry a note in place of text.
        if (id === 'M-LP-14-05' || id === 'M-LP-14-T') continue;
        // 14-06 alone has a "where" column ("Category shelf") before the English name.
        const o = cells[1] === 'Category shelf' ? 1 : 0;
        out.set(id, { en: cells[1 + o], hi: cells[2 + o] });
      } else if (cells.length >= 4) {
        // Sections 1 and 5 and the addendum: id | where | EN | HI | ...
        out.set(id, { en: cells[2], hi: cells[3] });
      }
    }
  }
  return out;
}

/** Backtick spans of the ruling row for `ref` (the row's first cell starts with it). */
function rulingSpans(ref: string): string[] {
  const line = RULINGS.split('\n').find((l) => l.startsWith(`| ${ref} |`));
  if (!line) throw new Error(`no ruling row for ${ref}`);
  return Array.from(line.matchAll(/`([^`]+)`/g), (m) => m[1]);
}

const COPY = parseCopy();

/** Ajay's changed text wins (rulings file). */
function authority(): Map<string, Text> {
  const a = new Map(COPY);
  const both = (id: string, ref = id) => {
    const spans = rulingSpans(ref);
    // The last two spans: EN and HI (09c names the template id in an earlier span).
    a.set(id, { en: spans[spans.length - 2], hi: spans[spans.length - 1] });
  };
  both('M-LP-06');
  both('M-LP-09a');
  both('M-LP-09b');
  both('M-LP-09c');
  both('M-LP-15-01');
  both('M-LP-15-06');
  both('M-LP-15-08');
  // 08b: Ajay gives the EN; the HI is "the same cut", which is what v2 prints.
  a.set('M-LP-08b', { en: rulingSpans('M-LP-08b')[0], hi: COPY.get('M-LP-08b')!.hi });
  // 14-06: HI changed by Ajay (the only span in the row is the new HI).
  const row14 = RULINGS.split('\n').find((l) => l.startsWith('| M-LP-14 (categories)'))!;
  const hi1406 = /14-06 HI changed\*\* to `([^`]+)`/.exec(row14)![1];
  a.set('M-LP-14-06', { en: COPY.get('M-LP-14-06')!.en, hi: hi1406 });
  // Ajay T-601 (c): the folio's accessible name.
  const c = RULINGS.split('\n').find((l) => l.startsWith('| (c) HI watermark'))!;
  const hiLabel = /HI aria-label: `([^`]+)`/.exec(c)![1];
  a.set('AJ-T601-c', { en: 'Sample draft, fictional parties', hi: hiLabel });
  return a;
}

const AUTH = authority();

beforeEach(() => clearMatchMedia());
afterEach(() => cleanupMounted());

describe('the handoff docs parse (the pin is not vacuous)', () => {
  it('finds the v2 rows, the addendum row and the rulings', () => {
    expect(COPY.size).toBeGreaterThan(70);
    expect(COPY.get('M-LP-02')).toEqual({
      en: 'Describe the matter. Read the draft.',
      hi: 'मामला बताइए। ड्राफ़्ट पढ़िए।',
    });
    expect(COPY.get('M-LP-15-09b')).toEqual({
      en: 'Play with sound',
      hi: 'आवाज़ के साथ चलाइए',
    });
    expect(COPY.get('M-LP-14-01')!.hi).toBe('आपराधिक: जमानत और हिरासत');
    expect(LANDING_COPY_ROWS.length).toBeGreaterThan(50);
  });
});

describe('every signed row equals the file text, byte for byte', () => {
  const signed = LANDING_COPY_ROWS.filter((r) => r.status === 'signed');

  it('every row is signed: no placeholder and no unsigned row is left in landing-copy.ts', () => {
    expect(signed.length).toBe(LANDING_COPY_ROWS.length);
    expect(LANDING_COPY_ROWS.filter((r) => r.status === 'placeholder').map((r) => r.id)).toEqual(
      [],
    );
    expect(LANDING_COPY_ROWS.filter((r) => r.status === 'unsigned').map((r) => r.id)).toEqual([]);
  });

  it.each(signed.map((r) => [r.id, r] as const))('%s (EN and HI)', (id, row: CopyRow) => {
    const want = AUTH.get(id);
    expect({ id, found: want !== undefined }).toEqual({ id, found: true });
    expect(row.en).toBe(want!.en);
    expect(row.hi).toBe(want!.hi);
  });

  it('row ids are unique', () => {
    const ids = LANDING_COPY_ROWS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the rows of the copy files that the page does not render are exactly the intended ones', () => {
    const have = new Set(LANDING_COPY_ROWS.map((r) => r.id));
    const missing = Array.from(AUTH.keys())
      .filter((id) => !have.has(id))
      .sort();
    // 11a..11h: the video's captions (inside the VTT files). 12a is the T-511 §1.7 title (read from
    // nl-copy). 15-15a..c are reused 14-xx names (read from CATEGORY_NAMES). 14-05 / 14-T never ship.
    expect(missing).toEqual(
      [
        'M-LP-11a',
        'M-LP-11b',
        'M-LP-11c',
        'M-LP-11d',
        'M-LP-11e',
        'M-LP-11f',
        'M-LP-11g',
        'M-LP-11h',
        'M-LP-12a',
        'M-LP-15-15a',
        'M-LP-15-15b',
        'M-LP-15-15c',
      ].sort(),
    );
  });

  it('15-15a..c (sample eyebrows) are the byte-for-byte reuse of 14-01, 14-23 and 14-08', () => {
    expect(COPY.get('M-LP-15-15a')).toEqual(COPY.get('M-LP-14-01'));
    expect(COPY.get('M-LP-15-15b')).toEqual(COPY.get('M-LP-14-23'));
    expect(COPY.get('M-LP-15-15c')).toEqual(COPY.get('M-LP-14-08'));
    const cats = SAMPLE_ENTRIES.map((e) => CATEGORY_NAMES[e.categoryId]?.id);
    expect(cats).toEqual(['M-LP-14-23', 'M-LP-14-08']);
  });

  it('no placeholder or unsigned row exists; if one is added it must not be rendered', () => {
    const notSigned = LANDING_COPY_ROWS.filter((r) => r.status !== 'signed');
    expect(notSigned.map((r) => r.id)).toEqual([]);
    mount(<ReadingDeskLanding />);
    for (const r of notSigned) expect(norm(document.body.textContent)).not.toContain(r.en);
  });

  it('every row has a source and conditions are recorded where Ajay set one', () => {
    for (const r of LANDING_COPY_ROWS) expect(r.source.length).toBeGreaterThan(0);
    expect(LP.samplesLead.condition).toMatch(/Ajay checks each sample PDF/);
    expect(LP.videoNote.condition).toBeDefined();
    expect(LP.videoCaptions.condition).toBeDefined();
  });
});

describe('the fixes file agrees with the rulings file (the rulings win if not)', () => {
  const norm1 = (x: string) => x.replace(/\s+/g, ' ');
  const R = norm1(RULINGS);
  it.each([
    'M-LP-10c',
    'M-LP-10c-hi',
    'M-LP-15-07',
    'M-LP-15-07b',
    'M-LP-15-16',
    'M-LP-15-17',
    'M-LP-15-18',
    'M-LP-15-19',
    'M-LP-15-20',
  ])('%s: the signed text in the rulings file is the fixes text', (id) => {
    const t = COPY.get(id)!;
    expect(t).toBeDefined();
    // Cause-title rows are quoted with the ellipsis the file prints.
    // 10c-hi is printed with a leading ellipsis in the rulings.
    const tail = (x: string) =>
      x
        .replace(/^Real product, fictional parties\. /, '')
        .replace(/^असली प्रोडक्ट, काल्पनिक पक्षकार। /, '');
    expect(R).toContain(id === 'M-LP-10c-hi' ? tail(t.en) : t.en);
    expect(R).toContain(id === 'M-LP-10c-hi' ? tail(t.hi) : t.hi);
  });
  it('15-10a (CC English) is the rulings text for a track-less video', () => {
    expect(R).toContain('15-10a "CC English"');
  });
});

describe("Ajay's rulings override the copy", () => {
  it('M-LP-06 is the changed text, not "cannot be out of date"', () => {
    expect(LP.coverageLead.en).toBe(
      'This list is built from our template library and changes when the library does. Open any drawer to see what is in it today.',
    );
    expect(V2).toContain(LP.coverageLead.en);
    for (const r of LANDING_COPY_ROWS) expect(r.en).not.toMatch(/cannot be out of date/i);
    mount(<ReadingDeskLanding />);
    expect(norm(document.body.textContent)).toContain(LP.coverageLead.en);
    expect(norm(document.body.textContent)).not.toMatch(/out of date/i);
  });

  it('M-LP-08b has no "details redacted" in EN or HI', () => {
    expect(LP.samplesLead.en).not.toMatch(/redact/i);
    expect(LP.samplesLead.hi).not.toMatch(/redact|छिपाए/);
    expect(LP.samplesLead.en).toBe(
      'Prepared in advance with fictional parties, with a SAMPLE watermark on every page. They show how a first draft reads, not a filed document.',
    );
  });

  it('09a/09b/09c use the placeholder names and the maintenance petition', () => {
    const { bail, notice, maintenance } = SAMPLE_SUMMARIES;
    expect(bail.en).toContain('Sample Person 1 and the State');
    expect(bail.hi).toContain('नमूना व्यक्ति 1');
    expect(notice.en).toContain('Sample Traders and Sample Packaging Works');
    expect(notice.hi).toContain('सैंपल ट्रेडर्स और सैंपल पैकेजिंग वर्क्स');
    expect(maintenance.en).toContain('Sample Person 2 and Sample Person 3');
    expect(maintenance.en).toContain('A maintenance petition');
    expect(maintenance.hi).toContain('भरण-पोषण याचिका');
    for (const r of [bail, notice, maintenance]) expect(r.en).toMatch(/^Fictional parties: /);
    // The v1 names and the plaint are gone.
    for (const r of LANDING_COPY_ROWS) {
      expect(r.en).not.toMatch(/plaint_recovery|recovery of money|plaint for/i);
    }
    expect(SAMPLE_ENTRIES.map((e) => e.templateId)).toEqual([
      'legal_notice_breach_of_contract',
      'maintenance_bnss_144',
    ]);
  });

  it('14-05 (plaints) is never a row and never rendered, even for a plaint category with templates', () => {
    expect(LANDING_COPY_ROWS.map((r) => r.id)).not.toContain('M-LP-14-05');
    expect(CATEGORY_NAMES.civil_plaints_suits).toBeUndefined();
    const plain = Object.values(CATEGORY_NAMES).map((r) => r.hi);
    expect(plain).not.toContain('सिविल: वाद-पत्र और वाद');
    mount(<ReadingDeskLanding catalogue={FIXTURE} />);
    const t = norm(document.body.textContent);
    expect(t).not.toContain('plaints and suits');
    click(qa('button').find((b) => b.getAttribute('lang') === 'hi')!);
    expect(norm(document.body.textContent)).not.toContain('वाद-पत्र');
  });

  it('14-06 HI is "बचाव", not "प्रतिरक्षा"', () => {
    expect(CATEGORY_NAMES.civil_defence_interlocutory.hi).toBe('सिविल: बचाव और अंतरिम आवेदन');
    for (const r of LANDING_COPY_ROWS) expect(r.hi).not.toContain('प्रतिरक्षा');
  });

  it('15-06 and 15-08 say "document types" (Ajay), not "drafts"', () => {
    expect(LP.coverageCount.en).toBe('{count} document types in the library, shelved by subject.');
    expect(LP.coverageTotal.en).toBe('{total} document types on {shelves} shelves today.');
    expect(LP.coverageCount.hi).toContain('प्रकार के दस्तावेज़');
  });

  it('15-01 is the gender-neutral text', () => {
    expect(LP.folioLine1.en).toBe(
      'The applicant is a first-time accused and has no earlier criminal case.',
    );
    expect(LP.folioLine1.en).not.toMatch(/\bhim\b/);
  });

  it('15-10 drops the Hindi part without the caption track', () => {
    expect(captionsChip(true)).toBe('CC English · हिंदी');
    expect(captionsChip(false)).toBe('CC English');
    expect(CAPTIONS_HINDI_PART).toBe(' · हिंदी');
  });
});

describe('words the page must not carry', () => {
  const FORBIDDEN_EN = [
    /guarantee/i,
    /unlimited/i,
    /coming/i,
    /details redacted/i,
    /every template/i,
    /in English or Hindi/i,
    /\bnever\b.*\bout of date\b/i,
  ];
  const FORBIDDEN_HI = ['हिंदी या अंग्रेज़ी में', 'हिंदी या अंग्रेजी में', 'विवरण छिपाए'];

  function fullPageProps() {
    return {
      catalogue: FIXTURE,
      videoAvailable: true,
      hindiCaptionsAvailable: true,
      availableSampleIds: SAMPLE_ENTRIES.map((s) => s.templateId),
    };
  }

  it.each(['en', 'hi'] as const)('%s page (nothing optional present)', (lang) => {
    mount(<ReadingDeskLanding initialLang={lang} catalogue={FIXTURE} />);
    const t = norm(document.body.textContent);
    for (const re of FORBIDDEN_EN)
      expect({ re: String(re), hit: re.test(t) }).toEqual({ re: String(re), hit: false });
    for (const s of FORBIDDEN_HI) expect(t).not.toContain(s);
  });

  it.each(['en', 'hi'] as const)('%s page with the samples and the video present', (lang) => {
    mount(<ReadingDeskLanding initialLang={lang} {...fullPageProps()} />);
    const t = norm(document.body.textContent);
    for (const re of FORBIDDEN_EN)
      expect({ re: String(re), hit: re.test(t) }).toEqual({ re: String(re), hit: false });
    for (const s of FORBIDDEN_HI) expect(t).not.toContain(s);
    // aria-labels and alt text count too.
    const labels = qa('[aria-label]')
      .map((e) => e.getAttribute('aria-label')!)
      .join('\n');
    for (const re of FORBIDDEN_EN) expect(labels).not.toMatch(re);
  });

  it('the phrase is in no source file of the landing folder (landing-copy.ts included)', () => {
    const dir = path.resolve(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files).toEqual(expect.arrayContaining(['landing-copy.ts', 'ReadingDeskLanding.tsx']));
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      // The only mentions are the comments that explain the rule, which say "dropped"/"no".
      for (const line of text.split('\n')) {
        const hit = /in English or Hindi|हिंदी या अंग्रेज़ी में|हिंदी या अंग्रेजी में/.test(line);
        if (hit) {
          const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
          expect({ f, line, isComment }).toEqual({ f, line, isComment: true });
          expect(line).toMatch(/drop|no |not /i);
        }
      }
      // And never inside a string literal that is rendered (comment lines are skipped).
      const code = text
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(code).not.toMatch(/in English or Hindi/);
      expect(code).not.toMatch(/हिंदी या अंग्रेज़ी में/);
    }
  });

  it('M-LP-03, 04a and the hero lead do not carry a language phrase', () => {
    for (const r of [LP.heroLead, LP.step1]) {
      expect(r.en).not.toMatch(/English|Hindi/);
      expect(r.hi).not.toMatch(/अंग्रेज़ी|हिंदी/);
    }
  });
});

describe('no typed counts', () => {
  it('the landing sources type no count of drafts, templates, shelves or drawers', () => {
    const dir = path.resolve(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    const offenders: string[] = [];
    for (const f of files) {
      for (const [i, line] of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').entries()) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (
          /\b\d{2,}\+?\s+(drafts?|templates?|document types?|shelves|drawers|categories)\b/i.test(
            line,
          )
        )
          offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every count on the rendered page is from the catalogue (total, shelves, n per drawer) or the headline', () => {
    mount(<ReadingDeskLanding catalogue={FIXTURE} />);
    const t = norm(document.body.textContent);
    const found = Array.from(
      t.matchAll(/(\d+\+?)\s+(drafts?|document types?|templates?|shelves|drawers|categories)\b/gi),
      (m) => `${m[1]} ${m[2].toLowerCase()}`,
    );
    const perDrawer = FIXTURE.categories
      .filter((c) => c.templates.length > 0)
      .flatMap((c) => {
        const n = c.templates.length;
        return n === 1 ? ['1 document type'] : [`${n} document types`];
      });
    const allowed = new Set([
      '80+ document types', // headlineCount(86)
      '86 document types', // exact total, footer
      '4 shelves',
      ...perDrawer,
    ]);
    for (const f of found) expect({ f, ok: allowed.has(f) }).toEqual({ f, ok: true });
    expect(found).toEqual(expect.arrayContaining(['80+ document types', '86 document types']));
  });
});

describe('08a (samples h2): the text is listed here so it is easy to update', () => {
  it('is the number-free label from the fixes file; no number word, so it cannot be false', () => {
    expect(LP.samplesTitle.en).toBe(COPY.get('M-LP-08a')!.en);
    expect(LP.samplesTitle.en).toBe('Drafts left on the desk for you to read.');
    expect(LP.samplesTitle.hi).toBe('ड्राफ़्ट मेज़ पर रखे हैं, आपके पढ़ने के लिए।');
    expect(LP.samplesTitle.en).not.toMatch(/\b(one|two|three|four|\d+)\b/i);
    // Ajay (AJ-601-F3): "Three" with two samples is a false claim.
    expect(LANDING_COPY_ROWS.map((r) => r.en)).not.toContain(
      'Three drafts left on the desk for you to read.',
    );
  });
});
