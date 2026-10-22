// T-565 B5/W7: the pure routing of a refused start, shared by the form flow and the one flow.
import {
  CHECK_DOCUMENTS_LIST,
  NOT_ON_CURRENT_PLAN,
  SOMETHING_DID_NOT_WORK,
  generationFailureCopy,
  isPlanGate,
  refusedStartError,
} from '../generationFailure';

describe('isPlanGate', () => {
  it.each([
    [{ upgradeUrl: '/settings' }, true],
    [{ upgradeUrl: '' }, true],
    [{ error: 'This template requires a Pro plan' }, true],
    [{ error: 'Requires an Enterprise Plan' }, true],
    [{ error: 'requires a plan' }, true],
    [{ error: 'requires plan' }, false],
    [{ error: 'forbidden' }, false],
    [{ upgradeUrl: 5 }, false],
    [{ error: 5 }, false],
    [{}, false],
    [null, false],
    [undefined, false],
    ['requires a Pro plan', false],
    [42, false],
  ])('%j -> %s', (body, want) => {
    expect(isPlanGate(body)).toBe(want);
  });
});

describe('refusedStartError', () => {
  it('409: the documents-list line, not retryable, source start', () => {
    expect(refusedStartError(409, { message: 'x' })).toEqual({
      reason: CHECK_DOCUMENTS_LIST,
      retryable: false,
      source: 'start',
    });
  });

  it('403 plan gate: the plan line, not retryable', () => {
    expect(refusedStartError(403, { upgradeUrl: '/p' })).toEqual({
      reason: NOT_ON_CURRENT_PLAN,
      retryable: false,
      source: 'start',
    });
    expect(NOT_ON_CURRENT_PLAN).toBe('This document is not available on your current plan.');
  });

  it('a plan-gate-looking body on a non-403 status is not the plan line', () => {
    expect(refusedStartError(400, { upgradeUrl: '/p' }).reason).toBe(SOMETHING_DID_NOT_WORK);
    expect(refusedStartError(500, { error: 'requires a Pro plan' }).retryable).toBe(true);
  });

  it.each([
    [400, {}],
    [401, {}],
    [403, {}],
    [403, { error: 'forbidden' }],
    [404, null],
    [429, { message: 'Slow down' }],
    [500, { message: 'Busy' }],
    [503, undefined],
  ])('%s %j: the generic line, retryable, never the server text', (status, body) => {
    const e = refusedStartError(status, body);
    expect(e).toEqual({ reason: SOMETHING_DID_NOT_WORK, retryable: true, source: 'start' });
    expect(SOMETHING_DID_NOT_WORK).toBe('Something did not work. Try again.');
  });

  it('the card for a refused start is the reason as the heading, no Ink claim', () => {
    for (const s of [409, 403, 500]) {
      const c = generationFailureCopy(refusedStartError(s, s === 403 ? { upgradeUrl: '/p' } : {}));
      expect(c.noInkClaim).toBe(false);
      expect(c.statusLine).toBeNull();
      expect(c.detail).toBeNull();
      expect(c.headline).not.toBe('');
    }
  });
});

describe('generationFailureCopy with the empty reason (W13)', () => {
  it('error_event with no reason and no inkReleased: heading + documents line, no detail', () => {
    expect(generationFailureCopy({ reason: '', retryable: true, source: 'error_event' })).toEqual({
      headline: 'The draft did not finish.',
      statusLine: CHECK_DOCUMENTS_LIST,
      detail: null,
      noInkClaim: false,
    });
  });

  it('dropped with no reason: Connection lost alone', () => {
    expect(generationFailureCopy({ reason: '', retryable: true, source: 'dropped' })).toEqual({
      headline: 'Connection lost. Check your documents.',
      statusLine: null,
      detail: null,
      noInkClaim: false,
    });
  });
});
