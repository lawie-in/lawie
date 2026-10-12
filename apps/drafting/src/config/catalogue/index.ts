/**
 * The template catalogue (T-240, built on T-227): the ONE place that says,
 * for every template id, which of T-239's 26 library categories it is filed
 * under and what it costs in Ink. Also the one alias map and the prices of
 * the ids that are not rule files.
 *
 * Read by: template-promoter (catalogueCategory + creditsCost on every
 * config, and the load-time checks), template-engine (the docs/templates
 * overrides), template-seed (Mongo), credits.service (the charge) and
 * prompt-assembler (alias resolution). Nothing else may keep its own copy.
 *
 * The rule files' own `category` and `creditsCost` are ignored for the library
 * and the price. Their `category` is still the behaviour value
 * (`TemplateConfig.category`), which this module does not touch.
 *
 * Adding templates (AC9-11, Priya 12 Oct 2026): each batch has its own file
 * in this folder (for example `batch1-civil.ts`, exporting a `CatalogueBatch`),
 * claimed by one lead. Add it to `BATCHES` below. The batches are merged when
 * this module loads; a repeated id, an unknown category or a bad price stops
 * the load (and so the service boot), never a request.
 */
import { DOC_TYPE_ALIASES } from './aliases';
import { BASE_BATCH } from './base';
import { CATALOGUE_CATEGORIES, catalogueCategory, isCatalogueCategoryId } from './categories';
import type { CatalogueCategoryId } from './categories';
import { NON_TEMPLATE_PRICES } from './non-template-prices';
import type { CatalogueBatch, CatalogueEntry } from './types';

export type { CatalogueCategory, CatalogueCategoryId } from './categories';
export type { CatalogueBatch, CatalogueEntry } from './types';
export { CATALOGUE_CATEGORIES, catalogueCategory, isCatalogueCategoryId, DOC_TYPE_ALIASES };
export { NON_TEMPLATE_PRICES };

/** Every batch file, merged in this order. One line per batch. */
const BATCHES: readonly CatalogueBatch[] = [BASE_BATCH];

function hasOwn(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

/**
 * Merge batch files into one frozen id -> entry table. Throws, naming the
 * batch and id, on an id in two batches, a category that is not one of the
 * 26, or a price that is not a whole number of Ink above zero.
 */
export function mergeCatalogueBatches(
  batches: readonly CatalogueBatch[],
): Readonly<Record<string, CatalogueEntry>> {
  const merged: Record<string, CatalogueEntry> = {};
  const from: Record<string, string> = {};
  const errors: string[] = [];
  for (const batch of batches) {
    for (const [id, entry] of Object.entries(batch.templates)) {
      if (hasOwn(merged, id)) {
        errors.push(`${id}: in both ${from[id]} and ${batch.name}`);
        continue;
      }
      if (!isCatalogueCategoryId(entry?.category)) {
        errors.push(
          `${id} (${batch.name}): unknown catalogue category '${String(entry?.category)}'`,
        );
        continue;
      }
      if (!Number.isInteger(entry.price) || entry.price <= 0) {
        errors.push(
          `${id} (${batch.name}): price must be a whole number above 0, got ${String(entry.price)}`,
        );
        continue;
      }
      merged[id] = Object.freeze({ category: entry.category, price: entry.price });
      from[id] = batch.name;
    }
  }
  if (errors.length > 0) {
    throw new Error(`Template catalogue: ${errors.join('; ')}`);
  }
  return Object.freeze(merged);
}

/** Every template id to its library category and Ink price (frozen). */
export const TEMPLATE_CATALOGUE: Readonly<Record<string, CatalogueEntry>> =
  mergeCatalogueBatches(BATCHES);

/**
 * Ink price of every template id, from the merged catalogue (frozen). The price
 * shown and the price charged both read it, through
 * `credits.service#costForTemplate`. There is no default price.
 */
export const TEMPLATE_PRICES: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(Object.entries(TEMPLATE_CATALOGUE).map(([id, e]) => [id, e.price])),
);

// The alias map and the non-template prices must agree with the catalogue:
// an alias points at a template and is not itself a priced id.
{
  const errors: string[] = [];
  for (const [alias, target] of Object.entries(DOC_TYPE_ALIASES)) {
    if (!hasOwn(TEMPLATE_PRICES, target))
      errors.push(`alias ${alias} -> ${target}: no such template`);
    if (hasOwn(TEMPLATE_PRICES, alias) || hasOwn(NON_TEMPLATE_PRICES, alias)) {
      errors.push(`alias ${alias} also has its own price`);
    }
  }
  for (const id of Object.keys(NON_TEMPLATE_PRICES)) {
    if (hasOwn(TEMPLATE_PRICES, id))
      errors.push(`${id}: priced as both a template and a non-template id`);
  }
  if (errors.length > 0) throw new Error(`Template catalogue: ${errors.join('; ')}`);
}

/** The library category of a template id, or `undefined` when the id is not in the catalogue. */
export function catalogueCategoryFor(templateId: string): CatalogueCategoryId | undefined {
  return hasOwn(TEMPLATE_CATALOGUE, templateId)
    ? TEMPLATE_CATALOGUE[templateId].category
    : undefined;
}

/**
 * The library category of a template id. Throws when the id has none: every
 * template must be filed (T-240, Arjun's condition 3).
 */
export function requireCatalogueCategory(templateId: string): CatalogueCategoryId {
  const id = catalogueCategoryFor(templateId);
  if (id === undefined) {
    throw new Error(
      `Template catalogue: no catalogue category for "${templateId}" (config/catalogue)`,
    );
  }
  return id;
}

/** Display name and T-239 order of a category id. Throws on an id that is not one of the 26. */
export function catalogueCategoryDisplay(id: CatalogueCategoryId): { name: string; order: number } {
  const c = catalogueCategory(id);
  if (!c) throw new Error(`Template catalogue: unknown catalogue category '${id}'`);
  return { name: c.name, order: c.order };
}
