import { query } from '../database/connection';
import { notificationService } from './notificationService';
import { sendMembershipRequestAdminEmail } from './emailService';

/**
 * In-app alerts + optional email to each active facility admin when a membership
 * request is created or set back to pending.
 */
export async function notifyFacilityAdminsOfMembershipRequest(
  userId: string,
  facilityId: string,
  membershipType: string = 'Full'
): Promise<void> {
  const userResult = await query(
    `SELECT full_name, email FROM users WHERE id = $1`,
    [userId]
  );
  const userName = userResult.rows[0]?.full_name || 'A user';
  const userEmail = userResult.rows[0]?.email || '';

  const facilityResult = await query(`SELECT name FROM facilities WHERE id = $1`, [facilityId]);
  const facilityName = facilityResult.rows[0]?.name || 'your facility';

  const admins = await query(
    `SELECT fa.user_id, u.email, u.full_name
     FROM facility_admins fa
     JOIN users u ON u.id = fa.user_id
     WHERE fa.facility_id = $1
       AND fa.status = 'active'
       AND fa.user_id IS NOT NULL
       AND u.email IS NOT NULL
       AND TRIM(u.email) <> ''`,
    [facilityId]
  );

  for (const admin of admins.rows) {
    try {
      await notificationService.createNotification(
        admin.user_id,
        'New Membership Request',
        `${userName} (${userEmail}) has requested to join ${facilityName}.`,
        'membership_request',
        { actionUrl: `/admin?tab=members` }
      );
    } catch (e) {
      console.error('Failed to create membership request in-app notification:', e);
    }

    try {
      await sendMembershipRequestAdminEmail(
        admin.email,
        admin.user_id,
        userName,
        userEmail,
        facilityName,
        membershipType
      );
    } catch (e) {
      console.error('Failed to send membership request email to admin:', e);
    }
  }
}
