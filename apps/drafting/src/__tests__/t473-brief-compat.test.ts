/**
 * T-473 round 3: the brief, the renderer and the court-type list after labels were
 * humanised. Answers saved before (raw pack text such as `yes_flag_title_warning`)
 * must still be accepted and map to the same option id. Ids never change.
 */
import './setupEnv';
import './setupDb';
import request from 'supertest';

import app from '../app';
import { Court } from '../models/Court.model';
import { packOptionIds } from '../services/draft-renderer';
import { buildChecklist, checkUserValue } from '../services/intake-brief';
import { normalise } from '../services/intake-text';
import { loadAllRulePacks, loadRulePack } from '../services/rule-pack.service';
import type { RulePackFact } from '../services/rule-pack.service';

/* eslint-disable @typescript-eslint/no-var-requires */
const COURT_ROWS: Array<Record<string, unknown>> =
  require('../config/courts/indian-courts.json').courts;
/* eslint-enable @typescript-eslint/no-var-requires */

const fold = (v: string): string =>
  normalise(v)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const gpa = loadRulePack('gpa')!;
const power = buildChecklist(gpa).find((i) => i.key === 'includes_power_to_sell')!;

describe('T-473 brief: matchOption accepts an old raw answer', () => {
  it('the gpa question is a choice with the humanised labels', () => {
    expect(power.kind).toBe('choice');
    expect(power.options).toEqual(['Yes title', 'No only management']);
    expect(power.optionIds).toEqual(['yes_flag_title_warning', 'no_only_management']);
  });

  it('accepts the new label, in any case and spacing', () => {
    expect(checkUserValue(power, 'Yes title')).toBeNull();
    expect(checkUserValue(power, '  yes   TITLE ')).toBeNull();
    expect(checkUserValue(power, 'No only management')).toBeNull();
  });

  it('accepts an old raw answer, including one whose dropped words are not in the label', () => {
    expect(checkUserValue(power, 'yes_flag_title_warning')).toBeNull();
    expect(checkUserValue(power, 'no_only_management')).toBeNull();
  });

  it('accepts old and new answers in a multi-choice list', () => {
    const multi = { ...power, kind: 'choices' as const };
    expect(checkUserValue(multi, ['yes_flag_title_warning', 'No only management'])).toBeNull();
    expect(checkUserValue(multi, ['yes_flag_title_warning', 'nope'])).toBe('Choose from the list.');
  });

  it('still refuses text that is in no option', () => {
    for (const v of ['Maybe', 'yes', 'not_an_option', 'title']) {
      expect(checkUserValue(power, v)).toBe('Choose from the list.');
    }
  });
});

