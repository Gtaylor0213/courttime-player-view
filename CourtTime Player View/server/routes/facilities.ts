import express from 'express';
import {
  getAllFacilities,
  searchFacilities,
  getFacilityById,
  getFacilityCourts,
  getFacilitiesWithStats
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

export default router;
