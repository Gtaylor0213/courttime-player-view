/**
 * Messages API Routes
 * Handles player-to-player messaging within facilities
 */

import express from 'express';
import { query } from '../../src/database/connection';
import { notificationService } from '../../src/services/notificationService';

const router = express.Router();

/** Cap on directory rows so large facilities don't ship their whole roster. */
const DIRECTORY_LIMIT = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Browsing a facility's directory requires belonging to that facility, either as
 * an active member or as an active admin.
 */
async function hasFacilityAccess(facilityId: string, userId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM facility_memberships
      WHERE facility_id = $1 AND user_id = $2 AND status = 'active'
     UNION ALL
     SELECT 1 FROM facility_admins
      WHERE facility_id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [facilityId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Only active members are listed, because POST /api/messages requires an active
 * membership for both participants — anyone else would fail on send. Email is
 * searchable below but deliberately not returned: the picker never shows it.
 */
const DIRECTORY_QUERY = `
  SELECT DISTINCT
    u.id as "userId",
    u.full_name as "fullName",
    pp.profile_image_url as "profileImageUrl",
    pp.skill_level as "skillLevel",
    (fa.user_id IS NOT NULL) as "isFacilityAdmin"
  FROM facility_memberships fm
  JOIN users u ON u.id = fm.user_id
  LEFT JOIN player_profiles pp ON pp.user_id = u.id
  LEFT JOIN facility_admins fa
    ON fa.user_id = fm.user_id
    AND fa.facility_id = fm.facility_id
    AND fa.status = 'active'
  WHERE fm.facility_id = $1
    AND fm.status = 'active'`;

/**
 * GET /api/messages/directory/:facilityId?search=
 * Members the caller is allowed to start a conversation with.
 */
router.get('/directory/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const callerId = req.user?.userId;
    if (!callerId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!(await hasFacilityAccess(facilityId, callerId))) {
      return res.status(403).json({ success: false, error: 'Not a member of this facility' });
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const params: any[] = [facilityId, callerId];
    let sql = `${DIRECTORY_QUERY} AND u.id <> $2`;

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.full_name ILIKE $3 OR u.email ILIKE $3)`;
    }

    sql += ` ORDER BY "fullName" ASC LIMIT ${DIRECTORY_LIMIT}`;

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        members: result.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching message directory:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/messages/directory/:facilityId/:userId
 * One messageable member, for deep links that arrive with only a recipient id.
 */
router.get('/directory/:facilityId/:userId', async (req, res) => {
  try {
    const { facilityId, userId } = req.params;
    const callerId = req.user?.userId;
    if (!callerId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!(await hasFacilityAccess(facilityId, callerId))) {
      return res.status(403).json({ success: false, error: 'Not a member of this facility' });
    }

    const result = UUID_PATTERN.test(userId)
      ? await query(`${DIRECTORY_QUERY} AND u.id = $2 LIMIT 1`, [facilityId, userId])
      : { rows: [] };

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'That member is not an active member of this facility'
      });
    }

    res.json({
      success: true,
      data: {
        member: result.rows[0]
      }
    });
  } catch (error: any) {
    console.error('Error fetching directory member:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/messages/conversations/:facilityId/:userId
 * Get all conversations for a user within a facility
 */
router.get('/conversations/:facilityId/:userId', async (req, res) => {
  try {
    const { facilityId, userId } = req.params;

    // A user may only read their own conversations.
    if (req.user?.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Cannot access another user conversations' });
    }

    const result = await query(`
      SELECT
        c.id,
        c.facility_id as "facilityId",
        c.created_at as "createdAt",
        c.updated_at as "updatedAt",
        CASE
          WHEN c.participant1_id = $1 THEN u2.id
          ELSE u1.id
        END as "otherUserId",
        CASE
          WHEN c.participant1_id = $1 THEN u2.full_name
          ELSE u1.full_name
        END as "otherUserName",
        CASE
          WHEN c.participant1_id = $1 THEN u2.email
          ELSE u1.email
        END as "otherUserEmail",
        (
          SELECT m.message_text
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as "lastMessageText",
        (
          SELECT m.sender_id
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as "lastMessageSenderId",
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as "lastMessageSentAt",
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_id != $1
            AND m.is_read = false
        ) as "unreadCount"
      FROM conversations c
      JOIN users u1 ON c.participant1_id = u1.id
      JOIN users u2 ON c.participant2_id = u2.id
      WHERE c.facility_id = $2
        AND (c.participant1_id = $1 OR c.participant2_id = $1)
      ORDER BY "lastMessageSentAt" DESC NULLS LAST
    `, [userId, facilityId]);

    const conversations = result.rows.map(row => ({
      id: row.id,
      otherUser: {
        id: row.otherUserId,
        name: row.otherUserName,
        email: row.otherUserEmail
      },
      lastMessage: row.lastMessageText ? {
        text: row.lastMessageText,
        senderId: row.lastMessageSenderId,
        sentAt: row.lastMessageSentAt
      } : null,
      unreadCount: parseInt(row.unreadCount || 0)
    }));

    res.json({
      success: true,
      data: {
        conversations
      }
    });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/messages/message/:messageId
 * Permanently remove a message you sent (must be sender and a participant in the conversation)
 */
router.delete('/message/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    // Identity comes from the verified JWT — a caller can only delete messages they sent.
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const result = await query(
      `
      DELETE FROM messages m
      USING conversations c
      WHERE m.id = $1
        AND m.sender_id = $2
        AND m.conversation_id = c.id
        AND (c.participant1_id = $2 OR c.participant2_id = $2)
      RETURNING m.id, m.conversation_id as "conversationId"
    `,
      [messageId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found or you cannot delete this message'
      });
    }

    res.json({
      success: true,
      data: {
        deletedId: result.rows[0].id,
        conversationId: result.rows[0].conversationId
      }
    });
  } catch (error: any) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/messages/:conversationId
 * Get all messages in a conversation
 */
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const callerId = req.user?.userId;
    if (!callerId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Only participants of the conversation may read its messages.
    const participantCheck = await query(
      `SELECT 1 FROM conversations
        WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)`,
      [conversationId, callerId]
    );
    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Cannot access this conversation' });
    }

    const result = await query(`
      SELECT
        id,
        conversation_id as "conversationId",
        sender_id as "senderId",
        message_text as "messageText",
        is_read as "isRead",
        created_at as "createdAt"
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [conversationId]);

    res.json({
      success: true,
      data: {
        messages: result.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/messages
 * Send a new message or create a conversation
 */
router.post('/', async (req, res) => {
  try {
    const { recipientId, facilityId, messageText } = req.body;
    // The sender is always the authenticated caller, never a client-supplied id.
    const senderId = req.user?.userId;
    if (!senderId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!recipientId || !facilityId || !messageText) {
      console.error('Missing required fields:', {
        hasSenderId: !!senderId,
        hasRecipientId: !!recipientId,
        hasFacilityId: !!facilityId,
        hasMessageText: !!messageText
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: senderId, recipientId, facilityId, messageText'
      });
    }

    // Check if both users are members of the facility
    const membershipCheck = await query(`
      SELECT user_id
      FROM facility_memberships
      WHERE facility_id = $1
        AND user_id IN ($2, $3)
        AND status = 'active'
    `, [facilityId, senderId, recipientId]);

    if (membershipCheck.rows.length !== 2) {
      return res.status(403).json({
        success: false,
        error: 'Both users must be active members of the facility'
      });
    }

    // Find or create conversation
    let conversationId;
    const existingConv = await query(`
      SELECT id
      FROM conversations
      WHERE facility_id = $1
        AND (
          (participant1_id = $2 AND participant2_id = $3) OR
          (participant1_id = $3 AND participant2_id = $2)
        )
    `, [facilityId, senderId, recipientId]);

    if (existingConv.rows.length > 0) {
      conversationId = existingConv.rows[0].id;
    } else {
      // Create new conversation
      const newConv = await query(`
        INSERT INTO conversations (participant1_id, participant2_id, facility_id)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [senderId, recipientId, facilityId]);
      conversationId = newConv.rows[0].id;
    }

    // Insert message
    const messageResult = await query(`
      INSERT INTO messages (conversation_id, sender_id, message_text)
      VALUES ($1, $2, $3)
      RETURNING
        id,
        conversation_id as "conversationId",
        sender_id as "senderId",
        message_text as "messageText",
        is_read as "isRead",
        created_at as "createdAt"
    `, [conversationId, senderId, messageText]);

    if (recipientId !== senderId) {
      void (async () => {
        try {
          const senderResult = await query(
            `SELECT full_name FROM users WHERE id = $1`,
            [senderId]
          );

          const senderName = senderResult.rows[0]?.full_name || 'A facility member';

          await notificationService.notifyMessageReceived(
            recipientId,
            senderName,
            messageResult.rows[0].messageText,
            {
              conversationId,
              facilityId,
              messageId: messageResult.rows[0].id,
              senderId,
            }
          );
        } catch (notificationError) {
          console.error('Error creating message notification:', notificationError);
        }
      })();
    }

    res.json({
      success: true,
      data: {
        message: messageResult.rows[0],
        conversationId
      }
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/messages/:conversationId/read
 * Mark all messages in a conversation as read for a user
 */
router.patch('/:conversationId/read', async (req, res) => {
  try {
    const { conversationId } = req.params;
    // Identity comes from the verified JWT, not the request body.
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Only a participant may mark a conversation's messages read.
    const participantCheck = await query(
      `SELECT 1 FROM conversations
        WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)`,
      [conversationId, userId]
    );
    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Cannot access this conversation' });
    }

    await query(`
      UPDATE messages
      SET is_read = true
      WHERE conversation_id = $1
        AND sender_id != $2
        AND is_read = false
    `, [conversationId, userId]);

    res.json({
      success: true,
      data: {
        message: 'Messages marked as read'
      }
    });
  } catch (error: any) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
