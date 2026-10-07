import { query } from '../database/connection';

export async function isFeatureEnabled(facilityId: string, featureKey: string): Promise<boolean> {
  const result = await query(
    `SELECT is_enabled FROM facility_features WHERE facility_id = $1 AND feature_key = $2`,
    [facilityId, featureKey]
  );
  return result.rows[0]?.is_enabled === true;
}

export async function getFacilityFeatureFlags(facilityId: string): Promise<{ feature_key: string; is_enabled: boolean; updated_at: string; updated_by: string | null }[]> {
  const result = await query(
    `SELECT feature_key, is_enabled, updated_at, updated_by
     FROM facility_features WHERE facility_id = $1 ORDER BY feature_key`,
    [facilityId]
  );
  return result.rows;
}

export async function setFeatureFlag(facilityId: string, featureKey: string, enabled: boolean, updatedBy?: string): Promise<void> {
  await query(
    `INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at, updated_by)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (facility_id, feature_key)
     DO UPDATE SET is_enabled = $3, updated_at = NOW(), updated_by = $4`,
    [facilityId, featureKey, enabled, updatedBy ?? null]
  );
}
