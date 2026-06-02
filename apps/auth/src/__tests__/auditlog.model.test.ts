import './setupDb';

import mongoose from 'mongoose';

import { AuditLog } from '../models/AuditLog.model';

describe('AuditLog model', () => {
  const validLog = {
    userId: new mongoose.Types.ObjectId(),
    eventType: 'login' as const,
    severity: 'info' as const,
    ipAddress: '10.0.0.1',
    metadata: { browser: 'Chrome', os: 'macOS' },
  };

  it('creates an audit log with all fields', async () => {
    const log = await AuditLog.create(validLog);
    expect(log.eventType).toBe('login');
    expect(log.severity).toBe('info');
    expect(log.ipAddress).toBe('10.0.0.1');
    expect(log.metadata).toEqual({ browser: 'Chrome', os: 'macOS' });
    expect(log.createdAt).toBeDefined();
  });

  it('creates a system event without userId', async () => {
    const log = await AuditLog.create({
      eventType: 'login',
      severity: 'warning',
      metadata: { reason: 'suspicious IP' },
    });
    expect(log.userId).toBeNull();
    expect(log.eventType).toBe('login');
  });

  it('rejects missing eventType', async () => {
    await expect(AuditLog.create({ ...validLog, eventType: undefined })).rejects.toThrow(
      /eventType is required/,
    );
  });

  it('rejects invalid eventType', async () => {
    await expect(AuditLog.create({ ...validLog, eventType: 'invalid_event' })).rejects.toThrow(
      /is not a valid enum/,
    );
  });

  it('rejects invalid severity', async () => {
    await expect(AuditLog.create({ ...validLog, severity: 'debug' })).rejects.toThrow(
      /is not a valid enum/,
    );
  });

  it('defaults severity to info', async () => {
    const log = await AuditLog.create({
      eventType: 'payment',
    });
    expect(log.severity).toBe('info');
  });

  it('stores all event types', async () => {
    const types = [
      'login',
      'logout',
      'payment',
      'data_export',
      'account_delete',
      'password_change',
      'plan_change',
    ] as const;
    for (const eventType of types) {
      const log = await AuditLog.create({ eventType, severity: 'info' });
      expect(log.eventType).toBe(eventType);
    }
  });

  it('has 2-year TTL index on createdAt', () => {
    const indexes = AuditLog.schema.indexes();
    const ttlIndex = indexes.find(
      ([fields]) => (fields as Record<string, unknown>).createdAt !== undefined,
    );
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex![1]).toMatchObject({ expireAfterSeconds: 63072000 });
  });
});
