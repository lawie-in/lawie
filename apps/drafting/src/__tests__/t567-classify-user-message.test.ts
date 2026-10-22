/**
 * T-567 item 41 (Ajay AJ-539-M2): classifyLlmError's userMessage is the signed
 * "The draft did not finish." for every case; the server detail (including the
 * AppSetting key) is only in logMessage, which the pipeline carries on
 * GenerationFailedError.message. Codes and retryable are unchanged. Driven
 * through streamGenerateFromTemplate like the T-118 classify test.
 */
import './setupEnv';
import './setupDb';

import { Response } from 'express';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  const actual = jest.requireActual('@anthropic-ai/sdk');
  const Ctor: Record<string, unknown> & jest.Mock = jest
    .fn()
    .mockImplementation(() => ({
      messages: { stream: (...a: unknown[]) => mockMessagesStream(...a) },
    })) as never;
  // Real error classes, so `instanceof` in the service works as it does in production.
  Ctor.APIError = actual.APIError;
  Ctor.APIConnectionError = actual.APIConnectionError;
  Ctor.APIConnectionTimeoutError = actual.APIConnectionTimeoutError;
  return { __esModule: true, default: Ctor };
});

import Anthropic from '@anthropic-ai/sdk';

import { AppSetting } from '../models/AppSetting.model';
import {
  DRAFT_DID_NOT_FINISH,
  GenerationFailedError,
  streamGenerateFromTemplate,
  writeSseError,
  TemplateGenerateInput,
} from '../services/ai.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadTemplateConfig } from '../services/template-engine.service';

const Sdk = Anthropic as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const INPUT: TemplateGenerateInput = {
  templateConfig: loadTemplateConfig('bail_regular')!,
  formData: {},
  userId: 'user-1',
  runId: 'test-run-id',
  runSequence: 1,
  runType: 'initial',
};

function fakeRes() {
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  return {
    res: res as unknown as Response,
    errorEvent: (): Record<string, unknown> => {
      const block = res.write.mock.calls
        .map((c) => String(c[0]))
        .find((t) => t.startsWith('event: error\n'))!;
      return JSON.parse(block.split('\ndata: ')[1]);
    },
  };
}

/** Run one generation whose model call throws `err`; return what the pipeline made of it. */
async function failWith(err: unknown) {
  mockMessagesStream.mockReset();
  mockMessagesStream.mockRejectedValue(err);
  const out = fakeRes();
  let caught: unknown;
  try {
    await streamGenerateFromTemplate(INPUT, out.res);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(GenerationFailedError);
  return { failure: caught as GenerationFailedError, event: out.errorEvent() };
}

const apiError = (status: number) =>
  new Sdk.APIError(status, { message: 'zzz' }, 'zzz', new Headers());

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
});

afterEach(() => {
  mockMessagesStream.mockReset();
});

const SIGNED = 'The draft did not finish.';

describe('T-567 exports', () => {
  it('DRAFT_DID_NOT_FINISH is the signed text', () => {
    expect(DRAFT_DID_NOT_FINISH).toBe(SIGNED);
  });

  it('writeSseError writes one `event: error` block with the event as JSON', () => {
    const res = { write: jest.fn() };
    writeSseError(res as unknown as Response, {
      reason: SIGNED,
      retryable: true,
      code: 'unknown',
      runId: 'r1',
    });
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledWith(
      `event: error\ndata: ${JSON.stringify({ reason: SIGNED, retryable: true, code: 'unknown', runId: 'r1' })}\n\n`,
    );
  });
});

describe('T-567 classifyLlmError userMessage', () => {
  const cases: Array<[string, () => unknown, string, boolean]> = [
    ['401 (AUTH)', () => apiError(401), 'auth', false],
    ['429 (rate_limited)', () => apiError(429), 'rate_limited', true],
    ['529 (provider_unavailable)', () => apiError(529), 'provider_unavailable', true],
    ['400 (INVALID_REQUEST)', () => apiError(400), 'invalid_request', false],
    [
      'connection error (NETWORK)',
      () => new Sdk.APIConnectionError({ message: 'zzz' }),
      'network',
      true,
    ],
    ['plain error (UNKNOWN)', () => new Error('something odd happened'), 'unknown', true],
  ];

  it.each(cases)(
    '%s: signed text to the advocate, code and retryable unchanged',
    async (_n, mk, code, retryable) => {
      const { failure, event } = await failWith(mk());
      expect(event.reason).toBe(SIGNED);
      expect(event.code).toBe(code);
      expect(event.retryable).toBe(retryable);
      expect(failure.code).toBe(code);
      expect(event).not.toHaveProperty('inkReleased');
      // The server detail is in the failure (log) message, which is not the signed text.
      expect(failure.message).not.toBe(SIGNED);
      expect(failure.message.length).toBeGreaterThan(0);
    },
  );

  it('AppSettingMissing: signed text to the advocate; the setting key and config text only in the log message', async () => {
    await AppSetting.deleteMany({});
    _clearAppSettingsCache();
    const { failure, event } = await failWith(new Error('unused: the app setting is read first'));
    expect(event.reason).toBe(SIGNED);
    expect(event.code).toBe('auth');
    expect(event.retryable).toBe(false);
    expect(JSON.stringify(event)).not.toMatch(/ai\.drafting_model|admin|app setting|configured/i);
    expect(failure.message).toContain('ai.drafting_model');
  });

  it('the detail of the underlying error is never in the event', async () => {
    const { event } = await failWith(new Error('rate-limited: sk-ant-FAKE-KEY-123 secret'));
    expect(JSON.stringify(event)).not.toMatch(/sk-ant|secret|rate-limited/);
  });
});
