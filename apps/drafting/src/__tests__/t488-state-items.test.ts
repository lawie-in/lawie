/**
 * T-488 part C: state_of_filing feeds {state}, and the Drafter / ledger writ_civil
 * prompt names that State rather than the no-State line (Ajay 57e1bd9c; the
 * civil-writ wording itself is unchanged, f9415fe8).
 * Strings are typed here byte for byte so a code change cannot move them.
 *
 *  C1  certiorari, state_of_filing "Bihar", no `state`: the title heading and State party name Bihar.
 *  C2  an off-state court / the Supreme Court whose listed State equals state_of_filing: kept, not blanked.
 *  C3  a `state` answer still wins over state_of_filing; no answer at all behaves as before.
 *  C4  drafterPartyDesignationLines(writ_petition_civil): no courtState -> no-State line,
 *      Bihar -> the Bihar line, Delhi -> the f9415fe8 Delhi line.
 */
import './setupEnv';
import { readFileSync } from 'fs';
import { join } from 'path';

import { drafterPartyDesignationLines } from '../services/ai.service';
import {
  buildPlaceholderContext,
  civilWritStateParty,
  clearConfigCache,
  loadCourtRule,
  loadTemplateConfig,
  promptCourtState,
  renderTemplateSection,
} from '../services/template-engine.service';

const SECRETARY = '[To be confirmed: Secretary of the concerned department]';
const NO_STATE_LINE = `State of [To be confirmed: State] through ${SECRETARY}`;
const BIHAR_LINE = `State of Bihar through ${SECRETARY}, Government of Bihar`;
const DELHI_LINE = `Government of NCT of Delhi through ${SECRETARY}`;

const certNames = {
  petitioner_name: 'Sample Petitioner',
  respondent_authority: 'Sample Authority',
  additional_respondents: 'Sample Private Party',
  article_invoked: '226',
};

interface CourtEntry {
  courtId: string;
  designation: string;
  city: string;
  caseNomenclature: string;
  formattingRulesRef: string;
  courtType: string;
  state: string;
}
const courtList = JSON.parse(
  readFileSync(join(__dirname, '../config/courts/indian-courts.json'), 'utf8'),
) as { courts?: CourtEntry[] } & Record<string, unknown>;

function findCourt(courtId: string) {
  const found: CourtEntry[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>;
      if (o.courtId === courtId) found.push(o as unknown as CourtEntry);
      Object.values(o).forEach(walk);
    }
  };
  walk(courtList);
  if (!found[0]) throw new Error(`court ${courtId} not in indian-courts.json`);
  const e = found[0];
  return {
    designation: e.designation,
    city: e.city,
    caseNomenclature: e.caseNomenclature,
    formattingRulesRef: e.formattingRulesRef,
    courtType: e.courtType,
    state: e.state,
  };
}

function build(id: string, form: Record<string, unknown>, court?: object) {
  clearConfigCache();
  const config = loadTemplateConfig(id)!;
  const ctx = buildPlaceholderContext(config, form, { advocateName: 'Adv. A' }, court as never);
  const title = config.document_structure.sections.find((s) => s.section_id === 'cause_title')!;
  return { ctx, cause_title: renderTemplateSection(title, ctx).content };
}

describe('T-488 C1: certiorari state_of_filing feeds {state}', () => {
  it('no court data: heading and State party name Bihar', () => {
    const r = build('certiorari', { ...certNames, state_of_filing: 'Bihar' });
    expect(r.ctx.state).toBe('Bihar');
    expect(r.cause_title).toContain("IN THE HON'BLE HIGH COURT OF Bihar AT");
    expect(r.cause_title).toContain(`1. ${BIHAR_LINE}`);
    expect(r.cause_title).not.toContain('HIGH COURT OF _____');
  });

  it('a lower-case state_of_filing is capitalised like a state answer', () => {
    const r = build('certiorari', { ...certNames, state_of_filing: 'bihar' });
    expect(r.ctx.state).toBe('Bihar');
    expect(r.cause_title).toContain('HIGH COURT OF Bihar AT');
  });

  it('the State party line is the civilWritStateParty / certiorari line for Bihar', () => {
    expect(civilWritStateParty('Bihar')).toBe(BIHAR_LINE);
    const r = build('certiorari', { ...certNames, state_of_filing: 'Bihar' });
    expect(r.cause_title).toContain(civilWritStateParty('Bihar'));
  });

  it('state_of_filing Delhi: the NCT line, never "State of Delhi"', () => {
    const r = build('certiorari', { ...certNames, state_of_filing: 'Delhi' });
    expect(r.cause_title).toContain(`1. ${DELHI_LINE}`);
    expect(r.cause_title).not.toContain('State of Delhi');
  });

  it('with a matter-State court (Patna) and state_of_filing Bihar: unchanged Bihar title', () => {
    const r = build(
      'certiorari',
      { ...certNames, state_of_filing: 'Bihar' },
      findCourt('patna_hc'),
    );
    expect(r.cause_title).toContain("IN THE HON'BLE HIGH COURT OF Bihar AT Patna");
    expect(r.cause_title).toContain(`1. ${BIHAR_LINE}`);
  });
});

