/**
 * CourtTime-Pickle org reporting service.
 * Revenue rollups from pickle_revenue_events; program/lifecycle analytics are partial stubs.
 */

import { query } from '../../database/connection';

export type RevenueCategory =
  | 'memberships'
  | 'pro_shop'
  | 'academy'
  | 'drop_in'
  | 'private_events'
  | 'sponsorships';

export const REVENUE_CATEGORIES: RevenueCategory[] = [
  'memberships',
  'pro_shop',
  'academy',
  'drop_in',
  'private_events',
  'sponsorships',
];

export interface RevenueRollupRow {
  category: RevenueCategory;
  amountCents: number;
  eventCount: number;
}

export interface RevenueRollupReport {
  orgId: string;
  startDate: string;
  endDate: string;
  totalCents: number;
  byCategory: RevenueRollupRow[];
  byMonth: Array<{ month: string; category: RevenueCategory; amountCents: number }>;
}

export interface ProgramAnalyticsReport {
  orgId: string;
  stub: true;
  registrations: {
    total: number;
    byProgram: Array<{ programName: string; count: number }>;
  };
  demographics: {
    gender: Array<{ label: string; count: number }>;
    ageBands: Array<{ band: string; count: number }>;
  };
  note: string;
}

export interface PlayerLifecycleReport {
  orgId: string;
  stub: true;
  segments: Array<{
    segment: string;
    description: string;
    playerCount: number;
  }>;
  note: string;
}

export interface ReportDateRange {
  startDate?: string;
  endDate?: string;
}

function defaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function getOrgRevenueRollup(
  orgId: string,
  range: ReportDateRange = {}
): Promise<RevenueRollupReport> {
  const defaults = defaultDateRange();
  const startDate = range.startDate || defaults.start;
  const endDate = range.endDate || defaults.end;

  const byCategoryResult = await query(
    `SELECT category, COALESCE(SUM(amount_cents), 0)::int as "amountCents",
            COUNT(*)::int as "eventCount"
     FROM pickle_revenue_events
     WHERE org_id = $1
       AND occurred_at >= $2::date
       AND occurred_at < ($3::date + INTERVAL '1 day')
     GROUP BY category
     ORDER BY category`,
    [orgId, startDate, endDate]
  );

  const byMonthResult = await query(
    `SELECT TO_CHAR(DATE_TRUNC('month', occurred_at), 'YYYY-MM') as month,
            category,
            COALESCE(SUM(amount_cents), 0)::int as "amountCents"
     FROM pickle_revenue_events
     WHERE org_id = $1
       AND occurred_at >= $2::date
       AND occurred_at < ($3::date + INTERVAL '1 day')
     GROUP BY DATE_TRUNC('month', occurred_at), category
     ORDER BY month, category`,
    [orgId, startDate, endDate]
  );

  const categoryMap = new Map<string, RevenueRollupRow>();
  for (const cat of REVENUE_CATEGORIES) {
    categoryMap.set(cat, { category: cat, amountCents: 0, eventCount: 0 });
  }
  for (const row of byCategoryResult.rows) {
    categoryMap.set(row.category, row);
  }

  const byCategory = REVENUE_CATEGORIES.map((cat) => categoryMap.get(cat)!);
  const totalCents = byCategory.reduce((sum, row) => sum + row.amountCents, 0);

  return {
    orgId,
    startDate,
    endDate,
    totalCents,
    byCategory,
    byMonth: byMonthResult.rows,
  };
}

/**
 * Program analytics stub — returns real member counts where available,
 * with placeholder program / demographic breakdowns until academy schema lands.
 */
export async function getProgramAnalytics(orgId: string): Promise<ProgramAnalyticsReport> {
  const memberResult = await query(
    `SELECT COUNT(DISTINCT fm.user_id)::int as total
     FROM facility_memberships fm
     JOIN facilities f ON f.id = fm.facility_id
     WHERE f.org_id = $1 AND f.product_line = 'pickle' AND fm.status = 'active'`,
    [orgId]
  );

  const totalMembers = memberResult.rows[0]?.total || 0;

  return {
    orgId,
    stub: true,
    registrations: {
      total: totalMembers,
      byProgram: [
        { programName: 'Open Play (stub)', count: Math.floor(totalMembers * 0.4) },
        { programName: 'Academy Clinics (stub)', count: Math.floor(totalMembers * 0.25) },
        { programName: 'Leagues (stub)', count: Math.floor(totalMembers * 0.15) },
      ],
    },
    demographics: {
      gender: [
        { label: 'Female (stub)', count: Math.floor(totalMembers * 0.48) },
        { label: 'Male (stub)', count: Math.floor(totalMembers * 0.48) },
        { label: 'Unknown (stub)', count: totalMembers - Math.floor(totalMembers * 0.96) },
      ],
      ageBands: [
        { band: '18-34 (stub)', count: Math.floor(totalMembers * 0.22) },
        { band: '35-49 (stub)', count: Math.floor(totalMembers * 0.35) },
        { band: '50-64 (stub)', count: Math.floor(totalMembers * 0.28) },
        { band: '65+ (stub)', count: Math.max(0, totalMembers - Math.floor(totalMembers * 0.85)) },
      ],
    },
    note: 'Program and demographic breakdowns are placeholders until academy registration schema is implemented.',
  };
}

/**
 * Player lifecycle segments stub — derived from membership activity heuristics.
 */
export async function getPlayerLifecycleSegments(orgId: string): Promise<PlayerLifecycleReport> {
  const activeResult = await query(
    `SELECT COUNT(DISTINCT fm.user_id)::int as count
     FROM facility_memberships fm
     JOIN facilities f ON f.id = fm.facility_id
     WHERE f.org_id = $1 AND f.product_line = 'pickle' AND fm.status = 'active'`,
    [orgId]
  );

  const activeCount = activeResult.rows[0]?.count || 0;
  const atRisk = Math.floor(activeCount * 0.12);
  const churned = Math.floor(activeCount * 0.08);
  const newPlayers = Math.floor(activeCount * 0.15);

  return {
    orgId,
    stub: true,
    segments: [
      {
        segment: 'active',
        description: 'Played or booked within the last 30 days (stub heuristic)',
        playerCount: activeCount,
      },
      {
        segment: 'new',
        description: 'Joined in the last 30 days (stub)',
        playerCount: newPlayers,
      },
      {
        segment: 'at_risk',
        description: 'No activity in 30–60 days (stub)',
        playerCount: atRisk,
      },
      {
        segment: 'churned',
        description: 'Inactive 60+ days (stub)',
        playerCount: churned,
      },
    ],
    note: 'Lifecycle segmentation uses stub heuristics until booking/program attendance feeds are wired.',
  };
}

export async function recordRevenueEvent(params: {
  orgId: string;
  facilityId?: string;
  category: RevenueCategory;
  amountCents: number;
  sourceType?: string;
  sourceId?: string;
  description?: string;
  occurredAt?: string;
}): Promise<{ id: string }> {
  const result = await query(
    `INSERT INTO pickle_revenue_events (
       org_id, facility_id, category, amount_cents, source_type, source_id, description, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
     RETURNING id`,
    [
      params.orgId,
      params.facilityId || null,
      params.category,
      params.amountCents,
      params.sourceType || null,
      params.sourceId || null,
      params.description || null,
      params.occurredAt || null,
    ]
  );
  return { id: result.rows[0].id };
}
