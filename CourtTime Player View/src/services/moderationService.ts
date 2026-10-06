/**
 * Member blocking and content reports (App Store Guideline 1.2).
 *
 * Blocking is one-directional in what it hides (A stops seeing B) but
 * two-directional for direct messages: once either has blocked the other,
 * neither can message the other.
 */

import { query } from '../database/connection';
import { notificationService } from './notificationService';
import { sendContentReportEmail } from './emailService';

export class ModerationError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = 'ModerationError';
  }
}

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_CONTENT_TYPES = ['message', 'bulletin_post', 'hitting_partner_post', 'user'] as const;
export type ReportContentType = (typeof REPORT_CONTENT_TYPES)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAILS_MAX_LENGTH = 1000;

export interface BlockedUser {
  userId: string;
  fullName: string;
  blockedAt: string;
}

/** Ids of everyone `userId` has blocked. */
export async function getBlockedUserIds(userId: string): Promise<Set<string>> {
  const result = await query(`SELECT blocked_id FROM user_blocks WHERE blocker_id = $1`, [userId]);
  return new Set(result.rows.map((row: any) => row.blocked_id as string));
}

/** Of `otherIds`, the ones with a block between them and `userId` in either direction. */
export async function getUsersBlockedEitherWay(userId: string, otherIds: string[]): Promise<Set<string>> {
  if (otherIds.length === 0) return new Set();
  const result = await query(
    `SELECT CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END AS other_id
       FROM user_blocks
      WHERE (blocker_id = $1 AND blocked_id = ANY($2::uuid[]))
         OR (blocked_id = $1 AND blocker_id = ANY($2::uuid[]))`,
    [userId, otherIds]
  );
  return new Set(result.rows.map((row: any) => row.other_id as string));
}

export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  return (await getUsersBlockedEitherWay(userA, [userB])).size > 0;
}

export async function listBlockedUsers(userId: string): Promise<BlockedUser[]> {
  const result = await query(
    `SELECT ub.blocked_id AS "userId", u.full_name AS "fullName", ub.created_at AS "blockedAt"
       FROM user_blocks ub
       JOIN users u ON u.id = ub.blocked_id
      WHERE ub.blocker_id = $1
      ORDER BY ub.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function blockUser(blockerId: string, blockedId: unknown): Promise<void> {
  if (typeof blockedId !== 'string' || !UUID_PATTERN.test(blockedId)) {
    throw new ModerationError('userId is required');
  }
  if (blockedId === blockerId) {
    throw new ModerationError('You cannot block yourself');
  }
  const target = await query(`SELECT 1 FROM users WHERE id = $1`, [blockedId]);
  if (target.rows.length === 0) {
    throw new ModerationError('Member not found', 404);
  }

  await query(
    `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    [blockerId, blockedId]
  );

  // Their direct thread disappears from the blocker's list, so anything unread
  // in it would otherwise keep the unread badge lit with no way to clear it.
  await query(
    `UPDATE messages m
        SET is_read = true
       FROM conversations c
      WHERE m.conversation_id = c.id
        AND c.is_group = false
        AND m.sender_id = $2
        AND m.is_read = false
        AND $1 IN (c.participant1_id, c.participant2_id)
        AND $2 IN (c.participant1_id, c.participant2_id)`,
    [blockerId, blockedId]
  );
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  if (!UUID_PATTERN.test(blockedId)) return;
  await query(`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`, [blockerId, blockedId]);
}

interface ReportTarget {
  reportedUserId: string | null;
  facilityId: string | null;
  snapshot: string | null;
}

/**
 * Looks the reported thing up server-side, so the stored snapshot and the
 * reported member come from the database rather than from the client, and so
 * nobody can report (and thereby read) content they have no access to.
 */
async function resolveReportTarget(
  reporterId: string,
  contentType: ReportContentType,
  contentId: string
): Promise<ReportTarget> {
  if (!UUID_PATTERN.test(contentId)) {
    throw new ModerationError('Content not found', 404);
  }

  if (contentType === 'message') {
    const result = await query(
      `SELECT m.sender_id, m.message_text, c.facility_id
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.id = $1
          AND (
            (c.is_group = false AND $2 IN (c.participant1_id, c.participant2_id))
            OR (c.is_group = true AND EXISTS (
              SELECT 1 FROM conversation_participants cp
               WHERE cp.conversation_id = c.id AND cp.user_id = $2
            ))
          )`,
      [contentId, reporterId]
    );
    const row = result.rows[0];
    if (!row) throw new ModerationError('Message not found', 404);
    return { reportedUserId: row.sender_id, facilityId: row.facility_id, snapshot: row.message_text };
  }

  if (contentType === 'bulletin_post') {
    const result = await query(
      `SELECT author_id, facility_id, title, content FROM bulletin_posts WHERE id = $1`,
      [contentId]
    );
    const row = result.rows[0];
    if (!row) throw new ModerationError('Post not found', 404);
    return {
      reportedUserId: row.author_id,
      facilityId: row.facility_id,
      snapshot: `${row.title}\n\n${row.content}`,
    };
  }

  if (contentType === 'hitting_partner_post') {
    const result = await query(
      `SELECT user_id, facility_id, availability, description FROM hitting_partner_posts WHERE id = $1`,
      [contentId]
    );
    const row = result.rows[0];
    if (!row) throw new ModerationError('Post not found', 404);
    return {
      reportedUserId: row.user_id,
      facilityId: row.facility_id,
      snapshot: `${row.description}\n\nAvailability: ${row.availability}`,
    };
  }

  const result = await query(`SELECT 1 FROM users WHERE id = $1`, [contentId]);
  if (result.rows.length === 0) throw new ModerationError('Member not found', 404);
  return { reportedUserId: contentId, facilityId: null, snapshot: null };
}

