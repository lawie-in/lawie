/**
 * T-600 - web landing catalogue lib. Also proves the JSON import works under the web jest config.
 */
import { headlineCount, landingCatalogue } from '../landingCatalogue';

describe('headlineCount', () => {
  it.each([
    [86, '80+'],
    [90, '90+'],
    [99, '90+'],
    [10, '10+'],
    [9, '0+'],
    [0, '0+'],
    [-5, '0+'],
    [NaN, '0+'],
    [Infinity, '0+'],
  ])('%p -> %p', (n, expected) => {
    expect(headlineCount(n)).toBe(expected);
  });
});

describe('landingCatalogue', () => {
  it('loads the committed JSON', () => {
    expect(Array.isArray(landingCatalogue.categories)).toBe(true);
    expect(landingCatalogue.categories.length).toBeGreaterThan(0);
    expect(new Date(landingCatalogue.generatedAt).toISOString()).toBe(landingCatalogue.generatedAt);
  });

  it('total equals the sum of template counts', () => {
    const sum = landingCatalogue.categories.reduce((n, c) => n + c.templates.length, 0);
    expect(landingCatalogue.total).toBe(sum);
    expect(headlineCount(landingCatalogue.total)).toMatch(/^\d+0\+$/);
  });
});
