/**
 * The "More" tab's contents.
 *
 * Mobile has four fixed tabs — Home, Book, Messages, Profile — plus Admin for
 * facility staff. Community lives here too, always available, alongside any
 * flagged features the selected facility has enabled. Because Community has
 * no flag, More itself is always visible.
 *
 * Web reaches the same screens from its sidebar; the flags and the wording are
 * kept in step with `UnifiedSidebar`.
 */

import { FEATURE_FLAGS, type FeatureFlagKey } from '../../../shared/constants/featureFlags';

export interface MoreMenuItem {
  key: string;
  label: string;
  description: string;
  /** Ionicons name. */
  icon: string;
  /** Route to push, relative to the app root. */
  route: string;
  /** Feature flag gating this item. Omitted for items that are always available. */
  flag?: FeatureFlagKey;
}

/**
 * Every item that can appear, in display order. Order matches web's sidebar so
 * a member moving between the two finds things in the same sequence.
 */
export const MORE_MENU_ITEMS: MoreMenuItem[] = [
  {
    key: 'community',
    label: 'Community',
    description: 'Find hitting partners, the bulletin board, and notifications',
    icon: 'people-outline',
    route: '/(tabs)/community',
  },
  {
    key: 'shop',
    label: 'Pro Shop',
    description: 'Browse and buy from your club',
    icon: 'cart-outline',
    route: '/pro-shop',
    flag: FEATURE_FLAGS.PRO_SHOP,
  },
  {
    key: 'lessons',
    label: 'Lessons',
    description: 'Clinics and lessons at your club',
    icon: 'school-outline',
    route: '/lessons',
    flag: FEATURE_FLAGS.LESSONS_TAB,
  },
  {
    key: 'padel',
    label: 'Padel',
    description: 'Social play sessions and open matches',
    icon: 'trophy-outline',
    route: '/padel',
    flag: FEATURE_FLAGS.PADEL,
  },
  {
    key: 'ball-machine',
    label: 'Ball Machine',
    description: 'Passes and court access codes',
    icon: 'tennisball-outline',
    route: '/ball-machine',
    flag: FEATURE_FLAGS.BALL_MACHINE,
  },
  {
    key: 'level-group',
    label: 'My Player Group',
    description: 'Your skill group and who is in it',
    icon: 'people-circle-outline',
    route: '/level-group',
    flag: FEATURE_FLAGS.PLAYER_LEVEL_GROUPS,
  },
];

/** The menu items available to this facility, in display order. */
export function getMoreMenuItems(isFeatureEnabled: (flag: FeatureFlagKey) => boolean): MoreMenuItem[] {
  return MORE_MENU_ITEMS.filter((item) => !item.flag || isFeatureEnabled(item.flag));
}

/** Whether the More tab should appear at all. Always true — Community has no flag. */
export function shouldShowMoreTab(isFeatureEnabled: (flag: FeatureFlagKey) => boolean): boolean {
  return getMoreMenuItems(isFeatureEnabled).length > 0;
}
