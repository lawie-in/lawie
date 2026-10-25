// T-525: forced-colors (Windows High Contrast) class guards for the selected settings tab.
// jsdom has no forced-colors media, so these pin the classes that carry the behaviour.
import { SettingsTabList, SETTINGS_TABS } from '../SettingsTabs';

import { cleanupMounted, mount } from '@/components/ui/__tests__/nl-test-utils';

afterEach(cleanupMounted);

const SELECTED = [
  'forced-colors:border-[color:Highlight]',
  'forced-colors:bg-[color:Highlight]',
  'forced-colors:text-[color:HighlightText]',
  'forced-colors:[forced-color-adjust:none]',
  'forced-colors:focus-visible:[outline-color:CanvasText]',
];

describe('SettingsTabs forced colours', () => {
  it('only the selected tab carries the Highlight pair, opt-out and CanvasText focus ring', () => {
    mount(<SettingsTabList active="plan" onSelect={() => {}} labelledBy="h" />);
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs).toHaveLength(SETTINGS_TABS.length);
    for (const tab of tabs) {
      const classes = tab.className.split(/\s+/);
      const selected = tab.getAttribute('aria-selected') === 'true';
      for (const c of SELECTED) expect(classes.includes(c)).toBe(selected);
      expect(classes.some((c) => c.startsWith('forced-colors:'))).toBe(selected);
    }
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('the classes follow the selection when the active tab changes', () => {
    const h = mount(<SettingsTabList active="profile" onSelect={() => {}} labelledBy="h" />);
    h.rerender(<SettingsTabList active="account" onSelect={() => {}} labelledBy="h" />);
    const sel = document.querySelector('[aria-selected="true"]') as HTMLElement;
    expect(sel.id).toBe('settings-tab-account');
    for (const c of SELECTED) expect(sel.className.split(/\s+/)).toContain(c);
    expect(document.getElementById('settings-tab-plan')?.className).not.toContain('forced-colors');
  });
});
