/**
 * Messages API Routes
 * Handles player-to-player messaging within facilities
 */

import express from 'express';
import { query } from '../../src/database/connection';

const router = express.Router();

/**
 * GET /api/messages/conversations/:facilityId/:userId
 * Get all conversations for a user within a facility
 */
router.get('/conversations/:facilityId/:userId', async (req, res) => {
  try {
    const { facilityId, userId } = req.params;

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
 * GET /api/messages/:conversationId
 * Get all messages in a conversation
 */
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

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
    const { senderId, recipientId, facilityId, messageText } = req.body;

    if (!senderId || !recipientId || !facilityId || !messageText) {
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
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: userId'
      });
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
