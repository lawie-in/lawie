/**
 * T-293 - guard the sections_charged pre-read key (__sections_charged_read).
 * AC1: client formData can never set it; the server always computes it.
 * AC2: bad JSON never throws while building the prompt; falls back to the normal read.
 */
import './setupEnv';
import './setupDb';

import logger from '../config/logger';
import { ChargedSection } from '../services/bns-offence-resolver';
import {
  buildAIUserPrompt,
  buildPlaceholderContext,
  loadTemplateConfig,
  SECTIONS_CHARGED_READ_KEY,
} from '../services/template-engine.service';

const config = loadTemplateConfig('bail_regular');
if (!config) throw new Error('bail_regular template missing');
const body = config.document_structure.sections.find((s) => s.section_id === 'body');
if (!body) throw new Error('body section missing');
const KEY = SECTIONS_CHARGED_READ_KEY;

const CHARGED = ['BNS 303', 'BNS 115(2)'];
// A well-formed pre-read that differs from what the server would compute.
const ATTACKER: ChargedSection[] = [{ code: 'BNS', number: '103' } as ChargedSection];
const ATTACKER_JSON = JSON.stringify(ATTACKER);

const build = (formData: Record<string, unknown>) =>
  buildPlaceholderContext(config, { facts_narrative: 'Facts.', ...formData }, {});

describe('T-293 AC1: client cannot set the pre-read key', () => {
  it('A: the server value replaces a client-sent key', () => {
    const clean = build({ sections_charged: CHARGED });
    const attacked = build({ sections_charged: CHARGED, [KEY]: ATTACKER_JSON });
    expect(attacked[KEY]).toBeDefined();
    expect(attacked[KEY]).not.toBe(ATTACKER_JSON);
    expect(attacked[KEY]).toBe(clean[KEY]);
  });

  it('A2: with no sections_charged, a client key is absent from ctx', () => {
    const ctx = build({ [KEY]: ATTACKER_JSON });
    expect(ctx[KEY]).toBeUndefined();
    expect(Object.keys(ctx)).not.toContain(KEY);
  });

  it('A2b: a null sections_charged also leaves the key absent', () => {
    const ctx = build({ sections_charged: null, [KEY]: ATTACKER_JSON });
    expect(ctx[KEY]).toBeUndefined();
  });

  it('A3: end to end, the prompt is identical with or without the attacker key', () => {
    const clean = buildAIUserPrompt(body, build({ sections_charged: CHARGED }));
    const attacked = buildAIUserPrompt(
      body,
      build({ sections_charged: CHARGED, [KEY]: ATTACKER_JSON }),
    );
    expect(attacked).toBe(clean);
    expect(clean).toContain('BAILABILITY CLASSIFICATION');
  });
});

describe('T-293 AC2: bad pre-read never throws', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const PARTY = 'Zorawar Pratap Singhania';
  const baseCtx = () => build({ sections_charged: CHARGED, accused_name: PARTY });
  const withRaw = (raw: string) => ({ ...baseCtx(), [KEY]: raw });
  // The normal read: no pre-read key at all.
  const normal = () => {
    const ctx = baseCtx();
    delete ctx[KEY];
    return buildAIUserPrompt(body, ctx);
  };

  it('B: unparseable JSON does not throw, falls back, warns with ids only', () => {
    const raw = '{bad';
    let prompt = '';
    expect(() => {
      prompt = buildAIUserPrompt(body, withRaw(raw));
    }).not.toThrow();
    expect(prompt).toBe(normal());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ key: KEY, sectionId: body.section_id });
    // Ajay's condition: only ids and the message; no raw value, section number or form value.
    const logged = JSON.stringify(warn.mock.calls);
    expect(warn.mock.calls[0]).toHaveLength(2);
    expect(warn.mock.calls[0][1]).toBe('sections_charged pre-read unparseable; using normal read');
    for (const leak of [raw, PARTY, 'Facts.', ...CHARGED, '303', '115']) {
      expect(logged).not.toContain(leak);
    }
  });

  it.each(['{"a":1}', '"str"', '42', 'null'])(
    'B2: valid JSON that is not an array (%s) falls back the same way',
    (raw) => {
      let prompt = '';
      expect(() => {
        prompt = buildAIUserPrompt(body, withRaw(raw));
      }).not.toThrow();
      expect(prompt).toBe(normal());
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(raw);
    },
  );

  it('B3: a valid array pre-read is still used, with no warning', () => {
    const ctx = withRaw(ATTACKER_JSON);
    const prompt = buildAIUserPrompt(body, ctx);
    expect(warn).not.toHaveBeenCalled();
    expect(prompt).not.toBe(normal());
    expect(prompt).toContain('103');
  });
});
