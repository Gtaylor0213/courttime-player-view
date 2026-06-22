/**
 * CourtTime-Pickle player lifecycle computation.
 * Derives membership status, activity level, and visit milestones.
 */

import { query } from '../../database/connection';
import { getMemberSubscription } from './pickleMembershipService';
import {
  getVisitCount,
  getLastVisitAt,
  listVisits,
  type PlayerVisit,
} from './picklePlayerProfileService';

export type LifecycleStatus =
  | 'lead'
  | 'drop_in'
  | 'trial_member'
  | 'member'
  | 'past_member';

export type ActivityLevel = 'active' | 'at_risk' | 'inactive';

export interface VisitMilestone {
  key: string;
  label: string;
  visitCount: number;
  achieved: boolean;
  achievedAt?: string;
}

export interface PlayerLifecycleSnapshot {
  userId: string;
  orgId: string;
  status: LifecycleStatus;
  activity: ActivityLevel;
  visitCount: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  milestones: VisitMilestone[];
  recentVisits: PlayerVisit[];
  subscriptionStatus: string | null;
  subscriptionTier: string | null;
}

const MILESTONE_THRESHOLDS = [
  { key: 'first_visit', label: 'First visit', count: 1 },
  { key: 'third_visit', label: '3 visits', count: 3 },
  { key: 'fifth_visit', label: '5 visits', count: 5 },
  { key: 'tenth_visit', label: '10 visits', count: 10 },
  { key: 'twenty_fifth_visit', label: '25 visits', count: 25 },
];

const ACTIVE_DAYS = 30;
const AT_RISK_DAYS = 60;

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function computeActivity(lastVisitAt: string | null, visitCount: number): ActivityLevel {
  if (visitCount === 0) return 'inactive';
  const days = daysSince(lastVisitAt);
  if (days == null) return 'inactive';
  if (days <= ACTIVE_DAYS) return 'active';
  if (days <= AT_RISK_DAYS) return 'at_risk';
  return 'inactive';
}

async function computeStatus(
  userId: string,
  orgId: string,
  visitCount: number
): Promise<{ status: LifecycleStatus; subscriptionStatus: string | null; subscriptionTier: string | null }> {
  const subscription = await getMemberSubscription(userId, orgId);
  const tier = subscription?.product?.tier ?? null;
  const subStatus = subscription?.status ?? null;

  if (subscription && subStatus && ['active', 'trialing', 'past_due'].includes(subStatus)) {
    if (tier === 'trial' || subStatus === 'trialing') {
      return { status: 'trial_member', subscriptionStatus: subStatus, subscriptionTier: tier };
    }
    return { status: 'member', subscriptionStatus: subStatus, subscriptionTier: tier };
  }

  const pastSubResult = await query(
    `SELECT ms.status, p.tier
     FROM member_subscriptions ms
     JOIN org_membership_products p ON p.id = ms.product_id
     WHERE ms.user_id = $1 AND ms.org_id = $2
       AND ms.status IN ('canceled', 'expired')
     ORDER BY ms.updated_at DESC
     LIMIT 1`,
    [userId, orgId]
  );

  if (pastSubResult.rows.length > 0) {
    return {
      status: 'past_member',
      subscriptionStatus: pastSubResult.rows[0].status,
      subscriptionTier: pastSubResult.rows[0].tier,
    };
  }

  if (visitCount > 0) {
    return { status: 'drop_in', subscriptionStatus: null, subscriptionTier: null };
  }

  return { status: 'lead', subscriptionStatus: null, subscriptionTier: null };
}

async function buildMilestones(
  userId: string,
  orgId: string,
  visitCount: number
): Promise<VisitMilestone[]> {
  let visitDates: string[] = [];
  if (visitCount > 0) {
    const result = await query(
      `SELECT visited_at as "visitedAt"
       FROM player_visits
       WHERE user_id = $1 AND org_id = $2
       ORDER BY visited_at ASC`,
      [userId, orgId]
    );
    visitDates = result.rows.map((r) => r.visitedAt as string);
  }

  return MILESTONE_THRESHOLDS.map((m) => {
    const achieved = visitCount >= m.count;
    const achievedAt = achieved && visitDates[m.count - 1]
      ? visitDates[m.count - 1]
      : undefined;
    return {
      key: m.key,
      label: m.label,
      visitCount: m.count,
      achieved,
      achievedAt,
    };
  });
}

export async function getPlayerLifecycle(
  userId: string,
  orgId: string
): Promise<PlayerLifecycleSnapshot> {
  const visitCount = await getVisitCount(userId, orgId);
  const [lastVisitAt, recentVisits, statusInfo, milestones] = await Promise.all([
    getLastVisitAt(userId, orgId),
    listVisits(userId, orgId, 10),
    computeStatus(userId, orgId, visitCount),
    buildMilestones(userId, orgId, visitCount),
  ]);

  const activity = computeActivity(lastVisitAt, visitCount);

  return {
    userId,
    orgId,
    status: statusInfo.status,
    activity,
    visitCount,
    lastVisitAt,
    daysSinceLastVisit: daysSince(lastVisitAt),
    milestones,
    recentVisits,
    subscriptionStatus: statusInfo.subscriptionStatus,
    subscriptionTier: statusInfo.subscriptionTier,
  };
}

export interface OrgLifecycleSummary {
  orgId: string;
  totals: Record<LifecycleStatus, number>;
  activity: Record<ActivityLevel, number>;
  playerCount: number;
}

export async function getOrgLifecycleSummary(orgId: string): Promise<OrgLifecycleSummary> {
  const usersResult = await query(
    `SELECT DISTINCT user_id as "userId"
     FROM (
       SELECT user_id FROM player_visits WHERE org_id = $1
       UNION
       SELECT user_id FROM member_subscriptions WHERE org_id = $1
       UNION
       SELECT user_id FROM pickle_player_profiles WHERE org_id = $1
     ) combined`,
    [orgId]
  );

  const totals: Record<LifecycleStatus, number> = {
    lead: 0,
    drop_in: 0,
    trial_member: 0,
    member: 0,
    past_member: 0,
  };
  const activity: Record<ActivityLevel, number> = {
    active: 0,
    at_risk: 0,
    inactive: 0,
  };

  for (const row of usersResult.rows) {
    const snapshot = await getPlayerLifecycle(row.userId as string, orgId);
    totals[snapshot.status]++;
    activity[snapshot.activity]++;
  }

  return {
    orgId,
    totals,
    activity,
    playerCount: usersResult.rows.length,
  };
}
