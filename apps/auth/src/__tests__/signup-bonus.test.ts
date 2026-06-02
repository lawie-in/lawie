import mongoose from 'mongoose';

import { User } from '../models/User.model';
import { grantSignupBonus, SIGNUP_BONUS_CREDITS } from '../services/credit-bonus.service';

import './setupDb';

describe('grantSignupBonus — SCRUM-100 idempotency + constant flip', () => {
  it('SIGNUP_BONUS_CREDITS equals 5 (not 10)', () => {
    expect(SIGNUP_BONUS_CREDITS).toBe(5);
  });

  it('grants exactly 5 credits on first call', async () => {
    const user = await User.create({
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
    });

    await grantSignupBonus(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.earnedCredits).toBe(5);
    expect(updated!.signupBonusGrantedAt).toBeInstanceOf(Date);
  });

  it('second call is a no-op — no double credit', async () => {
    const user = await User.create({
      email: 'test2@example.com',
      name: 'Test User 2',
      password: 'password123',
    });

    await grantSignupBonus(user._id.toString());
    await grantSignupBonus(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.earnedCredits).toBe(5);

    // Only one ledger row
    const ledgerRows = await mongoose.connection
      .db!.collection('creditledgers')
      .find({ userId: user._id, source: 'signup_bonus' })
      .toArray();
    expect(ledgerRows).toHaveLength(1);
  });

  it('handles invalid userId gracefully', async () => {
    await expect(grantSignupBonus('invalid')).resolves.toBeUndefined();
  });

  it('handles non-existent userId gracefully', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(grantSignupBonus(fakeId)).resolves.toBeUndefined();
  });
});
