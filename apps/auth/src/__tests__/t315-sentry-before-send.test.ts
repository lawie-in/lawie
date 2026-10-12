import type * as Sentry from '@sentry/node';

import { beforeSend } from '../config/sentry';

// T-315 — a body-parser or JSON.parse message must never reach Sentry from auth.

const SECRET = 'Sup3rS3cret';
const values = (e: Sentry.ErrorEvent) => (e.exception?.values ?? []).map((v) => v.value);
const mk = (...msgs: string[]) =>
  ({
    exception: { values: msgs.map((value) => ({ type: 'SyntaxError', value })) },
  }) as unknown as Sentry.ErrorEvent;

describe('T-315 auth beforeSend', () => {
  it.each([
    'entity.parse.failed',
    'entity.too.large',
    'encoding.unsupported',
    'charset.unsupported',
    'parameters.too.many',
    'querystring.parse.rangeError',
  ])('body-parser error %s: value replaced, event kept', (type) => {
    const err = Object.assign(new SyntaxError(`Unexpected token } "{"password": "${SECRET}"`), {
      type,
      body: `{"password":"${SECRET}"`,
    });
    const out = beforeSend(mk(err.message, `wrapped ${SECRET}`), {
      originalException: err,
    });
    expect(out).not.toBeNull();
    expect(values(out)).toEqual([
      `Request body rejected (${type})`,
      `Request body rejected (${type})`,
    ]);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it.each([
    `Unexpected token 'p', "{"password": ${SECRET}"... is not valid JSON`,
    `Unexpected token } in JSON at position 5 ${SECRET}`,
    `Unexpected end of JSON input ${SECRET}`,
    `Expected property name or '}' in JSON at position 1 (${SECRET})`,
  ])('plain JSON.parse SyntaxError is redacted: %#', (msg) => {
    const out = beforeSend(mk(msg), { originalException: new SyntaxError(msg) });
    expect(values(out)).toEqual(['JSON parse error (message redacted)']);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('JSON.parse message is redacted even with no hint', () => {
    const out = beforeSend(mk(`Unexpected token x, "${SECRET}" is not valid JSON`));
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('unrelated errors keep their message; T-210 email masking still runs', () => {
    const out = beforeSend(mk('connect ECONNREFUSED user@example.com'), {
      originalException: new Error('x'),
    });
    expect(values(out)[0]).toContain('ECONNREFUSED');
    expect(values(out)[0]).not.toContain('user@example.com');
  });

  it('a type of "constructor" is not treated as a body-parser type', () => {
    const out = beforeSend(mk('boom'), {
      originalException: Object.assign(new Error('boom'), { type: 'constructor' }),
    });
    expect(values(out)).toEqual(['boom']);
  });
});
