/**
 * CourtTime-Pickle leaderboard service.
 * Aggregates player_visits + program_registrations into player_stats cache.
 */

import { query } from '../../database/connection';
import { PRODUCT_LINE_PICKLE } from '../../../shared/constants/productLine';

export type LeaderboardMetric =
  | 'all_time_visits'
  | 'month_visits'
  | 'year_visits'
  | 'programs_attended'
  | 'dupr_rating_snapshot';

export const LEADERBOARD_METRICS: LeaderboardMetric[] = [
  'all_time_visits',
  'month_visits',
  'year_visits',
  'programs_attended',
  'dupr_rating_snapshot',
];

export interface PlayerStatEntry {
  userId: string;
  facilityId?: string;
  orgId: string;
  fullName: string;
  allTimeVisits: number;
  monthVisits: number;
  yearVisits: number;
  programsAttended: number;
  duprRatingSnapshot: number | null;
  rank: number;
}

export interface LeaderboardResult {
  scope: 'facility' | 'org';
  facilityId?: string;
  orgId: string;
  metric: LeaderboardMetric;
  entries: PlayerStatEntry[];
  currentUserEntry?: PlayerStatEntry;
}

const METRIC_SORT: Record<LeaderboardMetric, string> = {
  all_time_visits: '"allTimeVisits"',
  month_visits: '"monthVisits"',
  year_visits: '"yearVisits"',
  programs_attended: '"programsAttended"',
  dupr_rating_snapshot: '"duprRatingSnapshot"',
};

const METRIC_FACILITY_COLUMN: Record<LeaderboardMetric, string> = {
  all_time_visits: 'all_time_visits',
  month_visits: 'month_visits',
  year_visits: 'year_visits',
  programs_attended: 'programs_attended',
  dupr_rating_snapshot: 'dupr_rating_snapshot',
};

function parseMetric(value?: string | null): LeaderboardMetric {
  if (value && LEADERBOARD_METRICS.includes(value as LeaderboardMetric)) {
    return value as LeaderboardMetric;
  }
  return 'all_time_visits';
}

async function assertPickleFacility(facilityId: string): Promise<{ orgId: string }> {
  const result = await query(
    `SELECT org_id as "orgId", product_line as "productLine"
     FROM facilities WHERE id = $1`,
    [facilityId]
  );
  if (result.rows.length === 0) {
    throw new Error('Facility not found');
  }
  const row = result.rows[0];
  if (row.productLine !== PRODUCT_LINE_PICKLE) {
    throw new Error('Leaderboards are only available at CourtTime-Pickle locations');
  }
  if (!row.orgId) {
    throw new Error('Pickle facility is missing organization context');
  }
  return { orgId: row.orgId };
}

async function assertPickleOrg(orgId: string): Promise<void> {
  const result = await query(
    `SELECT id FROM franchise_organizations WHERE id = $1 AND status = 'active'`,
    [orgId]
  );
  if (result.rows.length === 0) {
    throw new Error('Organization not found');
  }
}

async function refreshPlayerStatsForFacility(facilityId: string, orgId: string): Promise<void> {
  await query(
    `WITH visit_stats AS (
       SELECT user_id,
         COUNT(*)::int AS all_time_visits,
         COUNT(*) FILTER (
           WHERE visited_at >= date_trunc('month', CURRENT_TIMESTAMP)
         )::int AS month_visits,
         COUNT(*) FILTER (
           WHERE visited_at >= date_trunc('year', CURRENT_TIMESTAMP)
         )::int AS year_visits
       FROM player_visits
       WHERE facility_id = $1
       GROUP BY user_id
     ),
     program_stats AS (
       SELECT pr.user_id, COUNT(*)::int AS programs_attended
       FROM program_registrations pr
       JOIN program_instances pi ON pi.id = pr.instance_id
       WHERE pi.facility_id = $1 AND pr.status = 'attended'
       GROUP BY pr.user_id
     ),
     all_users AS (
       SELECT user_id FROM visit_stats
       UNION
       SELECT user_id FROM program_stats
     )
     INSERT INTO player_stats (
       user_id, facility_id, org_id,
       all_time_visits, month_visits, year_visits,
       programs_attended, dupr_rating_snapshot, updated_at
     )
     SELECT
       au.user_id,
       $1,
       $2,
       COALESCE(vs.all_time_visits, 0),
       COALESCE(vs.month_visits, 0),
       COALESCE(vs.year_visits, 0),
       COALESCE(ps.programs_attended, 0),
       COALESCE(ppp_org.dupr_rating, ppp_global.dupr_rating),
       NOW()
     FROM all_users au
     LEFT JOIN visit_stats vs ON vs.user_id = au.user_id
     LEFT JOIN program_stats ps ON ps.user_id = au.user_id
     LEFT JOIN pickle_player_profiles ppp_org
       ON ppp_org.user_id = au.user_id AND ppp_org.org_id = $2
     LEFT JOIN pickle_player_profiles ppp_global
       ON ppp_global.user_id = au.user_id AND ppp_global.org_id IS NULL
     ON CONFLICT (user_id, facility_id) DO UPDATE SET
       org_id = EXCLUDED.org_id,
       all_time_visits = EXCLUDED.all_time_visits,
       month_visits = EXCLUDED.month_visits,
       year_visits = EXCLUDED.year_visits,
       programs_attended = EXCLUDED.programs_attended,
       dupr_rating_snapshot = EXCLUDED.dupr_rating_snapshot,
       updated_at = NOW()`,
    [facilityId, orgId]
  );

  await query(
    `DELETE FROM player_stats ps
     WHERE ps.facility_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM player_visits pv
         WHERE pv.facility_id = $1 AND pv.user_id = ps.user_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM program_registrations pr
         JOIN program_instances pi ON pi.id = pr.instance_id
         WHERE pi.facility_id = $1 AND pr.user_id = ps.user_id AND pr.status = 'attended'
       )`,
    [facilityId]
  );
}

