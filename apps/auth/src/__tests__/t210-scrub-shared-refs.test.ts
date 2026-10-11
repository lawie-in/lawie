/**
 * T-210 round 4 - scrubPii handles shared refs, cycles and depth.
 *   AC1/AC4  emails never survive scrubbing, even through shared refs and cycles
 *   AC4      keyValue dropped everywhere; name/code/keyPattern kept
 */

import './setupEnv';

import { scrubPii } from '../config/logger';

const EMAIL = 'jane.doe+x@example.com';

describe('scrubPii shared refs, cycles, depth', () => {
  it('scrubs a shared object in both places', () => {
    const keyPattern = { email: 1 };
    const out = scrubPii({
      keyPattern,
      errorResponse: { keyPattern, keyValue: { email: EMAIL } },
    }) as any;
    expect(out.keyPattern).toEqual({ email: 1 });
    expect(out.errorResponse.keyPattern).toEqual({ email: 1 });
    expect(out.errorResponse.keyValue).toBeUndefined();
  });

  it('handles a shared ref and a cycle in the same object, masking emails', () => {
    const shared = { note: `contact ${EMAIL}` };
    const root: any = { a: shared, b: shared, code: 11000 };
    root.self = root;
    const out = scrubPii(root) as any;
    expect(out.a).toEqual({ note: 'contact [email]' });
    expect(out.b).toEqual({ note: 'contact [email]' });
    expect(out.self).toBe('[Truncated]');
    expect(out.code).toBe(11000);
    expect(JSON.stringify(out)).not.toContain(EMAIL);
  });

  it('truncates very deep nesting without leaking the leaf', () => {
    let deep: any = { leaf: EMAIL };
    for (let i = 0; i < 10; i++) deep = { n: deep };
    const out = JSON.stringify(scrubPii(deep));
    expect(out).toContain('[Truncated]');
    expect(out).not.toContain(EMAIL);
  });

  it('documents: any `errors` object is reduced to {path,kind,message}', () => {
    const out = scrubPii({
      errors: { f: { path: 'p', kind: 'k', message: `bad ${EMAIL}`, value: EMAIL, other: 1 } },
    }) as any;
    expect(out.errors.f).toEqual({ path: 'p', kind: 'k', message: 'bad [email]' });
  });

  it('masks scalars and does not mutate input', () => {
    const input = { s: `x ${EMAIL}`, n: 1, nul: null };
    expect(scrubPii(input)).toEqual({ s: 'x [email]', n: 1, nul: null });
    expect(input.s).toContain(EMAIL);
  });
});
