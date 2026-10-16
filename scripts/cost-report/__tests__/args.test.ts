import { ArgsError, parseArgs, parseWindow } from '../lib/args';

const W = '2026-10-15T10:00:00+05:30/2026-10-15T11:00:00+05:30';
const USER = 'a1b2c3d4e5f6a7b8c9d0e1f2';

describe('cost-report args', () => {
  it('parses a labelled window', () => {
    const o = parseArgs(['--window', `anushka-1=${W}`]);
    expect(o.windows).toHaveLength(1);
    expect(o.windows[0].label).toBe('anushka-1');
    expect(o.windows[0].start.toISOString()).toBe('2026-10-15T04:30:00.000Z');
    expect(o.windows[0].end.toISOString()).toBe('2026-10-15T05:30:00.000Z');
    expect(o.user).toBeNull();
    expect(o.json).toBe(false);
    expect(o.includeFixtures).toBe(false);
  });

  it('defaults labels to w1, w2 for unlabelled windows (repeatable)', () => {
    const o = parseArgs(['--window', W, '--window', '2026-10-16T00:00:00Z/2026-10-17T00:00:00Z']);
    expect(o.windows.map((w) => w.label)).toEqual(['w1', 'w2']);
  });

  it('accepts --window=... form', () => {
    expect(parseArgs([`--window=x=${W}`]).windows[0].label).toBe('x');
  });

  it('accepts --user (24 hex), --json, --include-fixtures', () => {
    const o = parseArgs(['--window', W, '--user', USER, '--json', '--include-fixtures']);
    expect(o.user).toBe(USER);
    expect(o.json).toBe(true);
    expect(o.includeFixtures).toBe(true);
  });

  it.each(['abc', USER + 'a', 'g'.repeat(24), ''])('rejects invalid --user %p', (u) => {
    expect(() => parseArgs(['--window', W, `--user=${u}`])).toThrow(ArgsError);
  });

  it('rejects --user without a value', () => {
    expect(() => parseArgs(['--window', W, '--user'])).toThrow(/needs a value/);
  });

  it.each([
    ['no zone', '2026-10-15T10:00:00/2026-10-15T11:00:00'],
    ['not a range', '2026-10-15T10:00:00Z'],
    ['end before start', '2026-10-15T11:00:00Z/2026-10-15T10:00:00Z'],
    ['end equals start', '2026-10-15T10:00:00Z/2026-10-15T10:00:00Z'],
    ['garbage', 'foo/bar'],
    ['invalid date', '2026-13-45T10:00:00Z/2026-13-46T10:00:00Z'],
    ['bad label', 'bad label!=2026-10-15T10:00:00Z/2026-10-15T11:00:00Z'],
  ])('rejects invalid window: %s', (_n, spec) => {
    expect(() => parseArgs(['--window', spec])).toThrow(ArgsError);
  });

  it('requires at least one window', () => {
    expect(() => parseArgs([])).toThrow(/at least one --window/);
  });

  it('rejects duplicate labels and unknown flags', () => {
    expect(() => parseArgs(['--window', `a=${W}`, '--window', `a=${W}`])).toThrow(/duplicate/);
    expect(() => parseArgs(['--window', W, '--bogus'])).toThrow(/unknown argument/);
  });

  it('--help does not require a window', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('parseWindow uses the index for the default label', () => {
    expect(parseWindow(W, 4).label).toBe('w5');
  });
});
