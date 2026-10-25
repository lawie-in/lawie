// T-525: which /dashboard routes use the Night Library shell, and which need the layout container.
import {
  NIGHT_LIBRARY_PATHS,
  NIGHT_LIBRARY_SELF_CONTAINED_PATHS,
  isNightLibraryPath,
  needsNightLibraryContainer,
} from '../nightLibraryPaths';

describe('NIGHT_LIBRARY_PATHS', () => {
  it('lists dashboard, settings and payment', () => {
    expect([...NIGHT_LIBRARY_PATHS]).toEqual([
      '/dashboard',
      '/dashboard/settings',
      '/dashboard/payment',
    ]);
    expect([...NIGHT_LIBRARY_SELF_CONTAINED_PATHS]).toEqual(['/dashboard']);
  });
});

// [path, isNight, needsContainer]
const TABLE: [string | null, boolean, boolean][] = [
  [null, false, false],
  ['', false, false],
  ['/', false, false],
  ['/dashboard', true, false],
  ['/dashboard/', true, false],
  ['/dashboard/settings', true, true],
  ['/dashboard/settings/', true, true],
  ['/dashboard/settings/profile', true, true],
  ['/dashboard/settings-x', false, false],
  ['/dashboard/settingsx', false, false],
  ['/dashboard/payment', true, true],
  ['/dashboard/payment/success', true, true],
  ['/dashboard/payment/success/', true, true],
  ['/dashboard/payments', false, false],
  ['/dashboard/new', false, false],
  ['/dashboard/documents', false, false],
  ['/dashboard/documents/abc', false, false],
  ['/dashboard/templates', false, false],
  ['/dashboard//settings', false, false],
  ['/DASHBOARD', false, false],
  ['/dashboardx', false, false],
  ['/login', false, false],
];

describe('isNightLibraryPath / needsNightLibraryContainer', () => {
  it.each(TABLE)('%p -> night %p, container %p', (path, night, container) => {
    expect(isNightLibraryPath(path)).toBe(night);
    expect(needsNightLibraryContainer(path)).toBe(container);
  });

  it('/dashboard is exact: it does not take every sub-route', () => {
    expect(isNightLibraryPath('/dashboard/anything-else')).toBe(false);
  });
});
