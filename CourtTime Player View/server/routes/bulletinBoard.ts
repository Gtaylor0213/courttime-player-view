import express from 'express';
import {
  getFacilityBulletinPosts,
  createBulletinPost,
  updateBulletinPost,
  deleteBulletinPost,
  togglePinBulletinPost,
  signupForDrill,
  cancelDrillSignup,
  removeDrillSignupByAdmin
} from '../../src/services/bulletinBoardService';
import { query } from '../../src/database/connection';

const router = express.Router();
const signupEnabledCategories = new Set(['drill', 'social', 'clinic', 'tournament']);

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
    const postData = { ...req.body, authorId: req.user!.userId };

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
 * POST /api/bulletin-board/:postId/signup
 * Signup current member for an eligible event post
 */
router.post('/:postId/signup', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user!.userId;
    const result = await signupForDrill(postId, userId);
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
      return res.status(400).json({ success: false, error: 'Signup management is only available for drill/social/clinic/tournament posts' });
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
