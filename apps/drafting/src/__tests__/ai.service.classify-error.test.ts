/**
 * T-118 — how a failed Anthropic call is classified now that every call goes
 * straight to the SDK. classifyLlmError is not exported, so these tests drive
 * it through streamGenerateFromTemplate with a stubbed SDK whose stream
 * rejects, and read the result off GenerationFailedError and the SSE error
 * event the advocate's browser receives.
 *
 * Status codes come first (Anthropic.APIError.status), message text is the
 * fallback. The messages used for the status cases match none of the text
 * patterns, so only the status can have decided the code.
 */
import './setupEnv';
import './setupDb';

import { Response } from 'express';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  const actual = jest.requireActual('@anthropic-ai/sdk');
  const Ctor: Record<string, unknown> & jest.Mock = jest
    .fn()
    .mockImplementation(() => ({ messages: { stream: (...a: unknown[]) => mockMessagesStream(...a) } })) as never;
  // Real error classes, so `instanceof` in the service works as it does in production.
  Ctor.APIError = actual.APIError;
  Ctor.APIConnectionError = actual.APIConnectionError;
  Ctor.APIConnectionTimeoutError = actual.APIConnectionTimeoutError;
  return { __esModule: true, default: Ctor };
});

import Anthropic from '@anthropic-ai/sdk';

import { AppSetting } from '../models/AppSetting.model';
import {
  GenerationFailedError,
  streamGenerateFromTemplate,
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
    errorEvent: (): { code: string; retryable: boolean; reason: string } => {
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

describe('classifyLlmError — by the SDK error status', () => {
  it.each([
    [401, 'auth', false],
    [403, 'auth', false],
    [429, 'rate_limited', true],
    [500, 'provider_unavailable', true],
    [529, 'provider_unavailable', true],
    [400, 'invalid_request', false],
    [404, 'invalid_request', false],
    [413, 'invalid_request', false],
    [422, 'invalid_request', false],
  ])('status %i -> %s (retryable: %s)', async (status, code, retryable) => {
    const err = apiError(status);
    // Guard the premise: nothing in the message could have decided the code.
    expect(err.status).toBe(status);
    const { failure, event } = await failWith(err);
    expect(failure.code).toBe(code);
    expect(event.code).toBe(code);
    expect(event.retryable).toBe(retryable);
    expect(failure.transport).toBe('direct');
  });
});

describe('classifyLlmError — the status alone decides when there is one', () => {
  it('a 400 whose message says "rate limit" is invalid_request, not rate_limited', async () => {
    const err = new Sdk.APIError(400, { message: 'rate limit' }, 'rate limit', new Headers());
    expect(err.message).toMatch(/rate limit/);
    const { failure, event } = await failWith(err);
    expect(failure.code).toBe('invalid_request');
    expect(event.code).toBe('invalid_request');
    expect(event.retryable).toBe(false);
  });
});

describe('classifyLlmError — connection errors and message fallback', () => {
  it('APIConnectionError -> network, retryable', async () => {
    const { failure, event } = await failWith(new Sdk.APIConnectionError({ message: 'zzz' }));
    expect(failure.code).toBe('network');
    expect(event.retryable).toBe(true);
  });

  it('APIConnectionTimeoutError -> network, retryable', async () => {
    const { failure, event } = await failWith(new Sdk.APIConnectionTimeoutError());
    expect(failure.code).toBe('network');
    expect(event.retryable).toBe(true);
  });

  it('the message "Connection error." alone -> network', async () => {
    const { failure } = await failWith(new Error('Connection error.'));
    expect(failure.code).toBe('network');
  });

  it('a plain Error with rate-limit wording -> rate_limited (message fallback)', async () => {
    const { failure, event } = await failWith(new Error('Rate limit exceeded, slow down'));
    expect(failure.code).toBe('rate_limited');
    expect(event.retryable).toBe(true);
  });

  it('a plain Error with no known wording -> unknown, retryable', async () => {
    const { failure, event } = await failWith(new Error('something odd happened'));
    expect(failure.code).toBe('unknown');
    expect(event.retryable).toBe(true);
  });
});

describe('classifyLlmError — a stubbed SDK without the error classes', () => {
  let saved: Record<string, unknown>;
  beforeEach(() => {
    saved = {
      APIError: Sdk.APIError,
      APIConnectionError: Sdk.APIConnectionError,
      APIConnectionTimeoutError: Sdk.APIConnectionTimeoutError,
    };
    delete Sdk.APIError;
    delete Sdk.APIConnectionError;
    delete Sdk.APIConnectionTimeoutError;
  });
  afterEach(() => Object.assign(Sdk, saved));

  it('does not throw: a plain Error is still classified by its message', async () => {
    const { failure } = await failWith(new Error('socket hang up'));
    expect(failure.code).toBe('network');
  });

  it('does not throw: an unrecognised error falls through to unknown', async () => {
    const { failure } = await failWith(new Error('something odd happened'));
    expect(failure.code).toBe('unknown');
  });
});
