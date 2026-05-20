import { query } from '../database/connection';
import {
  issueSetupInviteForWhitelistRow,
  normalizeWhitelistEmail,
} from './memberSetupInviteService';

export interface AddressWhitelist {
  id: string;
  facilityId: string;
  address: string;
  lastName: string;
  email: string | null;
  accountsLimit: number;
  setupInviteSentAt: string | null;
  setupInviteAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const WHITELIST_SELECT = `
  id,
  facility_id as "facilityId",
  address,
  COALESCE(last_name, '') as "lastName",
  email,
  accounts_limit as "accountsLimit",
  setup_invite_sent_at as "setupInviteSentAt",
  setup_invite_accepted_at as "setupInviteAcceptedAt",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

/**
 * True when the user's email or street address + last name matches a whitelist row.
 */
export async function isUserWhitelistedForFacility(
  userId: string,
  facilityId: string
): Promise<boolean> {
  const userResult = await query(
    `SELECT street_address as "streetAddress", last_name as "lastName", email
     FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) return false;

  const user = userResult.rows[0];
  const userAddress = user.streetAddress;
  const userLastName = user.lastName || '';
  const userEmail = user.email || '';

  const whitelistResult = await query(
    `SELECT 1
     FROM address_whitelist
     WHERE facility_id = $1
       AND (
         (
           $2::text IS NOT NULL AND $2::text <> ''
           AND LOWER(TRIM(SPLIT_PART(address, ',', 1))) = LOWER(TRIM($2))
           AND LOWER(TRIM(COALESCE(last_name, ''))) = LOWER(TRIM($3))
         )
         OR (
           $4::text IS NOT NULL AND $4::text <> ''
           AND email IS NOT NULL AND TRIM(email) <> ''
           AND LOWER(TRIM(email)) = LOWER(TRIM($4))
         )
       )
     LIMIT 1`,
    [facilityId, userAddress || null, userLastName, userEmail || null]
  );

  return whitelistResult.rows.length > 0;
}

export async function resolveMembershipStatusFromWhitelist(
  userId: string,
  facilityId: string
): Promise<'active' | 'pending'> {
  const whitelisted = await isUserWhitelistedForFacility(userId, facilityId);
  return whitelisted ? 'active' : 'pending';
}

/**
 * Promote pending memberships to active when the user matches the whitelist.
 */