export interface CreateReportInput {
  reporterId: string;
  contentType: unknown;
  contentId: unknown;
  reason: unknown;
  details?: unknown;
  /** Only used for `user` reports, which have no content to derive a facility from. */
  facilityId?: unknown;
}

/** Stores a report and alerts the CourtTime team. Returns the report id. */
export async function createContentReport(input: CreateReportInput): Promise<string> {
  const { reporterId } = input;
  if (!REPORT_CONTENT_TYPES.includes(input.contentType as ReportContentType)) {
    throw new ModerationError('Invalid contentType');
  }
  if (!REPORT_REASONS.includes(input.reason as ReportReason)) {
    throw new ModerationError('Invalid reason');
  }
  if (typeof input.contentId !== 'string') {
    throw new ModerationError('contentId is required');
  }
  const contentType = input.contentType as ReportContentType;
  const reason = input.reason as ReportReason;
  const contentId = input.contentId;
  const details =
    typeof input.details === 'string' && input.details.trim()
      ? input.details.trim().slice(0, DETAILS_MAX_LENGTH)
      : null;

  const target = await resolveReportTarget(reporterId, contentType, contentId);
  if (target.reportedUserId === reporterId) {
    throw new ModerationError('You cannot report your own content');
  }
  const facilityId =
    target.facilityId ?? (typeof input.facilityId === 'string' && input.facilityId ? input.facilityId : null);

  const inserted = await query(
    `INSERT INTO content_reports
       (reporter_id, reported_user_id, facility_id, content_type, content_id, reason, details, content_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (reporter_id, content_type, content_id) DO NOTHING
     RETURNING id`,
    [reporterId, target.reportedUserId, facilityId, contentType, contentId, reason, details, target.snapshot]
  );

  if (inserted.rows.length === 0) {
    // Already reported by this member: succeed quietly, don't alert twice.
    const existing = await query(
      `SELECT id FROM content_reports WHERE reporter_id = $1 AND content_type = $2 AND content_id = $3`,
      [reporterId, contentType, contentId]
    );
    return existing.rows[0]?.id;
  }

  const reportId: string = inserted.rows[0].id;
  void alertOnNewReport(reportId, {
    reporterId,
    reportedUserId: target.reportedUserId,
    facilityId,
    contentType,
    reason,
    details,
    snapshot: target.snapshot,
  });
  return reportId;
}

/**
 * Fire-and-forget alerts. The report is already stored, so a failed email or
 * notification is logged and never surfaced to the reporting member.
 */
async function alertOnNewReport(
  reportId: string,
  report: {
    reporterId: string;
    reportedUserId: string | null;
    facilityId: string | null;
    contentType: ReportContentType;
    reason: ReportReason;
    details: string | null;
    snapshot: string | null;
  }
): Promise<void> {
  try {
    const users = await query(`SELECT id, full_name, email FROM users WHERE id = ANY($1::uuid[])`, [
      [report.reporterId, report.reportedUserId].filter(Boolean),
    ]);
    const byId = new Map<string, any>(users.rows.map((row: any) => [row.id, row]));
    const facility = report.facilityId
      ? (await query(`SELECT name FROM facilities WHERE id = $1`, [report.facilityId])).rows[0]
      : null;

    await sendContentReportEmail({
      reportId,
      contentType: report.contentType,
      reason: report.reason,
      details: report.details,
      contentSnapshot: report.snapshot,
      reporterName: byId.get(report.reporterId)?.full_name || 'A member',
      reporterEmail: byId.get(report.reporterId)?.email || '',
      reportedUserName: report.reportedUserId ? byId.get(report.reportedUserId)?.full_name : null,
      reportedUserId: report.reportedUserId,
      facilityName: facility?.name ?? null,
    });

    // Club admins can already remove bulletin posts, so tell them about reported
    // public posts. Private messages go to the CourtTime team only.
    const isPublicPost = report.contentType === 'bulletin_post' || report.contentType === 'hitting_partner_post';
    if (isPublicPost && report.facilityId) {
      const admins = await query(
        `SELECT user_id FROM facility_admins
          WHERE facility_id = $1 AND status = 'active' AND user_id IS NOT NULL AND user_id <> $2`,
        [report.facilityId, report.reporterId]
      );
      await Promise.all(
        admins.rows.map((admin: any) =>
          notificationService.createNotification(
            admin.user_id,
            'Post reported',
            `A member reported a ${report.contentType === 'bulletin_post' ? 'bulletin board' : 'hitting partner'} post as ${report.reason}. Please review it.`,
            'content_report',
            { actionUrl: '/bulletin-board', pushData: { facilityId: report.facilityId as string } }
          )
        )
      );
    }
  } catch (error) {
    console.error('[Moderation] Failed to send report alerts for', reportId, error);
  }
}
