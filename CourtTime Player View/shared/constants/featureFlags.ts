// Add new feature keys here as you build new features.
// All features default to OFF — enable per facility from the support dashboard.
export const FEATURE_FLAGS = {
  PRO_SHOP: 'pro_shop',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

export const FEATURE_FLAG_LABELS: Record<string, string> = {
  pro_shop: 'Pro Shop',
};
