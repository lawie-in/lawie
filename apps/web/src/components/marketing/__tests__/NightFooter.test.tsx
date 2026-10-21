// T-517 (AJ-517-M8, M11): the grievance line in the Night Library footer. The officer's name is
// read from NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME only; unset (or blank) gives the fallback.
import { NightFooter } from '../NightFooter';
import { grievanceLine, grievanceOfficerName } from '../nl-copy';

import { cleanupMounted, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

const KEY = 'NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME';
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
let saved: string | undefined;

beforeEach(() => {
  saved = process.env[KEY];
  delete process.env[KEY];
});
afterEach(() => {
  cleanupMounted();
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

const line = () => q('[data-grievance-line]')!;

describe('NightFooter grievance line', () => {
  it('falls back to "For complaints, write to contact@lawie.in." without the env', () => {
    mount(<NightFooter />);
    expect(norm(line().textContent)).toBe('For complaints, write to contact@lawie.in.');
    expect(norm(q('footer')!.textContent)).not.toContain('Grievance Officer');
  });

  it('shows the full M11 line when the name is set', () => {
    process.env[KEY] = 'Asha Rao';
    mount(<NightFooter />);
    expect(norm(line().textContent)).toBe(
      'Grievance Officer: Asha Rao. Email: contact@lawie.in. We acknowledge every complaint within 24 hours and resolve it within 15 days.',
    );
  });

  it('trims the name; a blank value is the same as unset', () => {
    process.env[KEY] = '  Asha Rao  ';
    expect(grievanceOfficerName()).toBe('Asha Rao');
    process.env[KEY] = '   ';
    expect(grievanceOfficerName()).toBeUndefined();
    mount(<NightFooter />);
    expect(norm(line().textContent)).toBe('For complaints, write to contact@lawie.in.');
  });

  it('links the email with mailto, in both states', () => {
    mount(<NightFooter />);
    expect(qa('a', line()).map((a) => a.getAttribute('href'))).toEqual(['mailto:contact@lawie.in']);
    cleanupMounted();
    process.env[KEY] = 'Asha Rao';
    mount(<NightFooter />);
    expect(qa('a', line()).map((a) => a.getAttribute('href'))).toEqual(['mailto:contact@lawie.in']);
  });

  it('never names the old privacy@lawie.in and has no Grievance Officer link', () => {
    mount(<NightFooter />);
    expect(q('footer')!.innerHTML).not.toContain('privacy@lawie.in');
    expect(qa('a').some((a) => /grievance/i.test(a.textContent ?? ''))).toBe(false);
  });

  it('grievanceLine() takes an explicit name', () => {
    expect(grievanceLine('X Y').before).toBe('Grievance Officer: X Y. Email: ');
    expect(grievanceLine(undefined)).toEqual({
      before: 'For complaints, write to ',
      email: 'contact@lawie.in',
      after: '.',
    });
  });

  it('has the disclaimer, Privacy / Terms / Refunds links and cookie settings', () => {
    mount(<NightFooter />);
    const f = q('footer')!;
    expect(qa('a', f).map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/privacy', '/terms', '/refunds']),
    );
    expect(norm(f.textContent)).toContain(
      'The advocate is responsible for legal accuracy and filing.',
    );
    expect(qa('button', f)).toHaveLength(1);
  });
});
