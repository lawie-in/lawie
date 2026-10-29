/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-661 (Ajay, handoff/legal/T-650-party-fields-signed.md (3g) and (3h)): signed brief ask lines for
 * plaint_partition other_defendants and defendant_name. replication and written_statement keep the
 * generic T-127 line (3j). The signed strings are typed here on purpose, byte for byte; the test does
 * not read handoff/. Fictional data only. No model call, no network.
 */
import './setupEnv';
import './setupDb';

import {
  O39_CONFIRM_MESSAGES,
  PACK_CONFIRM_MESSAGES,
  signedConfirmMessage,
} from '../config/intake/o39-confirm-messages';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// ── Signed strings (T-650 (3g), (3h)) ───────────────────────────────────────
const OTHER_EN = 'Say whether there are other defendants to continue.';
const OTHER_HI = 'आगे बढ़ने के लिए बताइए कि क्या अन्य प्रतिवादी भी हैं।';
const DEF1_EN = 'Add the name of Defendant No. 1 to continue.';
const DEF1_HI = 'आगे बढ़ने के लिए प्रतिवादी संख्या 1 का नाम जोड़िए।';
const NO_LABEL = 'No, Defendant No. 1 is the only defendant';
const COMBINED = 'Choose the court and add the parties to continue.';

const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };
const NO_COURT = { state: null, court_type: null, court: null };
const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
const P1 = user('plaintiff_name', 'Sample Person 1');
const D1 = user('defendant_name', 'Sample Person 2');
const briefOf = (id: string, values: GivenValue[], court: any = COURT) =>
  buildBrief({
    kind: { id, name: id, court_document: true },
    checklist: buildChecklist(loadRulePack(id)!),
    values,
    court,
  } as any);

describe('T-661: PACK_CONFIRM_MESSAGES, byte for byte', () => {
  it('plaint_partition has exactly (3g) and (3h), EN and HI', () => {
    expect(Object.keys(PACK_CONFIRM_MESSAGES)).toEqual(['plaint_partition']);
    expect(PACK_CONFIRM_MESSAGES.plaint_partition).toEqual({
      other_defendants: { en: OTHER_EN, hi: OTHER_HI },
      defendant_name: { en: DEF1_EN, hi: DEF1_HI },
    });
  });

  it('signedConfirmMessage looks up pack then field, and is own-property safe', () => {
    expect(signedConfirmMessage('plaint_partition', 'other_defendants')).toEqual({
      en: OTHER_EN,
      hi: OTHER_HI,
    });
    expect(signedConfirmMessage('plaint_partition', 'defendant_name')?.en).toBe(DEF1_EN);
    expect(signedConfirmMessage('plaint_partition', 'constructor')).toBeNull();
    expect(signedConfirmMessage('plaint_partition', '__proto__')).toBeNull();
    expect(signedConfirmMessage('plaint_partition', 'toString')).toBeNull();
    expect(signedConfirmMessage('constructor', 'other_defendants')).toBeNull();
    expect(signedConfirmMessage('__proto__', 'defendant_name')).toBeNull();
    expect(signedConfirmMessage(null, 'other_defendants')).toBeNull();
    expect(signedConfirmMessage('replication', 'defendant_name')).toBeNull();
    expect(signedConfirmMessage('written_statement', 'plaintiff_name')).toBeNull();
    expect(signedConfirmMessage('plaint_partition', 'plaintiff_name')).toBeNull();
  });
});

describe('T-661: plaint_partition brief', () => {
  it('(3g) other_defendants unanswered: the signed EN line, exactly', () => {
    const b = briefOf('plaint_partition', [P1, D1]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('required_fields');
    expect(b.confirm_message).toBe(OTHER_EN);
    expect((b.confirm_blocking_keys ?? []).map((k) => k.split('.').pop())).toEqual([
      'other_defendants',
    ]);
  });

  it('(3h) defendant_name missing: the signed EN line first', () => {
    const b = briefOf('plaint_partition', [P1, user('other_defendants', NO_LABEL)]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_message).toBe(DEF1_EN);
  });

  it('both missing: the party line, then the blocker line', () => {
    const b = briefOf('plaint_partition', [P1]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toEqual(expect.arrayContaining(['parties', 'required_fields']));
    expect(b.confirm_message).toBe(`${DEF1_EN}\n${OTHER_EN}`);
  });

  it('both answered: nothing blocks', () => {
    const b = briefOf('plaint_partition', [P1, D1, user('other_defendants', NO_LABEL)]);
    expect(b.confirm_blockers).toEqual([]);
    expect(b.confirm_message).toBeNull();
    expect(b.can_confirm).toBe(true);
  });

  it('court and a party both missing: still the combined T-127 line', () => {
    const b = briefOf('plaint_partition', [P1, user('other_defendants', NO_LABEL)], NO_COURT);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(COMBINED);
  });

  it('court missing only: the T-127 court line', () => {
    const b = briefOf('plaint_partition', [P1, D1, user('other_defendants', NO_LABEL)], NO_COURT);
    expect(b.confirm_message).toBe('Choose the court to continue.');
  });
});

describe('T-661: replication and written_statement keep the generic T-127 line', () => {
  it('replication, defendant missing', () => {
    const b = briefOf('replication', [P1]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message!.split('\n')[0]).toBe('Add the name of the defendant to continue.');
    expect(b.confirm_message).not.toContain(DEF1_EN);
  });

  it('written_statement, plaintiff missing', () => {
    const b = briefOf('written_statement', [D1]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message!.split('\n')[0]).toBe('Add the name of the plaintiff to continue.');
  });

  it.each(['replication', 'written_statement'])(
    '%s, court and a party missing: combined line',
    (id) => {
      const b = briefOf(id, [], NO_COURT);
      expect(b.confirm_message).toBe(COMBINED);
    },
  );

  it.each(['replication', 'written_statement'])('%s, all held: nothing blocks', (id) => {
    const b = briefOf(id, [P1, D1]);
    expect(b.confirm_blockers).toEqual([]);
    expect(b.can_confirm).toBe(true);
  });
});

describe('T-661: O.39 is unchanged', () => {
  const O39 = 'temporary_injunction_o39';
  it('AJ-644-M1 party lines, then the relief and restraint lines', () => {
    const b = briefOf(O39, []);
    expect(b.confirm_message).toBe(
      [
        "Add the plaintiff's name to continue.",
        "Add the defendant's name to continue.",
        O39_CONFIRM_MESSAGES.main_suit_relief.en,
        O39_CONFIRM_MESSAGES.restraint_sought.en,
      ].join('\n'),
    );
    expect(b.confirm_message).not.toContain(DEF1_EN);
  });
});
