import './setupDb';

import { User } from '../models/User.model';

describe('User model', () => {
  const validUser = {
    email: 'adv.sharma@example.com',
    password: 'securepass123',
    name: 'Rakesh Sharma',
    role: 'Lawyer' as const,
  };

  it('creates a user with required fields', async () => {
    const user = await User.create(validUser);
    expect(user.email).toBe('adv.sharma@example.com');
    expect(user.name).toBe('Rakesh Sharma');
    expect(user.plan).toBe('free');
    expect(user.isActive).toBe(true);
    expect(user.emailVerified).toBe(false);
    expect(user.authProvider).toBe('email');
    expect(user.practiceAreas).toEqual([]);
    expect(user.docCount).toBe(0);
  });

  it('hashes password on save', async () => {
    const user = await User.create(validUser);
    const raw = await User.findById(user._id).select('+password');
    expect(raw!.password).not.toBe('securepass123');
    expect(raw!.password).toMatch(/^\$2[ab]\$/);
  });

  it('comparePassword returns true for correct password', async () => {
    const user = await User.create(validUser);
    const raw = await User.findById(user._id).select('+password');
    const match = await raw!.comparePassword('securepass123');
    expect(match).toBe(true);
  });

  it('comparePassword returns false for wrong password', async () => {
    const user = await User.create(validUser);
    const raw = await User.findById(user._id).select('+password');
    const match = await raw!.comparePassword('wrongpassword');
    expect(match).toBe(false);
  });

  it('rejects duplicate email', async () => {
    await User.create(validUser);
    await expect(User.create({ ...validUser })).rejects.toThrow(/duplicate key/i);
  });

  it('rejects missing email', async () => {
    await expect(User.create({ ...validUser, email: undefined })).rejects.toThrow(
      /Email is required/,
    );
  });

  it('rejects missing name', async () => {
    await expect(
      User.create({ ...validUser, name: undefined, email: 'another@example.com' }),
    ).rejects.toThrow(/Name is required/);
  });

  it('rejects invalid email format', async () => {
    await expect(User.create({ ...validUser, email: 'not-an-email' })).rejects.toThrow(
      /Invalid email format/,
    );
  });

  it('rejects invalid phone format', async () => {
    await expect(
      User.create({ ...validUser, email: 'phone@test.com', phone: '12345' }),
    ).rejects.toThrow(/Phone must be/);
  });

  it('accepts valid phone +91XXXXXXXXXX', async () => {
    const user = await User.create({
      ...validUser,
      email: 'phone2@test.com',
      phone: '+919876543210',
    });
    expect(user.phone).toBe('+919876543210');
  });

  it('rejects invalid plan value', async () => {
    await expect(
      User.create({ ...validUser, email: 'plan@test.com', plan: 'enterprise' }),
    ).rejects.toThrow(/is not a valid enum/);
  });

  it('stores new fields: state, practiceAreas, yearsOfExperience', async () => {
    const user = await User.create({
      ...validUser,
      email: 'fields@test.com',
      state: 'Delhi',
      practiceAreas: ['criminal', 'civil'],
      yearsOfExperience: 10,
    });
    expect(user.state).toBe('Delhi');
    expect(user.practiceAreas).toEqual(['criminal', 'civil']);
    expect(user.yearsOfExperience).toBe(10);
  });

  it('stores plan dates', async () => {
    const now = new Date();
    const user = await User.create({
      ...validUser,
      email: 'plandate@test.com',
      plan: 'pro',
      planStartedAt: now,
      planExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });
    expect(user.planStartedAt).toEqual(now);
    expect(user.planExpiresAt).toBeDefined();
  });

  it('creates Google OAuth user without password', async () => {
    const user = await User.create({
      email: 'google@test.com',
      name: 'Google User',
      authProvider: 'google',
    });
    expect(user.authProvider).toBe('google');
    expect(user.password).toBeUndefined();
  });
});
