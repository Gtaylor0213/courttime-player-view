/**
 * Account deletion.
 *
 * Both app stores require an app that allows account creation to offer in-app
 * account deletion (Apple Guideline 5.1.1(v), and Google Play's equivalent).
 * `legal/ACCOUNT_DELETION.md` is the contract this implements — read it before
 * changing anything here, because it tells members exactly what happens.
 *
 * The account is **anonymized in place**, not deleted as a row:
 *
 *   - The policy promises facilities keep anonymized booking history, so
 *     cascading the bookings away would break it.
 *   - pro_shop_orders / pro_shop_tabs / pro_shop_tab_items reference users
 *     ON DELETE RESTRICT, so a row delete fails for anyone who has ever bought
 *     something, and financial records are retained for 7 years anyway.
 *
 * What the member gets, per the policy's "Immediate" timeline: they cannot log
 * in, push stops, memberships end, future bookings are released.
 */

import { transaction } from '../database/connection';
import type { PoolClient } from 'pg';

export interface AccountDeletionSummary {
  userId: string;
  futureBookingsCancelled: number;
  membershipsEnded: number;
  deletedAt: string;
}

export class SoleFacilityAdminError extends Error {
  readonly facilityNames: string[];

  constructor(facilityNames: string[]) {
    super(
      `You are the only administrator for ${facilityNames.join(
        ', '
      )}. Add another administrator, or contact support, before deleting your account.`
    );
    this.name = 'SoleFacilityAdminError';
    this.facilityNames = facilityNames;
  }
}

/**
 * Facilities where this user is the last remaining active admin.
 *
 * Deleting them would leave the facility with nobody able to manage courts,
 * members or billing, which is worse for everyone than refusing the request.
 * The policy does not cover this case; refusing with a clear next step does.
 */
async function findSolelyAdministeredFacilities(
  client: PoolClient,
  userId: string
): Promise<string[]> {
  const result = await client.query(
    `SELECT f.name
       FROM facility_admins fa
       JOIN facilities f ON f.id = fa.facility_id
      WHERE fa.user_id = $1
        AND fa.status = 'active'
        AND NOT EXISTS (
          SELECT 1
            FROM facility_admins other
           WHERE other.facility_id = fa.facility_id
             AND other.user_id <> $1
             AND other.status = 'active'
        )`,
    [userId]
  );
  return result.rows.map((row: { name: string }) => row.name);
}

/** Best-effort delete: a table that does not exist in this database is skipped. */
async function deleteFrom(
  client: PoolClient,
  table: string,
  whereClause: string,
  params: unknown[]
): Promise<number> {
  try {
    const result = await client.query(`DELETE FROM ${table} WHERE ${whereClause}`, params);
    return result.rowCount ?? 0;
  } catch (error: any) {
    // 42P01 = undefined_table. Deployments differ in which optional features
    // have been migrated; a missing table must not abort the deletion.
    if (error?.code === '42P01') return 0;
    throw error;
  }
}

/**
 * Delete a member's account.
 *
 * Runs in one transaction: either the member is fully anonymized or nothing
 * changes. A partially deleted account is the one outcome worse than a failed
 * request, since the member would be told they are gone while their data
 * remains.
 */
export async function deleteUserAccount(userId: string): Promise<AccountDeletionSummary> {
  return transaction(async (client) => {
    const existing = await client.query(
      `SELECT id, deleted_at FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (existing.rows.length === 0) {
      throw new Error('Account not found');
    }
    if (existing.rows[0].deleted_at) {
      throw new Error('This account has already been deleted');
    }

    const soleAdminFacilities = await findSolelyAdministeredFacilities(client, userId);
    if (soleAdminFacilities.length > 0) {
      throw new SoleFacilityAdminError(soleAdminFacilities);
    }

    // ── Future bookings: cancelled and the slots released ──
    const cancelledBookings = await client.query(
      `UPDATE bookings
          SET status = 'cancelled',
              updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
          AND status <> 'cancelled'
          AND (booking_date > CURRENT_DATE
               OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))`,
      [userId]
    );

    // ── Memberships end; facility admins see the membership as ended ──
    const endedMemberships = await client.query(
      `UPDATE facility_memberships
          SET status = 'expired',
              end_date = CURRENT_DATE
        WHERE user_id = $1
          AND status <> 'expired'`,
      [userId]
    );

    await deleteFrom(client, 'facility_admins', 'user_id = $1', [userId]);

    // ── Personal content the policy says is not retained ──
    await deleteFrom(client, 'messages', 'sender_id = $1', [userId]);
    await deleteFrom(client, 'conversation_participants', 'user_id = $1', [userId]);
    await deleteFrom(client, 'notifications', 'user_id = $1', [userId]);
    await deleteFrom(client, 'hitting_partner_posts', 'user_id = $1', [userId]);
    await deleteFrom(client, 'bulletin_drill_signups', 'user_id = $1', [userId]);
    await deleteFrom(client, 'bulletin_posts', 'author_id = $1', [userId]);
    await deleteFrom(client, 'player_profiles', 'user_id = $1', [userId]);
    await deleteFrom(client, 'player_stats', 'user_id = $1', [userId]);
    await deleteFrom(client, 'user_preferences', 'user_id = $1', [userId]);
    await deleteFrom(client, 'password_reset_tokens', 'user_id = $1', [userId]);
    await deleteFrom(client, 'member_terms_acceptances', 'user_id = $1', [userId]);
    await deleteFrom(client, 'member_general_rules_acceptances', 'user_id = $1', [userId]);
    await deleteFrom(client, 'member_court_waiver_acceptances', 'user_id = $1', [userId]);
    await deleteFrom(client, 'household_members', 'user_id = $1', [userId]);
    await deleteFrom(client, 'player_level_group_members', 'user_id = $1', [userId]);
    await deleteFrom(client, 'user_tiers', 'user_id = $1', [userId]);
    await deleteFrom(client, 'booking_participants', 'user_id = $1', [userId]);

    // Push stops immediately, which is the policy's first promise.
    await deleteFrom(client, 'user_push_tokens', 'user_id = $1', [userId]);

    // Deliberately retained, per the policy's retention table:
    //   pro_shop_orders / pro_shop_tabs / payment_history / connect_payments
    //   facility_revenue_log — financial records, 7 years
    //   account_strikes — abuse and safety records
    //   bookings (past) — anonymized via the users row below

    // ── Anonymize the account itself ──
    // The email is rewritten so the address is free for a fresh signup, and the
    // password hash is replaced with a value no bcrypt comparison can match.
    const deleted = await client.query(
      `UPDATE users
          SET email = 'deleted+' || id || '@deleted.courttimeapp.com',
              password_hash = 'account-deleted',
              full_name = 'Deleted Member',
              first_name = NULL,
              last_name = NULL,
              gender = NULL,
              phone = NULL,
              address = NULL,
              street_address = NULL,
              city = NULL,
              state = NULL,
              zip_code = NULL,
              deleted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      RETURNING deleted_at as "deletedAt"`,
      [userId]
    );

    return {
      userId,
      futureBookingsCancelled: cancelledBookings.rowCount ?? 0,
      membershipsEnded: endedMemberships.rowCount ?? 0,
      deletedAt: String(deleted.rows[0].deletedAt),
    };
  });
}
