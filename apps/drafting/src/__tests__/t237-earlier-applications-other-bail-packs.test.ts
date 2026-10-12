/**
 * T-237 — earlier bail applications (and the undertaking cue) in the other bail
 * packs. Text and cue sets signed by Ajay (CLO), 12 Oct 2026
 * (handoff/legal/T-237-pack-text-signed.md).
 *
 * Pure tests of findMissingClauses on the real packs. Cue sets:
 *   EA-standard (bail_anticipatory, bail_before_magistrate): "bail" and one of
 *     earlier / previous / prior / pending / rejected / ... (no "before").
 *   EA-interim (interim_bail): the same without "pending" and "लंबित", because
 *     the main-application paragraph of every interim draft says "pending".
 */
import { CLAUSES_MARKER, findMissingClauses, splitDrafterOutput } from '../services/brief-drafter';
import type { Brief } from '../services/intake-brief';
import { loadRulePack, RulePack } from '../services/rule-pack.service';

const BRIEF = {
  items: [{ key: 'fir_number', value: '124/2026' }],
  still_unknown: [],
} as unknown as Brief;

const PACKS = ['bail_anticipatory', 'interim_bail', 'bail_before_magistrate'] as const;
const pack = (id: string) => loadRulePack(id) as RulePack;

/**
 * Cue words for every other cued clause of the three packs (FIR, custody, grounds,
 * undertaking) and none of the earlier-application words: no "earlier", "previous",
 * "prior", "pending", "rejected", "dismissed", "withdrawn".
 */
const BASE =
  'That FIR No. 124/2026 was registered. The applicant is in custody. The grounds are submitted below. The applicant gives an undertaking.';

/**
 * A draft of a real pack. Every required clause is reported at paragraph 1,
 * except earlier_applications, reported at `eaPara`. Returns the missing clauses.
 */
function missing(packId: string, paras: Record<number, string>, eaPara = 1) {
  const p = pack(packId);
  const lines = p.mandatoryClauses
    .filter((c) => c.required)
    .map((c) => `${c.id}: ${c.id === 'earlier_applications' ? eaPara : 1}`)
    .join('\n');
  const body = Object.entries(paras)
    .map(([n, t]) => `${n}. ${t}`)
    .join('\n\n');
  const out = splitDrafterOutput(`${body}\n\n${CLAUSES_MARKER}\n${lines}`);
  return findMissingClauses(p, out, [], { brief: BRIEF });
}
const ea = (packId: string, paras: Record<number, string>, eaPara = 1) =>
  missing(packId, paras, eaPara).filter((m) => m.id === 'earlier_applications');

describe('T-237 AC1, AC2: the signed clauses are in the real packs', () => {
  it.each(PACKS)('%s: earlier_applications is required, directly before the prayer', (id) => {
    const ids = pack(id).mandatoryClauses.map((c) => c.id);
    const at = ids.indexOf('earlier_applications');
    expect(at).toBeGreaterThan(-1);
    expect(ids[at + 1]).toBe('prayer');
    expect(pack(id).mandatoryClauses[at]).toMatchObject({
      title: 'Earlier Bail Applications',
      required: true,
    });
  });

  it('bail_anticipatory: no_flight_risk is the required "Undertakings" clause', () => {
    const c = pack('bail_anticipatory').mandatoryClauses.find((x) => x.id === 'no_flight_risk');
    expect(c).toMatchObject({ title: 'Undertakings', required: true });
  });

  it('interim_bail: no_flight_risk is "Roots of the Applicant" and not required', () => {
    const c = pack('interim_bail').mandatoryClauses.find((x) => x.id === 'no_flight_risk');
    expect(c).toMatchObject({ title: 'Roots of the Applicant', required: false });
  });
});

describe('T-237 AC4: a draft without the disclosure reports earlier_applications missing', () => {
  it.each(PACKS)('%s: no disclosure -> earlier_applications missing, and only it', (id) => {
    expect(missing(id, { 1: BASE })).toEqual([
      {
        id: 'earlier_applications',
        title: expect.any(String),
        reason: 'clause_not_in_paragraph',
      },
    ]);
  });

  it('interim_bail: only the main-application paragraph is reported for earlier_applications -> clause_not_in_paragraph', () => {
    const main = "That the main application for bail is pending before this Hon'ble Court.";
    const got = ea('interim_bail', { 1: BASE, 2: main }, 2);
    expect(got.map((m) => m.reason)).toEqual(['clause_not_in_paragraph']);
  });

  it('interim_bail: the same paragraph in Hindi ("लंबित") does not satisfy EA-interim either', () => {
    const got = ea('interim_bail', { 1: BASE, 2: 'मुख्य जमानत आवेदन न्यायालय में लंबित है।' }, 2);
    expect(got.map((m) => m.reason)).toEqual(['clause_not_in_paragraph']);
  });

  it('contrast: the main-application wording with "pending" does satisfy EA-standard', () => {
    const main = "That an application for bail is pending before this Hon'ble Court.";
    expect(ea('bail_anticipatory', { 1: BASE, 2: main }, 2)).toEqual([]);
    expect(ea('bail_before_magistrate', { 1: BASE, 2: main }, 2)).toEqual([]);
    expect(
      ea('bail_anticipatory', { 1: BASE, 2: 'जमानत आवेदन न्यायालय में लंबित है।' }, 2),
    ).toEqual([]);
  });
});

