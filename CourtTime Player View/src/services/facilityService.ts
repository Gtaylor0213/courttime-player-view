import { query } from '../database/connection';
import { Facility, Court } from '../types/database';

/**
 * Facility Service
 * Handles facility and court-related operations
 */

/**
 * Get all facilities
 */
export async function getAllFacilities(): Promise<Facility[]> {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        type,
        address,
        phone,
        email,
        description,
        amenities,
        operating_hours as "operatingHours",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM facilities
      ORDER BY name
    `);

    return result.rows;
  } catch (error) {
    console.error('Get all facilities error:', error);
    return [];
  }
}

/**
 * Search facilities by query
 */
export async function searchFacilities(searchQuery: string): Promise<any[]> {
  try {
    const result = await query(`
      SELECT
        f.id,
        f.name,
        f.type,
        f.address,
        f.description,
        COUNT(DISTINCT c.id) as courts,
        COUNT(DISTINCT fm.user_id) as members
      FROM facilities f
      LEFT JOIN courts c ON f.id = c.facility_id
      LEFT JOIN facility_memberships fm ON f.id = fm.facility_id AND fm.status = 'active'
      WHERE
        LOWER(f.name) LIKE LOWER($1) OR
        LOWER(f.type) LIKE LOWER($1) OR
        LOWER(f.address) LIKE LOWER($1) OR
        LOWER(f.description) LIKE LOWER($1)
      GROUP BY f.id, f.name, f.type, f.address, f.description
      ORDER BY f.name
    `, [`%${searchQuery}%`]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type || 'Facility',
      location: row.address || 'Location not specified',
      description: row.description || '',
      courts: parseInt(row.courts) || 0,
      members: parseInt(row.members) || 0,
      requiresApproval: row.type === 'Private Club' // Private clubs require approval
    }));
  } catch (error) {
    console.error('Search facilities error:', error);
    return [];
  }
}

/**
 * Get facility by ID
 */
export async function getFacilityById(facilityId: string): Promise<Facility | null> {
  try {
    const result = await query(`
      SELECT
        id,
        name,
        type,
        address,
        phone,
        email,
        description,
        amenities,
        operating_hours as "operatingHours",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM facilities
      WHERE id = $1
    `, [facilityId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Get facility by ID error:', error);
    return null;
  }
}

/**
 * Get courts for a facility
 */
export async function getFacilityCourts(facilityId: string): Promise<Court[]> {
  try {
    const result = await query(`
      SELECT
        id,
        facility_id as "facilityId",
        name,
        court_number as "courtNumber",
        surface_type as "surfaceType",
        court_type as "courtType",
        is_indoor as "isIndoor",
        has_lights as "hasLights",
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM courts
      WHERE facility_id = $1
      ORDER BY court_number
    `, [facilityId]);

    return result.rows;
  } catch (error) {
    console.error('Get facility courts error:', error);
    return [];
  }
}

/**
 * Get facilities with member counts
 */
export async function getFacilitiesWithStats(): Promise<any[]> {
  try {
    const result = await query(`
      SELECT
        f.id,
        f.name,
        f.type,
        f.description,
        COUNT(DISTINCT c.id) as total_courts,
        COUNT(DISTINCT fm.user_id) FILTER (WHERE fm.status = 'active') as active_members,
        COUNT(DISTINCT fm.user_id) FILTER (WHERE fm.status = 'pending') as pending_requests
      FROM facilities f
      LEFT JOIN courts c ON f.id = c.facility_id
      LEFT JOIN facility_memberships fm ON f.id = fm.facility_id
      GROUP BY f.id, f.name, f.type, f.description
      ORDER BY f.name
    `);

    return result.rows;
  } catch (error) {
    console.error('Get facilities with stats error:', error);
    return [];
  }
}
