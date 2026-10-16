/**
 * T-365: bail_before_magistrate asks for the brief facts like bail_regular. facts_narrative is a
 * required textarea with bail_regular's label, placeholder, type and limits, and the intake
 * checklist item is the same too.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';

const RULES = join(__dirname, '..', 'config', 'document-rules');

interface Field {
  name?: string;
  field_id?: string;
  [k: string]: unknown;
}

function factsField(pack: string): Field {
  const json = JSON.parse(readFileSync(join(RULES, `${pack}.json`), 'utf8'));
  const found: Field[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      const o = n as Field;
      if (o.name === 'facts_narrative' || o.field_id === 'facts_narrative') found.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(json.form_schema);
  expect(found).toHaveLength(1);
  return found[0];
}

describe('T-365 bail_before_magistrate facts_narrative', () => {
  const mag = () => factsField('bail_before_magistrate');
  const reg = () => factsField('bail_regular');

  it('is declared exactly once, as a required textarea with the regular-bail wording', () => {
    const f = mag();
    expect(f.type).toBe('textarea');
    expect(f.required).toBe(true);
    expect(f.label).toBe('Brief Facts of the Case (3-5 lines)');
    expect(f.min_length).toBe(50);
    expect(f.max_length).toBe(1500);
    expect(f.placeholder).toBe("Describe what happened from the applicant's perspective...");
  });

  it("matches bail_regular's label, placeholder, type, required and limits", () => {
    // The two packs name the key differently (name vs field_id) and only bail_regular carries
    // inject_into; the asked wording and limits are what must agree.
    const pickAsked = (f: Field) => ({
      label: f.label,
      placeholder: f.placeholder,
      type: f.type,
      required: f.required,
      min_length: f.min_length,
      max_length: f.max_length,
    });
    expect(pickAsked(mag())).toEqual(pickAsked(reg()));
    expect(pickAsked(reg()).min_length).toBeDefined();
  });

  it('has no inject_into or part key of its own', () => {
    const f = mag();
    expect('inject_into' in f).toBe(false);
    expect('part' in f).toBe(false);
  });

  it('the pack loads as a rule pack and a template config', () => {
    expect(loadRulePack('bail_before_magistrate')).not.toBeNull();
    expect(loadTemplateConfig('bail_before_magistrate')).not.toBeNull();
  });

  it("the intake checklist item equals bail_regular's", () => {
    const pick = (pack: string) =>
      buildChecklist(loadRulePack(pack)!).find((i) => i.key === 'facts_narrative');
    const m = pick('bail_before_magistrate');
    expect(m).toBeDefined();
    expect(m).toEqual(pick('bail_regular'));
  });
});