export async function refreshPlayerStatsForOrg(orgId: string): Promise<void> {
  await assertPickleOrg(orgId);

  const facilitiesResult = await query(
    `SELECT id FROM facilities
     WHERE org_id = $1 AND product_line = $2 AND status = 'active'`,
    [orgId, PRODUCT_LINE_PICKLE]
  );

  for (const row of facilitiesResult.rows) {
    await refreshPlayerStatsForFacility(row.id, orgId);
  }
}

function mapRow(row: Record<string, unknown>, rank: number, facilityId?: string): PlayerStatEntry {
  return {
    userId: row.userId as string,
    facilityId,
    orgId: row.orgId as string,
    fullName: (row.fullName as string) || 'Player',
    allTimeVisits: Number(row.allTimeVisits) || 0,
    monthVisits: Number(row.monthVisits) || 0,
    yearVisits: Number(row.yearVisits) || 0,
    programsAttended: Number(row.programsAttended) || 0,
    duprRatingSnapshot: row.duprRatingSnapshot != null ? Number(row.duprRatingSnapshot) : null,
    rank,
  };
}

function metricValue(entry: PlayerStatEntry, metric: LeaderboardMetric): number | null {
  switch (metric) {
    case 'all_time_visits':
      return entry.allTimeVisits;
    case 'month_visits':
      return entry.monthVisits;
    case 'year_visits':
      return entry.yearVisits;
    case 'programs_attended':
      return entry.programsAttended;
    case 'dupr_rating_snapshot':
      return entry.duprRatingSnapshot;
    default:
      return entry.allTimeVisits;
  }
}

function findCurrentUserEntry(
  entries: PlayerStatEntry[],
  currentUserId: string | undefined,
  metric: LeaderboardMetric
): PlayerStatEntry | undefined {
  if (!currentUserId) return undefined;
  const inTop = entries.find((entry) => entry.userId === currentUserId);
  if (inTop) return inTop;
  return undefined;
}

