/**
 * T-122 — the bail guard (ADR-021 section 3.3; rule and cue lists signed by
 * Ajay in T-127, section 5).
 *
 * No model call and no database. The three rule cases, the cue lists in
 * English, Hindi and Hinglish, and the bail part of the T-113 set.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  applyBailGuard,
  BAIL_ANTICIPATORY,
  BAIL_REGULAR,
  findBailCue,
} from '../services/bail-guard';

const ALLOWED = new Set([
  BAIL_REGULAR,
  BAIL_ANTICIPATORY,
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'plaint_recovery',
]);

const FOUNDER =
  'My brother was arrested by Sadar Thana Police on 25th August 2026 from lajpat market. ' +
  'This is a false accusation on him and I want to write bail application for him';
const EXPECTS = 'My client apprehends arrest in FIR 12/2026. He has not been arrested yet.';
const BOTH = 'The co-accused was arrested yesterday and my client apprehends arrest.';
const NEITHER = 'Need a bail application for my client in a case under section 85 BNS.';

const matched = (templateId: string) => ({ kind: 'matched', templateId });
const choice = (...choices: string[]) => ({ kind: 'needs_choice', choices });

describe('findBailCue', () => {
  it.each([
    [FOUNDER, 'arrested'],
    ['Client is in judicial custody since 3 March 2026.', 'arrested'],
    ['He has been lodged in Beur Jail for two months.', 'arrested'],
    ['She was remanded by the CJM.', 'arrested'],
    ['मेरे भाई को पुलिस ने गिरफ्तार कर लिया है, जमानत चाहिए', 'arrested'],
    ['मेरा मुवक्किल तीन महीने से न्यायिक हिरासत में है', 'arrested'],
    ['mere bhai ko police ne pakad liya, ab jail mein hai', 'arrested'],
    ['client ko arrest kar liya gaya, custody mein hai', 'arrested'],
    [EXPECTS, 'expects'],
    ['Client has not been arrested but the police may arrest him; he fears arrest.', 'expects'],
    ['Please draft a pre-arrest bail application.', 'expects'],
    ['He is likely to be arrested any day.', 'expects'],
    ['उन्हें गिरफ्तारी की आशंका है, अभी तक गिरफ्तार नहीं किया गया है', 'expects'],
    ['पुलिस गिरफ्तार कर सकती है, गिरफ्तारी से पहले जमानत चाहिए', 'expects'],
    ['police giraftar kar sakti hai, abhi arrest nahi hua, agrim zamanat chahiye', 'expects'],
    ['mere bhai ko giraftari ka dar hai', 'expects'],
    [BOTH, 'both'],
    ['He was arrested in 2019 in another matter. Now he fears arrest again.', 'both'],
    [NEITHER, 'none'],
    ['Draft a legal notice for recovery of money.', 'none'],
  ])('%s -> %s', (text, cue) => {
    expect(findBailCue(text)).toBe(cue);
  });

  it('does not read "has not been arrested" as an arrest', () => {
    expect(findBailCue('My client has not been arrested.')).toBe('expects');
    expect(findBailCue('Mera client abhi tak giraftar nahi hua.')).toBe('expects');
    expect(findBailCue('वह हिरासत में नहीं है।')).toBe('expects');
  });

  it('matches Latin-script cues as whole words only', () => {
    // "unarrested" and "jailmein" are not words on the list.
    expect(findBailCue('The unarrested persons are named in the FIR.')).toBe('none');
    expect(findBailCue('Send it to the injail address.')).toBe('none');
  });

  it('ignores case and extra spaces', () => {
    expect(findBailCue('He WAS   ARRESTED on Monday.')).toBe('arrested');
    expect(findBailCue('Client  Apprehends   Arrest.')).toBe('expects');
  });
});

describe('applyBailGuard — a single match', () => {
  it('arrested: anticipatory bail is never the single match', () => {
    const r = applyBailGuard(matched(BAIL_ANTICIPATORY), FOUNDER, ALLOWED);
    expect(r).toEqual({
      changed: true,
      cue: 'arrested',
      kind: 'needs_choice',
      choices: [BAIL_REGULAR, BAIL_ANTICIPATORY],
    });
  });

  it('arrested: regular bail is left as it is', () => {
    const r = applyBailGuard(matched(BAIL_REGULAR), FOUNDER, ALLOWED);
    expect(r.changed).toBe(false);
    expect(r).toMatchObject({ kind: 'matched', templateId: BAIL_REGULAR });
  });

  it('expects arrest: regular bail is never the single match', () => {
    const r = applyBailGuard(matched(BAIL_REGULAR), EXPECTS, ALLOWED);
    expect(r).toEqual({
      changed: true,
      cue: 'expects',
      kind: 'needs_choice',
      choices: [BAIL_ANTICIPATORY, BAIL_REGULAR],
    });
  });

  it('expects arrest: anticipatory bail is left as it is', () => {
    const r = applyBailGuard(matched(BAIL_ANTICIPATORY), EXPECTS, ALLOWED);
    expect(r.changed).toBe(false);
    expect(r).toMatchObject({ kind: 'matched', templateId: BAIL_ANTICIPATORY });
  });

  it.each([BAIL_REGULAR, BAIL_ANTICIPATORY])(
    'both kinds of cue: %s becomes a choice, the service never picks',
    (picked) => {
      const r = applyBailGuard(matched(picked), BOTH, ALLOWED);
      expect(r.changed).toBe(true);
      expect(r.kind).toBe('needs_choice');
      expect(r.templateId).toBeUndefined();
      expect(r.choices?.[0]).toBe(picked);
      expect(r.choices).toHaveLength(2);
      expect(new Set(r.choices)).toEqual(new Set([BAIL_REGULAR, BAIL_ANTICIPATORY]));
    },
  );

  it('no cue: nothing changes', () => {
    expect(applyBailGuard(matched(BAIL_ANTICIPATORY), NEITHER, ALLOWED).changed).toBe(false);
    expect(applyBailGuard(matched(BAIL_REGULAR), NEITHER, ALLOWED).changed).toBe(false);
  });

  it('another document is never touched, whatever the description says', () => {
    for (const id of ['bail_before_magistrate', 'default_bail', 'plaint_recovery']) {
      const r = applyBailGuard(matched(id), FOUNDER, ALLOWED);
      expect(r).toMatchObject({ changed: false, cue: 'none', kind: 'matched', templateId: id });
    }
  });

  it('never offers a document that is not in the catalogue', () => {
    const onlyAnticipatory = new Set([BAIL_ANTICIPATORY]);
    const r = applyBailGuard(matched(BAIL_ANTICIPATORY), FOUNDER, onlyAnticipatory);
    expect(r.changed).toBe(false);
    expect(r.templateId).toBe(BAIL_ANTICIPATORY);
  });
});

describe('applyBailGuard — a choice list', () => {
  it('arrested: regular bail is put first', () => {
    const r = applyBailGuard(choice(BAIL_ANTICIPATORY, BAIL_REGULAR), FOUNDER, ALLOWED);
    expect(r.changed).toBe(true);
    expect(r.choices).toEqual([BAIL_REGULAR, BAIL_ANTICIPATORY]);
  });

  it('arrested: regular bail is added when it was not offered', () => {
    const r = applyBailGuard(choice(BAIL_ANTICIPATORY, 'interim_bail'), FOUNDER, ALLOWED);
    expect(r.choices).toEqual([BAIL_REGULAR, BAIL_ANTICIPATORY, 'interim_bail']);
  });

  it('expects arrest: anticipatory bail is put first', () => {
    const r = applyBailGuard(choice(BAIL_REGULAR, BAIL_ANTICIPATORY), EXPECTS, ALLOWED);
    expect(r.choices).toEqual([BAIL_ANTICIPATORY, BAIL_REGULAR]);
  });

  it('a list that is already in the right order is not changed', () => {
    const r = applyBailGuard(choice(BAIL_REGULAR, BAIL_ANTICIPATORY), FOUNDER, ALLOWED);
    expect(r.changed).toBe(false);
    expect(r.choices).toEqual([BAIL_REGULAR, BAIL_ANTICIPATORY]);
  });

  it('never returns more than 3 choices', () => {
    const r = applyBailGuard(
      choice(BAIL_ANTICIPATORY, 'interim_bail', 'default_bail'),
      FOUNDER,
      ALLOWED,
    );
    expect(r.choices).toEqual([BAIL_REGULAR, BAIL_ANTICIPATORY, 'interim_bail']);
  });

  it('both kinds of cue: the list is left as the match call gave it', () => {
    const r = applyBailGuard(choice(BAIL_ANTICIPATORY, BAIL_REGULAR), BOTH, ALLOWED);
    expect(r.changed).toBe(false);
  });

  it('a list with neither bail document is never touched', () => {
    const r = applyBailGuard(choice('interim_bail', 'default_bail'), FOUNDER, ALLOWED);
    expect(r).toMatchObject({ changed: false, cue: 'none' });
  });
});

describe('applyBailGuard — other outcomes', () => {
  it.each(['guided', 'no_match'])('%s is passed through', (kind) => {
    expect(applyBailGuard({ kind }, FOUNDER, ALLOWED)).toMatchObject({ changed: false, kind });
  });
});

/**
 * The bail part of the T-113 set. Whatever the match call answers for these
 * descriptions, the two documents can never be swapped as a single match.
 */
