import express from 'express';
import {
  getAllFacilities,
  searchFacilities,
  getFacilityById,
  getFacilityCourts,
  getFacilitiesWithStats,
  registerFacility,
  FacilityRegistrationData
} from '../../src/services/facilityService';
import { getCurrentTermsVersion } from '../../src/services/termsService';
import { generateToken } from '../middleware/auth';
import { verifyCheckoutSession, validatePromoCode } from '../../src/services/paymentService';
import { getAmountForCourts } from '../../src/services/subscriptionPricing';

const router = express.Router();

/**
 * GET /api/facilities
 * Get all facilities
 */
router.get('/', async (req, res, next) => {
  try {
    const facilities = await getAllFacilities();
    res.json({
      success: true,
      facilities
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/facilities/search
 * Search facilities
 */
router.get('/search', async (req, res, next) => {
  try {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const facilities = await searchFacilities(query);
    res.json({
      success: true,
      facilities
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/facilities/stats
 * Get facilities with statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const facilities = await getFacilitiesWithStats();
    res.json({
      success: true,
      facilities
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/facilities/:id
 * Get facility by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const facility = await getFacilityById(id);

    if (!facility) {
      return res.status(404).json({
        success: false,
        error: 'Facility not found'
      });
    }

    res.json({
      success: true,
      facility
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/facilities/:id/courts
 * Get courts for a facility
 */
router.get('/:id/courts', async (req, res, next) => {
  try {
    const { id } = req.params;
    const courts = await getFacilityCourts(id);

    res.json({
      success: true,
      courts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/facilities/:id/terms
 * Get current Terms & Conditions for a facility (if configured)
 */
router.get('/:id/terms', async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentVersion = await getCurrentTermsVersion(id);
    res.json({
      success: true,
      termsEnabled: Boolean(currentVersion),
      terms: currentVersion
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/facilities/register
 * Register a new facility with facility administrator
 */
router.post('/register', async (req, res, next) => {
  try {
    const {
      // Facility Administrator Account (if creating new user)
      adminEmail,
      adminPassword,
      adminFullName,

      // Facility Information
      facilityName,
      facilityType,
      primaryLocationLabel,
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      email,
      contactName,
      description,
      facilityImage,

      // Contacts
      primaryContact,
      secondaryContacts,
      secondaryLocations,

      // Operating Hours
      operatingHours,

      // Facility Rules
      generalRules,
      bookingRules,
      termsAndConditions,
      termsAttachments,
      requiredReviewSeconds,
      restrictionType,
      maxBookingsPerWeek,
      maxBookingDurationHours,
      advanceBookingDays,

      // Admin restrictions
      restrictionsApplyToAdmins,
      adminRestrictions,

      // Peak hours and weekend policies
      peakHoursPolicy,
      weekendPolicy,

      // Courts
      courts,

      // Admin Invites
      adminInvites,

      // Address Whitelist
      hoaAddresses,

      // Rules engine configs
      ruleConfigs,

      // Existing user ID (if already logged in)
      existingUserId,

      // Admin profile fields
      adminProfilePicture,
      adminSkillLevel,
      adminUstaRating,
      adminBio,

      // Payment
      paymentSessionId,
      promoCode,
      paymentAmountCents,
      paymentWaived,
      customPricing,
    } = req.body;

    // Validation
    if (!facilityName || !facilityType || !streetAddress || !city || !state || !zipCode) {
      return res.status(400).json({
        success: false,
        error: 'Facility name, type, and address fields are required'
      });
    }

    if (!phone || !email || !contactName) {
      return res.status(400).json({
        success: false,
        error: 'Phone, email, and contact name are required'
      });
    }

    if (!courts || !Array.isArray(courts) || courts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one court is required'
      });
    }

    const normalizedRequiredReviewSeconds = Number.isFinite(Number(requiredReviewSeconds))
      ? Math.floor(Number(requiredReviewSeconds))
      : 0;
    if (normalizedRequiredReviewSeconds < 0) {
      return res.status(400).json({
        success: false,
        error: 'Required review time must be 0 or greater'
      });
    }

    if (termsAttachments != null && !Array.isArray(termsAttachments)) {
      return res.status(400).json({
        success: false,
        error: 'Terms attachments must be an array when provided'
      });
    }

    // If no existing user, admin credentials are required
    if (!existingUserId && (!adminEmail || !adminPassword || !adminFullName)) {
      return res.status(400).json({
        success: false,
        error: 'Admin email, password, and full name are required when creating a new account'
      });
    }

    // Prepare registration data
    const registrationData: FacilityRegistrationData = {
      adminEmail,
      adminPassword,
      adminFullName,
      facilityName,
      facilityType,
      primaryLocationLabel: primaryLocationLabel || undefined,
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      email,
      contactName,
      description,
      facilityImage: facilityImage || undefined,
      primaryContact: primaryContact || undefined,
      secondaryContacts: secondaryContacts?.filter((c: any) => c.name?.trim()) || [],
      secondaryLocations: secondaryLocations?.filter((l: any) =>
        l.locationName?.trim() &&
        l.streetAddress?.trim() &&
        l.city?.trim() &&
        l.state?.trim() &&
        l.zipCode?.trim()
      ) || [],
      operatingHours: operatingHours || {},
      generalRules: generalRules || '',
      bookingRules: bookingRules ? JSON.stringify(bookingRules) : undefined,
      termsAndConditions: termsAndConditions?.trim() || undefined,
      termsAttachments: termsAndConditions?.trim() ? termsAttachments || [] : [],
      requiredReviewSeconds: termsAndConditions?.trim() ? normalizedRequiredReviewSeconds : 0,
      restrictionType: restrictionType || 'account',
      maxBookingsPerWeek: parseInt(maxBookingsPerWeek) || 3,
      maxBookingDurationHours: parseFloat(maxBookingDurationHours) || 2,
      advanceBookingDays: parseInt(advanceBookingDays) || 14,
      restrictionsApplyToAdmins: false,
      adminRestrictions: undefined,
      peakHoursPolicy: peakHoursPolicy
        ? {
            ...peakHoursPolicy,
            applyToAdmins: false,
          }
        : undefined,
      weekendPolicy: weekendPolicy
        ? {
            ...weekendPolicy,
            applyToAdmins: false,
          }
        : undefined,
      courts: courts.map((court: any) => ({
        name: court.name,
        courtNumber: parseInt(court.courtNumber),
        surfaceType: court.surfaceType,
        courtType: court.courtType,
        isIndoor: court.isIndoor || false,
        hasLights: court.hasLights || false,
        isWalkUp: court.isWalkUp || false,
        requirePayment: Boolean(court.requirePayment),
        bookingAmountCents: court.bookingAmountCents != null ? parseInt(court.bookingAmountCents) : undefined,
        guestFeeCents: court.guestFeeCents != null ? parseInt(court.guestFeeCents) : undefined,
        canSplit: court.canSplit || false,
        splitConfig: court.splitConfig
      })),
      ruleConfigs: Array.isArray(ruleConfigs) ? ruleConfigs : undefined,
      adminInvites: adminInvites?.map((invite: any) => invite.email || invite).filter(Boolean),
      hoaAddresses: hoaAddresses || undefined,

      // Admin profile fields
      adminProfilePicture: adminProfilePicture || undefined,
      adminSkillLevel: adminSkillLevel || undefined,
      adminUstaRating: adminUstaRating || undefined,
      adminBio: adminBio || undefined,

      // Payment
      paymentSessionId: paymentSessionId || undefined,
      promoCode: promoCode || undefined,
      paymentAmountCents: paymentAmountCents != null ? parseInt(paymentAmountCents) : getAmountForCourts(courts.length),
      paymentWaived: paymentWaived || false,
      customPricing: false,
    };

    if (!paymentWaived) {
      const expectedBase = getAmountForCourts(courts.length);
      let expectedAmount = expectedBase;
      if (promoCode?.trim()) {
        const promo = await validatePromoCode(promoCode.trim(), courts.length);
        if (!promo.valid) {
          return res.status(400).json({
            success: false,
            error: promo.message || 'Invalid promo code',
          });
        }
        expectedAmount = promo.finalAmountCents ?? expectedBase;
      }
      if (registrationData.paymentAmountCents !== expectedAmount) {
        return res.status(400).json({
          success: false,
          error: 'Payment amount does not match expected subscription price',
        });
      }
    }

    // Verify Stripe payment when required (not waived)
    const requiresPayment = !paymentWaived;

    if (requiresPayment) {
      if (!paymentSessionId) {
        return res.status(400).json({
          success: false,
          error: 'Payment is required. Please complete payment before registering.',
        });
      }

      const paymentVerification = await verifyCheckoutSession(paymentSessionId);
      if (!paymentVerification.verified) {
        return res.status(400).json({
          success: false,
          error: paymentVerification.error || 'Payment could not be verified. Please contact support.',
        });
      }
    }

    // Register facility
    const result = await registerFacility(registrationData, existingUserId);

    // Generate JWT for auto-login after registration
    const token = result.user ? generateToken({
      userId: result.user.id,
      email: result.user.email,
      userType: (result.user.userType as 'player' | 'admin') || 'admin',
    }) : undefined;

    res.status(201).json({
      success: true,
      facility: result.facility,
      user: result.user,
      token,
      courts: result.courts,
      message: 'Facility registered successfully'
    });
  } catch (error: any) {
    console.error('Facility registration error:', error);

    // Handle specific errors
    if (error.message?.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    next(error);
  }
});

export default router;
