import './setupDb';

import mongoose from 'mongoose';

import { Session } from '../models/Session.model';

describe('Session model', () => {
  beforeAll(async () => {
    await Session.syncIndexes();
  });

  const validSession = {
    userId: new mongoose.Types.ObjectId(),
    jwtTokenHash: 'sha256_hash_of_jwt_token_abc123',
    refreshTokenHash: 'sha256_hash_of_refresh_token_def456',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    deviceType: 'web' as const,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  };

  it('creates a session with all fields', async () => {
    const session = await Session.create(validSession);
    expect(session.userId.toString()).toBe(validSession.userId.toString());
    expect(session.jwtTokenHash).toBe(validSession.jwtTokenHash);
    expect(session.refreshTokenHash).toBe(validSession.refreshTokenHash);
    expect(session.isActive).toBe(true);
    expect(session.deviceType).toBe('web');
    expect(session.lastActivityAt).toBeDefined();
  });

  it('rejects missing userId', async () => {
    await expect(Session.create({ ...validSession, userId: undefined })).rejects.toThrow(
      /userId is required/,
    );
  });

  it('rejects missing jwtTokenHash', async () => {
    await expect(Session.create({ ...validSession, jwtTokenHash: undefined })).rejects.toThrow(
      /jwtTokenHash is required/,
    );
  });

  it('rejects missing expiresAt', async () => {
    await expect(
      Session.create({ ...validSession, jwtTokenHash: 'unique1', expiresAt: undefined }),
    ).rejects.toThrow(/expiresAt is required/);
  });

  it('enforces unique jwtTokenHash', async () => {
    await Session.create(validSession);
    await expect(Session.create({ ...validSession })).rejects.toThrow(/duplicate key/i);
  });

  it('defaults deviceType to web', async () => {
    const session = await Session.create({
      ...validSession,
      jwtTokenHash: 'unique_hash_2',
      deviceType: undefined,
    });
    expect(session.deviceType).toBe('web');
  });

  it('allows mobile deviceType', async () => {
    const session = await Session.create({
      ...validSession,
      jwtTokenHash: 'unique_hash_3',
      deviceType: 'mobile',
    });
    expect(session.deviceType).toBe('mobile');
  });

  it('has TTL index on expiresAt', () => {
    const indexes = Session.schema.indexes();
    const ttlIndex = indexes.find(
      ([fields]) => (fields as Record<string, unknown>).expiresAt !== undefined,
    );
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex![1]).toMatchObject({ expireAfterSeconds: 0 });
  });
});
