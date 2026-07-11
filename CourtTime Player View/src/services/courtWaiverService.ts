import { query, transaction } from '../database/connection';
import type { PoolClient } from 'pg';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

export interface CourtWaiverVersion {
  id: string;
  courtId: string;
  facilityId: string;
  versionNumber: number;
  contentHtml: string;
  isActive: boolean;
  publishedAt: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingCourtWaiver {
  courtId: string;
  courtName: string;
  facilityId: string;
  waiverVersionId: string;
  versionNumber: number;
  contentHtml: string;
  publishedAt: string;
}

function mapCourtWaiverVersion(row: any): CourtWaiverVersion {
  return {
    id: row.id,
    courtId: row.courtId,
    facilityId: row.facilityId,
    versionNumber: Number(row.versionNumber),
    contentHtml: row.contentHtml,
    isActive: row.isActive === true,
    publishedAt: row.publishedAt,
    createdBy: row.createdBy || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const WAIVER_VERSION_COLUMNS = `
  id,
  court_id as "courtId",
  facility_id as "facilityId",
  version_number as "versionNumber",
  content_html as "contentHtml",
  is_active as "isActive",
  published_at as "publishedAt",
  created_by as "createdBy",
  created_at as "createdAt",
  updated_at as "updatedAt"`;

/**
 * The court's current waiver: the latest published version, or null when the
 * court has no waiver (never published, or the latest version was removed).
 */
export async function getCurrentCourtWaiver(courtId: string): Promise<CourtWaiverVersion | null> {
  const result = await query(
    `SELECT ${WAIVER_VERSION_COLUMNS}
     FROM court_waiver_versions
     WHERE court_id = $1
     ORDER BY version_number DESC
     LIMIT 1`,
    [courtId]
  );

  if (result.rows.length === 0) return null;
  const latest = mapCourtWaiverVersion(result.rows[0]);
  return latest.isActive ? latest : null;
}

async function getNextCourtWaiverVersionNumber(client: PoolClient, courtId: string): Promise<number> {
  const result = await client.query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 as "nextVersion"
     FROM court_waiver_versions
     WHERE court_id = $1`,
    [courtId]
  );
  return Number(result.rows[0]?.nextVersion || 1);
}

/**
 * Publish a new waiver version for a court. Every member (including those who
 * accepted an older version) must accept the new version before booking.
 */
export async function publishCourtWaiver(
  courtId: string,
  contentHtml: string,
  createdBy?: string
): Promise<CourtWaiverVersion> {
  return transaction(async (client) => {
    const courtResult = await client.query(
      `SELECT facility_id as "facilityId" FROM courts WHERE id = $1`,
      [courtId]
    );
    if (courtResult.rows.length === 0) {
      throw new Error('Court not found');
    }
    const facilityId = courtResult.rows[0].facilityId as string;

    const nextVersion = await getNextCourtWaiverVersionNumber(client, courtId);
    const insertResult = await client.query(
      `INSERT INTO court_waiver_versions (
        court_id,
        facility_id,
        version_number,
        content_html,
        created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING ${WAIVER_VERSION_COLUMNS}`,
      [courtId, facilityId, nextVersion, contentHtml, createdBy || null]
    );

    return mapCourtWaiverVersion(insertResult.rows[0]);
  });
}

/**
 * Remove the court's waiver: bookings no longer require acceptance.
 * Version history and past acceptances are kept.
 */
export async function removeCourtWaiver(courtId: string): Promise<void> {
  await query(
    `UPDATE court_waiver_versions
     SET is_active = false, updated_at = CURRENT_TIMESTAMP
     WHERE court_id = $1
       AND version_number = (
         SELECT MAX(version_number) FROM court_waiver_versions WHERE court_id = $1
       )`,
    [courtId]
  );
}

/**
 * Waivers the user still needs to accept among the given courts.
 * Only courts whose facility has the Court Waivers feature enabled count —
 * with the flag off, nothing is pending and bookings are never blocked.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPendingCourtWaiversForUser(
  userId: string,
  courtIds: string[]
): Promise<PendingCourtWaiver[]> {
  const uniqueCourtIds = [...new Set(courtIds.filter((id) => UUID_PATTERN.test(id || '')))];
  if (uniqueCourtIds.length === 0) return [];

  const result = await query(
    `SELECT
      c.id as "courtId",
      c.name as "courtName",
      c.facility_id as "facilityId",
      wv.id as "waiverVersionId",
      wv.version_number as "versionNumber",
      wv.content_html as "contentHtml",
      wv.published_at as "publishedAt"
     FROM courts c
     JOIN LATERAL (
       SELECT id, version_number, content_html, is_active, published_at
       FROM court_waiver_versions
       WHERE court_id = c.id
       ORDER BY version_number DESC
       LIMIT 1
     ) wv ON TRUE
     LEFT JOIN member_court_waiver_acceptances mca
       ON mca.user_id = $1
      AND mca.court_id = c.id
      AND mca.version_number = wv.version_number
     WHERE c.id = ANY($2::uuid[])
       AND wv.is_active = true
       AND mca.id IS NULL
       AND EXISTS (
         SELECT 1 FROM facility_features ff
         WHERE ff.facility_id = c.facility_id
           AND ff.feature_key = $3
           AND ff.is_enabled = true
       )
     ORDER BY c.name ASC`,
    [userId, uniqueCourtIds, FEATURE_FLAGS.COURT_WAIVERS]
  );

  return result.rows.map((row: any) => ({
    courtId: row.courtId,
    courtName: row.courtName,
    facilityId: row.facilityId,
    waiverVersionId: row.waiverVersionId,
    versionNumber: Number(row.versionNumber),
    contentHtml: row.contentHtml,
    publishedAt: row.publishedAt,
  }));
}

/**
 * Booking blocker when the court has a waiver the user has not accepted,
 * mirroring buildTermsAcceptanceBookingBlocker in termsService.
 */
export async function buildCourtWaiverBookingBlocker(
  userId: string,
  courtId: string
): Promise<{
  ruleCode: string;
  ruleName: string;
  message: string;
  severity: 'error';
  passed: false;
} | null> {
  const pending = await getPendingCourtWaiversForUser(userId, [courtId]);
  if (pending.length === 0) return null;

  return {
    ruleCode: 'COURT-WAIVER-NOT-ACCEPTED',
    ruleName: 'Court waiver acceptance required',
    message: `You must accept the waiver for ${pending[0].courtName} before booking this court.`,
    severity: 'error',
    passed: false,
  };
}

/**
 * Record the user's acceptance of the court's current waiver version.
 */
export async function acceptCourtWaiverForUser(
  userId: string,
  courtId: string,
  ipAddress?: string | null
): Promise<{ acceptedVersionNumber: number; acceptedAt: string }> {
  return transaction(async (client) => {
    const currentResult = await client.query(
      `SELECT id, version_number, is_active
       FROM court_waiver_versions
       WHERE court_id = $1
       ORDER BY version_number DESC
       LIMIT 1`,
      [courtId]
    );

    const current = currentResult.rows[0];
    if (!current || current.is_active !== true) {
      throw new Error('This court has no waiver to accept');
    }

    const versionNumber = Number(current.version_number);
    const acceptanceResult = await client.query(
      `INSERT INTO member_court_waiver_acceptances (
         user_id,
         court_id,
         waiver_version_id,
         version_number,
         ip_address
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, court_id, version_number)
       DO UPDATE SET ip_address = COALESCE(EXCLUDED.ip_address, member_court_waiver_acceptances.ip_address)
       RETURNING accepted_at as "acceptedAt"`,
      [userId, courtId, current.id, versionNumber, ipAddress || null]
    );

    return {
      acceptedVersionNumber: versionNumber,
      acceptedAt: acceptanceResult.rows[0].acceptedAt,
    };
  });
}

/**
 * Acceptance summary for the court's current waiver among the facility's
 * active members, for the admin view.
 */
export async function getCourtWaiverAcceptanceSummary(courtId: string): Promise<{
  currentVersion: CourtWaiverVersion | null;
  accepted: Array<{ userId: string; fullName: string; email: string; acceptedAt: string }>;
  notAccepted: Array<{ userId: string; fullName: string; email: string }>;
}> {
  const currentVersion = await getCurrentCourtWaiver(courtId);
  if (!currentVersion) {
    return { currentVersion: null, accepted: [], notAccepted: [] };
  }

  const acceptedResult = await query(
    `SELECT
      u.id as "userId",
      u.full_name as "fullName",
      u.email,
      mca.accepted_at as "acceptedAt"
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     JOIN member_court_waiver_acceptances mca
       ON mca.user_id = fm.user_id
      AND mca.court_id = $2
      AND mca.version_number = $3
     WHERE fm.facility_id = $1
       AND fm.status = 'active'
     ORDER BY u.full_name ASC`,
    [currentVersion.facilityId, courtId, currentVersion.versionNumber]
  );

  const notAcceptedResult = await query(
    `SELECT
      u.id as "userId",
      u.full_name as "fullName",
      u.email
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     LEFT JOIN member_court_waiver_acceptances mca
       ON mca.user_id = fm.user_id
      AND mca.court_id = $2
      AND mca.version_number = $3
     WHERE fm.facility_id = $1
       AND fm.status = 'active'
       AND mca.id IS NULL
     ORDER BY u.full_name ASC`,
    [currentVersion.facilityId, courtId, currentVersion.versionNumber]
  );

  return {
    currentVersion,
    accepted: acceptedResult.rows.map((row: any) => ({
      userId: row.userId,
      fullName: row.fullName,
      email: row.email,
      acceptedAt: row.acceptedAt,
    })),
    notAccepted: notAcceptedResult.rows.map((row: any) => ({
      userId: row.userId,
      fullName: row.fullName,
      email: row.email,
    })),
  };
}
