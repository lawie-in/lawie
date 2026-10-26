/**
 * T-585 criterion 1 — index.ts logs one WARN per missing key, key name only.
 * index.ts boots on import, so every collaborator is mocked.
 */
const warn = jest.fn();
const prime = jest.fn();

jest.mock('../config/sentry', () => ({}));
jest.mock('../config/logger', () => ({
  __esModule: true,
  default: {
    warn: (...a: unknown[]) => warn(...a),
    info: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
}));
jest.mock('../app', () => ({ __esModule: true, default: { listen: jest.fn() } }));
jest.mock('../config/database', () => ({
  connectDatabase: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../config/redis', () => ({ disconnectRedis: jest.fn() }));
jest.mock('../services/app-settings.service', () => ({
  primeConfigWarnings: (...a: unknown[]) => prime(...a),
}));
jest.mock('../services/credits.service', () => ({
  startHoldSweep: jest.fn(),
  stopHoldSweep: jest.fn(),
}));
jest.mock('../services/document-erase.service', () => ({
  startDocumentEraseSweep: jest.fn(),
  stopDocumentEraseSweep: jest.fn(),
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

const flush = () => new Promise((r) => setImmediate(r));

describe('boot WARN for missing AI settings', () => {
  beforeEach(() => {
    jest.resetModules();
    warn.mockClear();
    prime.mockReset();
    jest.spyOn(process, 'on').mockImplementation((() => process) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('warns once per missing key with the key name only', async () => {
    prime.mockResolvedValue(['ai.drafting_model', 'ai.intake_model']);
    await import('../index');
    await flush();
    const calls = warn.mock.calls.filter((c) => c[1] === 'Required AppSetting is not configured');
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c[0])).toEqual([
      { setting: 'ai.drafting_model' },
      { setting: 'ai.intake_model' },
    ]);
  });

  it('warns for all three when all are missing', async () => {
    prime.mockResolvedValue(['ai.drafting_model', 'ai.preflight_model', 'ai.intake_model']);
    await import('../index');
    await flush();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('does not warn when none are missing', async () => {
    prime.mockResolvedValue([]);
    await import('../index');
    await flush();
    expect(warn).not.toHaveBeenCalled();
  });
});
