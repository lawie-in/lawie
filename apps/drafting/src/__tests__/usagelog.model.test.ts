import './setupDb';

import mongoose from 'mongoose';

import { UsageLog } from '../models/UsageLog.model';

describe('UsageLog model', () => {
  const validLog = {
    userId: new mongoose.Types.ObjectId(),
    action: 'ai_generation' as const,
    documentId: new mongoose.Types.ObjectId(),
    monthYear: '2026-04',
    tokensUsed: 2048,
    costInr: 0.35,
  };

  it('creates a usage log with all fields', async () => {
    const log = await UsageLog.create(validLog);
    expect(log.action).toBe('ai_generation');
    expect(log.monthYear).toBe('2026-04');
    expect(log.tokensUsed).toBe(2048);
    expect(log.costInr).toBe(0.35);
    expect(log.createdAt).toBeDefined();
  });

  it('rejects missing userId', async () => {
    await expect(UsageLog.create({ ...validLog, userId: undefined })).rejects.toThrow(
      /userId is required/,
    );
  });

  it('rejects missing action', async () => {
    await expect(UsageLog.create({ ...validLog, action: undefined })).rejects.toThrow(
      /action is required/,
    );
  });

  it('rejects invalid action', async () => {
    await expect(UsageLog.create({ ...validLog, action: 'invalid_action' })).rejects.toThrow(
      /is not a valid enum/,
    );
  });

  it('rejects missing monthYear', async () => {
    await expect(UsageLog.create({ ...validLog, monthYear: undefined })).rejects.toThrow(
      /monthYear is required/,
    );
  });

  it('rejects invalid monthYear format', async () => {
    await expect(UsageLog.create({ ...validLog, monthYear: 'April 2026' })).rejects.toThrow(
      /monthYear must be YYYY-MM format/,
    );
  });

  it('defaults tokensUsed to 0', async () => {
    const log = await UsageLog.create({
      ...validLog,
      tokensUsed: undefined,
    });
    expect(log.tokensUsed).toBe(0);
  });

  it('defaults costInr to 0', async () => {
    const log = await UsageLog.create({
      ...validLog,
      costInr: undefined,
    });
    expect(log.costInr).toBe(0);
  });

  it('allows document_created action', async () => {
    const log = await UsageLog.create({
      ...validLog,
      action: 'document_created',
    });
    expect(log.action).toBe('document_created');
  });

  it('allows document_exported action', async () => {
    const log = await UsageLog.create({
      ...validLog,
      action: 'document_exported',
    });
    expect(log.action).toBe('document_exported');
  });

  it('allows null documentId', async () => {
    const log = await UsageLog.create({
      ...validLog,
      documentId: undefined,
    });
    expect(log.documentId).toBeNull();
  });

  it('queries by userId + monthYear compound index', async () => {
    const userId = new mongoose.Types.ObjectId();
    await UsageLog.create({ ...validLog, userId, monthYear: '2026-03' });
    await UsageLog.create({ ...validLog, userId, monthYear: '2026-04' });
    await UsageLog.create({ ...validLog, userId, monthYear: '2026-04' });

    const aprilLogs = await UsageLog.find({ userId, monthYear: '2026-04' });
    expect(aprilLogs).toHaveLength(2);
  });
});
