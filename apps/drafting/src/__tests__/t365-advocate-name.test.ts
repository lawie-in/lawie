/**
 * T-365 AC1 (Ajay, 13 Oct 2026) - the brief's auto-written
 * "[To be confirmed: advocate name]" is not a name the advocate typed, so it
 * must not beat the profile name. Only a typed name wins (Anushka run 3, T-300,
 * default_bail).
 */
import { formDataFromBrief, ledgerSkeletonBrief } from '../services/brief-drafter';
import { Brief, buildBrief, buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  loadTemplateConfig,
  renderTemplateSection,
  TemplateConfig,
} from '../services/template-engine.service';

const PROFILE = 'Abhi';
const TYPED = 'R. Sharma';
const TBC = '[To be confirmed: advocate name]';
const BLANK = '____________________';
const PACKS = ['default_bail', 'bail_before_magistrate', 'interim_bail'] as const;

function config(id: string): TemplateConfig {
  const c = loadTemplateConfig(id);
  if (!c) throw new Error(`${id} template missing`);
  return c;
}

function briefOf(pack: string, typed?: string): Brief {
  return buildBrief({
    kind: { id: pack, name: pack, court_document: true },
    checklist: buildChecklist(loadRulePack(pack)!),
    values: typed ? [{ key: 'advocate_name', value: typed, source: 'user' }] : [],
  }) as Brief;
}

/** Every system-filled (template) section, as the draft prints it. */
function systemOutput(cfg: TemplateConfig, formData: Record<string, unknown>, profile?: string) {
  const ctx = buildPlaceholderContext(cfg, formData, profile ? { advocateName: profile } : {});
  const sections = cfg.document_structure.sections.filter((s) => s.type === 'template');
  return {
    all: sections.map((s) => renderTemplateSection(s, ctx).content).join('\n\n'),
    block: renderTemplateSection(
      cfg.document_structure.sections.find((s) => s.section_id === 'advocate_block')!,
      ctx,
    ).content,
    ctx,
  };
}

describe('T-365 AC1 formDataFromBrief', () => {
  const cfg = config('default_bail');
  const withItem = (patch: Record<string, unknown>): Brief => {
    const b = briefOf('default_bail');
    return {
      ...b,
      items: b.items.map((i) => (i.key === 'advocate_name' ? { ...i, ...patch } : i)),
    } as Brief;
  };

  it('precondition: the brief holds an empty advocate_name with the auto-written blank', () => {
    const item = briefOf('default_bail').items.find((i) => i.key === 'advocate_name')!;
    expect(item.value).toBeNull();
    expect(item.placeholder).toBe(TBC);
  });

  it('empty advocate_name: the key is absent', () => {
    const fd = formDataFromBrief(briefOf('default_bail'), cfg, 'en');
    expect('advocate_name' in fd).toBe(false);
  });

  it('unconfirmed advocate_name: the key is absent', () => {
    const fd = formDataFromBrief(withItem({ value: 'Someone', unconfirmed: true }), cfg, 'en');
    expect('advocate_name' in fd).toBe(false);
  });

  it('typed and confirmed advocate_name is kept', () => {
    const fd = formDataFromBrief(briefOf('default_bail', TYPED), cfg, 'en');
    expect(fd.advocate_name).toBe(TYPED);
  });

  it('other empty keys still get their placeholder', () => {
    const fd = formDataFromBrief(briefOf('default_bail'), cfg, 'en');
    expect(fd.advocate_enrollment).toBe('[To be confirmed: bar council enrolment no.]');
    expect(fd.applicant_name).toBe('[To be confirmed: applicant name]');
  });
});

describe.each(PACKS)('T-365 AC1 end to end, %s', (pack) => {
  const cfg = config(pack);
  const form = (typed?: string) => formDataFromBrief(briefOf(pack, typed), cfg, 'en');

  it('empty advocate name + profile name: the profile name prints, no auto blank anywhere', () => {
    const out = systemOutput(cfg, form(), PROFILE);
    expect(out.ctx.advocate_name).toBe(PROFILE);
    expect(out.block).toContain(PROFILE);
    expect(out.all).not.toContain(TBC);
    expect(out.all).not.toContain('To be confirmed: advocate name');
  });

  it('empty advocate name, no profile name: the draft blank', () => {
    const out = systemOutput(cfg, form());
    expect(out.ctx.advocate_name).toBe(BLANK);
    expect(out.block).toContain(BLANK);
    expect(out.all).not.toContain(TBC);
  });

  it('typed name beats the profile name', () => {
    const out = systemOutput(cfg, form(TYPED), PROFILE);
    expect(out.ctx.advocate_name).toBe(TYPED);
    expect(out.block).toContain(TYPED);
    expect(out.block).not.toContain(PROFILE);
  });
});

describe('T-365 AC1 ledger path', () => {
  it('a ledger with no advocate name (value null, {{MISSING}}): the profile name prints', () => {
    const cfg = config('default_bail');
    const skeleton = ledgerSkeletonBrief(briefOf('default_bail', TYPED), []);
    const item = skeleton.items.find((i) => i.key === 'advocate_name')!;
    expect(item.value).toBeNull();
    expect(item.placeholder).toContain('{{MISSING');
    const fd = formDataFromBrief(skeleton, cfg, 'en');
    expect('advocate_name' in fd).toBe(false);
    const out = systemOutput(cfg, fd, PROFILE);
    expect(out.block).toContain(PROFILE);
    expect(out.all).not.toContain('MISSING: Advocate Name');
    expect(out.all).not.toContain('advocate name');
  });
});
