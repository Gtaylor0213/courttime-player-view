import { query } from '../database/connection';

// Seeded in migration 083_seed_courttime_team_user.sql. Used as the sender
// identity for every message sent from the /developer broadcast panel.
export const COURTTIME_TEAM_USER_ID = '00000000-0000-0000-0000-000000000001';

export type BroadcastAudience = 'all' | 'facility' | 'specific';

export interface BroadcastFilters {
  audience: BroadcastAudience;
  facilityId?: string;
  userIds?: string[];
  neverMessagedOnly?: boolean;
  joinedFrom?: string;
  joinedTo?: string;
}

export interface BroadcastRecipient {
  id: string;
  fullName: string;
  email: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds and runs the recipient query for a given filter set. Called both by
 * the preview endpoint and again server-side by the send endpoint, so a
 * client can never widen its own audience beyond what it previewed.
 */
export async function resolveAudience(filters: BroadcastFilters): Promise<BroadcastRecipient[]> {
  const conditions: string[] = [`u.user_type = 'player'`];
  const params: any[] = [];

  if (filters.audience === 'facility') {
    if (!filters.facilityId) {
      throw new Error('facilityId is required for the facility audience');
    }
    params.push(filters.facilityId);
    conditions.push(`EXISTS (
      SELECT 1 FROM facility_memberships fm
      WHERE fm.user_id = u.id AND fm.facility_id = $${params.length} AND fm.status = 'active'
    )`);
  } else if (filters.audience === 'specific') {
    if (!filters.userIds || filters.userIds.length === 0) {
      return [];
    }
    params.push(filters.userIds);
    conditions.push(`u.id = ANY($${params.length}::uuid[])`);
  }

  if (filters.neverMessagedOnly) {
    params.push(COURTTIME_TEAM_USER_ID);
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      WHERE m.sender_id = $${params.length}
        AND (c.participant1_id = u.id OR c.participant2_id = u.id)
    )`);
  }

  if (filters.joinedFrom) {
    params.push(filters.joinedFrom);
    conditions.push(`u.created_at >= $${params.length}`);
  }
  if (filters.joinedTo) {
    params.push(filters.joinedTo);
    conditions.push(`u.created_at <= $${params.length}`);
  }

  const result = await query(
    `SELECT u.id, u.full_name as "fullName", u.email
     FROM users u
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.full_name`,
    params
  );

  return result.rows;
}

/**
 * Finds the standing CourtTime Team <-> player thread, creating it on first
 * contact. The conversations.unique_conversation constraint is on the
 * participant pair only (not facility_id), so this lookup ignores facility
 * entirely and every broadcast to a given player reuses the same thread.
 */
async function findOrCreateTeamConversation(playerId: string): Promise<string> {
  const existing = await query(
    `SELECT id FROM conversations
     WHERE (participant1_id = $1 AND participant2_id = $2)
        OR (participant1_id = $2 AND participant2_id = $1)`,
    [COURTTIME_TEAM_USER_ID, playerId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const created = await query(
    `INSERT INTO conversations (participant1_id, participant2_id, facility_id)
     VALUES ($1, $2, NULL)
     RETURNING id`,
    [COURTTIME_TEAM_USER_ID, playerId]
  );

  return created.rows[0].id;
}

async function sendTeamMessage(playerId: string, messageText: string): Promise<void> {
  const conversationId = await findOrCreateTeamConversation(playerId);
  await query(
    `INSERT INTO messages (conversation_id, sender_id, message_text)
     VALUES ($1, $2, $3)`,
    [conversationId, COURTTIME_TEAM_USER_ID, messageText]
  );
}

export interface TeamConversationSummary {
  conversationId: string;
  playerId: string;
  playerName: string;
  playerEmail: string;
  lastMessageText: string | null;
  lastMessageSenderId: string | null;
  lastMessageSentAt: string | null;
  unreadCount: number;
}

export interface TeamConversationMessage {
  id: string;
  senderId: string;
  messageText: string;
  isRead: boolean;
  createdAt: string;
}

/**
 * Every thread CourtTime Team is a participant in, newest activity first.
 * Mirrors the 1:1 list query in server/routes/messages.ts:471-524, minus the
 * group-conversation branch (broadcast threads are never groups).
 */
export async function listTeamConversations(): Promise<TeamConversationSummary[]> {
  const result = await query(
    `SELECT
       c.id as "conversationId",
       CASE WHEN c.participant1_id = $1 THEN c.participant2_id ELSE c.participant1_id END as "playerId",
       CASE WHEN c.participant1_id = $1 THEN u2.full_name ELSE u1.full_name END as "playerName",
       CASE WHEN c.participant1_id = $1 THEN u2.email ELSE u1.email END as "playerEmail",
       (
         SELECT m.message_text FROM messages m
         WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
       ) as "lastMessageText",
       (
         SELECT m.sender_id FROM messages m
         WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
       ) as "lastMessageSenderId",
       (
         SELECT m.created_at FROM messages m
         WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
       ) as "lastMessageSentAt",
       (
         SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.is_read = false
       ) as "unreadCount"
     FROM conversations c
     JOIN users u1 ON c.participant1_id = u1.id
     JOIN users u2 ON c.participant2_id = u2.id
     WHERE c.participant1_id = $1 OR c.participant2_id = $1
     ORDER BY "lastMessageSentAt" DESC NULLS LAST`,
    [COURTTIME_TEAM_USER_ID]
  );

  return result.rows.map((row) => ({ ...row, unreadCount: parseInt(row.unreadCount || 0, 10) }));
}

async function assertIsTeamConversation(conversationId: string): Promise<void> {
  const result = await query(
    `SELECT 1 FROM conversations
     WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)`,
    [conversationId, COURTTIME_TEAM_USER_ID]
  );
  if (result.rows.length === 0) {
    throw new Error('Not a CourtTime Team conversation');
  }
}

/**
 * Fetches a thread's full history and, as a side effect, marks the player's
 * messages read (opening the thread in the console is the "reading" action,
 * same as messages.ts:924-961's mark-as-read endpoint).
 */
export async function getTeamConversationMessages(conversationId: string): Promise<TeamConversationMessage[]> {
  await assertIsTeamConversation(conversationId);

  const result = await query(
    `SELECT id, sender_id as "senderId", message_text as "messageText",
            is_read as "isRead", created_at as "createdAt"
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );

  await query(
    `UPDATE messages SET is_read = true
     WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false`,
    [conversationId, COURTTIME_TEAM_USER_ID]
  );

  return result.rows;
}

export async function replyToTeamConversation(conversationId: string, messageText: string): Promise<void> {
  await assertIsTeamConversation(conversationId);
  await query(
    `INSERT INTO messages (conversation_id, sender_id, message_text)
     VALUES ($1, $2, $3)`,
    [conversationId, COURTTIME_TEAM_USER_ID, messageText]
  );
}

const BROADCAST_SEND_DELAY_MS = 100;

/**
 * Sends to every recipient one at a time. Deliberately not awaited by the
 * request handler that calls it: an "all players" audience can be large
 * enough to run past typical platform HTTP timeouts, so this keeps going in
 * the background after the response has already gone out (same rationale as
 * sendBulkInvitesThrottled in addressWhitelistService.ts).
 */
export async function sendBroadcastThrottled(
  recipients: BroadcastRecipient[],
  messageText: string
): Promise<void> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    try {
      await sendTeamMessage(recipients[i].id, messageText);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error('[DeveloperMessaging] Failed to send to', recipients[i].id, err);
    }
    if (i < recipients.length - 1) {
      await delay(BROADCAST_SEND_DELAY_MS);
    }
  }

  console.log(`[DeveloperMessaging] Broadcast complete: sent ${sent}, failed ${failed}`);
}
