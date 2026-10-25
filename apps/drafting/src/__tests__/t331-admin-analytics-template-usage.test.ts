/**
 * T-331 — admin analytics template usage.
 *
 * LawieDocument.templateId is never set by any create path, so the slug is
 * read from the completed Generation that produced the document and joined to
 * Template.templateId. Covers: the name (not the id) for a real-shaped
 * document, one count per document, finalised rate, exclusions, the fallback
 * to the id for a slug with no Template, and no document content in logs.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { Template } from '../models/Template.model';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439011';
const SECRET_TITLE = 'ZZ-SECRET-TITLE-8841';
const SECRET_BODY = 'ZZ-SECRET-BODY-5527';
const SECRET_ENC = 'ZZ-SECRET-ENC-3390';

function adminHeaders() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'admin@test.com',
    'x-user-name': 'Admin',
    'x-user-plan': 'pro',
    'x-user-role': 'Admin',
  };
}

async function makeTemplate(slug: string, displayName: string) {
  return Template.create({
    templateId: slug,
    slug,
    displayName,
    category: 'bail',
    catalogueCategory: 'bail',
    creditsCost: 1,
    sourceFile: `${slug}.json`,
  });
}

async function makeDoc(overrides: Record<string, unknown> = {}) {
  return LawieDocument.create({
    userId: USER_ID,
    title: SECRET_TITLE,
    docType: 'bail_application',
    generatedContent: SECRET_BODY,
    formInputsEnc: SECRET_ENC,
    ...overrides,
  });
}

async function makeGen(
  documentId: unknown,
  templateId: string,
  overrides: Record<string, unknown> = {},
) {
  return Generation.create({
    userId: USER_ID,
    docType: 'bail_application',
    tokensUsed: 10,
    costUsd: 0.1,
    status: 'completed',
    templateId,
    documentId,
    ...overrides,
  });
}

async function usage() {
  const res = await request(app).get('/admin/documents/analytics').set(adminHeaders());
  expect(res.status).toBe(200);
  return res.body.templateUsage as Array<{
    templateId: string;
    displayName: string;
    count: number;
    finalisedRate: number;
  }>;
}

describe('GET /admin/documents/analytics — templateUsage (T-331)', () => {
  it('AC2: shows the template display name, not the id, for a real-shaped document', async () => {
    await makeTemplate('bail-regular', 'Regular Bail Application');
    const doc = await makeDoc();
    expect(doc.templateId).toBeNull();
    await makeGen(doc._id, 'bail-regular');

    const rows = await usage();

    expect(rows).toHaveLength(1);
    expect(rows[0].templateId).toBe('bail-regular');
    expect(rows[0].displayName).toBe('Regular Bail Application');
    expect(rows[0].displayName).not.toBe('bail-regular');
    expect(rows[0].count).toBe(1);
  });

  it('counts a document once when it has two generations for the same slug', async () => {
    await makeTemplate('bail-regular', 'Regular Bail Application');
    const doc = await makeDoc();
    await makeGen(doc._id, 'bail-regular');
    await makeGen(doc._id, 'bail-regular');

    const rows = await usage();
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
  });

  it('finalisedRate reflects finalised and exported documents', async () => {
    await makeTemplate('bail-regular', 'Regular Bail Application');
    for (const status of ['draft', 'finalised', 'exported', 'draft']) {
      const doc = await makeDoc({ status });
      await makeGen(doc._id, 'bail-regular');
    }

    const rows = await usage();
    expect(rows[0].count).toBe(4);
    expect(rows[0].finalisedRate).toBe(50);
  });

  it('excludes deleted documents, fixture documents, fixture generations and non-completed generations', async () => {
    await makeTemplate('bail-regular', 'Regular Bail Application');
    const live = await makeDoc();
    await makeGen(live._id, 'bail-regular');

    const deleted = await makeDoc({ isDeleted: true });
    await makeGen(deleted._id, 'bail-regular');

    const fixtureDoc = await makeDoc({ runType: 'fixture' });
    await makeGen(fixtureDoc._id, 'bail-regular');

    const fixtureGenDoc = await makeDoc();
    await makeGen(fixtureGenDoc._id, 'bail-regular', { runOrigin: 'fixture' });

    const failedDoc = await makeDoc();
    await makeGen(failedDoc._id, 'bail-regular', { status: 'failed' });

    const orphan = await makeGen(new mongoose.Types.ObjectId(), 'bail-regular');
    expect(orphan.documentId).toBeDefined();

    const rows = await usage();
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
  });

  it('falls back to the id when the slug has no Template (brief-path record id)', async () => {
    const doc = await makeDoc();
    await makeGen(doc._id, 'brief-abc123');

    const rows = await usage();
    expect(rows).toHaveLength(1);
    expect(rows[0].templateId).toBe('brief-abc123');
    expect(rows[0].displayName).toBe('brief-abc123');
    expect(rows[0].count).toBe(1);
  });

  it('AC3: no document content reaches any log call', async () => {
    await makeTemplate('bail-regular', 'Regular Bail Application');
    const doc = await makeDoc();
    await makeGen(doc._id, 'bail-regular');

    const spies = (['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((lvl) =>
      jest.spyOn(logger, lvl),
    );
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );

    try {
      const rows = await usage();
      expect(rows[0].count).toBe(1);

      const logged = JSON.stringify([...spies, ...consoleSpies].map((s) => s.mock.calls));
      expect(logged).not.toContain(SECRET_TITLE);
      expect(logged).not.toContain(SECRET_BODY);
      expect(logged).not.toContain(SECRET_ENC);
    } finally {
      [...spies, ...consoleSpies].forEach((s) => s.mockRestore());
    }
  });
});
