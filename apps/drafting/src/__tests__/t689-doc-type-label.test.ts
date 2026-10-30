/**
 * T-689 — docTypeLabelFor: the pack's own name for the document type, with a trailing
 * statute or rule reference dropped. Pure unit cases, then a table over every real pack.
 */
import { readdirSync } from 'fs';

import { RULE_PACKS_DIR, loadRulePack } from '../services/rule-pack.service';
import { docTypeLabelFor } from '../services/doc-type-label';

const label = (name: unknown) => docTypeLabelFor({ name });

describe('docTypeLabelFor: no usable name', () => {
  it.each([null, undefined])('a %s pack gives null', (p) => {
    expect(docTypeLabelFor(p)).toBeNull();
  });
  it.each([undefined, null, 42, true, {}, ['x']])('a non-string name (%p) gives null', (n) => {
    expect(label(n)).toBeNull();
  });
  it('a pack with no name key gives null', () => {
    expect(docTypeLabelFor({})).toBeNull();
  });
  it.each(['', '   ', '\t\n  '])('a blank name (%j) gives null', (n) => {
    expect(label(n)).toBeNull();
  });
});

describe('docTypeLabelFor: statute references are dropped', () => {
  it.each([
    ['Written Statement (Order VIII CPC)', 'Written Statement'],
    ['Condonation of Delay Application (S.5 Limitation Act)', 'Condonation of Delay Application'],
    ['Mutual Consent Divorce (s.13B HMA / s.28 SMA)', 'Mutual Consent Divorce'],
    ['Thing (Section 138 NI Act)', 'Thing'],
    ['Thing (Sec. 9 CPC)', 'Thing'],
    ['Thing (Rule 5)', 'Thing'],
    ['Thing (Article 226)', 'Thing'],
    ['Thing (Art. 32)', 'Thing'],
    ['Thing (Schedule II)', 'Thing'],
    ['Thing (order xxxix rule 1)', 'Thing'],
    ['Thing (VIII CPC)', 'Thing'],
    ['Thing (13B Act)', 'Thing'],
    ['Thing (528 BNSS)', 'Thing'],
    ['Thing (  Order VIII CPC )', 'Thing'],
  ])('%s -> %s', (name, want) => {
    expect(label(name)).toBe(want);
  });

  it('trims and collapses whitespace', () => {
    expect(label('  Written   Statement \n (Order VIII CPC)  ')).toBe('Written Statement');
    expect(label('  Replication  ')).toBe('Replication');
  });

  it('only the last bracket is considered', () => {
    expect(label('A (Order I CPC) B (Order VIII CPC)')).toBe('A (Order I CPC) B');
    expect(label('A (Order VIII CPC) B (PIL)')).toBe('A (Order VIII CPC) B (PIL)');
  });

  it('drops one segment only', () => {
    expect(label('A (Order I CPC) (Order VIII CPC)')).toBe('A (Order I CPC)');
  });
});

describe('docTypeLabelFor: other text is kept', () => {
  it.each([
    'Divorce Petition (HMA, contested)',
    'Divorce Petition (SMA, contested)',
    'Public Interest Litigation (PIL)',
    'Interim Application (IA) for Interim Relief During Pendency',
    'Writ Petition (Criminal) — WP(CRL)',
    'Writ Petition(Order VIII CPC)',
    '(Order VIII CPC)',
    '  (Order VIII CPC) ',
    'Plaint for Partition (CPC + Hindu Succession Act)',
    'Thing (Civil)',
    'Thing (Sectional)',
    'Thing (Ruled)',
    'Thing (Sx 5)',
    'Thing (VIII)',
    'Thing (13B)',
    // HMA/SMA are not in the statute-word list, so a bare numeral + HMA stays (see report).
    'Thing (13B HMA)',
    'Thing (Order VIII CPC',
    'Thing (Order (VIII) CPC)',
    'Thing ()',
  ])('%s is unchanged', (name) => {
    expect(label(name)).toBe(name.replace(/\s+/g, ' ').trim());
  });

  it('keeps HMA and SMA divorce petitions distinct', () => {
    expect(label('Divorce Petition (HMA, contested)')).not.toBe(
      label('Divorce Petition (SMA, contested)'),
    );
  });
});

describe('docTypeLabelFor: every real pack', () => {
  const ids = readdirSync(RULE_PACKS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();

  const labels = new Map<string, string | null>();
  beforeAll(() => {
    for (const id of ids) labels.set(id, docTypeLabelFor(loadRulePack(id)));
  });

  it('finds the packs', () => {
    expect(ids.length).toBeGreaterThan(50);
  });

  it('every pack gives a non-empty label', () => {
    for (const id of ids) {
      const l = labels.get(id);
      expect({ id, ok: typeof l === 'string' && l.trim() !== '' }).toEqual({ id, ok: true });
    }
  });

  it('labels are unique across packs', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const id of ids) {
      const l = labels.get(id)!;
      const prior = seen.get(l);
      if (prior !== undefined) dupes.push(`${prior} / ${id}: ${l}`);
      seen.set(l, id);
    }
    expect(dupes).toEqual([]);
  });

  it('none is the generic Petition, starts lower-case, or is over 70 characters', () => {
    const bad: string[] = [];
    for (const id of ids) {
      const l = labels.get(id)!;
      if (l === 'Petition' || /^[a-z]/.test(l) || l.length > 70) bad.push(`${id}: ${l}`);
    }
    expect(bad).toEqual([]);
  });

  it.each([
    ['written_statement', 'Written Statement'],
    ['plaint_recovery', 'Plaint for Recovery of Money'],
    ['legal_notice_s138', 'Legal Notice under Section 138 NI Act (Cheque Bounce)'],
    ['interim_application', 'Interim Application (IA) for Interim Relief During Pendency'],
    ['divorce_hma', 'Divorce Petition (HMA, contested)'],
    ['divorce_sma', 'Divorce Petition (SMA, contested)'],
    ['bail_regular', 'Regular Bail Application'],
    ['replication', 'Replication'],
  ])('%s gives %s', (id, want) => {
    expect(docTypeLabelFor(loadRulePack(id))).toBe(want);
  });
});
