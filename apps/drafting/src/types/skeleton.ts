/**
 * The signed clause skeleton of a pack (ADR-025 D1, "Skeleton file"; T-373 / T-374).
 *
 * LEGAL CONTENT is the data, not this file: each skeleton is Ajay's signed
 * `handoff/legal/skeleton-<pack>-signed.md`, generated into
 * `config/document-rules/_skeletons/<pack>.json` and read by T-374's
 * `loadSkeleton` in `rule-pack.service.ts`, which returns the clauses exactly as
 * signed, with the slot aliases already resolved to this pack's ledger keys.
 *
 * The shape is the ADR format plus Ajay's signed extensions (re-sign 0204a7e):
 * `when`, `variants`, `none_values`, `derived`, `render_if_any_slot`,
 * `skip_if_rendered`, and grounds rendered from `grounds_for_bail` with one
 * signed sentence per option (`list` + `from` + `items`). A loader must keep
 * every one of these; it must not drop them.
 *
 * Types only. Rendering is `services/draft-renderer.ts`.
 */

/** A value a condition compares a ledger fact with (case, spacing and punctuation folded). */
export type SkeletonValue = string | number | boolean;

/**
 * The values of `in` / `not_in`: a list written in the skeleton, or the name of
 * a signed list held elsewhere. Names in the signed skeletons: `none_values`
 * (the skeleton's own `none_values`, i.e. the T-334 `first_bail_application`
 * equals list) and `<averment id>.equals` (that averment's signed list, e.g.
 * `no_recovery.equals`), and a `<prefix>_none_values` name for a list the
 * skeleton holds at its top level (e.g. `antecedents_none_values`, d87355a).
 * A name that cannot be resolved fails closed.
 */
export type SkeletonValueSet = SkeletonValue[] | string;

/** A test on one ledger key. Exactly one of `in`, `not_in`, `present`. */
export interface SkeletonKeyCondition {
  key: string;
  /** Some entry of the fact is one of these. */
  in?: SkeletonValueSet;
  /** The fact is held and no entry is one of these. */
  not_in?: SkeletonValueSet;
  /** The fact is held with a non-empty display. */
  present?: boolean;
}

/** Every inner condition holds. */
export interface SkeletonAllOfCondition {
  all_of: SkeletonCondition[];
}

/** A condition on ledger values. A key the ledger does not hold never satisfies one. */
export type SkeletonCondition = SkeletonKeyCondition | SkeletonAllOfCondition;

/** One alternate signed text of a clause, used when its `when` holds. The first that holds wins. */
export interface SkeletonVariant {
  when: SkeletonCondition;
  text: string;
  slots?: string[];
}

/** A slot whose text is looked up from a choice fact (by option id), not printed from a display. */
export interface SkeletonDerivedSlot {
  /** The ledger key the slot is derived from. */
  from: string;
  /** Option id (or value) of that fact to the signed words to print. */
  map: Record<string, string>;
}

/** The signed sentence for one option of a list clause (one ticked ground). */
export interface SkeletonListItem {
  text?: string;
  slots?: string[];
  /** Print the named clause's rendered text for this option instead of a sentence of its own. */
  use_clause?: string;
  /** When this does not hold, the item renders its MISSING form. */
  requires?: SkeletonCondition;
  missing_label?: string;
}

export type SkeletonSource = 'fixed' | 'advocate';

export interface SkeletonClause {
  /** The pack's clause id; the required ones are the pack's `mandatoryClauses` ids. */
  id: string;
  /** Position in the body. Rendering is by this order, never by the model's. */
  order: number;
  /** True: a clause with no matching variant, or no fact, renders its MISSING form. */
  required: boolean;
  /** `fixed`: signed wording, slots filled from facts. `advocate`: the advocate's own words for `slot`. */
  source: SkeletonSource;
  /** The signed wording, with `{slot}` where a fact's display goes. */
  text?: string;
  /** Ledger keys (and derived slot names) the text fills. */
  slots?: string[];
  /** `advocate`: the one ledger key whose words the clause carries. */
  slot?: string;
  /** Signed words printed before the advocate's words or the list. */
  intro?: string;
  /** True for a list clause: one item per entry of `from`. */
  list?: boolean;
  /** List clause: the ledger key whose entries (ticked options) are listed. */
  from?: string;
  /** List clause: option id to its signed sentence. */
  items?: Record<string, SkeletonListItem>;
  /** The clause applies only when this holds. */
  when?: SkeletonCondition;
  /** Alternate signed texts; the first whose `when` holds is printed. */
  variants?: SkeletonVariant[];
  /** The label of the clause's MISSING form. */
  missing_label?: string;
  derived?: Record<string, SkeletonDerivedSlot>;
  /** The clause renders only when the ledger holds this key. */
  render_if_any_slot?: string;
  /** `<clauseId>` or `<clauseId>.<option id>`: left out when that was rendered. */
  skip_if_rendered?: string;
  /** T-327 note on the signed skeleton: the brief's blank covers this clause. Not read by the renderer. */
  t327_brief_blank_covers?: boolean;
  /**
   * T-500 (entry list): signed templates printed once per entry of `from`, the
   * first whose placeholders the entry supplies (`skeleton-entries.ts`). With
   * `intro` the lines are lettered under it; without, they print as one paragraph.
   */
  entry_texts?: string[];
  /** T-500: how a value of `from` is read into entries: `enumerated` or `dependant`. None: one entry, `{entry}`. */
  entry_parse?: 'enumerated' | 'dependant';
  /** T-500: the signed sentence the clause's MISSING form prints, with `{missing}` where the blank goes. */
  missing_text?: string;
}

export interface Skeleton {
  pack: string;
  version: number;
  /**
   * The signed reference behind the `none_values` list name, as written, e.g.
   * `first_bail_application.equals (T-334)`.
   */
  none_values?: string;
  /**
   * Ajay's re-sign d87355a: the antecedents "none" phrasings, a list the
   * skeleton holds itself. A list name matching `<prefix>_none_values`
   * (T-374's loader validation) reads the skeleton's own top-level list first.
   */
  antecedents_none_values?: string[];
  /** The pack's mandatory clause ids this skeleton covers (ADR-025 slot list), when the loader gives them. */
  mandatoryClauses?: string[];
  clauses: SkeletonClause[];
}

/** T-374's loader, injected (ADR-025 "Split"): a pack with no skeleton stays on today's path. */
export type LoadSkeleton = (packId: string) => Skeleton | null;
