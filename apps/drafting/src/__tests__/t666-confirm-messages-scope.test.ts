/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-666 (follow-ups to T-661, legal content path):
 *   AC1 the signed-lines module is renamed to a pack-neutral name, no string changes;
 *   AC2 isO39RequiredField is pack-scoped: a field with the same key in another pack is not
 *       O.39-required;
 *   AJ-655-M1 (Priya's pin): a ledger "Not known" party still blocks in EVERY pack, so
 *       isNoFactGuardedField stays pack-neutral.
 * The signed strings are typed here on purpose, byte for byte, not imported. Fictional data only.
 * No model call, no network.
 */
import './setupEnv';
import './setupDb';
import fs from 'fs';
import path from 'path';

import * as signed from '../config/intake/signed-confirm-messages';
import {
  isNoFactGuardedField,
  isO39RequiredField,
  O39_CONFIRM_MESSAGES,
  PACK_CONFIRM_MESSAGES,
  signedConfirmMessage,
} from '../config/intake/signed-confirm-messages';
import {
  buildBrief,
  buildChecklist,
  GivenValue,
  ledgerGivenKeys,
  withoutLedgerGiven,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const O39 = 'temporary_injunction_o39';
const COURT = { state: 'bihar', court_type: 'civil_court', court: 'civil_court_patna' };

const PLAINTIFF_EN = "Add the plaintiff's name to continue.";
const DEFENDANT_EN = "Add the defendant's name to continue.";
const RELIEF_EN = 'Add the relief sought in the main suit to continue.';
const RESTRAINT_EN = 'Add the acts the defendant should be restrained from, to continue.';
const DEF1_EN = 'Add the name of Defendant No. 1 to continue.';
const OTHER_EN = 'Say whether there are other defendants to continue.';

const SRC = path.join(__dirname, '..');

// ── AC1: the rename ──────────────────────────────────────────────────────────────────────
describe('T-666 AC1: the rename, no string changes', () => {
  it('the old path is gone and the new one exists', () => {
    expect(fs.existsSync(path.join(SRC, 'config/intake/o39-confirm-messages.ts'))).toBe(false);
    expect(fs.existsSync(path.join(SRC, 'config/intake/signed-confirm-messages.ts'))).toBe(true);
  });

  it('no source file still imports the old name', () => {
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name) && !/t666-/.test(e.name)) out.push(p);
      }
      return out;
    };
    const stale = walk(SRC).filter((p) =>
      /from\s*'[^']*config\/intake\/o39-confirm-messages'|from\s*'\.\/o39-confirm-messages'/.test(
        fs.readFileSync(p, 'utf8'),
      ),
    );
    expect(stale).toEqual([]);
  });

  it('exports the same names as before, plus isNoFactGuardedField (T-666) and NON_ANSWER_PARTY_PACKS, isNonAnswerPartyPack (T-668)', () => {
    expect(Object.keys(signed).sort()).toEqual(
      [
        'O39_CONFIRM_MESSAGES',
        'O39_NON_ANSWERS',
        'O39_REQUIRED_FIELDS',
        'GENERIC_PARTY_LINE_OVERRIDES',
        'PACK_CONFIRM_MESSAGES',
        'NON_ANSWER_PARTY_PACKS',
        'isEmptyOrNonAnswer',
        'isNoFactGuardedField',
        'isNonAnswerPartyPack',
        'isO39RequiredField',
        'isPartyNameGuardedField',
        'isPartyNonAnswer',
        'requiredFieldBlockers',
        'signedConfirmMessage',
      ].sort(),
    );
  });

  it('O39_CONFIRM_MESSAGES is byte for byte the signed text, EN and HI', () => {
    expect(O39_CONFIRM_MESSAGES).toEqual({
      plaintiff_name: {
        en: PLAINTIFF_EN,
        hi: 'आगे बढ़ने के लिए वादी का नाम जोड़िए।',
      },
      defendant_name: {
        en: DEFENDANT_EN,
        hi: 'आगे बढ़ने के लिए प्रतिवादी का नाम जोड़िए।',
      },
      main_suit_relief: {
        en: RELIEF_EN,
        hi: 'आगे बढ़ने के लिए मुख्य वाद में माँगी गई राहत जोड़िए।',
      },
      restraint_sought: {
        en: RESTRAINT_EN,
        hi: 'आगे बढ़ने के लिए वे कार्य जोड़िए जिनसे प्रतिवादी को रोका जाना है।',
      },
    });
  });

  it('PACK_CONFIRM_MESSAGES is byte for byte the signed text, EN and HI', () => {
    expect(PACK_CONFIRM_MESSAGES).toEqual({
      plaint_partition: {
        other_defendants: {
          en: OTHER_EN,
          hi: 'आगे बढ़ने के लिए बताइए कि क्या अन्य प्रतिवादी भी हैं।',
        },
        defendant_name: {
          en: DEF1_EN,
          hi: 'आगे बढ़ने के लिए प्रतिवादी संख्या 1 का नाम जोड़िए।',
        },
      },
    });
  });
});