export async function syncWhitelistedPendingMemberships(userId: string): Promise<void> {
  const pendingResult = await query(
    `SELECT facility_id as "facilityId"
     FROM facility_memberships
     WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );

  for (const row of pendingResult.rows) {
    if (await isUserWhitelistedForFacility(userId, row.facilityId)) {
      await query(
        `UPDATE facility_memberships
         SET status = 'active'
         WHERE user_id = $1 AND facility_id = $2 AND status = 'pending'`,
        [userId, row.facilityId]
      );
    }
  }
}

function mapDuplicateError(error: { code?: string; constraint?: string }): string | null {
  if (error.code !== '23505') return null;
  if (error.constraint?.includes('email')) {
    return 'Email already whitelisted for this facility';
  }
  return 'Address already whitelisted';
}

async function sendInviteIfEmailPresent(whitelistId: string, email: string | null): Promise<void> {
  if (!email) return;
  issueSetupInviteForWhitelistRow(whitelistId).catch((err) =>
    console.error('Failed to issue setup invite for whitelist row:', err)
  );
}

/**
 * Get all whitelisted addresses for a facility
 */
export async function getWhitelistedAddresses(facilityId: string): Promise<AddressWhitelist[]> {
  try {
    const result = await query(
      `SELECT ${WHITELIST_SELECT}
      FROM address_whitelist
      WHERE facility_id = $1
      ORDER BY address ASC, last_name ASC`,
      [facilityId]
    );

    return result.rows;
  } catch (error) {
    console.error('Error fetching whitelisted addresses:', error);
    return [];
  }
}

/**
 * Add an address to the whitelist
 */
export async function addWhitelistedAddress(
  facilityId: string,
  address: string,
  accountsLimit: number = 4,
  lastName: string = '',
  email?: string | null
): Promise<{ success: boolean; address?: AddressWhitelist; error?: string }> {
  try {
    const normalizedEmail = normalizeWhitelistEmail(email);
    const result = await query(
      `INSERT INTO address_whitelist (facility_id, address, last_name, accounts_limit, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${WHITELIST_SELECT}`,
      [facilityId, address, lastName.trim(), accountsLimit, normalizedEmail]
    );

    const row = result.rows[0];
    await sendInviteIfEmailPresent(row.id, normalizedEmail);

    return {
      success: true,
      address: row,
    };
  } catch (error: any) {
    console.error('Error adding whitelisted address:', error);
    const duplicateMsg = mapDuplicateError(error);
    if (duplicateMsg) {
      return { success: false, error: duplicateMsg };
    }
    return {
      success: false,
      error: 'Failed to add address to whitelist',
    };
  }
}

/**
 * Remove an address from the whitelist
 */
export async function removeWhitelistedAddress(
  facilityId: string,
  addressId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await query(
      `DELETE FROM address_whitelist
       WHERE id = $1 AND facility_id = $2
       RETURNING id`,
      [addressId, facilityId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Address not found or unauthorized',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing whitelisted address:', error);
    return {
      success: false,
      error: 'Failed to remove address from whitelist',
    };
  }
}

/**
 * Update whitelist entry (accounts limit and/or email)
 */
export async function updateWhitelistedAddress(
  facilityId: string,
  addressId: string,
  updates: { accountsLimit?: number; email?: string | null }
): Promise<{ success: boolean; address?: AddressWhitelist; error?: string }> {
  try {
    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.accountsLimit !== undefined) {
      sets.push(`accounts_limit = $${paramIndex++}`);
      values.push(updates.accountsLimit);
    }

    if (updates.email !== undefined) {
      sets.push(`email = $${paramIndex++}`);
      values.push(normalizeWhitelistEmail(updates.email));
    }

    if (sets.length === 1) {
      return { success: false, error: 'No updates provided' };
    }

    values.push(addressId, facilityId);

    const result = await query(
      `UPDATE address_whitelist
       SET ${sets.join(', ')}
       WHERE id = $${paramIndex++} AND facility_id = $${paramIndex}
       RETURNING ${WHITELIST_SELECT}`,
      values
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Address not found or unauthorized' };
    }

    const row = result.rows[0];
    if (updates.email !== undefined && row.email) {
      await sendInviteIfEmailPresent(row.id, row.email);
    }

    return { success: true, address: row };
  } catch (error: any) {
    console.error('Error updating whitelisted address:', error);
    const duplicateMsg = mapDuplicateError(error);
    if (duplicateMsg) {
      return { success: false, error: duplicateMsg };
    }
    return { success: false, error: 'Failed to update whitelist entry' };
  }
}

/**
 * Update the accounts limit for a whitelisted address
 */
export async function updateAccountsLimit(
  facilityId: string,
  addressId: string,
  accountsLimit: number
): Promise<{ success: boolean; error?: string }> {
  const result = await updateWhitelistedAddress(facilityId, addressId, { accountsLimit });
  return { success: result.success, error: result.error };
}

/**
 * Check if an address is whitelisted for a facility
 */
export async function isAddressWhitelisted(
  facilityId: string,
  address: string,
  lastName: string = ''
): Promise<{ isWhitelisted: boolean; accountsLimit?: number }> {
  try {
    const result = await query(
      `SELECT accounts_limit as "accountsLimit"
       FROM address_whitelist
       WHERE facility_id = $1
         AND LOWER(TRIM(SPLIT_PART(address, ',', 1))) = LOWER(TRIM($2))
         AND LOWER(TRIM(COALESCE(last_name, ''))) = LOWER(TRIM($3))`,
      [facilityId, address, lastName]
    );

    if (result.rows.length > 0) {
      return {
        isWhitelisted: true,
        accountsLimit: result.rows[0].accountsLimit,
      };
    }

    return { isWhitelisted: false };
  } catch (error) {
    console.error('Error checking whitelisted address:', error);
    return { isWhitelisted: false };
  }
}

/**
 * Bulk import addresses to the whitelist (skips duplicates)
 */
export async function bulkAddWhitelistedAddresses(
  facilityId: string,
  addresses: Array<{ address: string; lastName?: string; accountsLimit?: number; email?: string }>
): Promise<{ success: boolean; added: number; skipped: number; error?: string }> {
  try {
    const validItems = addresses.filter((item) => item.address?.trim());
    const skippedEmpty = addresses.length - validItems.length;

    if (validItems.length === 0) {
      return { success: true, added: 0, skipped: skippedEmpty };
    }

    let added = 0;
    let skippedDuplicates = 0;

    for (const item of validItems) {
      const normalizedEmail = normalizeWhitelistEmail(item.email);
      try {
        const result = await query(
          `INSERT INTO address_whitelist (facility_id, address, last_name, accounts_limit, email)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING
           RETURNING id, email`,
          [
            facilityId,
            item.address.trim(),
            (item.lastName || '').trim(),
            item.accountsLimit || 4,
            normalizedEmail,
          ]
        );

        if (result.rows.length === 0) {
          skippedDuplicates += 1;
          continue;
        }

        added += 1;
        const row = result.rows[0];
        if (row.email) {
          await sendInviteIfEmailPresent(row.id, row.email);
        }
      } catch (error: any) {
        if (error.code === '23505') {
          skippedDuplicates += 1;
          continue;
        }
        throw error;
      }
    }

    return {
      success: true,
      added,
      skipped: skippedEmpty + skippedDuplicates,
    };
  } catch (error) {
    console.error('Error bulk importing addresses:', error);
    return { success: false, added: 0, skipped: addresses.length, error: 'Failed to import addresses' };
  }
}

/**
 * Get count of accounts at a specific address for a facility
 */
export async function getAccountCountAtAddress(
  facilityId: string,
  address: string,
  lastName: string = ''
): Promise<number> {
  try {
    const result = await query(
      `SELECT COUNT(DISTINCT u.id) as count
       FROM users u
       JOIN facility_memberships fm ON u.id = fm.user_id
       WHERE fm.facility_id = $1
         AND LOWER(TRIM(u.street_address)) = LOWER(TRIM($2))
         AND LOWER(TRIM(COALESCE(u.last_name, ''))) = LOWER(TRIM($3))
         AND fm.status != 'expired'`,
      [facilityId, address, lastName]
    );

    return parseInt(result.rows[0].count) || 0;
  } catch (error) {
    console.error('Error getting account count:', error);
    return 0;
  }
}

/**
 * Get all whitelist entries with their matched member accounts
 */
export async function getWhitelistWithMembers(facilityId: string) {
  try {
    const result = await query(
      `SELECT
        aw.id as "whitelistId",
        aw.address,
        COALESCE(aw.last_name, '') as "lastName",
        aw.email as "whitelistEmail",
        aw.accounts_limit as "accountsLimit",
        aw.setup_invite_sent_at as "setupInviteSentAt",
        aw.setup_invite_accepted_at as "setupInviteAcceptedAt",
        u.id as "userId",
        u.first_name as "firstName",
        u.last_name as "userLastName",
        u.email,
        u.full_name as "fullName",
        fm.status as "membershipStatus",
        fm.membership_type as "membershipType"
      FROM address_whitelist aw
      LEFT JOIN users u ON
        LOWER(TRIM(SPLIT_PART(aw.address, ',', 1))) = LOWER(TRIM(COALESCE(u.street_address, '')))
        AND LOWER(TRIM(COALESCE(aw.last_name, ''))) = LOWER(TRIM(COALESCE(u.last_name, '')))
      LEFT JOIN facility_memberships fm ON
        fm.user_id = u.id AND fm.facility_id = aw.facility_id
        AND fm.status IN ('active', 'pending', 'suspended')
      WHERE aw.facility_id = $1
      ORDER BY aw.address ASC, aw.last_name ASC, u.last_name ASC, u.first_name ASC`,
      [facilityId]
    );

    const entriesMap = new Map<string, any>();
    for (const row of result.rows) {
      if (!entriesMap.has(row.whitelistId)) {
        entriesMap.set(row.whitelistId, {
          id: row.whitelistId,
          address: row.address,
          lastName: row.lastName,
          email: row.whitelistEmail,
          accountsLimit: row.accountsLimit,
          setupInviteSentAt: row.setupInviteSentAt,
          setupInviteAcceptedAt: row.setupInviteAcceptedAt,
          members: [],
        });
      }
      if (row.userId && row.membershipStatus) {
        entriesMap.get(row.whitelistId).members.push({
          userId: row.userId,
          firstName: row.firstName,
          lastName: row.userLastName,
          fullName: row.fullName,
          email: row.email,
          status: row.membershipStatus,
          membershipType: row.membershipType,
        });
      }
    }

    return Array.from(entriesMap.values());
  } catch (error) {
    console.error('Error getting whitelist with members:', error);
    throw error;
  }
}
