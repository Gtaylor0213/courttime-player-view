// Add new feature keys here as you build new features.
// All features default to OFF — enable per facility from the support dashboard.
export const FEATURE_FLAGS = {
  PRO_SHOP: 'pro_shop',
  ANNUAL_MEMBERSHIP_FEES: 'annual_membership_fees',
  PICKLEBALL: 'pickleball',
  WEEK_MONTH_VIEW: 'week_month_view',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_LABELS: Record<string, string> = {
  pro_shop: 'Pro Shop',
  annual_membership_fees: 'Annual Membership Fees',
  pickleball: 'Pickleball (CourtTime-Pickle)',
  week_month_view: 'Week/Month Calendar Overview',
};
