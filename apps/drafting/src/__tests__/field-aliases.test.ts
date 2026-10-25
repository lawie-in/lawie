import { FIELD_ALIASES, applyFieldAliases } from '../services/rule-pack.service';

describe('FIELD_ALIASES (T-382)', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(FIELD_ALIASES)).toBe(true);
  });

  it('ignores assignment, addition and deletion', () => {
    const m = FIELD_ALIASES as Record<string, string>;
    try {
      m.advocate_enrolment = 'x';
    } catch {
      /* strict mode throws; either way the map must not change */
    }
    try {
      m.extra = 'y';
    } catch {
      /* ignore */
    }
    try {
      m.bhajan_lal_categories_invoked = 'z';
    } catch {
      /* ignore */
    }
    try {
      delete m.advocate_enrolment;
    } catch {
      /* ignore */
    }
    try {
      delete m.bhajan_lal_categories_invoked;
    } catch {
      /* ignore */
    }
    try {
      m.statutory_duty = 'z';
    } catch {
      /* ignore */
    }
    try {
      delete m.statutory_duty;
    } catch {
      /* ignore */
    }
    expect(FIELD_ALIASES).toEqual({
      advocate_enrolment: 'advocate_enrollment',
      bhajan_lal_categories_invoked: 'quashing_categories_invoked',
      statutory_duty: 'statute_invoked',
    });
  });

  it('has exactly three keys (T-382, T-451 and T-489), in order', () => {
    expect(Object.keys(FIELD_ALIASES)).toEqual([
      'advocate_enrolment',
      'bhajan_lal_categories_invoked',
      'statutory_duty',
    ]);
    expect(FIELD_ALIASES.advocate_enrolment).toBe('advocate_enrollment');
    expect(FIELD_ALIASES.bhajan_lal_categories_invoked).toBe('quashing_categories_invoked');
    expect(FIELD_ALIASES.statutory_duty).toBe('statute_invoked');
  });

  it('guard: holds none of the SLOT_ALIASES keys (Arjun ruling 8cfbce3)', () => {
    const forbidden = [
      'father_name',
      'address',
      'sections_charged',
      'applicant_parentage',
      'applicant_address',
      'offences_alleged',
    ];
    for (const k of forbidden) {
      expect(Object.keys(FIELD_ALIASES)).not.toContain(k);
      expect(Object.values(FIELD_ALIASES)).not.toContain(k);
    }
  });
});

describe('applyFieldAliases (T-382)', () => {
  it('copies old -> new when old is present and new is absent', () => {
    expect(applyFieldAliases({ advocate_enrolment: 'D/1/2020' })).toEqual({
      advocate_enrolment: 'D/1/2020',
      advocate_enrollment: 'D/1/2020',
    });
  });

  it('keeps new when present with a different value', () => {
    const out = applyFieldAliases({ advocate_enrolment: 'old', advocate_enrollment: 'new' });
    expect(out.advocate_enrollment).toBe('new');
  });

  it('does not overwrite new when it is explicitly undefined', () => {
    const out = applyFieldAliases({ advocate_enrolment: 'old', advocate_enrollment: undefined });
    expect(out.advocate_enrollment).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, 'advocate_enrollment')).toBe(true);
  });

  it('does not overwrite new when it is null', () => {
    const out = applyFieldAliases({ advocate_enrolment: 'old', advocate_enrollment: null });
    expect(out.advocate_enrollment).toBeNull();
  });

  it('keeps old', () => {
    const out = applyFieldAliases({ advocate_enrolment: 'old' });
    expect(out.advocate_enrolment).toBe('old');
    const both = applyFieldAliases({ advocate_enrolment: 'old', advocate_enrollment: 'new' });
    expect(both.advocate_enrolment).toBe('old');
  });

  it('copies an undefined/null old value when old is an own property', () => {
    const out = applyFieldAliases({ advocate_enrolment: null });
    expect(out).toEqual({ advocate_enrolment: null, advocate_enrollment: null });
  });

  it('leaves data without the old key unchanged', () => {
    expect(applyFieldAliases({ a: 1 })).toEqual({ a: 1 });
    expect(applyFieldAliases({ advocate_enrollment: 'n' })).toEqual({ advocate_enrollment: 'n' });
  });

  it('does not mutate the input', () => {
    const input = { advocate_enrolment: 'old', nested: { a: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    applyFieldAliases(input);
    expect(input).toEqual(snapshot);
    expect(Object.keys(input)).toEqual(['advocate_enrolment', 'nested']);
  });

  it('works on frozen input without throwing or mutating', () => {
    const input = Object.freeze({ advocate_enrolment: 'old' });
    let out: Record<string, unknown> = {};
    expect(() => {
      out = applyFieldAliases(input);
    }).not.toThrow();
    expect(out.advocate_enrollment).toBe('old');
    expect(input).toEqual({ advocate_enrolment: 'old' });
    expect(Object.isFrozen(out)).toBe(false);
  });

  it('returns a copy, not the same reference (even with nothing to alias)', () => {
    const a = { x: 1 };
    expect(applyFieldAliases(a)).not.toBe(a);
    expect(applyFieldAliases(a)).toEqual(a);
    const b = { advocate_enrolment: 'o' };
    expect(applyFieldAliases(b)).not.toBe(b);
  });

  it('is shallow: nested values are shared by reference', () => {
    const nested = { k: 1 };
    const out = applyFieldAliases({ nested });
    expect(out.nested).toBe(nested);
  });

  it('returns a new {} for null and undefined', () => {
    const n = applyFieldAliases(null as unknown as Record<string, unknown>);
    const u = applyFieldAliases(undefined as unknown as Record<string, unknown>);
    expect(n).toEqual({});
    expect(u).toEqual({});
    expect(n).not.toBe(u);
  });

  it('returns arrays unchanged (same reference)', () => {
    const arr = [{ advocate_enrolment: 'x' }];
    expect(applyFieldAliases(arr as unknown as Record<string, unknown>)).toBe(arr);
    expect(arr).toEqual([{ advocate_enrolment: 'x' }]);
  });

  it('returns other non-objects unchanged', () => {
    expect(applyFieldAliases('abc' as unknown as Record<string, unknown>)).toBe('abc');
    expect(applyFieldAliases(42 as unknown as Record<string, unknown>)).toBe(42);
    expect(applyFieldAliases(true as unknown as Record<string, unknown>)).toBe(true);
  });

  it('does not treat an inherited old key as present', () => {
    const proto = { advocate_enrolment: 'inherited' };
    const input = Object.create(proto) as Record<string, unknown>;
    const out = applyFieldAliases(input);
    expect(Object.prototype.hasOwnProperty.call(out, 'advocate_enrollment')).toBe(false);
  });

  it('does not treat an inherited new key as present', () => {
    const proto = { advocate_enrollment: 'inherited' };
    const input = Object.create(proto) as Record<string, unknown>;
    input.advocate_enrolment = 'own-old';
    const out = applyFieldAliases(input);
    expect(Object.prototype.hasOwnProperty.call(out, 'advocate_enrollment')).toBe(true);
    expect(out.advocate_enrollment).toBe('own-old');
  });
});
