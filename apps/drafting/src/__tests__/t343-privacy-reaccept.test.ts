/**
 * T-343 — requireCurrentPrivacy on the drafting routes, with the REAL middleware.
 * setupEnv.ts makes the middleware a pass-through for every other drafting test; this file
 * takes the real one back with jest.requireActual.
 *
 * Ajay (T-343 legal §2): only new drafts (every generate route) are blocked. Viewing, downloading,
 * exporting and the rest stay open. Arjun: stale or missing header -> 403 privacy_reaccept_required.
 */
import './setupDb';
import {
  CURRENT_PRIVACY_VERSION,
  INTERNAL_HEADERS,
  PRIVACY_VERSION_SUMMARIES,
  getPrivacyVersionSummary,
  requireCurrentPrivacy,
} from '@lawie/shared';
import * as privacyConstants from '@lawie/shared/dist/constants/privacy';
import request from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import { encrypt } from '../utils/encryption';

jest.mock('@lawie/shared', () => jest.requireActual('@lawie/shared'));

const INTERNAL_SECRET = process.env.INTERNAL_SECRET as string;
const USER_ID = '507f1f77bcf86cd799439077';

function headers(privacyVersion?: string) {
  const h: Record<string, string> = {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
  if (privacyVersion !== undefined) h['x-user-privacy-version'] = privacyVersion;
  return h;
}

// T-443: the legacy POST /generate is retired (410, answers before every middleware), so it is no
// longer a gated generate route; see t443-legacy-generate-410.test.ts.
const GENERATE_ROUTES = ['/generate-from-template', '/generate-from-brief'];

describe('T-343 requireCurrentPrivacy on the generate routes (real middleware)', () => {
  it('uses the real current version', () => {
    expect(CURRENT_PRIVACY_VERSION).toBe('2026-10-15');
  });

  describe.each(GENERATE_ROUTES)('POST %s', (path) => {
    it('returns 403 privacy_reaccept_required when the header is missing', async () => {
      const res = await request(app).post(path).set(headers()).send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'privacy_reaccept_required' });
    });

    it('returns 403 for an older version', async () => {
      const res = await request(app).post(path).set(headers('2026-10-11')).send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'privacy_reaccept_required' });
    });

    it('returns 403 for an empty header and a near-miss version', async () => {
      for (const v of [
        '',
        '2026-10-12',
        '2026-10-12b',
        '2026-10-15x',
        `${CURRENT_PRIVACY_VERSION}x`,
      ]) {
        const res = await request(app).post(path).set(headers(v)).send({});
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('privacy_reaccept_required');
      }
    });

    it('lets the current version through to the next handler', async () => {
      const res = await request(app).post(path).set(headers(CURRENT_PRIVACY_VERSION)).send({});
      expect(res.body.error).not.toBe('privacy_reaccept_required');
      expect(res.status).not.toBe(403);
    });

    it('still 401s without the gateway secret before looking at the version', async () => {
      const h = headers(CURRENT_PRIVACY_VERSION);
      delete h['x-internal-secret'];
      const res = await request(app).post(path).set(h).send({});
      expect(res.status).toBe(401);
    });
  });

  describe('actions that are never blocked, even with a stale version', () => {
    let docId: string;

    beforeEach(async () => {
      const doc = await LawieDocument.create({
        userId: USER_ID,
        title: 'A draft',
        docType: 'bail_application',
        generatedContent: encrypt('Draft body'),
      });
      docId = String(doc._id);
    });

    it('lists and views drafts', async () => {
      const list = await request(app).get('/').set(headers('2026-10-11'));
      expect(list.status).not.toBe(403);
      const one = await request(app).get(`/${docId}`).set(headers('2026-10-11'));
      expect(one.status).toBe(200);
    });

    it('views a draft with no header at all', async () => {
      const one = await request(app).get(`/${docId}`).set(headers());
      expect(one.status).toBe(200);
    });

    it('tracks a docx export', async () => {
      const res = await request(app).post(`/${docId}/export/docx`).set(headers('2026-10-11'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('lets the user save edits and read usage', async () => {
      const usage = await request(app).get('/usage').set(headers());
      expect(usage.status).not.toBe(403);
      const patch = await request(app).patch(`/${docId}`).set(headers()).send({ status: 'draft' });
      expect(patch.status).not.toBe(403);
    });
  });
});

describe('T-343 no signed summary, no block (Arjun, Addendum 2.1)', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(GENERATE_ROUTES)(
    'POST %s is not blocked when the current version has no signed summary',
    async (path) => {
      // The middleware reads the summary table from its own module in @lawie/shared's dist.
      jest.spyOn(privacyConstants, 'getPrivacyVersionSummary').mockReturnValue(undefined);
      const res = await request(app).post(path).set(headers()).send({});
      expect(res.body.error).not.toBe('privacy_reaccept_required');
      expect(res.status).not.toBe(403);
    },
  );
});

/**
 * @lawie/shared has no test runner of its own ("No tests for shared package"), so its unit tests
 * for the middleware, the header constant and the summary table live here, where jest and
 * ts-jest already run. They call the middleware directly with fake req/res objects.
 */
describe('T-343 @lawie/shared: requireCurrentPrivacy unit', () => {
  afterEach(() => jest.restoreAllMocks());

  function run(headersIn: Record<string, string | string[] | undefined>) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const next = jest.fn();
    requireCurrentPrivacy({ headers: headersIn }, { status }, next);
    return { json, status, next };
  }

  it('uses the x-user-privacy-version internal header', () => {
    expect(INTERNAL_HEADERS.USER_PRIVACY_VERSION).toBe('x-user-privacy-version');
  });

  it('403s when the header is missing', () => {
    const { status, json, next } = run({});
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'privacy_reaccept_required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('403s on a stale version, an empty string and an array value', () => {
    for (const v of ['2026-10-11', '2026-10-12', '', ['2026-10-12b']]) {
      const { status, json, next } = run({ 'x-user-privacy-version': v });
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'privacy_reaccept_required' });
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('does not treat versions as dates: a later-looking version is still not equal', () => {
    const { status, next } = run({ 'x-user-privacy-version': '2026-10-13' });
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next, with no response, on the current version', () => {
    const { status, json, next } = run({ 'x-user-privacy-version': CURRENT_PRIVACY_VERSION });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it('passes with no header at all when the current version has no signed summary', () => {
    jest.spyOn(privacyConstants, 'getPrivacyVersionSummary').mockReturnValue(undefined);
    const { status, next } = run({});
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('keeps the signed summary for 2026-10-12b byte for byte (Ajay, Addendum 1)', () => {
    expect(PRIVACY_VERSION_SUMMARIES['2026-10-12b']).toBe(
      'We now explain how Google Analytics works on our public pages, and that we keep the campaign link a new account came from.',
    );
    // T-436 (Ajay, GST file Addendum 4): the current version's summary, byte for byte.
    expect(getPrivacyVersionSummary(CURRENT_PRIVACY_VERSION)).toBe(
      'We now ask for your State to issue GST tax invoices, and we explain how you can close your account and how long we keep your data.',
    );
  });

  it('has no summary for an unknown version or an Object.prototype key (no generic fallback)', () => {
    expect(getPrivacyVersionSummary('1999-01-01')).toBeUndefined();
    expect(getPrivacyVersionSummary('')).toBeUndefined();
    expect(getPrivacyVersionSummary('constructor')).toBeUndefined();
    expect(getPrivacyVersionSummary('toString')).toBeUndefined();
    expect(getPrivacyVersionSummary('__proto__')).toBeUndefined();
  });

  it('freezes the summary table', () => {
    expect(Object.isFrozen(PRIVACY_VERSION_SUMMARIES)).toBe(true);
  });
});
