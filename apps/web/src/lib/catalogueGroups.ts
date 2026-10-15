/**
 * Catalogue grouping shared by the templates library (/dashboard/templates) and
 * the intake "Browse document types" step (T-365 AC4), so the two screens show
 * the same sections in the same order and cannot drift.
 */

/** A T-240 library category: id, display name and T-239 order. */
export interface CatalogueCategory {
  id: string;
  name: string;
  order: number;
}

export interface CatalogueGroup<T> extends CatalogueCategory {
  items: T[];
}

/**
 * Items grouped by catalogue category, groups sorted by T-239 order. Items keep
 * their input order inside a group; groups with the same order keep the order
 * in which they first appear.
 */
export function groupByCatalogueCategory<T>(
  items: readonly T[],
  categoryOf: (item: T) => CatalogueCategory,
): CatalogueGroup<T>[] {
  const groups = new Map<string, CatalogueGroup<T>>();
  for (const item of items) {
    const category = categoryOf(item);
    const group = groups.get(category.id) ?? { ...category, items: [] };
    group.items.push(item);
    groups.set(category.id, group);
  }
  return Array.from(groups.values()).sort((a, b) => a.order - b.order);
}
