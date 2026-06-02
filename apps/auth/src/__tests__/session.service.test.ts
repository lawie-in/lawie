import './setupDb';

// Mock ioredis with ioredis-mock
jest.mock('ioredis', () => require('ioredis-mock'));

import redis from '../config/redis';
import {
  hashToken,
  createSession,
  validateSession,
  deleteSession,
  deleteAllUserSessions,
} from '../services/session.service';
import { Session } from '../models/Session.model';

const USER_ID = '507f1f77bcf86cd799439011';
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test-access-token';
const REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test-refresh-token';
const USER_INFO = { plan: 'free', email: 'test@test.com', role: 'Client', name: 'Test User' };

describe('Session Service', () => {
  afterEach(async () => {
    await redis.flushall();
  });

  describe('hashToken', () => {
    it('returns a deterministic SHA-256 hex string', () => {
      const hash1 = hashToken('my-token');
      const hash2 = hashToken('my-token');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('returns different hashes for different tokens', () => {
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createSession', () => {
    it('creates session keys in Redis with correct TTL', async () => {
      await createSession(USER_ID, ACCESS_TOKEN, REFRESH_TOKEN, USER_INFO);

      const accessHash = hashToken(ACCESS_TOKEN);
      const refreshHash = hashToken(REFRESH_TOKEN);

      const accessData = await redis.get(`session:${USER_ID}:${accessHash}`);
      expect(accessData).not.toBeNull();
      const parsed = JSON.parse(accessData!);
      expect(parsed.email).toBe('test@test.com');
      expect(parsed.plan).toBe('free');
      expect(parsed.refreshTokenHash).toBe(refreshHash);

      const refreshData = await redis.get(`session:refresh:${USER_ID}:${refreshHash}`);
      expect(refreshData).not.toBeNull();
      const refreshParsed = JSON.parse(refreshData!);
      expect(refreshParsed.accessTokenHash).toBe(accessHash);
    });

    it('creates a Session document in MongoDB', async () => {
      await createSession(USER_ID, ACCESS_TOKEN, REFRESH_TOKEN, USER_INFO, {
        ip: '127.0.0.1',
        userAgent: 'Jest',
      });

      const sessions = await Session.find({ userId: USER_ID });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].jwtTokenHash).toBe(hashToken(ACCESS_TOKEN));
      expect(sessions[0].refreshTokenHash).toBe(hashToken(REFRESH_TOKEN));
      expect(sessions[0].ipAddress).toBe('127.0.0.1');
      expect(sessions[0].userAgent).toBe('Jest');
      expect(sessions[0].isActive).toBe(true);
    });
  });

  describe('validateSession', () => {
    it('returns session data when session exists', async () => {
      await createSession(USER_ID, ACCESS_TOKEN, REFRESH_TOKEN, USER_INFO);

      const accessHash = hashToken(ACCESS_TOKEN);
      const result = await validateSession(USER_ID, accessHash);

      expect(result).not.toBeNull();
      expect(result!.email).toBe('test@test.com');
      expect(result!.plan).toBe('free');
    });

    it('returns null when session does not exist', async () => {
      const result = await validateSession(USER_ID, 'nonexistent-hash');
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('removes both Redis keys and MongoDB document', async () => {
      await createSession(USER_ID, ACCESS_TOKEN, REFRESH_TOKEN, USER_INFO);

      const accessHash = hashToken(ACCESS_TOKEN);
      const refreshHash = hashToken(REFRESH_TOKEN);

      await deleteSession(USER_ID, accessHash);

      // Redis keys should be gone
      const accessData = await redis.get(`session:${USER_ID}:${accessHash}`);
      expect(accessData).toBeNull();
      const refreshData = await redis.get(`session:refresh:${USER_ID}:${refreshHash}`);
      expect(refreshData).toBeNull();

      // MongoDB document should be gone
      const sessions = await Session.find({ userId: USER_ID });
      expect(sessions).toHaveLength(0);
    });
  });

  describe('deleteAllUserSessions', () => {
    it('removes all sessions for a user', async () => {
      // Create two sessions
      await createSession(USER_ID, 'token-a', 'refresh-a', USER_INFO);
      await createSession(USER_ID, 'token-b', 'refresh-b', USER_INFO);

      const sessionsBeforeDelete = await Session.find({ userId: USER_ID });
      expect(sessionsBeforeDelete).toHaveLength(2);

      await deleteAllUserSessions(USER_ID);

      // All Redis keys should be gone
      const accessA = await redis.get(`session:${USER_ID}:${hashToken('token-a')}`);
      const accessB = await redis.get(`session:${USER_ID}:${hashToken('token-b')}`);
      expect(accessA).toBeNull();
      expect(accessB).toBeNull();

      // All MongoDB documents should be gone
      const sessionsAfterDelete = await Session.find({ userId: USER_ID });
      expect(sessionsAfterDelete).toHaveLength(0);
    });
  });
});
