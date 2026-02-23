import { query } from '../database/connection';

export interface AddressWhitelist {
  id: string;
  facilityId: string;
  address: string;
  accountsLimit: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all whitelisted addresses for a facility
 */
export async function getWhitelistedAddresses(facilityId: string): Promise<AddressWhitelist[]> {
  try {
    const result = await query(
      `SELECT
        id,
        facility_id as "facilityId",
        address,
        accounts_limit as "accountsLimit",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM address_whitelist
      WHERE facility_id = $1
      ORDER BY address ASC`,
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
  accountsLimit: number = 4
): Promise<{ success: boolean; address?: AddressWhitelist; error?: string }> {
  try {
    const result = await query(
      `INSERT INTO address_whitelist (facility_id, address, accounts_limit)
       VALUES ($1, $2, $3)
       RETURNING
         id,
         facility_id as "facilityId",
         address,
         accounts_limit as "accountsLimit",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [facilityId, address, accountsLimit]
    );

    return {
      success: true,
      address: result.rows[0]
    };
  } catch (error: any) {
    console.error('Error adding whitelisted address:', error);
    if (error.code === '23505') {
      return {
        success: false,
        error: 'Address already whitelisted'
      };
    }
    return {
      success: false,
      error: 'Failed to add address to whitelist'
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
        error: 'Address not found or unauthorized'
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing whitelisted address:', error);
    return {
      success: false,
      error: 'Failed to remove address from whitelist'
    };
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
  try {
    const result = await query(
      `UPDATE address_whitelist
       SET accounts_limit = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND facility_id = $3
       RETURNING id`,
      [accountsLimit, addressId, facilityId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Address not found or unauthorized'
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating accounts limit:', error);
    return {
      success: false,
      error: 'Failed to update accounts limit'
    };
  }
}

/**
 * Check if an address is whitelisted for a facility
 */
export async function isAddressWhitelisted(
  facilityId: string,
  address: string
): Promise<{ isWhitelisted: boolean; accountsLimit?: number }> {
  try {
    const result = await query(
      `SELECT accounts_limit as "accountsLimit"
       FROM address_whitelist
       WHERE facility_id = $1 AND address = $2`,
      [facilityId, address]
    );

    if (result.rows.length > 0) {
      return {
        isWhitelisted: true,
        accountsLimit: result.rows[0].accountsLimit
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
  addresses: Array<{ address: string; accountsLimit?: number }>
): Promise<{ success: boolean; added: number; skipped: number; error?: string }> {
  let added = 0;
  let skipped = 0;

  try {
    for (const item of addresses) {
      const addr = item.address?.trim();
      if (!addr) {
        skipped++;
        continue;
      }
      try {
        await query(
          `INSERT INTO address_whitelist (facility_id, address, accounts_limit)
           VALUES ($1, $2, $3)
           ON CONFLICT (facility_id, address) DO NOTHING`,
          [facilityId, addr, item.accountsLimit || 4]
        );
        // Check if it was actually inserted (ON CONFLICT DO NOTHING returns 0 rows affected for dupes)
        added++;
      } catch (error: any) {
        if (error.code === '23505') {
          skipped++;
        } else {
          console.error('Error inserting address:', addr, error);
          skipped++;
        }
      }
    }

    return { success: true, added, skipped };
  } catch (error) {
    console.error('Error bulk importing addresses:', error);
    return { success: false, added, skipped, error: 'Failed to import addresses' };
  }
}

/**
 * Get count of accounts at a specific address for a facility
 */
export async function getAccountCountAtAddress(
  facilityId: string,
  address: string
): Promise<number> {
  try {
    const result = await query(
      `SELECT COUNT(DISTINCT u.id) as count
       FROM users u
       JOIN facility_members fm ON u.id = fm.user_id
       WHERE fm.facility_id = $1
         AND u.street_address = $2
         AND fm.status != 'expired'`,
      [facilityId, address]
    );

    return parseInt(result.rows[0].count) || 0;
  } catch (error) {
    console.error('Error getting account count:', error);
    return 0;
  }
}
