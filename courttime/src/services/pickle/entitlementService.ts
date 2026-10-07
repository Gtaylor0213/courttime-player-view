/**
 * CourtTime-Pickle hybrid entitlement engine.
 * Brand-wide perks (courts, open play) vs home-facility perks (clinics, guest passes).
 * Only invoked for product_line === 'pickle' facilities.
 */

import {
  evaluateEntitlements,
  getMemberSubscription,
  getFacilityOrgId,
  incrementHomePerkUsage,
  currentPeriodMonth,
  type HomePerkType,
  type EvaluatedEntitlements,
} from './pickleMembershipService';

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  discountPercent?: number;
  dropInPriceCents?: number;
  entitlements?: EvaluatedEntitlements;
}

export interface DropInPriceResult {
  priceCents: number;
  isMember: boolean;
  tier?: string;
  discountPercent?: number;
}

const BRAND_PROGRAM_TYPES = new Set(['open_play', 'round_robin', 'kings_court', 'social']);
const BRAND_DISCOUNT_PROGRAM_TYPES = new Set(['league', 'tournament']);
const HOME_PROGRAM_TYPES = new Set(['clinic']);

export async function canBookCourt(
  userId: string,
  facilityId: string,
  _bookingType?: string
): Promise<EntitlementCheckResult> {
  const orgId = await getFacilityOrgId(facilityId);
  if (!orgId) {
    return { allowed: true, reason: 'classic_facility' };
  }

  const evaluated = await evaluateEntitlements(userId, orgId, facilityId);

  if (!evaluated.brandWide) {
    return {
      allowed: false,
      reason: 'No active membership or product not rolled out at this location',
      dropInPriceCents: evaluated.dropInPriceCents,
      entitlements: evaluated,
    };
  }

  if (!evaluated.brandWide.courtBooking) {
    return {
      allowed: false,
      reason: 'Membership tier does not include court booking',
      dropInPriceCents: evaluated.dropInPriceCents,
      entitlements: evaluated,
    };
  }

  return {
    allowed: true,
    discountPercent: evaluated.brandWide.courtDiscountPercent,
    dropInPriceCents: evaluated.dropInPriceCents,
    entitlements: evaluated,
  };
}

export async function canJoinProgram(
  userId: string,
  facilityId: string,
  programType: string
): Promise<EntitlementCheckResult> {
  const orgId = await getFacilityOrgId(facilityId);
  if (!orgId) {
    return { allowed: true, reason: 'classic_facility' };
  }

  const evaluated = await evaluateEntitlements(userId, orgId, facilityId);
  const normalizedType = programType.toLowerCase();

  if (!evaluated.brandWide && !evaluated.homeFacility) {
    return {
      allowed: false,
      reason: 'No active membership',
      dropInPriceCents: evaluated.dropInPriceCents,
      entitlements: evaluated,
    };
  }

  if (HOME_PROGRAM_TYPES.has(normalizedType)) {
    if (!evaluated.isAtHomeFacility) {
      return {
        allowed: false,
        reason: 'Clinics are available at your home facility only',
        entitlements: evaluated,
      };
    }
    const clinicUsage = evaluated.homePerkUsage.clinic;
    if (!clinicUsage || clinicUsage.remaining <= 0) {
      return {
        allowed: false,
        reason: 'No clinic credits remaining this month',
        entitlements: evaluated,
      };
    }
    return { allowed: true, entitlements: evaluated };
  }

  if (BRAND_PROGRAM_TYPES.has(normalizedType)) {
    const key = normalizedType === 'open_play' ? 'openPlay' : normalizedType === 'social' ? 'socials' : 'openPlay';
    const allowed = evaluated.brandWide?.[key as keyof typeof evaluated.brandWide];
    if (!allowed && normalizedType !== 'round_robin' && normalizedType !== 'kings_court') {
      if (!evaluated.brandWide?.openPlay && !evaluated.brandWide?.socials) {
        return {
          allowed: false,
          reason: 'Membership tier does not include this program type',
          entitlements: evaluated,
        };
      }
    }
    return {
      allowed: true,
      discountPercent: evaluated.brandWide?.courtDiscountPercent ?? 0,
      entitlements: evaluated,
    };
  }

  if (BRAND_DISCOUNT_PROGRAM_TYPES.has(normalizedType)) {
    const leagueKey = normalizedType === 'league' ? 'leagues' : 'tournaments';
    if (!evaluated.brandWide?.[leagueKey as 'leagues' | 'tournaments']) {
      return {
        allowed: false,
        reason: `Membership tier does not include ${normalizedType} access`,
        entitlements: evaluated,
      };
    }
    return {
      allowed: true,
      discountPercent: evaluated.brandWide.courtDiscountPercent,
      entitlements: evaluated,
    };
  }

  return { allowed: true, entitlements: evaluated };
}

export async function consumeHomePerk(
  userId: string,
  orgId: string,
  facilityId: string,
  perkType: HomePerkType
): Promise<{ success: boolean; error?: string; used?: number; remaining?: number }> {
  const subscription = await getMemberSubscription(userId, orgId);
  if (!subscription) {
    return { success: false, error: 'No active subscription' };
  }

  if (subscription.homeFacilityId !== facilityId) {
    return { success: false, error: 'Perk can only be consumed at your home facility' };
  }

  const evaluated = await evaluateEntitlements(userId, orgId, facilityId);
  const usage = evaluated.homePerkUsage[perkType];
  if (!usage || usage.remaining <= 0) {
    return { success: false, error: 'No remaining perk credits' };
  }

  const periodMonth = currentPeriodMonth();
  const result = await incrementHomePerkUsage(subscription.id, perkType, periodMonth);

  return {
    success: true,
    used: result.used,
    remaining: Math.max(0, usage.limit - result.used),
  };
}

export async function getDropInPrice(
  userId: string,
  facilityId: string
): Promise<DropInPriceResult> {
  const orgId = await getFacilityOrgId(facilityId);
  if (!orgId) {
    return { priceCents: 0, isMember: false };
  }

  const evaluated = await evaluateEntitlements(userId, orgId, facilityId);

  if (evaluated.brandWide?.courtBooking && evaluated.dropInPriceCents === 0) {
    return {
      priceCents: 0,
      isMember: true,
      tier: evaluated.product?.tier,
      discountPercent: evaluated.brandWide.courtDiscountPercent,
    };
  }

  if (evaluated.brandWide && evaluated.brandWide.courtDiscountPercent > 0) {
    const base = evaluated.dropInPriceCents || 1500;
    const discounted = Math.round(base * (1 - evaluated.brandWide.courtDiscountPercent / 100));
    return {
      priceCents: discounted,
      isMember: true,
      tier: evaluated.product?.tier,
      discountPercent: evaluated.brandWide.courtDiscountPercent,
    };
  }

  return {
    priceCents: evaluated.dropInPriceCents,
    isMember: Boolean(evaluated.subscription),
    tier: evaluated.product?.tier,
  };
}
