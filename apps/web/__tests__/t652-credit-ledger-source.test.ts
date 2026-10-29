/**
 * @jest-environment node
 */
// T-652: there is no component harness for the admin credit-ledger page (it needs auth and fetch
// wiring), so this is a source-level guard, like tailwind-content: the Granted tab asks the ledger
// route for every grant source, historic ones included, and the Earned bucket note says accrual
// stopped. The route side (comma list, allow-list) is tested in apps/drafting t652-credits-routes.
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../src/app/admin/credit-ledger/page.tsx'),
  'utf8',
);

describe('T-652 admin credit-ledger page', () => {
  it('the Granted tab sends the comma-separated list of every grant source', () => {
    const m = SRC.match(/granted:\s*'([^']+)'/);
    expect(m).not.toBeNull();
    expect(m![1].split(',').sort()).toEqual(
      [
        'signup_bonus',
        'login_bonus',
        'rating_bonus',
        'plan_renewal',
        'topup_purchase',
        'admin_grant',
      ].sort(),
    );
    expect(m![1]).not.toMatch(/\s/);
  });

  it('the Earned bucket note says accrual stopped, and no longer advertises login/rating', () => {
    expect(SRC).toContain('Legacy · accrual stopped (T-652)');
    expect(SRC).not.toContain('Login · rating · permanent');
  });

  it('the historic sources keep a label so old rows still read', () => {
    for (const s of ['signup_bonus', 'login_bonus', 'rating_bonus']) {
      expect(SRC).toMatch(new RegExp(`${s}:\\s*['"{]`));
    }
  });
});
