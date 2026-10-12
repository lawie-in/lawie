import type { CatalogueCategoryId } from './categories';

/** One template's place in the catalogue: its library category and its Ink price. */
export interface CatalogueEntry {
  readonly category: CatalogueCategoryId;
  readonly price: number;
}

/**
 * One batch file's entries (T-240 AC9-11). Each lead adds and claims only
 * their own batch file; `index.ts` merges every batch at load.
 */
export interface CatalogueBatch {
  /** The batch's name, used in load errors (for example 'base', 'batch1-civil'). */
  readonly name: string;
  /** Template id (the rule file's name without .json) to its entry. */
  readonly templates: Readonly<Record<string, CatalogueEntry>>;
}
