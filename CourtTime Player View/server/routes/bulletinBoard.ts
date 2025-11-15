import express from 'express';
import {
  getFacilityBulletinPosts,
  createBulletinPost,
  updateBulletinPost,
  deleteBulletinPost,
  togglePinBulletinPost
} from '../../src/services/bulletinBoardService';

const router = express.Router();

/**
 * GET /api/bulletin-board/:facilityId
 * Get bulletin posts for a facility
 */
router.get('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const posts = await getFacilityBulletinPosts(facilityId);

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
    const postData = req.body;

    if (!postData.facilityId || !postData.authorId || !postData.title || !postData.content || !postData.category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: facilityId, authorId, title, content, category'
      });
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
 * Delete a bulletin post
 */
router.delete('/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { authorId } = req.query;

    if (!authorId) {
      return res.status(400).json({
        success: false,
        error: 'authorId is required'
      });
    }

    const success = await deleteBulletinPost(postId, authorId as string);

    if (success) {
      res.json({
        success: true,
        message: 'Bulletin post deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Post not found or you do not have permission to delete it'
      });
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