// ── AC2: pack-scoped isO39RequiredField ──────────────────────────────────────────────────
describe('T-666 AC2: isO39RequiredField is pack-scoped', () => {
  it('true for each O.39 key in the O.39 pack', () => {
    for (const k of ['plaintiff_name', 'defendant_name', 'main_suit_relief', 'restraint_sought']) {
      expect(isO39RequiredField(O39, k)).toBe(true);
    }
  });

  it('the same key in another pack, or with no pack, is not O.39-required', () => {
    expect(isO39RequiredField(O39, 'plaintiff_name')).toBe(true);
    expect(isO39RequiredField('plaint_partition', 'plaintiff_name')).toBe(false);
    expect(isO39RequiredField('plaint_declaration', 'defendant_name')).toBe(false);
    expect(isO39RequiredField(null, 'main_suit_relief')).toBe(false);
    expect(isO39RequiredField('plaint_injunction', 'restraint_sought')).toBe(false);
  });

  it('an O.39 pack field that is not on the list is not O.39-required', () => {
    expect(isO39RequiredField(O39, 'acts_complained_of')).toBe(false);
    expect(isO39RequiredField(O39, 'constructor')).toBe(false);
  });
});

describe('T-666: isNoFactGuardedField stays pack-neutral (AJ-655-M1)', () => {
  it('true for all four keys with no pack argument, false otherwise', () => {
    for (const k of ['plaintiff_name', 'defendant_name', 'main_suit_relief', 'restraint_sought']) {
      expect(isNoFactGuardedField(k)).toBe(true);
    }
    expect(isNoFactGuardedField('acts_complained_of')).toBe(false);
    expect(isNoFactGuardedField('other_defendants')).toBe(false);
  });
});

// ── AJ-655-M1: a ledger "Not known" party still blocks in every pack ────────────────────
describe('T-666 AJ-655-M1: a ledger "Not known" party still blocks in a plaint pack', () => {
  const setup = (id: string) => {
    const checklist = buildChecklist(loadRulePack(id)!);
    const keyOf = (name: string) => {
      const item = checklist.find((i) => i.key.split('.').pop() === name);
      if (!item) throw new Error(`no ${name} on ${id}`);
      return item.key;
    };
    const kind = { id, name: id, court_document: true };
    const brief = (values: GivenValue[]) =>
      buildBrief({ kind, checklist, values, court: COURT } as any);
    return { keyOf, brief };
  };
  const fact = (key: string, text: string) => ({ key, display: text, value: text });

  it.each([
    ['plaint_declaration', 'plaintiff_name', 'defendant_name'],
    ['plaint_partition', 'defendant_name', 'plaintiff_name'],
    ['plaint_injunction', 'plaintiff_name', 'defendant_name'],
  ])('%s: ledger "Not known" %s is not given and still blocks', (id, held, other) => {
    const { keyOf, brief } = setup(id);
    for (const word of ['Not known', 'N/A', 'nil']) {
      // The ledger holds the party as a non-answer and the other party as a real name.
      const g = ledgerGivenKeys([fact(keyOf(held), word), fact(keyOf(other), 'Sample Person 2')]);
      expect(g.has(keyOf(held))).toBe(false);
      expect(g.has(keyOf(other))).toBe(true);
      const b = withoutLedgerGiven(brief([]), g);
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('parties');
      expect(b.ledger_given_keys).toEqual([keyOf(other)]);
    }
  });

  it('control: the same party held as a real name is given and lifts the party block', () => {
    const { keyOf, brief } = setup('plaint_declaration');
    const g = ledgerGivenKeys([
      fact(keyOf('plaintiff_name'), 'Sample Person 1'),
      fact(keyOf('defendant_name'), 'Sample Person 2'),
    ]);
    expect(g.size).toBe(2);
    const b = withoutLedgerGiven(brief([]), g);
    expect(b.confirm_blockers).not.toContain('parties');
  });

  it('plaint_partition: a "Not known" defendant_name shows the signed Defendant No. 1 line', () => {
    const { keyOf, brief } = setup('plaint_partition');
    const g = ledgerGivenKeys([
      fact(keyOf('defendant_name'), 'Not known'),
      fact(keyOf('plaintiff_name'), 'Sample Person 1'),
    ]);
    const b = withoutLedgerGiven(brief([]), g);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_message).toContain(DEF1_EN);
  });
});

