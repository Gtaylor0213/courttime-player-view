import express from 'express';
import {
  registerUser,
  loginUser,
  getUserWithMemberships,
  addUserToFacility
} from '../../src/services/authService';
import {
  requestPasswordReset,
  validateResetToken,
  resetPassword
} from '../../src/services/passwordResetService';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res, next) => {
  try {
    const {
      email,
      password,
      fullName,
      userType,
      selectedFacilities,
      phone,
      streetAddress,
      city,
      state,
      zipCode,
      skillLevel,
      ustaRating,
      bio,
      profilePicture,
      notificationPreferences
    } = req.body;

    // Validation
    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and full name are required'
      });
    }

    // Register user with additional data
    const result = await registerUser(
      email,
      password,
      fullName,
      userType || 'player',
      {
        phone,
        streetAddress,
        city,
        state,
        zipCode,
        skillLevel,
        ustaRating,
        bio,
        profilePicture,
        notificationPreferences
      }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Add user to selected facilities
    if (result.user && selectedFacilities && Array.isArray(selectedFacilities)) {
      for (const facilityId of selectedFacilities) {
        await addUserToFacility(result.user.id, facilityId);
      }
    }

    // Get user with memberships
    const userWithMemberships = await getUserWithMemberships(result.user!.id);

    res.status(201).json({
      success: true,
      user: userWithMemberships,
      message: 'User registered successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Login a user
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Login user
    const result = await loginUser(email, password);

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me/:userId
 * Get current user with memberships (for session refresh)
 */
router.get('/me/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const userWithMemberships = await getUserWithMemberships(userId);

    if (!userWithMemberships) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: userWithMemberships
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/add-facility
 * Add user to a facility
 */
router.post('/add-facility', async (req, res, next) => {
  try {
    const { userId, facilityId, membershipType } = req.body;

    if (!userId || !facilityId) {
      return res.status(400).json({
        success: false,
        error: 'User ID and facility ID are required'
      });
    }

    const success = await addUserToFacility(userId, facilityId, membershipType);

    if (success) {
      const userWithMemberships = await getUserWithMemberships(userId);
      res.json({
        success: true,
        user: userWithMemberships,
        message: 'User added to facility successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to add user to facility'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const result = await requestPasswordReset(email);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/validate-reset-token
 * Validate a password reset token
 */
router.get('/validate-reset-token', async (req, res, next) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({
        valid: false,
        message: 'Token is required'
      });
    }

    const result = await validateResetToken(token);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using a valid token
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }

    const result = await resetPassword(token, password);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
