import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import request from 'supertest';

import './setupDb';
import app from '../app';
import { Template } from '../models/Template.model';
import * as promoter from '../services/template-promoter';
import { getCatalogue } from '../services/intake.service';
import { listTemplateConfigs } from '../services/template-engine.service';
import { cardDescriptionFor } from '../utils/cardDescription';
import { presentDescription } from '../utils/presentDescription';

// T-365 AC6. Ajay's signed lines (handoff/legal/T-365-card-descriptions-signed.md) are the
// source of truth: every pack carries exactly its line as a top-level card_description, and
// cards show that field only, never description or _meta.description.

const REPO = join(__dirname, '..', '..', '..', '..');
const SIGNED = join(REPO, 'handoff', 'legal', 'T-365-card-descriptions-signed.md');
const PACK_DIR = join(__dirname, '..', 'config', 'document-rules');
const OVERRIDE_DIR = join(REPO, 'docs', 'templates');
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;

function parseSigned(): Map<string, string> {
  const lines = new Map<string, string>();
  for (const row of readFileSync(SIGNED, 'utf8').split('\n')) {
    const m = row.match(/^\| `([a-z0-9_]+)` \| (.+) \|$/);
    if (m) {
      if (lines.has(m[1])) throw new Error(`duplicate signed id ${m[1]}`);
      lines.set(m[1], m[2]);
    }
  }
  return lines;
}

const packIds = () =>
  readdirSync(PACK_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();

const readPack = (id: string) => JSON.parse(readFileSync(join(PACK_DIR, `${id}.json`), 'utf8'));

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': '507f1f77bcf86cd799439011',
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'pro',
    'x-user-role': 'Client',
  };
}

afterEach(() => jest.restoreAllMocks());

