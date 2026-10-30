import mongoose from 'mongoose';

import { User } from '../models/User.model';
import { grantSignupBonus } from '../services/credit-bonus.service';

import './setupDb';

// T-652: the +5 earnedCredits signup grant is gone; only the once-only free Ink seed remains.
describe('grantSignupBonus — SCRUM-100 idempotency, T-652 Ink-only', () => {
  const users = () => mongoose.connection.db!.collection('users');
  const ink = () => mongoose.connection.db!.collection('inkledger');

  it('first call seeds 10 Ink units, stamps the marker, grants no earnedCredits', async () => {
    const user = await User.create({
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      emailVerified: true,
    });

    await grantSignupBonus(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.earnedCredits ?? 0).toBe(0);
    expect(updated!.signupBonusGrantedAt).toBeInstanceOf(Date);
    expect((await users().findOne({ _id: user._id }))!.inkTopup).toBe(10);
  });

  it('second call is a no-op — no double Ink, no creditledger row ever', async () => {
    const user = await User.create({
      email: 'test2@example.com',
      name: 'Test User 2',
      password: 'password123',
      emailVerified: true,
    });

    await grantSignupBonus(user._id.toString());
    await grantSignupBonus(user._id.toString());

    expect((await users().findOne({ _id: user._id }))!.inkTopup).toBe(10);
    expect(await ink().countDocuments({ userId: user._id, reason: 'free_seed' })).toBe(1);
    expect(
      await mongoose.connection
        .db!.collection('creditledgers')
        .countDocuments({ userId: user._id }),
    ).toBe(0);
  });

  it('handles invalid userId gracefully', async () => {
    await expect(grantSignupBonus('invalid')).resolves.toBeUndefined();
  });

  it('handles non-existent userId gracefully', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(grantSignupBonus(fakeId)).resolves.toBeUndefined();
  });
});
