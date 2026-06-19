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
import {
  validateSetupToken,
  consumeSetupToken,
} from '../../src/services/memberSetupInviteService';
import { generateToken, verifyToken } from '../middleware/auth';
import {
  acceptCurrentTermsForUser,
  getUserPendingTermsAcceptances
} from '../../src/services/termsService';

const router = express.Router();

function getAuthenticatedUserId(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = verifyToken(authHeader.slice(7));
  return payload?.userId || null;
}

/**
 * GET /api/auth/setup-invite/:token
 * Validate a member setup invite token for registration prefill
 */
router.get('/setup-invite/:token', async (req, res, next) => {
  try {
    const validation = await validateSetupToken(req.params.token);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    res.json({
      success: true,
      email: validation.email,
      facilityId: validation.facilityId,
      facilityName: validation.facilityName,
      address: validation.address,
      lastName: validation.lastName,
    });
  } catch (error) {
    next(error);
  }
});

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
      setupToken,
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

    let inviteFacilityId: string | null = null;
    if (setupToken) {
      const validation = await validateSetupToken(setupToken);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error });
      }
      if (email.trim().toLowerCase() !== validation.email) {
        return res.status(400).json({
          success: false,
          error: 'Email must match the address on your setup invitation',
        });
      }
      inviteFacilityId = validation.facilityId;
    }

    // Register user with additional data
    const result = await registerUser(
      email,
      password,
      fullName,
      'player',
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

    const facilitiesToJoin = inviteFacilityId
      ? [inviteFacilityId]
      : selectedFacilities && Array.isArray(selectedFacilities)
        ? selectedFacilities
        : [];

    if (result.user && facilitiesToJoin.length > 0) {
      for (const facilityId of facilitiesToJoin) {
        try {
          await addUserToFacility(result.user.id, facilityId);
        } catch (facilityError) {
          if (facilityError instanceof Error && facilityError.message.includes('max number of accounts')) {
            return res.status(400).json({ success: false, error: facilityError.message });
          }
          throw facilityError;
        }
      }
    }

    if (result.user && setupToken) {
      await consumeSetupToken(setupToken, result.user.id);
    }

    // Get user with memberships
    const userWithMemberships = await getUserWithMemberships(result.user!.id);

    // Generate JWT token
    const token = generateToken({
      userId: result.user!.id,
      email: result.user!.email,
      userType: (result.user!.userType as 'player' | 'admin') || 'player',
    });

    res.status(201).json({
      success: true,
      user: userWithMemberships,
      token,
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
    const { email, password, setupToken } = req.body;

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

    let userForResponse = result.user!;

    if (setupToken) {
      const validation = await validateSetupToken(setupToken);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      if (userForResponse.email.trim().toLowerCase() !== validation.email) {
        return res.status(400).json({
          success: false,
          error: 'Email must match the address on your setup invitation',
        });
      }

      const added = await addUserToFacility(userForResponse.id, validation.facilityId);
      if (!added) {
        return res.status(500).json({
          success: false,
          error: 'Failed to add facility to your account',
        });
      }

      await consumeSetupToken(setupToken, userForResponse.id);
      userForResponse = await getUserWithMemberships(userForResponse.id) || userForResponse;
    }

    // Generate JWT token
    const token = generateToken({
      userId: userForResponse.id,
      email: userForResponse.email,
      userType: (userForResponse.userType as 'player' | 'admin') || 'player',
    });

    res.json({ ...result, user: userForResponse, token });
  } catch (error) {
    if (error instanceof Error && error.message.includes('max number of accounts')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user from JWT token (mobile app)
 */
router.get('/me', async (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userWithMemberships = await getUserWithMemberships(userId);

    if (!userWithMemberships) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user: userWithMemberships });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/terms/status
 * Get all pending T&C acceptances for the authenticated user
 */
router.get('/terms/status', async (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userWithMemberships = await getUserWithMemberships(userId);
    if (!userWithMemberships) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const pendingAcceptances = await getUserPendingTermsAcceptances(userId);
    res.json({ success: true, pendingAcceptances });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/terms/accept
 * Accept latest T&C version for a facility as authenticated user
 */
router.post('/terms/accept', async (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { facilityId } = req.body;
    if (!facilityId) {
      return res.status(400).json({ success: false, error: 'facilityId is required' });
    }

    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
      || req.ip
      || null;

    const accepted = await acceptCurrentTermsForUser(userId, facilityId, ipAddress);
    res.json({ success: true, accepted });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me/:userId
 * Get current user with memberships (for session refresh — legacy/web)
 */
router.get('/me/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    if (!authenticatedUserId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (authenticatedUserId !== userId) {
      return res.status(403).json({ success: false, error: 'Cannot access another user session' });
    }

    const userWithMemberships = await getUserWithMemberships(authenticatedUserId);

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
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (userId && userId !== authenticatedUserId) {
      return res.status(403).json({ success: false, error: 'Cannot add another user to a facility' });
    }

    if (!facilityId) {
      return res.status(400).json({
        success: false,
        error: 'Facility ID is required'
      });
    }

    const success = await addUserToFacility(authenticatedUserId, facilityId, membershipType);

    if (success) {
      const userWithMemberships = await getUserWithMemberships(authenticatedUserId);
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
    if (error instanceof Error && error.message.includes('max number of accounts')) {
      return res.status(400).json({ success: false, error: error.message });
    }
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
