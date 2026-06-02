/**
 * SCRUM-67 — Grounds-vs-facts coherence prompt rule
 *
 * Coverage:
 *   - detectCoherenceMismatches: every COHERENCE_RULE fires when its ground is
 *     selected and the narrative lacks substantiating keywords.
 *   - Each rule does NOT fire when the narrative does contain substantiating
 *     keywords (false-positive prevention).
 *   - Multiple grounds can fire simultaneously / independently.
 *   - Both string and array grounds inputs are accepted.
 *   - buildAIUserPrompt injects the prompt_injection text per mismatch.
 */

import './setupEnv';

import {
  COHERENCE_RULES,
  CoherenceMismatch,
  buildAIUserPrompt,
  detectCoherenceMismatches,
} from '../services/template-engine.service';

// ── detectCoherenceMismatches ─────────────────────────────────────────────────

describe('detectCoherenceMismatches', () => {
  describe('false_implication', () => {
    it('fires when narrative is purely passive (no action words)', () => {
      const m = detectCoherenceMismatches(
        ['false_implication'],
        'The applicant was at home. The FIR was lodged. The applicant has no role.',
      );
      expect(m.map((r) => r.rule_id)).toEqual(['false_implication']);
      expect(m[0].warning_message).toMatch(/false implication/i);
      expect(m[0].prompt_injection).toMatch(/passive presence/i);
    });

    it('does NOT fire when narrative shows positive deeds', () => {
      const m = detectCoherenceMismatches(
        ['false_implication'],
        'The applicant took the victim to the hospital and rendered first-aid.',
      );
      expect(m).toEqual([]);
    });

    it('does NOT fire when narrative explains misidentification', () => {
      const m = detectCoherenceMismatches(
        ['false_implication'],
        'The complainant wrongly named the applicant in a clear case of mistaken identity.',
      );
      expect(m).toEqual([]);
    });
  });

  describe('business_dispute_civil_in_nature', () => {
    it('fires when narrative lacks business keywords', () => {
      const m = detectCoherenceMismatches(
        ['business_dispute_civil_in_nature'],
        'The applicant denies all allegations and is law-abiding.',
      );
      expect(m.map((r) => r.rule_id)).toContain('business_dispute_civil_in_nature');
    });

    it('does NOT fire when narrative names the commercial relationship', () => {
      const m = detectCoherenceMismatches(
        ['business_dispute_civil_in_nature'],
        'The dispute relates to a transport partnership and unpaid invoices between the parties.',
      );
      expect(m).toEqual([]);
    });
  });

  describe('complainant_motive', () => {
    it('fires when narrative shows no prior friction', () => {
      const m = detectCoherenceMismatches(
        ['complainant_motive'],
        'The applicant is innocent of all charges.',
      );
      expect(m.map((r) => r.rule_id)).toContain('complainant_motive');
    });

    it('does NOT fire when narrative mentions prior dispute', () => {
      const m = detectCoherenceMismatches(
        ['complainant_motive'],
        'There has been a long-standing land dispute between the families since 2019.',
      );
      expect(m).toEqual([]);
    });
  });

  describe('medical_grounds', () => {
    it('fires when narrative does not describe a condition', () => {
      const m = detectCoherenceMismatches(
        ['medical_grounds'],
        'The applicant is willing to cooperate with the investigation.',
      );
      expect(m.map((r) => r.rule_id)).toContain('medical_grounds');
    });

    it('does NOT fire when a medical condition is named', () => {
      const m = detectCoherenceMismatches(
        ['medical_grounds'],
        'The applicant has been undergoing cardiac treatment at RIMS since March 2025.',
      );
      expect(m).toEqual([]);
    });
  });

  describe('deep_roots_in_community', () => {
    it('fires when narrative lacks community ties', () => {
      const m = detectCoherenceMismatches(
        ['deep_roots_in_community'],
        'The applicant denies the allegations made against him.',
      );
      expect(m.map((r) => r.rule_id)).toContain('deep_roots_in_community');
    });

    it('does NOT fire when narrative establishes residence and family', () => {
      const m = detectCoherenceMismatches(
        ['deep_roots_in_community'],
        'The applicant has resided in Ranchi for 22 years with his wife and two children.',
      );
      expect(m).toEqual([]);
    });
  });

  describe('professional_reputation', () => {
    it('fires when narrative does not identify a profession', () => {
      const m = detectCoherenceMismatches(
        ['professional_reputation'],
        'The applicant has no criminal antecedents.',
      );
      expect(m.map((r) => r.rule_id)).toContain('professional_reputation');
    });

    it('does NOT fire when profession is named', () => {
      const m = detectCoherenceMismatches(
        ['professional_reputation'],
        'The applicant is employed as a Senior Accounts Officer at a public-sector undertaking.',
      );
      expect(m).toEqual([]);
    });
  });

  // ── Mixed / multi-rule cases ────────────────────────────────────────────────

  it('emits multiple mismatches when several grounds are unsupported', () => {
    const m = detectCoherenceMismatches(
      ['false_implication', 'medical_grounds', 'complainant_motive'],
      'The applicant denies all charges and is innocent.',
    );
    const ids = m.map((r) => r.rule_id).sort();
    expect(ids).toEqual(
      ['complainant_motive', 'false_implication', 'medical_grounds'].sort(),
    );
  });

  it('only emits mismatches for grounds that are actually unsupported', () => {
    const m = detectCoherenceMismatches(
      ['false_implication', 'medical_grounds'],
      // Substantiates medical, not false_implication
      'The applicant has chronic hypertension under treatment.',
    );
    expect(m.map((r) => r.rule_id)).toEqual(['false_implication']);
  });

  // ── Input shapes ────────────────────────────────────────────────────────────

  it('accepts a comma-separated string for grounds (placeholder-context shape)', () => {
    const m = detectCoherenceMismatches(
      'false_implication, complainant_motive',
      'Generic narrative without specifics.',
    );
    expect(m.map((r) => r.rule_id).sort()).toEqual(
      ['complainant_motive', 'false_implication'].sort(),
    );
  });

  it('returns empty for unrecognised ground ids', () => {
    const m = detectCoherenceMismatches(['unknown_ground_xyz'], 'any facts');
    expect(m).toEqual([]);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it.each([
    [undefined, 'some facts'],
    [null, 'some facts'],
    [['false_implication'], undefined],
    [['false_implication'], null],
    [['false_implication'], ''],
    [['false_implication'], '   '],
    [[], 'some facts'],
  ])('returns empty for invalid input (grounds=%p facts=%p)', (g, f) => {
    expect(
      detectCoherenceMismatches(g as string[] | undefined | null, f as string | undefined | null),
    ).toEqual([]);
  });

  it('exports exactly 6 rules (per spec)', () => {
    expect(COHERENCE_RULES.length).toBe(6);
    const ids = COHERENCE_RULES.map((r) => r.groundId).sort();
    expect(ids).toEqual(
      [
        'business_dispute_civil_in_nature',
        'complainant_motive',
        'deep_roots_in_community',
        'false_implication',
        'medical_grounds',
        'professional_reputation',
      ].sort(),
    );
  });

  it('every rule has non-empty prompt_injection and warning_message', () => {
    for (const r of COHERENCE_RULES) {
      expect(r.promptInjection.length).toBeGreaterThan(20);
      expect(r.warningMessage.length).toBeGreaterThan(10);
      expect(r.narrativeKeywords).toBeInstanceOf(RegExp);
    }
  });
});

// ── buildAIUserPrompt integration ─────────────────────────────────────────────

describe('buildAIUserPrompt — coherence injection', () => {
  const bodySection = {
    section_id: 'body',
    type: 'ai_generated' as const,
    prompt_context: 'Draft the body paragraphs based on the facts.',
  };

  it('injects the prompt for an unsupported false_implication ground', () => {
    const prompt = buildAIUserPrompt(bodySection, {
      grounds_for_bail: 'false_implication',
      facts_narrative: 'The applicant denies everything.',
    });
    expect(prompt).toMatch(/COHERENCE:/);
    expect(prompt).toMatch(/False implication/i);
    expect(prompt).toMatch(/passive presence/i);
  });

  it('does NOT inject when the ground is substantiated by the narrative', () => {
    const prompt = buildAIUserPrompt(bodySection, {
      grounds_for_bail: 'false_implication',
      facts_narrative:
        'The applicant took the victim to the hospital and rendered first-aid.',
    });
    expect(prompt).not.toMatch(/COHERENCE:/);
  });

  it('injects multiple coherence blocks for multiple unsupported grounds', () => {
    const prompt = buildAIUserPrompt(bodySection, {
      grounds_for_bail: 'false_implication, professional_reputation',
      facts_narrative: 'The applicant denies all allegations.',
    });
    const occurrences = (prompt.match(/COHERENCE:/g) ?? []).length;
    expect(occurrences).toBe(2);
  });

  it('does not inject when grounds or facts are missing', () => {
    const promptA = buildAIUserPrompt(bodySection, {
      grounds_for_bail: 'false_implication',
      // no facts_narrative
    });
    const promptB = buildAIUserPrompt(bodySection, {
      facts_narrative: 'Some narrative.',
      // no grounds_for_bail
    });
    expect(promptA).not.toMatch(/COHERENCE:/);
    expect(promptB).not.toMatch(/COHERENCE:/);
  });

  it('falls back to grounds_for_quashing or grounds when grounds_for_bail absent', () => {
    const promptQuashing = buildAIUserPrompt(bodySection, {
      grounds_for_quashing: 'complainant_motive',
      facts_narrative: 'Generic narrative.',
    });
    expect(promptQuashing).toMatch(/COHERENCE:/);
  });

  it('shape sanity — returns at least the prompt_context plus the closing draft instruction', () => {
    const prompt = buildAIUserPrompt(bodySection, {
      grounds_for_bail: 'false_implication',
      facts_narrative: 'Generic.',
    });
    expect(prompt).toContain('Draft the body paragraphs based on the facts.');
    expect(prompt).toMatch(/Draft the body paragraphs now:/);
  });

  it('every rule firing produces a unique mismatch (no duplicates)', () => {
    const all: CoherenceMismatch[] = detectCoherenceMismatches(
      COHERENCE_RULES.map((r) => r.groundId),
      'completely empty narrative with no keywords',
    );
    const ids = new Set(all.map((m) => m.rule_id));
    expect(ids.size).toBe(all.length);
  });
});
