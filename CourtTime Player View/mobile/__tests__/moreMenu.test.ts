import { describe, expect, it } from '@jest/globals';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { getMoreMenuItems, shouldShowMoreTab, MORE_MENU_ITEMS } from '../src/utils/moreMenu';

/** Builds the predicate the context supplies. */
function enabled(...flags: string[]) {
  const set = new Set(flags);
  return (flag: string) => set.has(flag);
}

describe('More menu', () => {
  it('still shows Community when the facility has no flagged features', () => {
    expect(shouldShowMoreTab(enabled())).toBe(true);
    expect(getMoreMenuItems(enabled()).map((i) => i.key)).toEqual(['community']);
  });

  it('adds flagged features alongside Community as they are enabled', () => {
    expect(shouldShowMoreTab(enabled(FEATURE_FLAGS.LESSONS_TAB))).toBe(true);
  });

  it('lists Community plus only the enabled features', () => {
    const items = getMoreMenuItems(enabled(FEATURE_FLAGS.PRO_SHOP, FEATURE_FLAGS.PADEL));
    expect(items.map((i) => i.key)).toEqual(['community', 'shop', 'padel']);
  });

  it('keeps a stable display order regardless of which flags are on', () => {
    // Enabling them in a different order must not reorder the menu.
    const items = getMoreMenuItems(enabled(FEATURE_FLAGS.PADEL, FEATURE_FLAGS.PRO_SHOP));
    expect(items.map((i) => i.key)).toEqual(['community', 'shop', 'padel']);
  });

  it('every item has a route, icon and label; flagged items also have a flag', () => {
    for (const item of MORE_MENU_ITEMS) {
      expect(item.route.startsWith('/')).toBe(true);
      expect(item.icon).toBeTruthy();
      expect(item.label).toBeTruthy();
      if (item.key !== 'community') {
        expect(item.flag).toBeTruthy();
      }
    }
  });

  it('uses no duplicate routes or keys', () => {
    expect(new Set(MORE_MENU_ITEMS.map((i) => i.key)).size).toBe(MORE_MENU_ITEMS.length);
    expect(new Set(MORE_MENU_ITEMS.map((i) => i.route)).size).toBe(MORE_MENU_ITEMS.length);
  });
});
