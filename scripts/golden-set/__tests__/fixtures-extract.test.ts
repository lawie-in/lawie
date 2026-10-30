/**
 * T-683: checkFixture accepts recorded.*.extract as a string or a non-empty
 * list of strings, and rejects anything else.
 */
import { checkFixture, loadFixtures } from '../lib/fixtures';
import { Fixture } from '../lib/types';

const base = (): Fixture => JSON.parse(JSON.stringify(loadFixtures()[0])) as Fixture;

function withExtract(extract: unknown): string[] {
  const f = base();
  f.recorded = {
    clean: { reception: 'r', extract: extract as string, drafter: 'd' },
  };
  return checkFixture(f);
}

describe('checkFixture: recorded extract', () => {
  it('a string loads', () => expect(withExtract('{"facts":[]}')).toEqual([]));
  it('a non-empty list of strings loads', () =>
    expect(withExtract(['{"facts":[]}', '{"facts":[]}'])).toEqual([]));
  it('an empty list is rejected', () =>
    expect(withExtract([]).join(';')).toMatch(/needs reception, extract and drafter/));
  it.each([[[1, 2]], [['ok', 3]], [null], [undefined], [42], [{}]])(
    'a non-string %j is rejected',
    (v) => expect(withExtract(v).join(';')).toMatch(/needs reception, extract and drafter/),
  );
  it('the shipped fixtures, cassettes 29-38 included, all load', () => {
    expect(loadFixtures().filter((f) => /^(29|3[0-8])-/.test(f.id))).toHaveLength(10);
  });
});
