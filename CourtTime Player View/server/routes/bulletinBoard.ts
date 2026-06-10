import express from 'express';
import {
  getFacilityBulletinPosts,
  getBulletinPostById,
  createBulletinPost,
  updateBulletinPost,
  deleteBulletinPost,
  togglePinBulletinPost,
  signupForDrill,
  cancelDrillSignup,
  removeDrillSignupByAdmin
} from '../../src/services/bulletinBoardService';
import { query } from '../../src/database/connection';
import { parseDollarsToCents } from '../../shared/utils/money';
import { confirmBulletinSignupCheckout } from '../../src/services/stripeConnectService';
import { sendBulletinPostShareEmail } from '../../src/services/emailService';
import {
  buildBulletinPostShareEmailContent,
  formatBulletinPostProminentDate,
} from '../../shared/utils/bulletinPostDisplay';

const router = express.Router();
const signupEnabledCategories = new Set(['event', 'drill', 'social', 'clinic', 'tournament']);

function isValidShareEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function userCanShareBulletinPost(userId: string, facilityId: string): Promise<boolean> {
  const access = await query(
    `SELECT 1
     FROM facility_memberships fm
     WHERE fm.facility_id = $1 AND fm.user_id = $2 AND fm.status = 'active'
     UNION
     SELECT 1
     FROM facility_admins fa
     WHERE fa.facility_id = $1 AND fa.user_id = $2 AND fa.status = 'active'
     LIMIT 1`,
    [facilityId, userId]
  );
  return access.rows.length > 0;
}

async function userIsFacilityAdmin(userId: string, facilityId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1
     FROM facility_admins
     WHERE facility_id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [facilityId, userId]
  );
  return result.rows.length > 0;
}

/**
 * GET /api/bulletin-board/post/:postId
 * Get a single bulletin post (for calendar signup, deep links)
 */
