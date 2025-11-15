import express from 'express';
import {
  getFacilityHittingPartnerPosts,
  getAllHittingPartnerPosts,
  createHittingPartnerPost,
  updateHittingPartnerPost,
  deleteHittingPartnerPost,
  getUserHittingPartnerPosts
} from '../../src/services/hittingPartnerService';

const router = express.Router();

/**
 * GET /api/hitting-partner
 * Get all hitting partner posts (for users with no facility)
 */
router.get('/', async (req, res, next) => {
  try {
    const posts = await getAllHittingPartnerPosts();

    res.json({
      success: true,
      posts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hitting-partner/facility/:facilityId
 * Get hitting partner posts for a facility
 */
router.get('/facility/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const posts = await getFacilityHittingPartnerPosts(facilityId);

    res.json({
      success: true,
      posts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hitting-partner/user/:userId
 * Get user's own hitting partner posts
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const posts = await getUserHittingPartnerPosts(userId);

    res.json({
      success: true,
      posts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/hitting-partner
 * Create a new hitting partner post
 */
router.post('/', async (req, res, next) => {
  try {
    const postData = req.body;

    if (!postData.userId || !postData.facilityId || !postData.availability || !postData.description || !postData.expiresInDays) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, facilityId, availability, description, expiresInDays'
      });
    }

    const postId = await createHittingPartnerPost(postData);

    res.status(201).json({
      success: true,
      postId,
      message: 'Hitting partner post created successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/hitting-partner/:postId
 * Update a hitting partner post
 */
router.patch('/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { userId, ...updates } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const success = await updateHittingPartnerPost(postId, userId, updates);

    if (success) {
      res.json({
        success: true,
        message: 'Hitting partner post updated successfully'
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
 * DELETE /api/hitting-partner/:postId
 * Delete a hitting partner post
 */
router.delete('/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const success = await deleteHittingPartnerPost(postId, userId as string);

    if (success) {
      res.json({
        success: true,
        message: 'Hitting partner post deleted successfully'
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

export default router;