describe('T-473 renderer: packOptionIds maps labels, old text and ids to the id', () => {
  const ids = (): Record<string, string> => packOptionIds(gpa.facts)['includes_power_to_sell'];

  it('maps the new label and the old raw text to the unchanged id', () => {
    expect(ids()[fold('Yes title')]).toBe('yes_flag_title_warning');
    expect(ids()[fold('yes_flag_title_warning')]).toBe('yes_flag_title_warning');
    expect(ids()[fold('No only management')]).toBe('no_only_management');
    expect(ids()[fold('no_only_management')]).toBe('no_only_management');
  });

  it('a label key wins over an id key that folds the same', () => {
    const fact: RulePackFact = {
      key: 'k',
      group: null,
      name: 'k',
      label: 'K',
      type: 'text',
      required: false,
      options: ['alpha beta', 'gamma'],
      option_ids: ['gamma', 'alpha_beta'],
    };
    // label 'alpha beta' -> id 'gamma'; id 'alpha_beta' folds to the same key but must not replace it
    expect(packOptionIds([fact]).k[fold('alpha beta')]).toBe('gamma');
    expect(packOptionIds([fact]).k[fold('gamma')]).toBe('alpha_beta');
  });

  it('a pack id longer than 60 characters is found by its full old text and by its label', () => {
    const raw = 'yes_property_in_bombay_calcutta_madras_HC_ordinary_original_civil_jurisdiction';
    expect(raw.length).toBeGreaterThan(60);
    const will = loadRulePack('will')!;
    const map = packOptionIds(will.facts)['probate_jurisdiction'];
    const fact = will.facts.find((f) => f.key === 'probate_jurisdiction')!;
    const i = fact.option_ids!.findIndex((id) => id.startsWith('yes_property_in_bombay'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(fact.option_ids![i].length).toBeLessThanOrEqual(60);
    expect(map[fold(raw)]).toBe(fact.option_ids![i]);
    expect(map[fold(fact.options[i])]).toBe(fact.option_ids![i]);
  });

  it('every option of every pack is found by its label, and by its id', () => {
    const problems: string[] = [];
    for (const pack of loadAllRulePacks().packs) {
      const maps = packOptionIds(pack.facts);
      for (const f of pack.facts) {
        if (!f.option_ids || f.option_ids.length !== f.options.length) continue;
        f.options.forEach((label) => {
          if (maps[f.key][fold(label)] === undefined) problems.push(`${pack.id}#${f.key} ${label}`);
        });
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('T-473 every pack brief: option labels', () => {
  const { packs, errors } = loadAllRulePacks();

  it('loads every pack', () => {
    expect(errors).toEqual([]);
    expect(packs.length).toBeGreaterThan(80);
  });

  it('no brief option label has an underscore-joined internal name', () => {
    const problems: string[] = [];
    for (const p of packs) {
      for (const f of p.facts) {
        for (const o of f.options)
          if (/[A-Za-z0-9]+(_[A-Za-z0-9]+)+/.test(o)) problems.push(`${p.id}#${f.key}: ${o}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('no field offers two options with the same label, and each label has one id', () => {
    const dup: string[] = [];
    const idProblems: string[] = [];
    for (const p of packs) {
      for (const f of p.facts) {
        const labels = f.options.map(fold);
        if (new Set(labels).size !== labels.length) dup.push(`${p.id}#${f.key}`);
        if (f.option_ids && f.option_ids.length === f.options.length) {
          if (new Set(f.option_ids).size !== f.option_ids.length)
            idProblems.push(`${p.id}#${f.key} repeated id`);
        }
      }
    }
    expect({ dup, idProblems }).toEqual({ dup: [], idProblems: [] });
  });
});

describe('T-473 /courts/types labels', () => {
  const types = [...new Set(COURT_ROWS.map((r) => r.courtType as string))];

  beforeEach(async () => {
    const rows = types.map((t, i) => ({
      ...(COURT_ROWS.find((r) => r.courtType === t) as Record<string, unknown>),
      courtId: `t473_${i}`,
      stateId: 't473_state',
      isActive: true,
    }));
    await Court.collection.insertMany(rows as never[]);
  });

  it('the courts list carries the ten known types', () => {
    expect(types.sort()).toEqual(
      [
        'civil_court',
        'cjm',
        'consumer_commission',
        'district_court',
        'high_court',
        'high_court_bench',
        'jmfc',
        'sessions',
        'supreme_court',
        'tribunal',
      ].sort(),
    );
  });

  it('every courtType in indian-courts.json has a plain label, not its id', async () => {
    const res = await request(app).get('/courts/types?state=t473_state');
    expect(res.status).toBe(200);
    const got = res.body.types as { id: string; label: string }[];
    expect(got.map((t) => t.id).sort()).toEqual([...types].sort());
    for (const t of got) {
      expect({ id: t.id, label: t.label }).toEqual({
        id: t.id,
        label: expect.not.stringMatching(/_/),
      });
      expect(t.label).not.toBe(t.id);
    }
  });

  it('the three new labels read as written', async () => {
    const res = await request(app).get('/courts/types?state=t473_state');
    const label = (id: string) => res.body.types.find((t: { id: string }) => t.id === id).label;
    expect(label('supreme_court')).toBe('Supreme Court');
    expect(label('tribunal')).toBe('Tribunal');
    expect(label('consumer_commission')).toBe('Consumer Commission');
  });
});