describe('T-365 AC6: signed file and packs', () => {
  const signed = parseSigned();

  it('the signed file holds 92 lines and the pack directory 92 packs, with the same id set', () => {
    expect(signed.size).toBe(92);
    expect(packIds()).toHaveLength(92);
    expect(packIds()).toEqual([...signed.keys()].sort());
  });

  it('every pack has a top-level card_description byte-equal to its signed line', () => {
    const wrong: string[] = [];
    for (const [id, line] of signed) {
      const pack = readPack(id);
      if (!Object.prototype.hasOwnProperty.call(pack, 'card_description')) {
        wrong.push(`${id}: missing`);
      } else if (pack.card_description !== line) {
        wrong.push(`${id}: ${JSON.stringify(pack.card_description)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('no pack carries card_description anywhere but the top level', () => {
    for (const id of packIds()) {
      expect(readPack(id)._meta?.card_description).toBeUndefined();
    }
  });
});

describe('T-365 AC6: cardDescriptionFor', () => {
  const signed = parseSigned();

  it('returns the signed line for every pack through the real registry', () => {
    for (const [id, line] of signed) expect(cardDescriptionFor(id)).toBe(line);
  });

  it("returns '' for an unknown id, an empty id and a non-string", () => {
    expect(cardDescriptionFor('no_such_pack')).toBe('');
    expect(cardDescriptionFor('')).toBe('');
    expect(cardDescriptionFor(undefined as unknown as string)).toBe('');
  });

  it("returns '' when the pack lacks the field, even with description and _meta text", () => {
    const config = {
      template_id: 'stub_pack',
      description: 'INTERNAL NOTE with Case v. Case (2020)',
      _meta: { description: 'META NOTE' },
    };
    jest.spyOn(promoter, 'getTemplateRegistry').mockReturnValue({
      configs: new Map([['stub_pack', config]]),
      mismatchReport: [],
      byFile: new Map(),
    } as unknown as ReturnType<typeof promoter.getTemplateRegistry>);
    expect(cardDescriptionFor('stub_pack')).toBe('');
  });

  it('returns card_description, not description, when both are present on a stub', () => {
    jest.spyOn(promoter, 'getTemplateRegistry').mockReturnValue({
      configs: new Map([
        [
          'stub_pack',
          { template_id: 'stub_pack', description: 'INTERNAL', card_description: 'SIGNED' },
        ],
      ]),
      mismatchReport: [],
      byFile: new Map(),
    } as unknown as ReturnType<typeof promoter.getTemplateRegistry>);
    expect(cardDescriptionFor('stub_pack')).toBe('SIGNED');
  });

  it('never returns the internal description or _meta text for any real pack', () => {
    for (const id of packIds()) {
      const pack = readPack(id);
      const out = cardDescriptionFor(id);
      for (const internal of [pack.description, pack._meta?.description]) {
        if (typeof internal === 'string' && internal !== pack.card_description) {
          expect(out).not.toBe(internal);
          expect(out).not.toBe(presentDescription(internal));
        }
      }
      expect(out).not.toContain('Document-rules config for');
    }
  });

  it('returns the pack card line, not the override description, for the 6 docs/templates ids', () => {
    const overrides = readdirSync(OVERRIDE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
    expect(overrides).toHaveLength(6);
    for (const id of overrides) {
      const override = JSON.parse(readFileSync(join(OVERRIDE_DIR, `${id}.json`), 'utf8'));
      expect(cardDescriptionFor(id)).toBe(signed.get(id));
      if (typeof override.description === 'string' && override.description !== signed.get(id)) {
        expect(cardDescriptionFor(id)).not.toBe(override.description);
      }
    }
  });
});

describe('T-365 AC6: promoter', () => {
  it('carries a non-empty card_description onto the promoted config', () => {
    const { config } = promoter.promoteDocRuleToTemplateConfig(
      { template_id: 'x', category: 'c', card_description: 'Signed line.' },
      'x.json',
    );
    expect((config as promoter.PromotedTemplateConfig).card_description).toBe('Signed line.');
  });

  it('does not fall back to description or _meta.description', () => {
    for (const rule of [
      { template_id: 'x', category: 'c', _meta: { description: 'meta only' } },
      { template_id: 'x', category: 'c', description: 'plain only' },
      { template_id: 'x', category: 'c', description: 'a', _meta: { description: 'b' } },
    ]) {
      const { config } = promoter.promoteDocRuleToTemplateConfig(rule, 'x.json');
      expect(config).not.toHaveProperty('card_description');
    }
  });

  it('ignores an empty or non-string card_description', () => {
    for (const bad of ['', 42, null]) {
      const { config } = promoter.promoteDocRuleToTemplateConfig(
        { template_id: 'x', category: 'c', card_description: bad as unknown as string },
        'x.json',
      );
      expect(config).not.toHaveProperty('card_description');
    }
  });

  it('keeps the internal description for the intake prompt unchanged', () => {
    const { config } = promoter.promoteDocRuleToTemplateConfig(
      {
        template_id: 'x',
        category: 'c',
        _meta: { description: 'meta only' },
        card_description: 'S',
      },
      'x.json',
    );
    expect(config.description).toBe('meta only');
  });
});

describe('T-365 AC6: GET /templates list (detail route removed in T-385)', () => {
  const OLD = 'Document-rules config for affidavit_identity — standalone INTERNAL text';

  beforeEach(async () => {
    await Template.insertMany([
      {
        templateId: 'affidavit_identity',
        slug: 'affidavit-identity',
        displayName: 'Affidavit of Identity',
        category: 'civil',
        catalogueCategory: 'affidavits_court_forms',
        description: OLD,
        planAccess: 'free',
        sourceFile: 'affidavit_identity.json',
        creditsCost: 1,
        isActive: true,
      },
      {
        templateId: 'ghost_pack',
        slug: 'ghost-pack',
        displayName: 'Ghost',
        category: 'civil',
        catalogueCategory: 'notices_replies',
        description: 'Ghost stored description',
        planAccess: 'free',
        sourceFile: 'ghost_pack.json',
        creditsCost: 1,
        isActive: true,
      },
    ]);
  });

  const LINE =
    "A sworn affidavit confirming a person's identity, for banks, offices and property work.";

  it('list returns only the card line, and "" for a row with no pack', async () => {
    const res = await request(app).get('/templates').set(headers());
    expect(res.status).toBe(200);
    const by = (slug: string) => res.body.templates.find((t: { slug: string }) => t.slug === slug);
    expect(by('affidavit-identity').description).toBe(LINE);
    expect(by('ghost-pack').description).toBe('');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('INTERNAL');
    expect(body).not.toContain('Ghost stored description');
  });

  it('the detail route is gone (T-385): /templates/:slug is 404 and carries no description', async () => {
    const res = await request(app).get('/templates/affidavit-identity').set(headers());
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('INTERNAL');
  });
});

describe('T-365 AC6: intake match prompt keeps the internal description', () => {
  it('getCatalogue descriptions are presentDescription of the internal description, not the card line', () => {
    const catalogue = getCatalogue();
    expect(catalogue.length).toBeGreaterThan(0);
    const internal = new Map(listTemplateConfigs().map((t) => [t.template_id, t.description]));
    let differing = 0;
    for (const entry of catalogue) {
      expect(entry.description).toBe(presentDescription(internal.get(entry.template_id) ?? ''));
      if (entry.description !== cardDescriptionFor(entry.template_id)) differing += 1;
    }
    // The prompt text is not the card text for most packs.
    expect(differing).toBeGreaterThan(catalogue.length / 2);
  });
});