describe('T-237: "before this Hon\'ble Court" is not a cue (EA-standard drops "before")', () => {
  it.each(PACKS)(
    '%s: a bail paragraph that only says "before this Hon\'ble Court" is missing',
    (id) => {
      const got = ea(
        id,
        {
          1: BASE,
          2: "That the applicant moves this application for bail before this Hon'ble Court.",
        },
        2,
      );
      expect(got.map((m) => m.reason)).toEqual(['clause_not_in_paragraph']);
    },
  );

  it('bail_regular keeps its 11 Oct cue (unchanged): "before" still passes there', () => {
    const p = pack('bail_regular');
    const out = splitDrafterOutput(
      `1. The applicant seeks bail before this Hon'ble Court.\n\n${CLAUSES_MARKER}\nearlier_applications: 1`,
    );
    const only = {
      ...p,
      mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === 'earlier_applications'),
    };
    expect(findMissingClauses(only, out, [])).toEqual([]);
  });
});

describe('T-237: a paragraph that discloses an earlier application is present', () => {
  const DISCLOSURES = [
    'That the earlier bail application of the applicant was rejected by the learned Sessions Judge on 3 March 2026.',
    'That a previous application for bail was dismissed as withdrawn.',
    '[To be confirmed: whether any earlier application for bail was made in this matter, to which court, and with what result]',
    'That the applicant had earlier moved for bail; the date of the order is ______.',
  ];

  it.each(PACKS.flatMap((id) => DISCLOSURES.map((d) => [id, d] as const)))('%s: %s', (id, text) => {
    expect(ea(id, { 1: BASE, 2: text }, 2)).toEqual([]);
  });

  it('interim_bail: the exact to-be-confirmed blank of the signed instruction passes', () => {
    const blank =
      '[To be confirmed: whether any earlier application for interim bail, bail or anticipatory bail, other than the pending main application, was made in this matter, to which court, and with what result]';
    expect(ea('interim_bail', { 1: BASE, 2: blank }, 2)).toEqual([]);
  });

  it.each(PACKS)('%s: a Hindi disclosure passes', (id) => {
    expect(
      ea(
        id,
        { 1: BASE, 2: 'आवेदक की पूर्व जमानत याचिका माननीय सत्र न्यायाधीश द्वारा खारिज की गई।' },
        2,
      ),
    ).toEqual([]);
  });

  it.each(PACKS)('%s: a Hindi disclosure with the nukta spellings passes', (id) => {
    expect(ea(id, { 1: BASE, 2: 'पहले की ज़मानत अर्जी ख़ारिज हुई।' }, 2)).toEqual([]);
  });

  it.each(PACKS)('%s: earlier words without "bail" are not enough', (id) => {
    expect(
      ea(id, { 1: BASE, 2: 'That an earlier matter was rejected by the court.' }, 2).map(
        (m) => m.reason,
      ),
    ).toEqual(['clause_not_in_paragraph']);
  });
});

describe('T-237: no_flight_risk', () => {
  const noFlight = (packId: string, text: string) => {
    const p = pack(packId);
    const only = {
      ...p,
      mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === 'no_flight_risk'),
    };
    const out = splitDrafterOutput(`1. ${text}\n\n${CLAUSES_MARKER}\nno_flight_risk: 1`);
    return findMissingClauses(only, out, []).map((m) => m.reason);
  };

  it('bail_anticipatory: uses the undertaking cue', () => {
    expect(
      noFlight('bail_anticipatory', 'The applicant undertakes to join the investigation.'),
    ).toEqual([]);
    expect(noFlight('bail_anticipatory', 'आवेदक वचन देता है कि वह सहयोग करेगा।')).toEqual([]);
    expect(noFlight('bail_anticipatory', 'आवेदक आश्वासन देता है।')).toEqual([]);
  });

  it('bail_anticipatory: a paragraph with no undertaking is missing (no longer R2b, no fallback)', () => {
    expect(noFlight('bail_anticipatory', 'The applicant has deep roots in society.')).toEqual([
      'clause_not_in_paragraph',
    ]);
  });

  it('bail_regular: the undertaking cue is as before', () => {
    expect(noFlight('bail_regular', 'He gives an undertaking.')).toEqual([]);
    expect(noFlight('bail_regular', 'He has deep roots.')).toEqual(['clause_not_in_paragraph']);
  });

  it('interim_bail: no_flight_risk is not required, so it is never reported missing', () => {
    const p = pack('interim_bail');
    const out = splitDrafterOutput(
      `1. ${BASE}\n\n${CLAUSES_MARKER}\n${p.mandatoryClauses
        .filter((c) => c.required)
        .map((c) => `${c.id}: 1`)
        .join('\n')}\nno_flight_risk: MISSING`,
    );
    const ids = findMissingClauses(p, out, [], { brief: BRIEF }).map((m) => m.id);
    expect(ids).not.toContain('no_flight_risk');
  });

  it('interim_bail: no_flight_risk is not reported when absent from the report, either', () => {
    expect(
      missing(
        'interim_bail',
        { 1: BASE, 2: 'Disclosure: the earlier bail application was rejected.' },
        2,
      ),
    ).toEqual([]);
  });
});
