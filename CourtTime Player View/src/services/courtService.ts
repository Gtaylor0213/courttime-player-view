/**
 * Court Service
 * Handles court creation, bulk creation, split courts, and court rules
 */

import { query, transaction } from '../database/connection';
import type { PoolClient } from 'pg';

export interface CourtCreateData {
  facilityId: string;
  name: string;
  courtNumber: number;
  surfaceType: 'Hard' | 'Clay' | 'Grass' | 'Synthetic';
  courtType: 'Tennis' | 'Pickleball' | 'Dual';
  isIndoor: boolean;
  hasLights: boolean;
  courtRules?: string;
  parentCourtId?: string; // For split courts
  splitConfiguration?: {
    splitInto?: string[]; // e.g., ['3a', '3b']
    splitType?: string; // e.g., 'pickleball'
  };
}

export interface Court {
  id: string;
  facilityId: string;
  name: string;
  courtNumber: number;
  surfaceType: string;
  courtType: string;
  isIndoor: boolean;
  hasLights: boolean;
  status: string;
  courtRules?: string;
  parentCourtId?: string;
  splitConfiguration?: any;
  isSplitCourt: boolean;
  createdAt: Date;
}

/**
 * Create a single court
 */
export async function createCourt(courtData: CourtCreateData): Promise<Court> {
  const result = await query(
    `INSERT INTO courts (
      facility_id, name, court_number, surface_type, court_type,
      is_indoor, has_lights, court_rules, parent_court_id, split_configuration,
      is_split_court, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'available')
    RETURNING
      id, facility_id as "facilityId", name, court_number as "courtNumber",
      surface_type as "surfaceType", court_type as "courtType",
      is_indoor as "isIndoor", has_lights as "hasLights", status,
      court_rules as "courtRules", parent_court_id as "parentCourtId",
      split_configuration as "splitConfiguration", is_split_court as "isSplitCourt",
      created_at as "createdAt"`,
    [
      courtData.facilityId,
      courtData.name,
      courtData.courtNumber,
      courtData.surfaceType,
      courtData.courtType,
      courtData.isIndoor,
      courtData.hasLights,
      courtData.courtRules || null,
      courtData.parentCourtId || null,
      courtData.splitConfiguration ? JSON.stringify(courtData.splitConfiguration) : null,
      courtData.splitConfiguration ? true : false,
    ]
  );

  return result.rows[0];
}

/**
 * Create multiple identical courts in bulk
 */
export async function createCourtsBulk(
  courtData: Omit<CourtCreateData, 'courtNumber' | 'name'>,
  count: number,
  startingNumber: number = 1
): Promise<Court[]> {
  return transaction(async (client: PoolClient) => {
    const courts: Court[] = [];

    for (let i = 0; i < count; i++) {
      const courtNumber = startingNumber + i;
      const courtName = `Court ${courtNumber}`;

      const result = await client.query(
        `INSERT INTO courts (
          facility_id, name, court_number, surface_type, court_type,
          is_indoor, has_lights, court_rules, status, is_split_court
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'available', false)
        RETURNING
          id, facility_id as "facilityId", name, court_number as "courtNumber",
          surface_type as "surfaceType", court_type as "courtType",
          is_indoor as "isIndoor", has_lights as "hasLights", status,
          court_rules as "courtRules", parent_court_id as "parentCourtId",
          split_configuration as "splitConfiguration", is_split_court as "isSplitCourt",
          created_at as "createdAt"`,
        [
          courtData.facilityId,
          courtName,
          courtNumber,
          courtData.surfaceType,
          courtData.courtType,
          courtData.isIndoor,
          courtData.hasLights,
          courtData.courtRules || null,
        ]
      );

      courts.push(result.rows[0]);
    }

    return courts;
  });
}

/**
 * Create split courts (e.g., Tennis Court 3 splits into Pickleball 3a and 3b)
 */
