import { query, transaction } from '../database/connection';
import type { PoolClient } from 'pg';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

export interface GeneralRulesVersion {
  id: string;
  facilityId: string;
  versionNumber: number;
  contentHtml: string;
  publishedAt: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingGeneralRulesAcceptance {
  facilityId: string;
  facilityName: string;
  currentVersionId: string;
  currentVersionNumber: number;
  contentHtml: string;
  publishedAt: string;
  acceptedVersionNumber: number | null;
  acceptedAt: string | null;
}

function mapGeneralRulesVersion(row: any): GeneralRulesVersion {
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

export async function getCurrentGeneralRulesVersion(facilityId: string): Promise<GeneralRulesVersion | null> {
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
     FROM facility_general_rules_versions
     WHERE facility_id = $1
     ORDER BY version_number DESC
     LIMIT 1`,
    [facilityId]
  );

  if (result.rows.length === 0) return null;
  return mapGeneralRulesVersion(result.rows[0]);
}

export async function getGeneralRulesVersionHistory(facilityId: string): Promise<GeneralRulesVersion[]> {
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
     FROM facility_general_rules_versions
     WHERE facility_id = $1
     ORDER BY version_number DESC`,
    [facilityId]
  );

  return result.rows.map(mapGeneralRulesVersion);
}

async function getNextGeneralRulesVersionNumber(client: PoolClient, facilityId: string): Promise<number> {
  const result = await client.query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 as "nextVersion"
     FROM facility_general_rules_versions
     WHERE facility_id = $1`,
    [facilityId]
  );
  return Number(result.rows[0]?.nextVersion || 1);
}

export async function publishGeneralRulesVersion(
  facilityId: string,
  contentHtml: string,
  createdBy?: string
): Promise<GeneralRulesVersion> {
  return transaction(async (client) => {
    const nextVersion = await getNextGeneralRulesVersionNumber(client, facilityId);

    const insertResult = await client.query(
      `INSERT INTO facility_general_rules_versions (
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
       SET rules_reaccept_required = true, updated_at = CURRENT_TIMESTAMP
       WHERE facility_id = $1`,
      [facilityId]
    );

    // Keep facilities.general_rules (shown on the Club Info page) in sync with the
    // latest published version, so there's a single place admins edit this content.
    await client.query(
      `UPDATE facilities
       SET general_rules = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [facilityId, contentHtml]
    );

    return mapGeneralRulesVersion(insertResult.rows[0]);
  });
}

export async function getPendingGeneralRulesAcceptanceForFacility(
  userId: string,
  facilityId: string
): Promise<PendingGeneralRulesAcceptance | null> {
  const pending = await getUserPendingGeneralRulesAcceptances(userId);
  return pending.find((item) => item.facilityId === facilityId) ?? null;
}

export async function buildGeneralRulesAcceptanceBookingBlocker(
  userId: string,
  facilityId: string
): Promise<{
  ruleCode: string;
  ruleName: string;
  message: string;
  severity: 'error';
  passed: false;
} | null> {
  const pending = await getPendingGeneralRulesAcceptanceForFacility(userId, facilityId);
  if (!pending) return null;

  return {
    ruleCode: 'GENERAL-RULES-NOT-ACCEPTED',
    ruleName: 'General Rules acceptance required',
    message: `You must accept the updated General Rules for ${pending.facilityName} before booking a court.`,
    severity: 'error',
    passed: false,
  };
}

export async function getUserPendingGeneralRulesAcceptances(userId: string): Promise<PendingGeneralRulesAcceptance[]> {
  const result = await query(
    `SELECT
      fm.facility_id as "facilityId",
      f.name as "facilityName",
      rv.id as "currentVersionId",
      rv.version_number as "currentVersionNumber",
      rv.content_html as "contentHtml",
      rv.published_at as "publishedAt",
      mra.version_number as "acceptedVersionNumber",
      mra.accepted_at as "acceptedAt"
     FROM facility_memberships fm
     JOIN facilities f ON f.id = fm.facility_id
     JOIN LATERAL (
       SELECT id, version_number, content_html, published_at
       FROM facility_general_rules_versions
       WHERE facility_id = fm.facility_id
       ORDER BY version_number DESC
       LIMIT 1
     ) rv ON TRUE
     LEFT JOIN LATERAL (
       SELECT version_number, accepted_at
       FROM member_general_rules_acceptances
       WHERE user_id = $1 AND facility_id = fm.facility_id
       ORDER BY version_number DESC
       LIMIT 1
     ) mra ON TRUE
     WHERE fm.user_id = $1
       AND fm.status = 'active'
       AND EXISTS (
         SELECT 1 FROM facility_features ff
         WHERE ff.facility_id = fm.facility_id
           AND ff.feature_key = $2
           AND ff.is_enabled = true
       )
       AND (fm.rules_reaccept_required = true OR mra.version_number IS DISTINCT FROM rv.version_number)
     ORDER BY f.name ASC`,
    [userId, FEATURE_FLAGS.GENERAL_RULES]
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

export async function acceptCurrentGeneralRulesForUser(
  userId: string,
  facilityId: string,
  ipAddress?: string | null
): Promise<{ acceptedVersionNumber: number; acceptedAt: string }> {
  return transaction(async (client) => {
    const currentVersionResult = await client.query(
      `SELECT id, version_number
       FROM facility_general_rules_versions
       WHERE facility_id = $1
       ORDER BY version_number DESC
       LIMIT 1`,
      [facilityId]
    );

    if (currentVersionResult.rows.length === 0) {
      throw new Error('No published General Rules for this facility');
    }

    const current = currentVersionResult.rows[0];
    const versionNumber = Number(current.version_number);

    const acceptanceResult = await client.query(
      `INSERT INTO member_general_rules_acceptances (
         user_id,
         facility_id,
         rules_version_id,
         version_number,
         ip_address
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, facility_id, version_number)
       DO UPDATE SET ip_address = COALESCE(EXCLUDED.ip_address, member_general_rules_acceptances.ip_address)
       RETURNING accepted_at as "acceptedAt"`,
      [userId, facilityId, current.id, versionNumber, ipAddress || null]
    );

    await client.query(
      `UPDATE facility_memberships
       SET rules_reaccept_required = false, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND facility_id = $2`,
      [userId, facilityId]
    );

    return {
      acceptedVersionNumber: versionNumber,
      acceptedAt: acceptanceResult.rows[0].acceptedAt,
    };
  });
}

export async function getGeneralRulesAcceptanceSummaryForFacility(facilityId: string): Promise<{
  currentVersion: GeneralRulesVersion | null;
  accepted: Array<{ userId: string; fullName: string; email: string; acceptedAt: string; acceptedVersionNumber: number }>;
  notAccepted: Array<{ userId: string; fullName: string; email: string }>;
}> {
  const currentVersion = await getCurrentGeneralRulesVersion(facilityId);
  if (!currentVersion) {
    return { currentVersion: null, accepted: [], notAccepted: [] };
  }

  const acceptedResult = await query(
    `SELECT
      u.id as "userId",
      u.full_name as "fullName",
      u.email,
      mra.accepted_at as "acceptedAt",
      mra.version_number as "acceptedVersionNumber"
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     JOIN member_general_rules_acceptances mra
       ON mra.user_id = fm.user_id
      AND mra.facility_id = fm.facility_id
      AND mra.version_number = $2
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
     LEFT JOIN member_general_rules_acceptances mra
       ON mra.user_id = fm.user_id
      AND mra.facility_id = fm.facility_id
      AND mra.version_number = $2
     WHERE fm.facility_id = $1
       AND fm.status = 'active'
       AND mra.id IS NULL
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
