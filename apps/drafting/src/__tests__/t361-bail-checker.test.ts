/**
 * T-361: the bail checker shows Ajay's signed 303 / 303(2) punishment line and note, keeps
 * the ranking by maximum with 303 at 3 years, and reminds a bare number to add the code.
 * Expected texts are written out from the signed text, not read from the JSON.
 */
import './setupEnv';
import './setupDb';

import fs from 'fs';
import path from 'path';

import { checkBailEligibility, readBailInputs } from '../services/bail-check.service';
import { CODE_REMINDER, resolveOffence } from '../services/bns-offence-resolver';

const PUNISHMENT =
  'Up to 3 years, or fine, or both. On a second or later conviction: rigorous imprisonment of 1 to 5 years, and fine.';
const NOTE =
  'Where the property is worth less than ₹5,000, it is a first conviction, and the property is returned or its value restored, the punishment is community service.';
const VARIANT_PUNISHMENT =
  'Community service, where it is a first conviction and the property is returned or its value restored.';

describe('T-361 AC2: 303 and 303(2) show the signed line and note', () => {
  it.each(['303', '303(2)', 'BNS 303(2)', 'BNS 303'])(
    '%s: punishment, note, max 3 years',
    async (text) => {
      // The route reads the text with readBailInputs; "BNS 303(2)" becomes "303(2)-BNS".
      const r = await checkBailEligibility(readBailInputs(text));
      const o = r.sections[0].offence;
      expect(r.sections[0].found).toBe(true);
      expect(o?.punishment).toBe(PUNISHMENT);
      expect(o?.note).toBe(NOTE);
      expect(o?.maxYears).toBe(3);
    },
  );

  it.each(['303', '303(2)'])('%s resolves to the new line (resolver level)', (key) => {
    const r = resolveOffence(key);
    expect(r.punishment).toBe(PUNISHMENT);
    expect(r.punishmentNote).toBe(NOTE);
    expect(r.maxYears).toBe(3);
  });

  it('the 303(2) variant text is the signed community-service line', () => {
    const file = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'config', 'bns-offences.json'), 'utf8'),
    ) as { offences: Record<string, { variants?: Record<string, { punishment: string }> }> };
    const rows = file.offences;
    expect(rows['303'].variants?.['303(2)'].punishment).toBe(VARIANT_PUNISHMENT);
  });
});

describe('T-361: ranking by maximum with 303 at 3 years', () => {
  it('303 outranks 115 (1 year)', async () => {
    const r = await checkBailEligibility(['115', '303']);
    expect(r.summary.mostSeriousSection).toBe('303');
  });

  it('318(4) (7 years) outranks 303 (3 years)', async () => {
    const r = await checkBailEligibility(['303', '318(4)']);
    expect(r.summary.mostSeriousSection).toBe('318(4)');
  });

  it('303 alone is the most serious and gets the 303 line', async () => {
    const r = await checkBailEligibility(['303']);
    expect(r.summary.mostSeriousSection).toBe('303');
    expect(r.summary.maxPunishment).toBe(PUNISHMENT);
  });
});

describe('T-361 AC4: bare number reminder', () => {
  it('a bare number gets the reminder', async () => {
    const r = await checkBailEligibility(['351']);
    expect(CODE_REMINDER).toBe('Add the code before the number, for example BNS 351 or IPC 351.');
    expect(r.sections[0].codeReminder).toBe(
      'Add the code before the number, for example BNS 351 or IPC 351.',
    );
  });

  it('a coded input gets no reminder', async () => {
    const r = await checkBailEligibility(readBailInputs('BNS 351, IPC 351'));
    expect(r.sections[0].codeReminder).toBeUndefined();
    expect(r.sections[1].codeReminder).toBeUndefined();
  });
});