// ── Same key, two packs ──────────────────────────────────────────────────────────────────
describe('T-666: a blocks_confirm field with an O.39 key, in O.39 and in another pack', () => {
  // The O.39 checklist (restraint_sought and main_suit_relief are blocks_confirm there) is run
  // under another pack's id, which is a same-key blocks_confirm field in a non-O.39 pack.
  const checklist = buildChecklist(loadRulePack(O39)!);
  const keyOf = (name: string) => checklist.find((i) => i.key.split('.').pop() === name)!.key;
  const user = (name: string, value: string): GivenValue => ({
    key: keyOf(name),
    value,
    source: 'user',
  });
  const values = [
    user('plaintiff_name', 'Sample Person 1'),
    user('defendant_name', 'Sample Person 2'),
    user('main_suit_relief', 'Declaration of title over Plot 000, Sample Nagar, Patna'),
  ]; // restraint_sought is left empty
  const briefIn = (id: string) =>
    buildBrief({
      kind: { id, name: id, court_document: true },
      checklist,
      values,
      court: COURT,
    } as any);

  it('sanity: the fixture has restraint_sought as a blocks_confirm item', () => {
    expect(checklist.find((i) => i.key === keyOf('restraint_sought'))?.blocksConfirm).toBe(true);
    expect(signedConfirmMessage('plaint_declaration', 'restraint_sought')).toBeNull();
  });

  it('in the O.39 pack it gets the O.39 signed line', () => {
    const b = briefIn(O39);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('required_fields');
    expect(b.confirm_blocking_keys).toEqual([keyOf('restraint_sought')]);
    expect(b.confirm_message).toBe(RESTRAINT_EN);
  });

  it.each(['plaint_declaration', 'plaint_injunction', 'plaint_partition', 'replication'])(
    'in %s it still blocks, but does not get the O.39 line (fails closed, no line)',
    (id) => {
      const b = briefIn(id);
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('required_fields');
      expect(b.confirm_blocking_keys).toEqual([keyOf('restraint_sought')]);
      expect(b.confirm_message ?? '').not.toContain(RESTRAINT_EN);
      expect(b.confirm_message ?? '').not.toContain(RELIEF_EN);
    },
  );

  it('in another pack the empty main_suit_relief also blocks without the O.39 line', () => {
    const b = buildBrief({
      kind: { id: 'plaint_declaration', name: 'x', court_document: true },
      checklist,
      values: values.filter((v) => v.key !== keyOf('main_suit_relief')),
      court: COURT,
    } as any);
    expect(b.confirm_blocking_keys).toEqual(
      expect.arrayContaining([keyOf('main_suit_relief'), keyOf('restraint_sought')]),
    );
    expect(b.confirm_message ?? '').not.toContain(RELIEF_EN);
    expect(b.confirm_message ?? '').not.toContain(RESTRAINT_EN);
  });

  it('a pack line for the pack still wins: plaint_partition other_defendants', () => {
    const partition = buildChecklist(loadRulePack('plaint_partition')!);
    const key = partition.find((i) => i.key.split('.').pop() === 'other_defendants')!.key;
    const pk = (n: string) => partition.find((i) => i.key.split('.').pop() === n)!.key;
    const b = buildBrief({
      kind: { id: 'plaint_partition', name: 'x', court_document: true },
      checklist: partition,
      values: [
        { key: pk('plaintiff_name'), value: 'Sample Person 1', source: 'user' },
        { key: pk('defendant_name'), value: 'Sample Person 2', source: 'user' },
      ],
      court: COURT,
    } as any);
    expect(b.confirm_blocking_keys).toContain(key);
    expect(b.confirm_message).toContain(OTHER_EN);
  });
});
