/**
 * Bail guard (T-122, ADR-021 section 3.3, rule 5).
 *
 * Regular bail is for a person who has been arrested or is in custody.
 * Anticipatory bail is for a person who has not been arrested and expects to
 * be. The match is one model call, so its answer can differ from run to run.
 * This guard runs in code after that call, on the description.
 *
 * The guard never picks a document for the user. It can only turn a single
 * match into a choice, or change the order of a choice.
 *
 * LEGAL CONTENT: the rule and the cue lists are Ajay's, signed in T-127
 * (`handoff/design/T-127-one-flow-rules-and-prompts.md`, section 5). The lists
 * are in `src/config/intake/bail-cues.json`. Do not change either without his
 * sign-off.
 *
 * Privacy: nothing here logs or returns any text from the description.
 */
import cueFile from '../config/intake/bail-cues.json';

export const BAIL_REGULAR = 'bail_regular';
export const BAIL_ANTICIPATORY = 'bail_anticipatory';

/** The longest choice list the intake returns. */
const MAX_CHOICES = 3;

export type BailCue = 'none' | 'arrested' | 'expects' | 'both';

type CueLists = Record<string, string[]>;

/** Lower case, one space between words, the same quotes and hyphens throughout. */
function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isLatin(cue: string): boolean {
  return /^[\x20-\x7e]+$/.test(cue);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Cue {
  text: string;
  /** Latin-script cues match whole words only. Other scripts match as written. */
  pattern: RegExp;
}

function compile(lists: CueLists): Cue[] {
  const seen = new Set<string>();
  const out: Cue[] = [];
  for (const list of Object.values(lists)) {
    for (const raw of list) {
      const text = normalise(raw);
      if (text.length === 0 || seen.has(text)) continue;
      seen.add(text);
      const body = escapeRegExp(text).replace(/ /g, ' +');
      out.push({
        text,
        pattern: isLatin(text)
          ? new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'g')
          : new RegExp(body, 'g'),
      });
    }
  }
  // Longest first, so "has not been arrested" is taken out before "not arrested".
  return out.sort((a, b) => b.text.length - a.text.length);
}

const EXPECTS = compile(cueFile.expects_arrest);
const ARRESTED = compile(cueFile.already_arrested);

/**
 * What the description says about arrest.
 *
 * The "expects arrest" phrases are looked for first and taken out of the text.
 * Only then are the "already arrested" words looked for, in what is left. So
 * "has not been arrested" is not read as an arrest.
 */
export function findBailCue(description: string): BailCue {
  let text = normalise(description);
  let expects = false;
  for (const cue of EXPECTS) {
    cue.pattern.lastIndex = 0;
    if (cue.pattern.test(text)) {
      expects = true;
      cue.pattern.lastIndex = 0;
      text = text.replace(cue.pattern, ' | ');
    }
  }
  let arrested = false;
  for (const cue of ARRESTED) {
    cue.pattern.lastIndex = 0;
    if (cue.pattern.test(text)) {
      arrested = true;
      break;
    }
  }
  if (arrested && expects) return 'both';
  if (arrested) return 'arrested';
  if (expects) return 'expects';
  return 'none';
}

export interface BailGuardInput {
  kind: string;
  templateId?: string;
  choices?: string[];
}

export interface BailGuardResult {
  /** True when the guard changed the result of the match call. */
  changed: boolean;
  cue: BailCue;
  kind: string;
  templateId?: string;
  choices?: string[];
}

function other(id: string): string {
  return id === BAIL_REGULAR ? BAIL_ANTICIPATORY : BAIL_REGULAR;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// ── Regular bail for a client not in custody (T-150, Rule B) ────────────────
//
// LEGAL CONTENT: the trigger and the text are Ajay's, signed in
// AJ-2026-10-07-T150. Do not reword or widen without his sign-off.

/** The regular-bail documents the warning is shown on. Never anticipatory bail. */
// bail_before_magistrate has no custody choice yet, so Rule B does not fire on it (follow-up ticket, AJ-2026-10-07-T150-diff).
export const REGULAR_BAIL_KINDS: ReadonlySet<string> = new Set([
  BAIL_REGULAR,
  'bail_before_magistrate',
]);

/** The custody answer that says the client has not been arrested. */
export const ANTICIPATING_ARREST = 'No — anticipating arrest';

/** Ajay's text, word for word (AJ-2026-10-07-T150, Rule B). */
export const REGULAR_BAIL_NOT_IN_CUSTODY_WARNING =
  'A regular bail application is usually for a client who is in custody or who will surrender before the court. If your client has not been arrested and will not surrender, you may need anticipatory bail.';

/** True for the custody field: the choice that offers "No — anticipating arrest". */
export function isCustodyChoice(options: readonly string[]): boolean {
  const want = normalise(ANTICIPATING_ARREST);
  return options.some((o) => normalise(o) === want);
}

/**
 * Rule B. True when the document is a regular bail and the custody answer is
 * "No — anticipating arrest" or is not given. A missing custody date alone
 * does not count: only the custody answer is looked at. The warning never
 * blocks Confirm and never changes the document.
 */
export function needsNotInCustodyWarning(
  kindId: string | null,
  custodyAnswer: string | string[] | null,
): boolean {
  if (kindId === null || !REGULAR_BAIL_KINDS.has(kindId)) return false;
  if (custodyAnswer === null) return true;
  const answer = Array.isArray(custodyAnswer) ? custodyAnswer.join(' ') : custodyAnswer;
  if (answer.trim() === '') return true;
  return normalise(answer) === normalise(ANTICIPATING_ARREST);
}

/**
 * Apply the bail rule to the result of the match call.
 *
 * `allowed` is the catalogue: a document that is not in it is never offered.
 * Only a result that names `bail_regular` or `bail_anticipatory` is touched.
 */
export function applyBailGuard(
  decision: BailGuardInput,
  description: string,
  allowed: ReadonlySet<string>,
): BailGuardResult {
  const same = (cue: BailCue): BailGuardResult => ({
    changed: false,
    cue,
    kind: decision.kind,
    templateId: decision.templateId,
    choices: decision.choices,
  });

  const names =
    decision.kind === 'matched'
      ? [decision.templateId ?? '']
      : decision.kind === 'needs_choice'
        ? (decision.choices ?? [])
        : [];
  if (!names.includes(BAIL_REGULAR) && !names.includes(BAIL_ANTICIPATORY)) return same('none');

  const cue = findBailCue(description);
  if (cue === 'none') return same(cue);

  // The document the description points to. With both kinds of cue there is none.
  const favoured = cue === 'arrested' ? BAIL_REGULAR : cue === 'expects' ? BAIL_ANTICIPATORY : null;

  if (decision.kind === 'matched') {
    const picked = decision.templateId as string;
    if (favoured !== null && picked === favoured) return same(cue);
    // A single match the description does not support, or one it speaks both ways on.
    const first = favoured ?? picked;
    const choices = [first, other(first)].filter((id) => allowed.has(id));
    if (choices.length === 0 || (choices.length === 1 && choices[0] === picked)) return same(cue);
    return { changed: true, cue, kind: 'needs_choice', choices };
  }

  // A choice list: the order may change, the user still chooses.
  if (favoured === null || !allowed.has(favoured)) return same(cue);
  const current = decision.choices ?? [];
  const choices = [favoured, ...current.filter((id) => id !== favoured)].slice(0, MAX_CHOICES);
  if (sameOrder(choices, current)) return same(cue);
  return { changed: true, cue, kind: 'needs_choice', choices };
}