export async function createSplitCourt(
  parentCourtId: string,
  splitConfig: {
    splitNames: string[]; // e.g., ['3a', '3b']
    splitType: 'Tennis' | 'Pickleball' | 'Dual';
    surfaceType?: 'Hard' | 'Clay' | 'Grass' | 'Synthetic';
  }
): Promise<{ parentCourt: Court; splitCourts: Court[] }> {
  return transaction(async (client: PoolClient) => {
    // Get parent court details
    const parentResult = await client.query(
      `SELECT * FROM courts WHERE id = $1`,
      [parentCourtId]
    );

    if (parentResult.rows.length === 0) {
      throw new Error('Parent court not found');
    }

    const parentCourt = parentResult.rows[0];

    // Update parent court to mark it as splittable
    await client.query(
      `UPDATE courts
       SET is_split_court = true,
           split_configuration = $1
       WHERE id = $2`,
      [JSON.stringify({ splitInto: splitConfig.splitNames, splitType: splitConfig.splitType }), parentCourtId]
    );

    // Create split courts
    const splitCourts: Court[] = [];

    for (const splitName of splitConfig.splitNames) {
      const result = await client.query(
        `INSERT INTO courts (
          facility_id, name, court_number, surface_type, court_type,
          is_indoor, has_lights, parent_court_id, status, is_split_court
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'available', false)
        RETURNING
          id, facility_id as "facilityId", name, court_number as "courtNumber",
          surface_type as "surfaceType", court_type as "courtType",
          is_indoor as "isIndoor", has_lights as "hasLights", status,
          court_rules as "courtRules", parent_court_id as "parentCourtId",
          split_configuration as "splitConfiguration", is_split_court as "isSplitCourt",
          created_at as "createdAt"`,
        [
          parentCourt.facility_id,
          `Court ${splitName}`,
          parentCourt.court_number,
          splitConfig.surfaceType || parentCourt.surface_type,
          splitConfig.splitType,
          parentCourt.is_indoor,
          parentCourt.has_lights,
          parentCourtId,
        ]
      );

      splitCourts.push(result.rows[0]);
    }

    // Get updated parent court
    const updatedParentResult = await client.query(
      `SELECT
        id, facility_id as "facilityId", name, court_number as "courtNumber",
        surface_type as "surfaceType", court_type as "courtType",
        is_indoor as "isIndoor", has_lights as "hasLights", status,
        court_rules as "courtRules", parent_court_id as "parentCourtId",
        split_configuration as "splitConfiguration", is_split_court as "isSplitCourt",
        created_at as "createdAt"
       FROM courts
       WHERE id = $1`,
      [parentCourtId]
    );

    return {
      parentCourt: updatedParentResult.rows[0],
      splitCourts,
    };
  });
}

/**
 * Bulk update multiple courts with shared property changes
 */
export async function updateCourtsBulk(
  courtIds: string[],
  updates: {
    surfaceType?: string;
    courtType?: string;
    isIndoor?: boolean;
    hasLights?: boolean;
    status?: string;
  }
): Promise<number> {
  if (courtIds.length === 0) return 0;

  const setClauses: string[] = [];
  const params: any[] = [courtIds];
  let paramIndex = 2;

  if (updates.surfaceType !== undefined) {
    setClauses.push(`surface_type = $${paramIndex++}`);
    params.push(updates.surfaceType);
  }
  if (updates.courtType !== undefined) {
    setClauses.push(`court_type = $${paramIndex++}`);
    params.push(updates.courtType);
  }
  if (updates.isIndoor !== undefined) {
    setClauses.push(`is_indoor = $${paramIndex++}`);
    params.push(updates.isIndoor);
  }
  if (updates.hasLights !== undefined) {
    setClauses.push(`has_lights = $${paramIndex++}`);
    params.push(updates.hasLights);
  }
  if (updates.status !== undefined) {
    const statusMap: Record<string, string> = { active: 'available', inactive: 'closed' };
    setClauses.push(`status = $${paramIndex++}`);
    params.push(statusMap[updates.status] || updates.status);
  }

  if (setClauses.length === 0) return 0;

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const result = await query(
    `UPDATE courts SET ${setClauses.join(', ')} WHERE id = ANY($1::uuid[])`,
    params
  );

  return result.rowCount || 0;
}

/**
 * Get all courts for a facility
 */
export async function getFacilityCourts(facilityId: string): Promise<Court[]> {
  const result = await query(
    `SELECT
      id, facility_id as "facilityId", name, court_number as "courtNumber",
      surface_type as "surfaceType", court_type as "courtType",
      is_indoor as "isIndoor", has_lights as "hasLights", status,
      court_rules as "courtRules", parent_court_id as "parentCourtId",
      split_configuration as "splitConfiguration", is_split_court as "isSplitCourt",
      created_at as "createdAt"
     FROM courts
     WHERE facility_id = $1
     ORDER BY court_number, name`,
    [facilityId]
  );

  return result.rows;
}

