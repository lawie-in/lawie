// T-634: the Court model's courtType enum lists every type the courts seed carries.
import fs from 'fs';
import path from 'path';

import { Court } from '../models/Court.model';

const seed = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'courts', 'indian-courts.json'), 'utf8'),
) as { courts: Array<{ courtId: string; courtType: string }> };

function make(courtType: string) {
  return new Court({
    courtId: 'c1',
    name: 'n',
    designation: 'd',
    courtType,
    state: 's',
    stateId: 'sid',
    city: 'x',
    formattingRulesRef: 'r',
  });
}

describe('T-634 Court model courtType enum', () => {
  const allowed: string[] = (Court.schema.path('courtType') as unknown as { enumValues: string[] })
    .enumValues;

  it('contains every courtType in indian-courts.json', () => {
    expect(seed.courts.length).toBeGreaterThan(0);
    const missing = [...new Set(seed.courts.map((c) => c.courtType))].filter(
      (t) => !allowed.includes(t),
    );
    expect(missing).toEqual([]);
  });

  it.each(['civil_court_junior', 'supreme_court', 'tribunal', 'high_court_bench'])(
    'accepts %s',
    (t) => {
      expect(make(t).validateSync()).toBeUndefined();
    },
  );

  it('rejects an unknown type', () => {
    const err = make('not_a_court').validateSync();
    expect(err?.errors.courtType).toBeDefined();
  });
});
