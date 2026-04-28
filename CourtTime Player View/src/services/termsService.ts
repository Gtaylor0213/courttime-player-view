import { query, transaction } from '../database/connection';
import type { PoolClient } from 'pg';

export interface TermsVersion {
  id: string;
  facilityId: string;
  versionNumber: number;
  contentHtml: string;
  publishedAt: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingTermsAcceptance {
  facilityId: string;
  facilityName: string;
  currentVersionId: string;
  currentVersionNumber: number;
  contentHtml: string;
  publishedAt: string;
  acceptedVersionNumber: number | null;
  acceptedAt: string | null;
}

function mapTermsVersion(row: any): TermsVersion {
  return {
    id: row.id,
    facilityId: row.facilityId,
    versionNumber: Number(row.versionNumber),
    contentHtml: row.contentHtml,
    publishedAt: row.publishedAt,
    createdBy: row.createdBy || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getCurrentTermsVersion(facilityId: string): Promise<TermsVersion | null> {
  const result = await query(
    `SELECT
      id,
      facility_id as "facilityId",
      version_number as "versionNumber",
      content_html as "contentHtml",
      published_at as "publishedAt",
      created_by as "createdBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
     FROM facility_terms_conditions_versions
     WHERE facility_id = $1
     ORDER BY version_number DESC
     LIMIT 1`,
    [facilityId]
  );

  if (result.rows.length === 0) return null;
  return mapTermsVersion(result.rows[0]);
}

export async function getTermsVersionHistory(facilityId: string): Promise<TermsVersion[]> {
  const result = await query(
    `SELECT
      id,
      facility_id as "facilityId",
      version_number as "versionNumber",
      content_html as "contentHtml",
      published_at as "publishedAt",
      created_by as "createdBy",
      created_at as "createdAt",
      updated_at as "updatedAt"
     FROM facility_terms_conditions_versions
     WHERE facility_id = $1
     ORDER BY version_number DESC`,
    [facilityId]
  );

  return result.rows.map(mapTermsVersion);
}

async function getNextTermsVersionNumber(client: PoolClient, facilityId: string): Promise<number> {
  const result = await client.query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 as "nextVersion"
     FROM facility_terms_conditions_versions
     WHERE facility_id = $1`,
    [facilityId]
  );
  return Number(result.rows[0]?.nextVersion || 1);
}

export async function publishTermsVersion(
  facilityId: string,
  contentHtml: string,
  createdBy?: string
): Promise<TermsVersion> {
  return transaction(async (client) => {
    const nextVersion = await getNextTermsVersionNumber(client, facilityId);

    const insertResult = await client.query(
      `INSERT INTO facility_terms_conditions_versions (
        facility_id,
        version_number,
        content_html,
        created_by
      ) VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        facility_id as "facilityId",
        version_number as "versionNumber",
        content_html as "contentHtml",
        published_at as "publishedAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [facilityId, nextVersion, contentHtml, createdBy || null]
    );

    await client.query(
      `UPDATE facility_memberships
       SET terms_reaccept_required = true, updated_at = CURRENT_TIMESTAMP
       WHERE facility_id = $1`,
      [facilityId]
    );

    return mapTermsVersion(insertResult.rows[0]);
  });
}

export async function getUserPendingTermsAcceptances(userId: string): Promise<PendingTermsAcceptance[]> {
  const result = await query(
    `SELECT
      fm.facility_id as "facilityId",
      f.name as "facilityName",
      tv.id as "currentVersionId",
      tv.version_number as "currentVersionNumber",
      tv.content_html as "contentHtml",
      tv.published_at as "publishedAt",
      mta.version_number as "acceptedVersionNumber",
      mta.accepted_at as "acceptedAt"
     FROM facility_memberships fm
     JOIN facilities f ON f.id = fm.facility_id
     JOIN LATERAL (
       SELECT id, version_number, content_html, published_at
       FROM facility_terms_conditions_versions
       WHERE facility_id = fm.facility_id
       ORDER BY version_number DESC
       LIMIT 1
     ) tv ON TRUE
     LEFT JOIN LATERAL (
       SELECT version_number, accepted_at
       FROM member_terms_acceptances
       WHERE user_id = $1 AND facility_id = fm.facility_id
       ORDER BY version_number DESC
       LIMIT 1
     ) mta ON TRUE
     WHERE fm.user_id = $1
       AND fm.status = 'active'
       AND (fm.terms_reaccept_required = true OR mta.version_number IS DISTINCT FROM tv.version_number)
     ORDER BY f.name ASC`,
    [userId]
  );

  return result.rows.map((row: any) => ({
    facilityId: row.facilityId,
    facilityName: row.facilityName,
    currentVersionId: row.currentVersionId,
    currentVersionNumber: Number(row.currentVersionNumber),
    contentHtml: row.contentHtml,
    publishedAt: row.publishedAt,
    acceptedVersionNumber: row.acceptedVersionNumber != null ? Number(row.acceptedVersionNumber) : null,
    acceptedAt: row.acceptedAt ?? null,
  }));
}

