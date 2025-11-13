import express from 'express';
import {
  registerUser,
  loginUser,
  getUserWithMemberships,
  addUserToFacility
} from '../../src/services/authService';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, fullName, userType, selectedFacilities } = req.body;

    // Validation
    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and full name are required'
      });
    }

    // Register user
    const result = await registerUser(email, password, fullName, userType || 'player');

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

export default router;
