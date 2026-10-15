/**
 * T-404 reviewer should-fix: the engine's enrolment-blank matcher (labelBlanksFor) hand-copies the
 * brief and ledger blank generators (`placeholderFor`, `missingPlaceholder`). Neither helper that
 * matters is exported from the engine, so this tests the behaviour: for every pack and twin that
 * declares `advocate_enrollment`, the blank each generator writes for that field's label renders as
 * the signed enrolment blank. A change to either generator, or a label rename, turns this red.
 */
import { readdirSync } from 'fs';
import { join } from 'path';

import { missingPlaceholder } from '../services/brief-drafter';
import { buildBrief, buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  type TemplateConfig,
} from '../services/template-engine.service';
import { loadAllDocRules } from '../services/template-promoter';

const SIGNED = "[To be confirmed: advocate's enrolment number]";
const TWIN_DIR = join(__dirname, '../../../../docs/templates');

function declares(c: TemplateConfig): { label: string } | undefined {
  return (c.form_schema?.steps ?? [])
    .flatMap((s) => s.fields ?? [])
    .find((f) => f.field_id === 'advocate_enrollment') as { label: string } | undefined;
}

clearConfigCache();
const all = new Map<string, TemplateConfig>();
for (const f of readdirSync(TWIN_DIR).filter((x) => x.endsWith('.json'))) {
  const c = loadTemplateConfig(f.replace(/\.json$/, ''));
  if (c) all.set(c.template_id, c);
}
for (const [id, c] of loadAllDocRules().configs) if (!all.has(id)) all.set(id, c);
const declaring = [...all.entries()].filter(([, c]) => declares(c));

const ctxFor = (c: TemplateConfig, value: string) =>
  buildPlaceholderContext(c, { advocate_enrollment: value }, {});

describe('T-404 enrolment blank: the matcher follows the generators', () => {
  it('premise: the packs and twins that declare advocate_enrollment are found', () => {
    expect(declaring.length).toBeGreaterThan(20);
    expect(declaring.map(([id]) => id)).toEqual(
      expect.arrayContaining(['legal_notice_s138', 'bail_regular', 'bail_anticipatory']),
    );
  });

  it.each(declaring.map(([id]) => [id]))(
    '%s: the brief and ledger blanks for the field print the signed blank',
    (id) => {
      const config = all.get(id)!;
      const pack = loadRulePack(id);
      if (!pack) return; // no rule pack, so no brief or ledger path to generate a blank
      const item = buildBrief({
        kind: { id, name: id, court_document: false },
        checklist: buildChecklist(pack),
        values: [],
      }).items.find((i) => i.key === 'advocate_enrollment');
      if (!item) return; // the pack does not ask for it, so no generator writes a blank for it

      const briefBlank = item.placeholder as string;
      const ledgerBlank = missingPlaceholder(item.label);
      expect(briefBlank).toMatch(/^\[To be confirmed: /);
      expect(ledgerBlank).toMatch(/^\{\{MISSING: /);

      for (const blank of [briefBlank, ledgerBlank]) {
        const ctx = ctxFor(config, blank);
        expect(ctx.enrollment_number).toBe(SIGNED);
        expect(ctx.advocate_enrollment).toBe(SIGNED);
      }
    },
  );

  it('control: a typed number is never mistaken for a blank', () => {
    for (const [, c] of declaring.slice(0, 5)) {
      expect(ctxFor(c, 'D/123/2015').enrollment_number).toBe('D/123/2015');
    }
  });

  it('at least one pack really generates a blank to pin (the loop above is not vacuous)', () => {
    const pinned = declaring.filter(([id]) => {
      const pack = loadRulePack(id);
      if (!pack) return false;
      return buildChecklist(pack).some((i) => i.key === 'advocate_enrollment');
    });
    expect(pinned.length).toBeGreaterThan(0);
  });
});