export async function acceptCurrentTermsForUser(
  userId: string,
  facilityId: string,
  ipAddress?: string | null
): Promise<{ acceptedVersionNumber: number; acceptedAt: string }> {
  return transaction(async (client) => {
    const currentVersionResult = await client.query(
      `SELECT id, version_number
       FROM facility_terms_conditions_versions
       WHERE facility_id = $1
       ORDER BY version_number DESC
       LIMIT 1`,
      [facilityId]
    );

    if (currentVersionResult.rows.length === 0) {
      throw new Error('No published Terms & Conditions for this facility');
    }

    const current = currentVersionResult.rows[0];
    const versionNumber = Number(current.version_number);

    const acceptanceResult = await client.query(
      `INSERT INTO member_terms_acceptances (
         user_id,
         facility_id,
         terms_version_id,
         version_number,
         ip_address
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, facility_id, version_number)
       DO UPDATE SET ip_address = COALESCE(EXCLUDED.ip_address, member_terms_acceptances.ip_address)
       RETURNING accepted_at as "acceptedAt"`,
      [userId, facilityId, current.id, versionNumber, ipAddress || null]
    );

    await client.query(
      `UPDATE facility_memberships
       SET terms_reaccept_required = false, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND facility_id = $2`,
      [userId, facilityId]
    );

    return {
      acceptedVersionNumber: versionNumber,
      acceptedAt: acceptanceResult.rows[0].acceptedAt,
    };
  });
}

export async function getTermsAcceptanceSummaryForFacility(facilityId: string): Promise<{
  currentVersion: TermsVersion | null;
  accepted: Array<{ userId: string; fullName: string; email: string; acceptedAt: string; acceptedVersionNumber: number }>;
  notAccepted: Array<{ userId: string; fullName: string; email: string }>;
}> {
  const currentVersion = await getCurrentTermsVersion(facilityId);
  if (!currentVersion) {
    return { currentVersion: null, accepted: [], notAccepted: [] };
  }

  const acceptedResult = await query(
    `SELECT
      u.id as "userId",
      u.full_name as "fullName",
      u.email,
      mta.accepted_at as "acceptedAt",
      mta.version_number as "acceptedVersionNumber"
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     JOIN member_terms_acceptances mta
       ON mta.user_id = fm.user_id
      AND mta.facility_id = fm.facility_id
      AND mta.version_number = $2
     WHERE fm.facility_id = $1
       AND fm.status = 'active'
     ORDER BY u.full_name ASC`,
    [facilityId, currentVersion.versionNumber]
  );

  const notAcceptedResult = await query(
    `SELECT
      u.id as "userId",
      u.full_name as "fullName",
      u.email
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     LEFT JOIN member_terms_acceptances mta
       ON mta.user_id = fm.user_id
      AND mta.facility_id = fm.facility_id
      AND mta.version_number = $2
     WHERE fm.facility_id = $1
       AND fm.status = 'active'
       AND mta.id IS NULL
     ORDER BY u.full_name ASC`,
    [facilityId, currentVersion.versionNumber]
  );

  return {
    currentVersion,
    accepted: acceptedResult.rows.map((row: any) => ({
      userId: row.userId,
      fullName: row.fullName,
      email: row.email,
      acceptedAt: row.acceptedAt,
      acceptedVersionNumber: Number(row.acceptedVersionNumber),
    })),
    notAccepted: notAcceptedResult.rows.map((row: any) => ({
      userId: row.userId,
      fullName: row.fullName,
      email: row.email,
    })),
  };
}