describe('the bail descriptions in the T-113 set', () => {
  interface Item {
    id: string;
    description: string;
    expected: string;
    language: string;
  }
  // Read from disk: the set lives with the gate script, outside src/.
  const items = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'scripts', 'intake-gate', 'bail-set.json'), 'utf-8'),
  ) as Item[];
  const clear = items.filter((i) => !i.id.startsWith('bail-x-'));
  const regular = clear.filter((i) => i.expected === BAIL_REGULAR);
  const anticipatory = clear.filter((i) => i.expected === BAIL_ANTICIPATORY);

  it('has at least 10 of each kind, with Hindi and Hinglish in both', () => {
    for (const group of [regular, anticipatory]) {
      expect(group.length).toBeGreaterThanOrEqual(10);
      expect(group.some((i) => i.language === 'hi')).toBe(true);
      expect(group.some((i) => i.language === 'mixed')).toBe(true);
    }
    expect(regular.some((i) => i.description === FOUNDER)).toBe(true);
  });

  it.each(regular.map((i) => [i.id, i.description]))(
    '%s: a wrong answer of anticipatory bail becomes a choice with regular bail first',
    (_id, description) => {
      const r = applyBailGuard(matched(BAIL_ANTICIPATORY), description, ALLOWED);
      expect(r.kind).toBe('needs_choice');
      expect(r.choices?.[0]).toBe(BAIL_REGULAR);
      expect(applyBailGuard(matched(BAIL_REGULAR), description, ALLOWED).changed).toBe(false);
    },
  );

  it.each(anticipatory.map((i) => [i.id, i.description]))(
    '%s: a wrong answer of regular bail is never returned as the single match',
    (_id, description) => {
      const r = applyBailGuard(matched(BAIL_REGULAR), description, ALLOWED);
      expect(r.kind).toBe('needs_choice');
      expect(r.choices).toContain(BAIL_ANTICIPATORY);
      const right = applyBailGuard(matched(BAIL_ANTICIPATORY), description, ALLOWED);
      // Left alone, or turned into a choice with anticipatory bail first. Never regular bail.
      expect(right.templateId ?? right.choices?.[0]).toBe(BAIL_ANTICIPATORY);
    },
  );

  it("the founder's sentence, 20 times, with the match call answering both ways", () => {
    for (let i = 0; i < 20; i += 1) {
      const said = i % 2 === 0 ? BAIL_ANTICIPATORY : BAIL_REGULAR;
      const r = applyBailGuard(matched(said), FOUNDER, ALLOWED);
      expect(r.templateId ?? r.choices?.[0]).toBe(BAIL_REGULAR);
    }
  });
});