/**
 * Get court by ID
 */
export async function getCourtById(courtId: string): Promise<Court | null> {
  const result = await query(
    `SELECT
      id, facility_id as "facilityId", name, court_number as "courtNumber",
      surface_type as "surfaceType", court_type as "courtType",
      is_indoor as "isIndoor", has_lights as "hasLights", status,
      court_rules as "courtRules", parent_court_id as "parentCourtId",
      split_configuration as "splitConfiguration", is_split_court as "isSplitCourt",
      created_at as "createdAt"
     FROM courts
     WHERE id = $1`,
    [courtId]
  );

  return result.rows[0] || null;
}

/**
 * Get split courts for a parent court
 */
export async function getSplitCourts(parentCourtId: string): Promise<Court[]> {
  const result = await query(
    `SELECT
      id, facility_id as "facilityId", name, court_number as "courtNumber",
      surface_type as "surfaceType", court_type as "courtType",
      is_indoor as "isIndoor", has_lights as "hasLights", status,
      court_rules as "courtRules", parent_court_id as "parentCourtId",
      split_configuration as "splitConfiguration", is_split_court as "isSplitCourt",
      created_at as "createdAt"
     FROM courts
     WHERE parent_court_id = $1
     ORDER BY name`,
    [parentCourtId]
  );

  return result.rows;
}

/**
 * Update court information
 */
export async function updateCourt(
  courtId: string,
  updates: Partial<CourtCreateData>
): Promise<Court> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.name) {
    fields.push(`name = $${paramCount++}`);
    values.push(updates.name);
  }
  if (updates.surfaceType) {
    fields.push(`surface_type = $${paramCount++}`);
    values.push(updates.surfaceType);
  }
  if (updates.courtType) {
    fields.push(`court_type = $${paramCount++}`);
    values.push(updates.courtType);
  }
  if (updates.isIndoor !== undefined) {
    fields.push(`is_indoor = $${paramCount++}`);
    values.push(updates.isIndoor);
  }
  if (updates.hasLights !== undefined) {
    fields.push(`has_lights = $${paramCount++}`);
    values.push(updates.hasLights);
  }
  if (updates.courtRules !== undefined) {
    fields.push(`court_rules = $${paramCount++}`);
    values.push(updates.courtRules);
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(courtId);

  const result = await query(
    `UPDATE courts
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING
       id, facility_id as "facilityId", name, court_number as "courtNumber",
       surface_type as "surfaceType", court_type as "courtType",
       is_indoor as "isIndoor", has_lights as "hasLights", status,
       court_rules as "courtRules", parent_court_id as "parentCourtId",
       split_configuration as "splitConfiguration", is_split_court as "isSplitCourt",
       created_at as "createdAt"`,
    values
  );

  return result.rows[0];
}

/**
 * Delete court (soft delete by setting status to 'closed')
 */
export async function deleteCourt(courtId: string): Promise<void> {
  await query(
    `UPDATE courts SET status = 'closed' WHERE id = $1`,
    [courtId]
  );
}

/**
 * Check if court is available for booking (considering split court relationships)
 */
export async function isCourtAvailable(
  courtId: string,
  bookingDate: Date,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const result = await query(
    `SELECT check_split_court_availability($1, $2, $3, $4) as available`,
    [courtId, bookingDate, startTime, endTime]
  );

  return result.rows[0]?.available || false;
}

/**
 * Get court availability for a date range
 */
export async function getCourtAvailability(
  courtId: string,
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  const result = await query(
    `SELECT
      b.booking_date as "bookingDate",
      b.start_time as "startTime",
      b.end_time as "endTime",
      b.status,
      u.full_name as "bookedBy"
     FROM bookings b
     JOIN users u ON b.user_id = u.id
     WHERE b.court_id = $1
       AND b.booking_date >= $2
       AND b.booking_date <= $3
       AND b.status != 'cancelled'
     ORDER BY b.booking_date, b.start_time`,
    [courtId, startDate, endDate]
  );

  return result.rows;
}
