/**
 * T-373: the boot check for signed skeletons (index.ts, loadSkeletonsAtBoot). index.ts runs bootstrap() on
 * import and does not export the function, so it cannot be imported. This file therefore:
 *  - runs the same loop (listRulePackIds + loadSkeleton over a directory) on the real _skeletons/ dir and on
 *    temp dirs, and
 *  - reads index.ts as text to pin that the check is called, and before app.listen.
 * What is NOT covered: process.exit(1) on a throw (the catch in bootstrap) is never executed here.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  clearSkeletonCache,
  listRulePackIds,
  loadSkeleton,
  RulePackError,
  SKELETONS_DIR,
} from '../services/rule-pack.service';

/** The loop of loadSkeletonsAtBoot, with the directory as a parameter. */
function bootLoop(dir: string): string[] {
  const loaded: string[] = [];
  for (const packId of listRulePackIds(dir)) {
    if (loadSkeleton(packId, dir) !== null) loaded.push(packId);
  }
  return loaded;
}

const realFile = (id: string): Record<string, any> =>
  // eslint-disable-line @typescript-eslint/no-explicit-any
  JSON.parse(readFileSync(join(SKELETONS_DIR, `${id}.json`), 'utf8'));

describe('boot check: the real _skeletons/ directory', () => {
  it('loads exactly the four signed skeletons, all valid', () => {
    clearSkeletonCache();
    expect(listRulePackIds(SKELETONS_DIR)).toEqual([
      'bail_anticipatory',
      'bail_before_magistrate',
      'bail_regular',
      'default_bail',
    ]);
    expect(loadSkeletonsOk()).toEqual([
      'bail_anticipatory',
      'bail_before_magistrate',
      'bail_regular',
      'default_bail',
    ]);
  });
});

function loadSkeletonsOk(): string[] {
  const out: string[] = [];
  for (const id of listRulePackIds(SKELETONS_DIR)) if (loadSkeleton(id) !== null) out.push(id);
  return out;
}

describe('boot check: a temp directory', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 't373-boot-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('an invalid skeleton makes the loop throw RulePackError (so boot exits before listen)', () => {
    const s = realFile('bail_regular');
    s.clauses[1].id = s.clauses[0].id; // duplicate clause id
    writeFileSync(join(tmp, 'bail_regular.json'), JSON.stringify(s));
    expect(() => bootLoop(tmp)).toThrow(RulePackError);
  });

  it('one bad file among good ones still throws; the good ones do not hide it', () => {
    writeFileSync(join(tmp, 'default_bail.json'), JSON.stringify(realFile('default_bail')));
    writeFileSync(join(tmp, 'bail_regular.json'), '{ not json');
    expect(() => bootLoop(tmp)).toThrow(RulePackError);
  });

  it('valid files load and are listed', () => {
    writeFileSync(join(tmp, 'default_bail.json'), JSON.stringify(realFile('default_bail')));
    expect(bootLoop(tmp)).toEqual(['default_bail']);
  });

  it('an empty directory loads none and does not throw', () => {
    expect(bootLoop(tmp)).toEqual([]);
  });

  it('a directory that does not exist is what existsSync guards in index.ts: listRulePackIds throws on it', () => {
    // So the guard in loadSkeletonsAtBoot (existsSync(SKELETONS_DIR)) is what makes "missing dir -> none" true.
    expect(() => listRulePackIds(join(tmp, 'absent'))).toThrow();
    mkdirSync(join(tmp, 'present'));
    expect(bootLoop(join(tmp, 'present'))).toEqual([]);
  });
});

describe('boot check: index.ts calls it before the service listens (source text)', () => {
  const src = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');

  it('the check is defined with the existsSync guard and uses listRulePackIds + loadSkeleton', () => {
    expect(src).toMatch(/function loadSkeletonsAtBoot\(\)/);
    expect(src).toMatch(/existsSync\(SKELETONS_DIR\)/);
    expect(src).toMatch(/listRulePackIds\(SKELETONS_DIR\)/);
    expect(src).toMatch(/loadSkeleton\(packId\)/);
  });

  it('it is called inside bootstrap, before app.listen, and inside the try that exits on error', () => {
    const call = src.indexOf('loadSkeletonsAtBoot();', src.indexOf('async function bootstrap'));
    const listen = src.indexOf('app.listen(');
    const exit = src.indexOf('process.exit(1)', src.indexOf('async function bootstrap'));
    expect(call).toBeGreaterThan(-1);
    expect(listen).toBeGreaterThan(call);
    expect(exit).toBeGreaterThan(listen);
  });
});
