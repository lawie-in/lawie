/**
 * T-124 — rule-pack loader (ADR-021 section 3.7).
 *
 * Acceptance criteria covered here:
 *   - one function returns the same shape for every pack
 *   - all packs load without an error; this file fails if one does not
 *   - one pack of each `form_schema` shape is covered
 *
 * The shape tests use small inline packs, so an edit to the legal content of a
 * real pack (T-128) does not break them. The real files are checked for loading
 * and for the things every pack must have.
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildRulePackReport,
  clearRulePackCache,
  findRulePackGaps,
  listRulePackIds,
  loadAllRulePacks,
  loadRulePack,
  readRulePack,
  RULE_PACKS_DIR,
  RulePackError,
} from '../services/rule-pack.service';

const FILES = readdirSync(RULE_PACKS_DIR).filter((f) => f.endsWith('.json'));

describe('rule-pack loader', () => {
  beforeEach(() => clearRulePackCache());

  describe('the real packs', () => {
    it('loads every pack in document-rules/ without an error', () => {
      const { packs, errors } = loadAllRulePacks();
      expect(errors).toEqual([]);
      expect(packs).toHaveLength(FILES.length);
      // 92 on 6 Oct 2026. Fewer means the loader is looking in the wrong place.
      expect(packs.length).toBeGreaterThanOrEqual(92);
    });

    it('lists the pack ids from the file names', () => {
      expect(listRulePackIds()).toEqual(FILES.map((f) => f.replace(/\.json$/, '')).sort());
    });

    it.each(FILES.map((f) => f.replace(/\.json$/, '')))(
      '%s has the parts every pack must have',
      (id) => {
        const pack = loadRulePack(id);
        expect(pack).not.toBeNull();
        if (pack === null) return;

        expect(pack.id).toBe(id);
        expect(pack.name.length).toBeGreaterThan(0);
        expect(pack.schemaShape).not.toBe('unknown');
        expect(pack.schemaShape).not.toBe('absent');
        expect(pack.facts.length).toBeGreaterThan(0);
        expect(pack.mandatoryClauses.length).toBeGreaterThan(0);
        expect(pack.draftingInstructions.length).toBeGreaterThan(0);
        expect(pack.relevantActs.length).toBeGreaterThan(0);

        const keys = pack.facts.map((f) => f.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const fact of pack.facts) {
          expect(fact.name.length).toBeGreaterThan(0);
          expect(fact.label.length).toBeGreaterThan(0);
          expect(typeof fact.required).toBe('boolean');
        }
        for (const clause of pack.mandatoryClauses) {
          expect(clause.id.length).toBeGreaterThan(0);
          expect(clause.title.length).toBeGreaterThan(0);
        }
        for (const group of pack.groups) {
          expect(group.factCount).toBe(pack.facts.filter((f) => f.group === group.name).length);
        }
      },
    );

    it.each([
      ['bail_regular', 'steps'],
      ['bail_cancellation', 'list'],
      ['plaint_recovery', 'fields'],
      ['nda', 'json_schema'],
      ['counter_affidavit', 'groups'],
    ])('reads %s as the %s shape', (id, shape) => {
      expect(loadRulePack(id)?.schemaShape).toBe(shape);
    });

    it('returns the same frozen object on a second call', () => {
      const first = loadRulePack('bail_regular');
      const second = loadRulePack('bail_regular');
      expect(second).toBe(first);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first?.facts)).toBe(true);
      expect(Object.isFrozen(first?.mandatoryClauses[0])).toBe(true);
    });
  });

  describe('pack ids', () => {
    it('returns null when there is no pack with that id', () => {
      expect(loadRulePack('no_such_document')).toBeNull();
    });

    it.each(['../../../package', 'bail_regular.json', 'Bail_Regular', 'a/b', '', ' bail_regular'])(
      'returns null for an id that is not a plain pack name: %p',
      (id) => {
        expect(loadRulePack(id)).toBeNull();
      },
    );

    it('returns null for an id that is not a string', () => {
      expect(loadRulePack(undefined as unknown as string)).toBeNull();
      expect(loadRulePack(42 as unknown as string)).toBeNull();
    });
  });

  describe('a pack that cannot be read', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'rule-packs-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('throws RulePackError for a file that is not valid JSON', () => {
      writeFileSync(join(dir, 'broken.json'), '{ not json');
      expect(() => loadRulePack('broken', dir)).toThrow(RulePackError);
      expect(() => loadRulePack('broken', dir)).toThrow(/broken.*not valid JSON/);
    });

    it('throws RulePackError for a file that does not hold an object', () => {
      writeFileSync(join(dir, 'list.json'), '["a"]');
      expect(() => loadRulePack('list', dir)).toThrow(/does not hold a JSON object/);
    });

    it('loadAllRulePacks reports the bad pack and still loads the others', () => {
      writeFileSync(join(dir, 'broken.json'), '{ not json');
      writeFileSync(join(dir, 'good.json'), JSON.stringify({ title: 'Good', form_schema: [] }));
      writeFileSync(join(dir, 'README.md'), 'not a pack');
      const { packs, errors } = loadAllRulePacks(dir);
      expect(packs.map((p) => p.id)).toEqual(['good']);
      expect(errors).toHaveLength(1);
      expect(errors[0].id).toBe('broken');
    });
  });

  describe('facts, one test per form_schema shape', () => {
    it('steps: the step title is the group, the key is the field id', () => {
      const pack = readRulePack('x', {
        form_schema: {
          steps: [
            {
              step: 1,
              title: 'Case Details',
              fields: [
                { field_id: 'fir_number', label: 'FIR Number', type: 'text', required: true },
                {
                  field_id: 'custody',
                  label: 'In custody?',
                  type: 'dropdown',
                  required: false,
                  options: [
                    { id: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ],
                },
              ],
            },
            { step: 2, title: 'Empty step', fields: [] },
          ],
        },
      });
      expect(pack.schemaShape).toBe('steps');
      expect(pack.facts).toEqual([
        {
          key: 'fir_number',
          group: 'Case Details',
          name: 'fir_number',
          label: 'FIR Number',
          type: 'text',
          required: true,
          options: [],
        },
        {
          key: 'custody',
          group: 'Case Details',
          name: 'custody',
          label: 'In custody?',
          type: 'dropdown',
          required: false,
          options: ['Yes', 'No'],
          option_ids: ['yes', 'no'],
        },
      ]);
      expect(pack.groups.map((g) => [g.name, g.factCount, g.detail])).toEqual([
        ['Case Details', 2, 'full'],
        ['Empty step', 0, 'none'],
      ]);
    });

    it('list: no groups, the key is `name`', () => {
      const pack = readRulePack('x', {
        form_schema: [
          { name: 'petitioner_name', label: 'Petitioner Name', type: 'text', required: true },
          { name: 'state', label: 'State', type: 'select', options: ['Bihar', 'Jharkhand'] },
          'not a field',
          { label: 'No key' },
        ],
      });
      expect(pack.schemaShape).toBe('list');
      expect(pack.groups).toEqual([]);
      expect(pack.facts.map((f) => [f.key, f.group, f.required, f.options])).toEqual([
        ['petitioner_name', null, true, []],
        ['state', null, false, ['Bihar', 'Jharkhand']],
      ]);
      expect(pack.notes).toEqual([
        'form_schema[2]: not an object, skipped',
        'form_schema[3]: no field_id, id or name, skipped',
      ]);
    });

    it('fields: the key is `id`, and `name` is the label when there is no label', () => {
      const pack = readRulePack('x', {
        form_schema: {
          fields: [
            { id: 'plaintiff_name', label: 'Plaintiff full name', type: 'text', required: true },
            { id: 'collusion_denial', name: 'Express denial of collusion', type: 'boolean' },
            { id: 'no_label_at_all', type: 'text', required: true },
          ],
        },
      });
      expect(pack.schemaShape).toBe('fields');
      expect(pack.facts.map((f) => [f.key, f.label, f.required])).toEqual([
        ['plaintiff_name', 'Plaintiff full name', true],
        ['collusion_denial', 'Express denial of collusion', false],
        ['no_label_at_all', 'No label at all', true],
      ]);
    });

    it('json_schema: `required` lists decide, and a nested object is a group', () => {
      const pack = readRulePack('x', {
        form_schema: {
          type: 'object',
          required: ['disclosing_party', 'purpose'],
          properties: {
            nda_type: { type: 'string', enum: ['One-way', 'Mutual'] },
            disclosing_party: {
              type: 'object',
              properties: { name: { type: 'string' }, address: { type: 'string' } },
            },
            receiving_party: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string' }, address: { type: 'string' } },
            },
            purpose: { type: 'string', title: 'Purpose of disclosure' },
          },
        },
      });
      expect(pack.schemaShape).toBe('json_schema');
      expect(pack.facts.map((f) => [f.key, f.group, f.required])).toEqual([
        ['nda_type', null, false],
        ['disclosing_party.name', 'disclosing_party', false],
        ['disclosing_party.address', 'disclosing_party', false],
        ['receiving_party.name', 'receiving_party', true],
        ['receiving_party.address', 'receiving_party', false],
        ['purpose', null, true],
      ]);
      expect(pack.facts[0].options).toEqual(['One-way', 'Mutual']);
      expect(pack.facts[5].label).toBe('Purpose of disclosure');
      expect(pack.groups.map((g) => [g.name, g.required, g.factCount])).toEqual([
        ['disclosing_party', true, 2],
        ['receiving_party', false, 2],
      ]);
      // The pack requires the disclosing party but marks none of its facts as required.
      expect(findRulePackGaps(pack).requiredGroupsWithNoRequiredFact).toEqual(['disclosing_party']);
    });

    it('groups: a key with a field type is a fact with no group', () => {
      const pack = readRulePack('x', {
        form_schema: {
          petitioner_name: { type: 'string', required: true, label: 'Petitioner Full Name' },
          ground: { type: 'enum', values: ['non_payment', 'subletting'], required: true },
          notes: { type: 'textarea', required: false },
        },
      });
      expect(pack.schemaShape).toBe('groups');
      expect(pack.groups).toEqual([]);
      expect(pack.facts.map((f) => [f.key, f.required, f.options])).toEqual([
        ['petitioner_name', true, []],
        ['ground', true, ['non_payment', 'subletting']],
        ['notes', false, []],
      ]);
    });

    it('groups: a section of written-out facts', () => {
      const pack = readRulePack('x', {
        form_schema: {
          case_details: {
            case_number: { type: 'string', required: true, label: 'Case Number' },
            year: { type: 'string', required: false, label: 'Year' },
          },
          parties: {
            petitioner_name: { type: 'string', required: true, label: 'Petitioner' },
          },
        },
      });
      expect(pack.facts.map((f) => [f.key, f.group, f.required])).toEqual([
        ['case_details.case_number', 'case_details', true],
        ['case_details.year', 'case_details', false],
        ['parties.petitioner_name', 'parties', true],
      ]);
      expect(pack.groups.map((g) => [g.name, g.required, g.detail])).toEqual([
        ['case_details', null, 'full'],
        ['parties', null, 'full'],
      ]);
    });

    it('groups: a group that only lists names gives required facts with those names', () => {
      const pack = readRulePack('x', {
        form_schema: {
          sender: { type: 'object', required: ['name', 'address'] },
          recipient: { type: 'object', required: ['name'], note: 'The noticee' },
          rent_arrears: { type: 'object', required: ['amount'], optional: true },
        },
      });
      expect(pack.facts.map((f) => [f.key, f.label, f.required, f.type])).toEqual([
        ['sender.name', 'Sender: name', true, null],
        ['sender.address', 'Sender: address', true, null],
        ['recipient.name', 'Recipient: name', true, null],
        // An optional group may not apply, so its facts are not required.
        ['rent_arrears.amount', 'Rent arrears: amount', false, null],
      ]);
      expect(pack.groups.map((g) => [g.name, g.detail, g.optional, g.note])).toEqual([
        ['sender', 'names_only', false, null],
        ['recipient', 'names_only', false, 'The noticee'],
        ['rent_arrears', 'names_only', true, null],
      ]);
      expect(findRulePackGaps(pack).namesOnlyGroups).toEqual([
        'sender',
        'recipient',
        'rent_arrears',
      ]);
    });

    it('groups: a group that names no facts is reported', () => {
      const pack = readRulePack('x', {
        form_schema: {
          sender: { type: 'object' },
          contract: { type: 'object', required: [] },
          demand: { type: 'object', properties: {} },
          bad: 'text',
        },
      });
      expect(pack.facts).toEqual([]);
      expect(findRulePackGaps(pack).emptyGroups).toEqual(['sender', 'contract', 'demand']);
      expect(pack.notes).toEqual(['form_schema.bad: not an object, skipped']);
    });

    it('groups: a group written as a JSON Schema object', () => {
      const pack = readRulePack('x', {
        form_schema: {
          sender: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' }, phone: { type: 'string' } },
          },
        },
      });
      expect(pack.facts.map((f) => [f.key, f.required])).toEqual([
        ['sender.name', true],
        ['sender.phone', false],
      ]);
      expect(pack.groups[0]).toMatchObject({ name: 'sender', factCount: 2, detail: 'full' });
    });

    it('no form_schema, or one that is not a list or an object', () => {
      expect(readRulePack('x', {}).schemaShape).toBe('absent');
      const odd = readRulePack('x', { form_schema: 'text' });
      expect(odd.schemaShape).toBe('unknown');
      expect(odd.facts).toEqual([]);
      expect(odd.notes).toEqual(['form_schema: unsupported root (string), no facts read']);
    });

    it('notes a fact that appears twice', () => {
      const pack = readRulePack('x', {
        form_schema: [{ name: 'a' }, { name: 'a' }],
      });
      expect(pack.notes).toEqual(["fact 'a' appears more than once"]);
    });
  });

  describe('mandatory clauses', () => {
    it('reads a list of strings', () => {
      const pack = readRulePack('x', { mandatory_clauses: ['Prayer for cancellation', '  '] });
      expect(pack.mandatoryClauses).toEqual([
        {
          id: 'prayer_for_cancellation',
          title: 'Prayer for cancellation',
          detail: null,
          fixedText: null,
          required: true,
          appliesWhen: null,
          statutoryBasis: null,
          parts: [],
          extra: {},
        },
      ]);
    });

    it('reads { id, name, description, required }', () => {
      const pack = readRulePack('x', {
        mandatoryClauses: [
          {
            id: 'grounds',
            name: 'Grounds for Bail',
            description: 'Specific grounds',
            required: true,
          },
          { id: 'optional_one', name: 'Optional', required: false },
        ],
      });
      expect(pack.mandatoryClauses.map((c) => [c.id, c.title, c.detail, c.required])).toEqual([
        ['grounds', 'Grounds for Bail', 'Specific grounds', true],
        ['optional_one', 'Optional', null, false],
      ]);
    });

    it('reads { clause_id, title, content, must_appear } and keeps what it does not interpret', () => {
      const pack = readRulePack('x', {
        mandatory_clauses: [
          {
            clause_id: 'name_clause',
            title: 'I. Name Clause',
            statutory_basis: 'S.4(1)(a)',
            content: 'The name of the Company is {{company_name}}.',
            must_appear: true,
          },
          {
            clause_id: 'objects',
            title: 'III. Objects',
            subclauses: ['A. Main objects', 'B. Ancillary'],
            note: 'Ultra vires acts are void',
            must_appear: true,
          },
          {
            clause_id: 'table',
            title: 'Subscribers',
            fields: ['Name', 'Address'],
            must_appear: true,
          },
          {
            clause_id: 'dpdp',
            title: 'Data Protection',
            must_appear: false,
            applies_when: 'Personal data is disclosed',
            applies_to_during_term: true,
          },
          {
            clause_id: 'guided',
            title: 'Cause Title',
            required: true,
            content_guidance: 'Mirror the petition',
          },
        ],
      });
      const [name, objects, table, dpdp, guided] = pack.mandatoryClauses;
      expect(name).toMatchObject({
        id: 'name_clause',
        title: 'I. Name Clause',
        fixedText: 'The name of the Company is {{company_name}}.',
        statutoryBasis: 'S.4(1)(a)',
        required: true,
      });
      expect(objects).toMatchObject({
        detail: 'Ultra vires acts are void',
        parts: ['A. Main objects', 'B. Ancillary'],
      });
      expect(table.parts).toEqual(['Name', 'Address']);
      expect(dpdp).toMatchObject({
        required: false,
        appliesWhen: 'Personal data is disclosed',
        extra: { applies_to_during_term: true },
      });
      expect(guided.detail).toBe('Mirror the petition');
    });

    it('uses mandatoryClauses when both lists are present, and says so', () => {
      const pack = readRulePack('x', {
        mandatory_clauses: ['short form one', 'short form two'],
        mandatoryClauses: [{ id: 'locus', name: 'Locus of Petitioner' }],
      });
      expect(pack.mandatoryClauses.map((c) => c.id)).toEqual(['locus']);
      expect(pack.notes[0]).toMatch(/both mandatoryClauses \(1\) and mandatory_clauses \(2\)/);
    });

    it('falls back to mandatory_clauses when mandatoryClauses is empty', () => {
      const pack = readRulePack('x', { mandatoryClauses: [], mandatory_clauses: ['one'] });
      expect(pack.mandatoryClauses.map((c) => c.title)).toEqual(['one']);
    });

    it('skips a clause it cannot name', () => {
      const pack = readRulePack('x', { mandatory_clauses: [{ required: true }, 7] });
      expect(pack.mandatoryClauses).toEqual([]);
      expect(pack.notes).toHaveLength(2);
    });
  });

  describe('fixed parts', () => {
    it('reads the cause title, prayer and verification', () => {
      const pack = readRulePack('x', {
        causeTitle: {
          format: 'IN THE COURT OF {courtDesignation}',
          caseNomenclature: 'BAIL APPLICATION No. _____',
          partyDesignations: [
            { role: 'applicant', label: 'Applicant/Accused' },
            { role: 'state' },
            3,
          ],
        },
        prayerTemplate: 'PRAYER …',
        verificationTemplate: 'VERIFICATION …',
      });
      expect(pack.causeTitle).toEqual({
        format: 'IN THE COURT OF {courtDesignation}',
        caseNomenclature: 'BAIL APPLICATION No. _____',
        partyDesignations: [
          { role: 'applicant', label: 'Applicant/Accused' },
          { role: 'state', label: 'State' },
        ],
      });
      expect(pack.prayerTemplate).toBe('PRAYER …');
      expect(pack.verificationTemplate).toBe('VERIFICATION …');
      expect(findRulePackGaps(pack).absentFixedParts).toEqual([]);
    });

    it('reports the fixed parts that are absent or empty', () => {
      const pack = readRulePack('x', {
        causeTitle: {},
        prayerTemplate: '',
        verificationTemplate: '  ',
      });
      expect(pack.causeTitle).toBeNull();
      expect(pack.prayerTemplate).toBeNull();
      expect(pack.verificationTemplate).toBeNull();
      expect(findRulePackGaps(pack).absentFixedParts).toEqual([
        'cause title',
        'prayer',
        'verification',
      ]);
    });

    it('accepts a cause title written as a string', () => {
      expect(readRulePack('x', { causeTitle: 'BEFORE THE NOTARY' }).causeTitle).toEqual({
        format: 'BEFORE THE NOTARY',
        caseNomenclature: null,
        partyDesignations: [],
      });
    });
  });

  describe('drafting instructions', () => {
    it('reads prompt_context as a string, then promptInstructions', () => {
      const pack = readRulePack('x', {
        prompt_context: 'Draft an application for cancellation of bail.',
        promptInstructions: ['State the bail order.', 'State the grounds.'],
      });
      expect(pack.draftingInstructions).toEqual([
        'Draft an application for cancellation of bail.',
        'State the bail order.',
        'State the grounds.',
      ]);
    });

    it('reads prompt_context { promptInstructions } without a label', () => {
      const pack = readRulePack('x', { prompt_context: { promptInstructions: ['One.', 'Two.'] } });
      expect(pack.draftingInstructions).toEqual(['One.', 'Two.']);
    });

    it('labels the other keys so each line stands alone', () => {
      const pack = readRulePack('x', {
        prompt_context: {
          system_role: 'You are drafting an NDA.',
          drafting_rules: ['Define CI.'],
          tone: 'Formal',
          must_avoid: ['Vague relief'],
          structure: { opening: 'Cause title', body: ['Facts', 'Grounds'] },
        },
      });
      expect(pack.draftingInstructions).toEqual([
        'System role: You are drafting an NDA.',
        'Define CI.',
        'Tone: Formal',
        'Must avoid: Vague relief',
        'Structure, opening: Cause title',
        'Structure, body: Facts',
        'Structure, body: Grounds',
      ]);
    });

    it('does not repeat an instruction that appears in both places', () => {
      const pack = readRulePack('x', {
        prompt_context: { promptInstructions: ['Same.'] },
        promptInstructions: ['Same.', 'Other.'],
      });
      expect(pack.draftingInstructions).toEqual(['Same.', 'Other.']);
    });
  });

  describe('validation rules', () => {
    it('reads strings', () => {
      expect(
        readRulePack('x', { validation_rules: ['amount must be > 0'] }).validationRules,
      ).toEqual([{ rule: 'amount must be > 0', detail: null, severity: null }]);
    });

    it('reads { rule, check }, { rule, description } and { rule, severity }', () => {
      const pack = readRulePack('x', {
        validation_rules: [
          { rule: 'CI defined', check: 'Definition clause present' },
          { rule: 'exact_words', description: 'Reproduce verbatim' },
          { rule: 'Order date given', severity: 'blocker' },
          { nothing: true },
        ],
      });
      expect(pack.validationRules).toEqual([
        { rule: 'CI defined', detail: 'Definition clause present', severity: null },
        { rule: 'exact_words', detail: 'Reproduce verbatim', severity: null },
        { rule: 'Order date given', detail: null, severity: 'blocker' },
      ]);
      expect(pack.notes).toEqual(['validation_rules[3]: not read']);
    });

    it('reads a map of rule name to text', () => {
      const pack = readRulePack('x', {
        validation_rules: {
          chronological_order: 'ERROR if dates are not ascending.',
          strict: true,
        },
      });
      expect(pack.validationRules).toEqual([
        {
          rule: 'chronological_order',
          detail: 'ERROR if dates are not ascending.',
          severity: null,
        },
        { rule: 'strict', detail: 'true', severity: null },
      ]);
    });

    it('gives an empty list when there are none', () => {
      expect(readRulePack('x', {}).validationRules).toEqual([]);
    });
  });

  describe('relevant acts', () => {
    it('reads every way the packs write an act', () => {
      const pack = readRulePack('x', {
        relevantActs: [
          'Oaths Act 1969',
          { act: 'BNSS, 2023', sections: [{ number: '480', description: 'Bail' }] },
          { act: 'Companies Act 2013', sections: ['S.5', 'S.6'] },
          { act: 'Constitution of India', provisions: ['Article 226'], notes: 'Supervisory' },
          { name: 'Constitution', articles: ['32', '226'] },
          {
            act: 'State Money-Lenders Acts',
            state_specific: true,
            applies_when: 'Private lending',
          },
          { sections: ['no act'] },
        ],
        relatedActs: [
          { act: 'PWDVA, 2005', applicableWhen: 'dv_dowry', sections: [{ number: '12' }] },
        ],
      });
      expect(pack.relevantActs).toEqual([
        {
          act: 'Oaths Act 1969',
          sections: [],
          note: null,
          appliesWhen: null,
          stateSpecific: false,
        },
        {
          act: 'BNSS, 2023',
          sections: [{ number: '480', description: 'Bail' }],
          note: null,
          appliesWhen: null,
          stateSpecific: false,
        },
        {
          act: 'Companies Act 2013',
          sections: [
            { number: 'S.5', description: null },
            { number: 'S.6', description: null },
          ],
          note: null,
          appliesWhen: null,
          stateSpecific: false,
        },
        {
          act: 'Constitution of India',
          sections: [{ number: 'Article 226', description: null }],
          note: 'Supervisory',
          appliesWhen: null,
          stateSpecific: false,
        },
        {
          act: 'Constitution',
          sections: [
            { number: 'Article 32', description: null },
            { number: 'Article 226', description: null },
          ],
          note: null,
          appliesWhen: null,
          stateSpecific: false,
        },
        {
          act: 'State Money-Lenders Acts',
          sections: [],
          note: null,
          appliesWhen: 'Private lending',
          stateSpecific: true,
        },
        {
          act: 'PWDVA, 2005',
          sections: [{ number: '12', description: null }],
          note: null,
          appliesWhen: 'dv_dowry',
          stateSpecific: false,
        },
      ]);
      expect(pack.notes).toEqual(['relevantActs[6]: no act name, skipped']);
    });
  });

  describe('the rest of the pack', () => {
    it('reads either spelling of the filing checklist', () => {
      expect(readRulePack('x', { filing_checklist: ['Vakalatnama'] }).filingChecklist).toEqual([
        'Vakalatnama',
      ]);
      expect(
        readRulePack('x', { filingChecklist: ['Affidavit'], filing_checklist: ['Old'] })
          .filingChecklist,
      ).toEqual(['Affidavit']);
    });

    it('reads the name, category and court levels', () => {
      const pack = readRulePack('bail_regular', {
        displayName: 'Regular Bail Application',
        title: 'Other',
        category: 'criminal',
        court_levels: ['sessions', 'high_court'],
      });
      expect(pack.name).toBe('Regular Bail Application');
      expect(pack.category).toBe('criminal');
      expect(pack.courtLevels).toEqual(['sessions', 'high_court']);
      expect(readRulePack('x', { title: 'From title' }).name).toBe('From title');
      expect(readRulePack('plaint_recovery', {}).name).toBe('Plaint recovery');
      expect(readRulePack('x', {}).courtLevels).toEqual([]);
    });

    it('lists the keys it does not return', () => {
      const pack = readRulePack('x', {
        _meta: {},
        title: 'T',
        key_citations: ['A v. B'],
        disclaimer: 'Draft only',
      });
      expect(pack.unreadKeys).toEqual(['key_citations', 'disclaimer']);
    });

    it('notes an id inside the file that differs from the file name', () => {
      const pack = readRulePack('bail_regular', { template_id: 'bail', docType: 'bail_regular' });
      expect(pack.notes).toEqual(["template_id is 'bail' but the file is 'bail_regular.json'"]);
    });
  });

  describe('the gap report', () => {
    it('has a row for every pack and the summary counts', () => {
      const result = loadAllRulePacks();
      const report = buildRulePackReport(result, '6 Oct 2026');
      expect(report).toContain(
        `Packs read: ${result.packs.length}. Packs that could not be read: 0.`,
      );
      for (const pack of result.packs) {
        expect(report).toContain(`| \`${pack.id}\` |`);
      }
      expect(report).not.toContain('## Packs that could not be read');
    });

    it('lists a pack that could not be read, the gaps and the unread keys', () => {
      const pack = readRulePack('demo', {
        form_schema: {
          sender: { type: 'object' },
          recipient: { type: 'object', required: ['name'] },
        },
        key_citations: ['A v. B'],
        mandatory_clauses: [7],
      });
      const report = buildRulePackReport(
        { packs: [pack], errors: [{ id: 'broken', message: 'is not valid JSON' }] },
        '6 Oct 2026',
      );
      expect(report).toContain('## Packs that could not be read');
      expect(report).toContain('- `broken`: is not valid JSON');
      expect(report).toContain(
        '| `demo` | groups | 1 | 1 | `sender` | `recipient` | None | cause title, prayer, verification | 0 |',
      );
      expect(report).toContain('- `demo`: mandatory clause 1: not a string or an object, skipped');
      expect(report).toContain('| `key_citations` | 1 | demo |');
      expect(report).toContain('Packs with no mandatory clause: 1.');
    });
  });
});