export async function getLeaderboard(params: {
  facilityId?: string;
  orgId?: string;
  metric?: string;
  limit?: number;
  currentUserId?: string;
}): Promise<LeaderboardResult> {
  const metric = parseMetric(params.metric);
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const nullsOrder = metric === 'dupr_rating_snapshot' ? 'NULLS LAST' : '';
  const facilityColumn = METRIC_FACILITY_COLUMN[metric];
  const sortColumn = METRIC_SORT[metric];

  if (params.facilityId) {
    const { orgId } = await assertPickleFacility(params.facilityId);
    await refreshPlayerStatsForFacility(params.facilityId, orgId);

    const result = await query(
      `SELECT
         ps.user_id as "userId",
         ps.org_id as "orgId",
         u.full_name as "fullName",
         ps.all_time_visits as "allTimeVisits",
         ps.month_visits as "monthVisits",
         ps.year_visits as "yearVisits",
         ps.programs_attended as "programsAttended",
         ps.dupr_rating_snapshot as "duprRatingSnapshot"
       FROM player_stats ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.facility_id = $1
       ORDER BY ps.${facilityColumn} DESC ${nullsOrder}, u.full_name ASC
       LIMIT $2`,
      [params.facilityId, limit]
    );

    const entries = result.rows.map((row, index) =>
      mapRow(row, index + 1, params.facilityId)
    );

    let currentUserEntry = findCurrentUserEntry(entries, params.currentUserId, metric);

    if (!currentUserEntry && params.currentUserId) {
      const userResult = await query(
        `SELECT
           ps.user_id as "userId",
           ps.org_id as "orgId",
           u.full_name as "fullName",
           ps.all_time_visits as "allTimeVisits",
           ps.month_visits as "monthVisits",
           ps.year_visits as "yearVisits",
           ps.programs_attended as "programsAttended",
           ps.dupr_rating_snapshot as "duprRatingSnapshot",
           (
             SELECT COUNT(*) + 1
             FROM player_stats ps2
             JOIN users u2 ON u2.id = ps2.user_id
             WHERE ps2.facility_id = $1
               AND (
                 ps2.${facilityColumn} > ps.${facilityColumn}
                 OR (
                   ps2.${facilityColumn} IS NOT DISTINCT FROM ps.${facilityColumn}
                   AND u2.full_name < u.full_name
                 )
               )
           )::int as rank
         FROM player_stats ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.facility_id = $1 AND ps.user_id = $2`,
        [params.facilityId, params.currentUserId]
      );
      if (userResult.rows[0]) {
        currentUserEntry = mapRow(userResult.rows[0], Number(userResult.rows[0].rank), params.facilityId);
      }
    }

    return {
      scope: 'facility',
      facilityId: params.facilityId,
      orgId,
      metric,
      entries,
      currentUserEntry,
    };
  }

  if (!params.orgId) {
    throw new Error('facilityId or orgId is required');
  }

  await assertPickleOrg(params.orgId);
  await refreshPlayerStatsForOrg(params.orgId);

  const orgResult = await query(
    `SELECT *
     FROM (
       SELECT
         ps.user_id as "userId",
         ps.org_id as "orgId",
         u.full_name as "fullName",
         SUM(ps.all_time_visits)::int as "allTimeVisits",
         SUM(ps.month_visits)::int as "monthVisits",
         SUM(ps.year_visits)::int as "yearVisits",
         SUM(ps.programs_attended)::int as "programsAttended",
         MAX(ps.dupr_rating_snapshot) as "duprRatingSnapshot"
       FROM player_stats ps
       JOIN users u ON u.id = ps.user_id
       JOIN facilities f ON f.id = ps.facility_id
       WHERE ps.org_id = $1 AND f.product_line = $2
       GROUP BY ps.user_id, ps.org_id, u.full_name
     ) ranked
     ORDER BY ${sortColumn} DESC ${nullsOrder}, "fullName" ASC
     LIMIT $3`,
    [params.orgId, PRODUCT_LINE_PICKLE, limit]
  );

  const entries = orgResult.rows.map((row, index) => mapRow(row, index + 1));

  let currentUserEntry = findCurrentUserEntry(entries, params.currentUserId, metric);

  if (!currentUserEntry && params.currentUserId) {
    const allOrgResult = await query(
      `SELECT
         ps.user_id as "userId",
         ps.org_id as "orgId",
         u.full_name as "fullName",
         SUM(ps.all_time_visits)::int as "allTimeVisits",
         SUM(ps.month_visits)::int as "monthVisits",
         SUM(ps.year_visits)::int as "yearVisits",
         SUM(ps.programs_attended)::int as "programsAttended",
         MAX(ps.dupr_rating_snapshot) as "duprRatingSnapshot"
       FROM player_stats ps
       JOIN users u ON u.id = ps.user_id
       JOIN facilities f ON f.id = ps.facility_id
       WHERE ps.org_id = $1 AND f.product_line = $2 AND ps.user_id = $3
       GROUP BY ps.user_id, ps.org_id, u.full_name`,
      [params.orgId, PRODUCT_LINE_PICKLE, params.currentUserId]
    );

    if (allOrgResult.rows[0]) {
      const userEntry = mapRow(allOrgResult.rows[0], 0);
      const userValue = metricValue(userEntry, metric);

      const rankResult = await query(
        `SELECT COUNT(*) + 1 as rank
         FROM (
           SELECT
             ps.user_id,
             SUM(ps.all_time_visits)::int as all_time_visits,
             SUM(ps.month_visits)::int as month_visits,
             SUM(ps.year_visits)::int as year_visits,
             SUM(ps.programs_attended)::int as programs_attended,
             MAX(ps.dupr_rating_snapshot) as dupr_rating_snapshot,
             MIN(u.full_name) as full_name
           FROM player_stats ps
           JOIN users u ON u.id = ps.user_id
           JOIN facilities f ON f.id = ps.facility_id
           WHERE ps.org_id = $1 AND f.product_line = $2
           GROUP BY ps.user_id
         ) agg
         WHERE (
           agg.${facilityColumn} > $3
           OR (
             agg.${facilityColumn} IS NOT DISTINCT FROM $3
             AND agg.full_name < $4
           )
         )`,
        [params.orgId, PRODUCT_LINE_PICKLE, userValue, userEntry.fullName]
      );

      currentUserEntry = {
        ...userEntry,
        rank: Number(rankResult.rows[0]?.rank) || entries.length + 1,
      };
    }
  }

  return {
    scope: 'org',
    orgId: params.orgId,
    metric,
    entries,
    currentUserEntry,
  };
}