describe('T-488 C2: the answered State is restored when the court rule would blank it', () => {
  it('Panaji bench (listed Maharashtra), state_of_filing Maharashtra: {state} kept', () => {
    const cd = findCourt('bombay_hc_panaji_bench');
    expect(cd.state).toBe('Maharashtra');
    const r = build('certiorari', { ...certNames, state_of_filing: 'Maharashtra' }, cd);
    expect(r.ctx.state).toBe('Maharashtra');
    expect(r.cause_title).toContain('HIGH COURT OF Maharashtra AT');
    expect(r.cause_title).toContain('1. State of Maharashtra through');
  });

  it('control: same bench, no state_of_filing: still blanked (T-479 unchanged)', () => {
    const r = build('certiorari', certNames, findCourt('bombay_hc_panaji_bench'));
    expect(r.ctx.state).toBeUndefined();
    expect(r.cause_title).toContain(`1. ${NO_STATE_LINE}`);
    expect(r.cause_title).not.toContain('Maharashtra');
  });

  it('Supreme Court (listed State), state_of_filing equal to it: {state} kept', () => {
    const cd = findCourt('supreme_court_india');
    const listed = cd.state;
    expect(listed).toBeTruthy();
    const r = build('certiorari', { ...certNames, state_of_filing: listed }, cd);
    expect(r.ctx.state).toBe(listed);
  });

  it('control: Supreme Court with a different state_of_filing is kept as answered too', () => {
    const r = build(
      'certiorari',
      { ...certNames, state_of_filing: 'Bihar' },
      findCourt('supreme_court_india'),
    );
    expect(r.ctx.state).toBe('Bihar');
  });

  it('promptCourtState returns the restored State for the prompt', () => {
    const cd = findCourt('bombay_hc_panaji_bench');
    const r = build('certiorari', { ...certNames, state_of_filing: 'Maharashtra' }, cd);
    expect(promptCourtState(r.ctx, cd as never)).toBe('Maharashtra');
  });

  it('promptCourtState: no answer at an off-state bench is undefined', () => {
    const cd = findCourt('bombay_hc_panaji_bench');
    const r = build('certiorari', certNames, cd);
    expect(promptCourtState(r.ctx, cd as never)).toBeUndefined();
  });

  it('promptCourtState: no answer at Patna reads the court State', () => {
    const cd = findCourt('patna_hc');
    const r = build('writ_petition_civil', { petitioner_name: 'Sample Petitioner' }, cd);
    expect(promptCourtState(r.ctx, cd as never)).toBe('Bihar');
  });
});

describe('T-488 C3: a `state` answer still wins', () => {
  it('state Jharkhand beats state_of_filing Bihar', () => {
    const r = build('certiorari', { ...certNames, state: 'Jharkhand', state_of_filing: 'Bihar' });
    expect(r.ctx.state).toBe('Jharkhand');
    expect(r.cause_title).toContain('HIGH COURT OF Jharkhand AT');
    expect(r.cause_title).toContain('State of Jharkhand through');
    expect(r.cause_title).not.toContain('Bihar');
  });

  it('a `state` answer alone behaves as before', () => {
    const r = build('certiorari', { ...certNames, state: 'bihar' });
    expect(r.ctx.state).toBe('Bihar');
    expect(r.cause_title).toContain(`1. ${BIHAR_LINE}`);
  });

  it('neither answered, no court: the signed blank State line, no State invented', () => {
    const r = build('certiorari', certNames);
    expect(r.ctx.state).toBeUndefined();
    expect(r.cause_title).toContain(`1. ${NO_STATE_LINE}`);
  });

  it('an empty state_of_filing does not become the State', () => {
    const r = build('certiorari', { ...certNames, state_of_filing: '' });
    expect(r.ctx.state).toBeUndefined();
  });
});

describe('T-488 C4: drafterPartyDesignationLines for writ_petition_civil', () => {
  const rule = loadCourtRule('patna_hc') ?? loadCourtRule('delhi_hc') ?? undefined;
  const stateLines = (courtState?: string) =>
    drafterPartyDesignationLines(rule, 'writ_petition_civil', courtState).filter((l) =>
      l.startsWith('Party designation, state:'),
    );

  it('has a court rule to test with', () => {
    expect(rule).toBeDefined();
  });

  it('no courtState: the no-State line, as before', () => {
    expect(stateLines()).toEqual([`Party designation, state: "${NO_STATE_LINE}"`]);
    expect(stateLines(undefined)).toEqual(stateLines());
  });

  it('courtState Bihar: the Bihar State party line', () => {
    expect(stateLines('Bihar')).toEqual([`Party designation, state: "${BIHAR_LINE}"`]);
  });

  it('courtState Delhi: the f9415fe8 civil-writ Delhi line, unchanged', () => {
    expect(stateLines('Delhi')).toEqual([`Party designation, state: "${DELHI_LINE}"`]);
  });

  it('a courtState changes only the state line', () => {
    const strip = (ls: string[]) => ls.filter((l) => !l.startsWith('Party designation, state:'));
    expect(strip(drafterPartyDesignationLines(rule, 'writ_petition_civil', 'Bihar'))).toEqual(
      strip(drafterPartyDesignationLines(rule, 'writ_petition_civil')),
    );
  });

  it('other packs ignore courtState', () => {
    expect(drafterPartyDesignationLines(rule, 'bail_regular', 'Bihar')).toEqual(
      drafterPartyDesignationLines(rule, 'bail_regular'),
    );
  });

  it('no court rule: no lines, whatever the courtState', () => {
    expect(drafterPartyDesignationLines(undefined, 'writ_petition_civil', 'Bihar')).toEqual([]);
  });
});
