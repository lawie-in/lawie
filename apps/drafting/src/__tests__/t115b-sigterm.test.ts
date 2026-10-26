/**
 * T-115b round 2 — the SIGTERM handler in index.ts stops the erase sweep.
 * index.ts boots on import, so every collaborator is mocked.
 */
const stopDocumentEraseSweep = jest.fn();
const stopHoldSweep = jest.fn();
const disconnectRedis = jest.fn().mockResolvedValue(undefined);

jest.mock('../config/sentry', () => ({}));
jest.mock('../app', () => ({ __esModule: true, default: { listen: jest.fn() } }));
jest.mock('../config/database', () => ({
  connectDatabase: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../config/redis', () => ({
  disconnectRedis: (...a: unknown[]) => disconnectRedis(...a),
}));
jest.mock('../services/app-settings.service', () => ({
  primeConfigWarnings: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/credits.service', () => ({
  startHoldSweep: jest.fn(),
  stopHoldSweep: (...a: unknown[]) => stopHoldSweep(...a),
}));
jest.mock('../services/document-erase.service', () => ({
  startDocumentEraseSweep: jest.fn(),
  stopDocumentEraseSweep: (...a: unknown[]) => stopDocumentEraseSweep(...a),
}));
jest.mock('../services/feature-switches', () => ({ primeToolSwitches: jest.fn() }));
jest.mock('../services/rule-pack.service', () => ({
  listRulePackIds: jest.fn(() => []),
  loadSkeleton: jest.fn(),
  SKELETONS_DIR: '/nonexistent-skeletons-dir',
}));
jest.mock('../services/signed-tables', () => ({
  loadSignedTables: jest.fn(() => ({ sha256: 'x' })),
}));
jest.mock('../services/template-promoter', () => ({ getTemplateRegistry: jest.fn() }));
jest.mock('../services/template-seed.service', () => ({ runBootSync: jest.fn() }));

describe('SIGTERM handler', () => {
  it('stops the document erase sweep, the hold sweep, then exits 0', async () => {
    const handlers: Record<string, (...a: unknown[]) => unknown> = {};
    jest.spyOn(process, 'on').mockImplementation(((
      ev: string,
      fn: (...a: unknown[]) => unknown,
    ) => {
      handlers[ev] = fn;
      return process;
    }) as never);
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await import('../index');
    expect(handlers.SIGTERM).toBeDefined();
    await handlers.SIGTERM();

    expect(stopDocumentEraseSweep).toHaveBeenCalledTimes(1);
    expect(stopHoldSweep).toHaveBeenCalledTimes(1);
    expect(disconnectRedis).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    jest.restoreAllMocks();
  });
});
