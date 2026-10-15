import { groupByCatalogueCategory } from '../catalogueGroups';

// T-365 AC4: the grouping shared by the templates library and "Browse document types".

interface Item {
  id: string;
  cat: string;
  order: number;
}

const categoryOf = (i: Item) => ({ id: i.cat, name: `Name ${i.cat}`, order: i.order });
const item = (id: string, cat: string, order: number): Item => ({ id, cat, order });

describe('groupByCatalogueCategory (T-365 AC4)', () => {
  it('sorts groups by order, not by first appearance', () => {
    const groups = groupByCatalogueCategory(
      [item('a', 'c3', 3), item('b', 'c1', 1), item('c', 'c2', 2)],
      categoryOf,
    );
    expect(groups.map((g) => g.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('carries the category id, name and order onto the group', () => {
    const [g] = groupByCatalogueCategory([item('a', 'c1', 4)], categoryOf);
    expect(g).toMatchObject({ id: 'c1', name: 'Name c1', order: 4 });
  });

  it('keeps input order of items inside a group and puts each item in one group', () => {
    const groups = groupByCatalogueCategory(
      [item('a', 'c2', 2), item('b', 'c1', 1), item('c', 'c2', 2), item('d', 'c1', 1)],
      categoryOf,
    );
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([
      ['b', 'd'],
      ['a', 'c'],
    ]);
  });

  it('keeps first-appearance order for groups with the same order', () => {
    const groups = groupByCatalogueCategory(
      [item('a', 'zeta', 1), item('b', 'alpha', 1), item('c', 'mid', 1)],
      categoryOf,
    );
    expect(groups.map((g) => g.id)).toEqual(['zeta', 'alpha', 'mid']);
  });

  it('sorts a group with a missing order (MAX_SAFE_INTEGER) last', () => {
    const groups = groupByCatalogueCategory(
      [item('a', 'none', Number.MAX_SAFE_INTEGER), item('b', 'c5', 5), item('c', 'c1', 1)],
      categoryOf,
    );
    expect(groups.map((g) => g.id)).toEqual(['c1', 'c5', 'none']);
  });

  it('returns no groups for an empty list', () => {
    expect(groupByCatalogueCategory([], categoryOf)).toEqual([]);
  });

  it('does not mutate the input list', () => {
    const input = [item('a', 'c2', 2), item('b', 'c1', 1)];
    const copy = [...input];
    groupByCatalogueCategory(input, categoryOf);
    expect(input).toEqual(copy);
  });

  it('groups by whatever the accessor returns, so a category fallback works', () => {
    // BrowseTypesStep falls back to the raw `category` when there is no catalogue id.
    const rows = [
      { id: 'a', category: 'civil', catalogueCategory: undefined },
      { id: 'b', category: 'criminal', catalogueCategory: 'bail' },
      { id: 'c', category: 'civil', catalogueCategory: undefined },
    ];
    const groups = groupByCatalogueCategory(rows, (r) => ({
      id: r.catalogueCategory ?? r.category,
      name: r.catalogueCategory ?? r.category,
      order: 1,
    }));
    expect(groups.map((g) => [g.id, g.items.length])).toEqual([
      ['civil', 2],
      ['bail', 1],
    ]);
  });
});
