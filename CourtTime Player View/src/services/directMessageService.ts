/**
 * Direct (1:1) message sending.
 *
 * Extracted so POST /api/messages (one recipient) and POST /api/messages/bulk
 * ("send the same message to several people individually") create threads and
 * rows the same way. A bulk send is deliberately *not* a group: each recipient
 * gets the message in their own private thread and never sees the others.
 */

import { query } from '../database/connection';

/**
 * Cap on recipients for one bulk send. Matches GROUP_MEMBER_LIMIT so the two
 * pickers in the Messages UI behave alike, and keeps a single request from
 * fanning out across a whole roster.
 */
export const BULK_RECIPIENT_LIMIT = 30;

/** Thrown for caller mistakes; `status` is the HTTP status the route should return. */
export class DirectMessageError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'DirectMessageError';
  }
}

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  messageText: string;
  isRead: boolean;
  createdAt: string;
}

/**
 * The 1:1 thread between two facility members, created on first contact.
 * Conversations are facility-scoped, so the same pair can hold separate
 * threads at two facilities.
 */
export async function findOrCreateDirectConversation(
  facilityId: string,
  senderId: string,
  recipientId: string
): Promise<string> {
  const existing = await query(
    `SELECT id
       FROM conversations
      WHERE facility_id = $1
        AND (
          (participant1_id = $2 AND participant2_id = $3) OR
          (participant1_id = $3 AND participant2_id = $2)
        )`,
    [facilityId, senderId, recipientId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const created = await query(
    `INSERT INTO conversations (participant1_id, participant2_id, facility_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [senderId, recipientId, facilityId]
  );
  return created.rows[0].id;
}

/** Append one message to a conversation and return the stored row. */
export async function insertMessage(
  conversationId: string,
  senderId: string,
  messageText: string
): Promise<MessageRow> {
  const result = await query(
    `INSERT INTO messages (conversation_id, sender_id, message_text)
     VALUES ($1, $2, $3)
     RETURNING
       id,
       conversation_id as "conversationId",
       sender_id as "senderId",
       message_text as "messageText",
       is_read as "isRead",
       created_at as "createdAt"`,
    [conversationId, senderId, messageText]
  );
  return result.rows[0];
}

/**
 * Narrows a caller-supplied recipient list to the ids we will actually send to:
 * strings only, de-duplicated, and never the sender themselves (a bulk send is
 * addressed to *other* people, so silently dropping self beats erroring on it).
 */
export function normalizeRecipientIds(rawRecipientIds: unknown, senderId: string): string[] {
  const requested: unknown[] = Array.isArray(rawRecipientIds) ? rawRecipientIds : [];
  const ids = new Set(
    requested.filter((id): id is string => typeof id === 'string' && !!id.trim() && id !== senderId)
  );

  if (ids.size === 0) {
    throw new DirectMessageError('Select at least one recipient');
  }
  if (ids.size > BULK_RECIPIENT_LIMIT) {
    throw new DirectMessageError(`You can message at most ${BULK_RECIPIENT_LIMIT} people at once`);
  }
  return Array.from(ids);
}

/** Trims and validates the message body, throwing DirectMessageError when invalid. */
export function validateMessageText(rawText: unknown): string {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new DirectMessageError('messageText is required');
  }
  return rawText.trim();
}

export interface SendToManyOptions {
  facilityId: string;
  senderId: string;
  /** Raw list from the caller; validated here. */
  recipientIds: unknown;
  /** Raw text from the caller; validated here. */
  messageText: unknown;
}

export interface SendToManyResult {
  messageText: string;
  /** One entry per recipient the message reached, in request order. */
  sent: Array<{ recipientId: string; conversationId: string; message: MessageRow }>;
  /** Recipients whose send failed, so the UI can name them rather than fail wholesale. */
  failed: Array<{ recipientId: string; error: string }>;
}

/**
 * Sends one message to each recipient as a separate 1:1 thread.
 *
 * Every recipient must be an active member of the facility, checked up front in
 * a single query: an unknown or inactive id is a client bug, not a partial
 * failure, so the whole request is rejected before anything is written. Only
 * per-recipient database errors land in `failed`.
 */
export async function sendDirectMessageToMany(
  options: SendToManyOptions
): Promise<SendToManyResult> {
  const { facilityId, senderId } = options;
  if (!facilityId) {
    throw new DirectMessageError('facilityId is required');
  }
  const recipientIds = normalizeRecipientIds(options.recipientIds, senderId);
  const messageText = validateMessageText(options.messageText);

  const membershipCheck = await query(
    `SELECT user_id FROM facility_memberships
      WHERE facility_id = $1
        AND user_id = ANY($2::uuid[])
        AND status = 'active'`,
    [facilityId, [...recipientIds, senderId]]
  );
  if (membershipCheck.rows.length !== recipientIds.length + 1) {
    throw new DirectMessageError(
      'Both you and every recipient must be active members of the facility',
      403
    );
  }

  const sent: SendToManyResult['sent'] = [];
  const failed: SendToManyResult['failed'] = [];

  for (const recipientId of recipientIds) {
    try {
      const conversationId = await findOrCreateDirectConversation(facilityId, senderId, recipientId);
      const message = await insertMessage(conversationId, senderId, messageText);
      sent.push({ recipientId, conversationId, message });
    } catch (error: any) {
      console.error('[DirectMessage] Bulk send failed for recipient', recipientId, error);
      failed.push({ recipientId, error: error?.message || 'Failed to send' });
    }
  }

  return { messageText, sent, failed };
}
