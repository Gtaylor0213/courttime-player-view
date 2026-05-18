import { resolveHH001EnforcementConfig } from '../../shared/utils/maxAccountsPerAddressRules';
import { query } from '../database/connection';

export interface MaxAccountsPerAddressConfig {
  enabled: boolean;
  maxMembers: number | null;
}

export interface MaxAccountsPerAddressCheckResult {
  allowed: boolean;
  message?: string;
  current?: number;
  max?: number;
}

const DEFAULT_LIMIT_MESSAGE =
  'This address has reached the maximum number of accounts allowed. You cannot join this facility with this address.';

/**
 * Load HH-001 (max accounts per address) for a facility.
 * Default: disabled (unlimited).
 */
export async function getMaxAccountsPerAddressConfig(
  facilityId: string
): Promise<MaxAccountsPerAddressConfig> {
  try {
    const engineResult = await query(
      `SELECT frc.is_enabled as "isEnabled", frc.rule_config as "ruleConfig"
       FROM facility_rule_configs frc
       JOIN booking_rule_definitions brd ON brd.id = frc.rule_definition_id
       WHERE frc.facility_id = $1 AND brd.rule_code = 'HH-001'
       LIMIT 1`,
      [facilityId]
    );

    if (engineResult.rows.length > 0) {
      const row = engineResult.rows[0];
      const config = row.ruleConfig || {};
      return resolveHH001EnforcementConfig({
        engineEnabled: !!row.isEnabled,
        engineMaxMembers: config.max_members,
      });
    }
  } catch (error) {
    console.error('Error loading HH-001 from rules engine:', error);
  }

  try {
    const facilityResult = await query(
      `SELECT booking_rules as "bookingRules" FROM facilities WHERE id = $1`,
      [facilityId]
    );
    if (facilityResult.rows.length === 0) {
      return { enabled: false, maxMembers: null };
    }

    const raw = facilityResult.rows[0].bookingRules;
    const bookingRules =
      typeof raw === 'string'
        ? JSON.parse(raw)
        : raw && typeof raw === 'object'
          ? raw
          : {};

    return resolveHH001EnforcementConfig({
      bookingRulesEnabled: !!bookingRules?.householdMaxMembersEnabled,
      bookingRulesMaxMembers: bookingRules?.householdMaxMembers,
    });
  } catch (error) {
    console.error('Error loading HH-001 from booking_rules:', error);
    return { enabled: false, maxMembers: null };
  }
}

/**
 * Count distinct member accounts at a street address for a facility.
 */
export async function getAccountCountAtStreetAddress(
  facilityId: string,
  streetAddress: string,
  excludeUserId?: string
): Promise<number> {
  if (!streetAddress?.trim()) {
    return 0;
  }

  try {
    const params: string[] = [facilityId, streetAddress.trim()];
    let excludeClause = '';
    if (excludeUserId) {
      params.push(excludeUserId);
      excludeClause = ` AND u.id != $${params.length}`;
    }

    const result = await query(
      `SELECT COUNT(DISTINCT u.id) as count
       FROM users u
       JOIN facility_memberships fm ON u.id = fm.user_id
       WHERE fm.facility_id = $1
         AND LOWER(TRIM(u.street_address)) = LOWER(TRIM($2))
         AND fm.status IN ('active', 'pending')
         ${excludeClause}`,
      params
    );

    return parseInt(result.rows[0]?.count, 10) || 0;
  } catch (error) {
    console.error('Error counting accounts at address:', error);
    return 0;
  }
}

/**
 * Returns whether a user may join a facility based on HH-001.
 */
export async function checkMaxAccountsPerAddressAllowed(
  facilityId: string,
  userId: string
): Promise<MaxAccountsPerAddressCheckResult> {
  const config = await getMaxAccountsPerAddressConfig(facilityId);
  if (!config.enabled || !config.maxMembers) {
    return { allowed: true };
  }

  const userResult = await query(
    `SELECT street_address as "streetAddress" FROM users WHERE id = $1`,
    [userId]
  );

  const streetAddress = userResult.rows[0]?.streetAddress?.trim();
  if (!streetAddress) {
    return { allowed: true };
  }

  const current = await getAccountCountAtStreetAddress(facilityId, streetAddress, userId);
  if (current >= config.maxMembers) {
    return {
      allowed: false,
      message: `${DEFAULT_LIMIT_MESSAGE} (${current}/${config.maxMembers} accounts at this address).`,
      current,
      max: config.maxMembers,
    };
  }

  return { allowed: true, current, max: config.maxMembers };
}
