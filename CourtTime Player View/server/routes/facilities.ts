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

      // Operating Hours
      operatingHours,

      // Facility Rules
      generalRules,
      restrictionType,
      maxBookingsPerWeek,
      maxBookingDurationHours,
      advanceBookingDays,
      cancellationNoticeHours,

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

      // Existing user ID (if already logged in)
      existingUserId
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
      operatingHours: operatingHours || {},
      generalRules: generalRules || '',
      restrictionType: restrictionType || 'account',
      maxBookingsPerWeek: parseInt(maxBookingsPerWeek) || 3,
      maxBookingDurationHours: parseFloat(maxBookingDurationHours) || 2,
      advanceBookingDays: parseInt(advanceBookingDays) || 14,
      cancellationNoticeHours: parseInt(cancellationNoticeHours) || 0,
      restrictionsApplyToAdmins: restrictionsApplyToAdmins !== false,
      adminRestrictions: adminRestrictions || undefined,
      peakHoursPolicy: peakHoursPolicy || undefined,
      weekendPolicy: weekendPolicy || undefined,
      courts: courts.map((court: any) => ({
        name: court.name,
        courtNumber: parseInt(court.courtNumber),
        surfaceType: court.surfaceType,
        courtType: court.courtType,
        isIndoor: court.isIndoor || false,
        hasLights: court.hasLights || false,
        canSplit: court.canSplit || false,
        splitConfig: court.splitConfig
      })),
      adminInvites: adminInvites?.map((invite: any) => invite.email || invite).filter(Boolean),
      hoaAddresses: hoaAddresses || undefined
    };

    // Register facility
    const result = await registerFacility(registrationData, existingUserId);

    res.status(201).json({
      success: true,
      facility: result.facility,
      user: result.user,
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
