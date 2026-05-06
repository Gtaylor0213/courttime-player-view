import express from 'express';
import { query } from '../../src/database/connection';

const router = express.Router();

/**
 * GET /api/facility-locations/:facilityId
 * Get all secondary locations for a facility.
 */
router.get('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const result = await query(
      `SELECT id, facility_id as "facilityId", location_name as "locationName",
              street_address as "streetAddress", city, state, zip_code as "zipCode", phone,
              created_at as "createdAt"
       FROM facility_secondary_locations
       WHERE facility_id = $1
       ORDER BY created_at ASC`,
      [facilityId]
    );
    res.json({ success: true, locations: result.rows });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/facility-locations/:facilityId
 * Add a secondary location.
 */
router.post('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { locationName, streetAddress, city, state, zipCode, phone } = req.body;

    if (!locationName || !streetAddress || !city || !state || !zipCode) {
      return res.status(400).json({ success: false, error: 'Location name and full address are required' });
    }

    const result = await query(
      `INSERT INTO facility_secondary_locations
         (facility_id, location_name, street_address, city, state, zip_code, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, facility_id as "facilityId", location_name as "locationName",
                 street_address as "streetAddress", city, state, zip_code as "zipCode", phone`,
      [facilityId, locationName, streetAddress, city, state, zipCode, phone || null]
    );

    res.json({ success: true, location: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/facility-locations/:facilityId/:locationId
 * Update a secondary location.
 */
router.patch('/:facilityId/:locationId', async (req, res, next) => {
  try {
    const { facilityId, locationId } = req.params;
    const { locationName, streetAddress, city, state, zipCode, phone } = req.body;

    const result = await query(
      `UPDATE facility_secondary_locations
       SET location_name = COALESCE($1, location_name),
           street_address = COALESCE($2, street_address),
           city = COALESCE($3, city),
           state = COALESCE($4, state),
           zip_code = COALESCE($5, zip_code),
           phone = $6,
           updated_at = NOW()
       WHERE id = $7 AND facility_id = $8
       RETURNING id, location_name as "locationName", street_address as "streetAddress",
                 city, state, zip_code as "zipCode", phone`,
      [locationName, streetAddress, city, state, zipCode, phone || null, locationId, facilityId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    res.json({ success: true, location: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/facility-locations/:facilityId/:locationId
 * Remove a secondary location.
 */
router.delete('/:facilityId/:locationId', async (req, res, next) => {
  try {
    const { facilityId, locationId } = req.params;

    const result = await query(
      `DELETE FROM facility_secondary_locations WHERE id = $1 AND facility_id = $2 RETURNING id`,
      [locationId, facilityId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