router.get('/post/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const post = await getBulletinPostById(postId, req.user?.userId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    res.json({ success: true, post });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bulletin-board/:facilityId
 * Get bulletin posts for a facility
 */
router.get('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const posts = await getFacilityBulletinPosts(facilityId, req.user?.userId);

    res.json({
      success: true,
      posts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bulletin-board
 * Create a new bulletin post
 */
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const requirePayment = Boolean(body.requirePayment ?? body.require_payment);
    const rawAmount = body.signupAmountCents ?? body.signup_amount_cents;
    const rawDollars = body.signupFeeDollars ?? body.signup_fee_dollars;
    let signupAmountCents: number | undefined;
    if (requirePayment) {
      if (rawDollars != null && String(rawDollars).trim() !== '') {
        signupAmountCents = parseDollarsToCents(rawDollars);
      } else if (rawAmount != null) {
        signupAmountCents = Math.round(Number(rawAmount));
      }
    }

    const rawDuration = body.drillDurationMinutes ?? body.drill_duration_minutes;
    const drillDurationMinutes =
      rawDuration != null && String(rawDuration).trim() !== ''
        ? Math.round(Number(rawDuration))
        : undefined;

    const postData = {
      ...body,
      authorId: req.user!.userId,
      requirePayment,
      drillDurationMinutes,
      signupAmountCents:
        requirePayment && signupAmountCents && signupAmountCents > 0 ? signupAmountCents : undefined,
    };

    if (!postData.facilityId || !postData.authorId || !postData.title || !postData.content || !postData.category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: facilityId, authorId, title, content, category'
      });
    }

    if (signupEnabledCategories.has(postData.category)) {
      const adminResult = await query(
        `SELECT 1 FROM facility_admins
         WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
         LIMIT 1`,
        [postData.authorId, postData.facilityId]
      );
      if (adminResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Only facility admins can create this event type'
        });
      }
    }

    const postId = await createBulletinPost(postData);

    res.status(201).json({
      success: true,
      postId,
      message: 'Bulletin post created successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bulletin-board/signup/confirm
 * Complete a paid bulletin signup after Stripe Checkout redirect.
 */
router.post('/signup/confirm', async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId || req.query?.sessionId || '');
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    const result = await confirmBulletinSignupCheckout({
      sessionId,
      memberId: req.user!.userId,
    });
    return res.json({
      success: true,
      data: result,
      message:
        result.status === 'confirmed'
          ? 'Successfully signed up for event'
          : `Added to waitlist at position #${result.waitlistPosition}`,
    });
  } catch (error: any) {
    if (
      error?.message?.includes('not belong') ||
      error?.message?.includes('not completed') ||
      error?.message?.includes('not found')
    ) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/bulletin-board/:postId/share
 * Email a bulletin post to someone (active member or facility admin)
 */
router.post('/:postId/share', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const sendToAllMembers = Boolean(req.body?.sendToAllMembers);
    const recipientEmail = String(req.body?.recipientEmail || '').trim().toLowerCase();
    const personalMessage =
      typeof req.body?.personalMessage === 'string' ? req.body.personalMessage.trim() : '';

    if (!sendToAllMembers) {
      if (!recipientEmail) {
        return res.status(400).json({ success: false, error: 'recipientEmail is required' });
      }
      if (!isValidShareEmail(recipientEmail)) {
        return res.status(400).json({ success: false, error: 'Enter a valid email address' });
      }
    }

    const post = await getBulletinPostById(postId, req.user!.userId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const canShare = await userCanShareBulletinPost(req.user!.userId, post.facilityId);
    if (!canShare) {
      return res.status(403).json({
        success: false,
        error: 'Only active facility members and admins can share bulletin posts',
      });
    }

    if (sendToAllMembers) {
      const isAdmin = await userIsFacilityAdmin(req.user!.userId, post.facilityId);
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Only facility admins can email all members',
        });
      }
    }

    const senderResult = await query(`SELECT full_name FROM users WHERE id = $1`, [req.user!.userId]);
    const senderName = senderResult.rows[0]?.full_name || 'A CourtTime member';
    const appOrigin = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

    const sharePost = {
      id: post.id,
      title: post.title,
      content: post.content,
      category: post.category,
      facilityId: post.facilityId,
      facilityName: (post as { facilityName?: string }).facilityName,
      authorName: post.authorName,
      drillStartAt: post.drillStartAt,
      drillCourtName: post.drillCourtName,
    };

    const { subject, plainTextBody, shareUrl } = buildBulletinPostShareEmailContent(sharePost, {
      senderName,
      personalMessage: personalMessage || undefined,
      appOrigin,
    });

    const eventLabel = formatBulletinPostProminentDate(sharePost, 'cardWithTime');
    const locationLabel = sharePost.drillCourtName?.trim() || '';
    const description = String(post.content || '').trim();
    const typeLabel = post.category
      ? post.category.charAt(0).toUpperCase() + post.category.slice(1)
      : 'Post';
    const facilityName = (post as { facilityName?: string }).facilityName || 'your club';

    if (sendToAllMembers) {
      const membersResult = await query(
        `SELECT
          u.id as "userId",
          u.email,
          u.full_name as "fullName"
         FROM facility_memberships fm
         JOIN users u ON fm.user_id = u.id
         WHERE fm.facility_id = $1
           AND fm.status = 'active'
           AND u.email IS NOT NULL
           AND TRIM(u.email) <> ''`,
        [post.facilityId]
      );

      const recipients = membersResult.rows;
      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No active members with email addresses found',
        });
      }

      const normalizedResults: Array<{ email: string; success: boolean; error?: string }> = [];
      for (let i = 0; i < recipients.length; i++) {
        const member = recipients[i];
        try {
          const result = await sendBulletinPostShareEmail(
            member.email,
            facilityName,
            subject,
            plainTextBody,
            shareUrl,
            post.title,
            typeLabel,
            eventLabel,
            locationLabel,
            description,
            senderName,
            personalMessage || undefined,
            member.userId
          );
          normalizedResults.push({
            email: member.email,
            success: result.success,
            error: result.error,
          });
        } catch (error) {
          normalizedResults.push({
            email: member.email,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown email send error',
          });
        }

        if (i < recipients.length - 1) {
          await delay(250);
        }
      }

      const sent = normalizedResults.filter((r) => r.success).length;
      const failed = recipients.length - sent;
      const firstErrorMessage = normalizedResults.find((r) => !r.success)?.error;

      if (sent === 0) {
        return res.status(502).json({
          success: false,
          error: firstErrorMessage || 'Could not send email to any members. Try again later.',
        });
      }

      return res.json({
        success: true,
        message:
          failed > 0
            ? `Shared with ${sent} of ${recipients.length} members (${failed} failed)`
            : `Shared with all ${sent} active members`,
        data: { sent, failed, total: recipients.length },
      });
    }

    const result = await sendBulletinPostShareEmail(
      recipientEmail,
      facilityName,
      subject,
      plainTextBody,
      shareUrl,
      post.title,
      typeLabel,
      eventLabel,
      locationLabel,
      description,
      senderName,
      personalMessage || undefined
    );

    if (!result.success) {
      return res.status(502).json({
        success: false,
        error: result.error || 'Could not send email. Try again later.',
      });
    }

    res.json({
      success: true,
      message: `Shared with ${recipientEmail}`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bulletin-board/:postId/signup
 * Signup current member for an eligible event post
 */
router.post('/:postId/signup', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user!.userId;
    const { successUrl, cancelUrl } = req.body || {};
    const result = await signupForDrill(postId, userId, { successUrl, cancelUrl });
    if (result.requiresPayment) {
      return res.json({
        success: true,
        data: result,
        message: 'Redirecting to payment',
      });
    }
    res.json({
      success: true,
      data: result,
      message: result.status === 'confirmed'
        ? 'Successfully signed up for event'
        : `Added to waitlist at position #${result.waitlistPosition}`
    });
  } catch (error: any) {
    if (error?.message?.includes('restricted') || error?.message?.includes('already signed up') || error?.message?.includes('active member')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * DELETE /api/bulletin-board/:postId/signup
 * Cancel current member signup/waitlist for an eligible event post
 */
router.delete('/:postId/signup', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user!.userId;
    const result = await cancelDrillSignup(postId, userId);
    res.json({
      success: true,
      data: result,
      message: 'Signup cancelled successfully'
    });
  } catch (error: any) {
    if (error?.message?.includes('not signed up')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * DELETE /api/bulletin-board/:postId/signup/:memberUserId
 * Admin removes a member from signup/waitlist
 */
router.delete('/:postId/signup/:memberUserId', async (req, res, next) => {
  try {
    const { postId, memberUserId } = req.params;
    const adminUserId = req.user!.userId;

    const postResult = await query(
      `SELECT facility_id, category
       FROM bulletin_posts
       WHERE id = $1`,
      [postId]
    );
    if (postResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (!signupEnabledCategories.has(postResult.rows[0].category)) {
      return res.status(400).json({ success: false, error: 'Signup management is only available for event/drill/social/clinic/tournament posts' });
    }

    const adminResult = await query(
      `SELECT 1 FROM facility_admins
       WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
       LIMIT 1`,
      [adminUserId, postResult.rows[0].facility_id]
    );
    if (adminResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Only facility admins can manage event signups' });
    }

    await removeDrillSignupByAdmin(postId, memberUserId);
    res.json({
      success: true,
      message: 'Member removed from event signup list'
    });
  } catch (error: any) {
    if (error?.message?.includes('not signed up')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * PATCH /api/bulletin-board/:postId
 * Update a bulletin post
 */
router.patch('/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { authorId, ...updates } = req.body;

    if (!authorId) {
      return res.status(400).json({
        success: false,
        error: 'authorId is required'
      });
    }

    const success = await updateBulletinPost(postId, authorId, updates);

    if (success) {
      res.json({
        success: true,
        message: 'Bulletin post updated successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Post not found or you do not have permission to edit it'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/bulletin-board/:postId
 * Delete a bulletin post (author or facility admin)
 */
router.delete('/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user!.userId;

    // Look up the post's facility to check admin status
    const postResult = await query(
      `SELECT facility_id, author_id FROM bulletin_posts WHERE id = $1`,
      [postId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const post = postResult.rows[0];
    const isAuthor = post.author_id === userId;

    // Check if user is a facility admin
    let isAdmin = false;
    if (!isAuthor) {
      const adminResult = await query(
        `SELECT 1 FROM facility_admins WHERE user_id = $1 AND facility_id = $2 AND status = 'active'`,
        [userId, post.facility_id]
      );
      isAdmin = adminResult.rows.length > 0;
    }

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this post'
      });
    }

    const success = await deleteBulletinPost(postId, userId, isAuthor ? false : isAdmin);

    if (success) {
      res.json({ success: true, message: 'Bulletin post deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Post not found' });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/bulletin-board/:postId/pin
 * Pin/unpin a bulletin post (admin only)
 */
router.put('/:postId/pin', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { facilityId, isPinned } = req.body;

    if (typeof isPinned !== 'boolean' || !facilityId) {
      return res.status(400).json({
        success: false,
        error: 'facilityId and isPinned (boolean) are required'
      });
    }

    const success = await togglePinBulletinPost(postId, facilityId, isPinned);

    if (success) {
      res.json({
        success: true,
        message: `Post ${isPinned ? 'pinned' : 'unpinned'} successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
