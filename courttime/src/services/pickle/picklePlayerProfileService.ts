/**
 * CourtTime-Pickle player profile extension service.
 * Isolated from classic playerProfileService — do not modify tennis profile fields.
 */

import { query } from '../../database/connection';

export interface PicklePlayerProfile {
  id: string;
  userId: string;
  orgId: string | null;
  duprRating: number | null;
  birthdate: string | null;
  primaryGoals: string[];
  preferredFormats: string[];
  preferredPrograms: string[];
  availabilityJson: Record<string, unknown>;
  equipmentBrands: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPickleProfileInput {
  userId: string;
  orgId?: string | null;
  duprRating?: number | null;
  birthdate?: string | null;
  primaryGoals?: string[];
  preferredFormats?: string[];
  preferredPrograms?: string[];
  availabilityJson?: Record<string, unknown>;
  equipmentBrands?: Record<string, unknown>;
}

export type VisitType =
  | 'drop_in'
  | 'open_play'
  | 'clinic'
  | 'league'
  | 'tournament'
  | 'court_booking'
  | 'pro_shop'
  | 'other';

export interface PlayerVisit {
  id: string;
  userId: string;
  facilityId: string;
  orgId: string;
  visitType: VisitType;
  visitedAt: string;
  createdAt: string;
  facilityName?: string;
}

function mapProfile(row: Record<string, unknown>): PicklePlayerProfile {
  return {
    id: row.id as string,
    userId: row.userId as string,
    orgId: (row.orgId as string) || null,
    duprRating: row.duprRating != null ? Number(row.duprRating) : null,
    birthdate: (row.birthdate as string) || null,
    primaryGoals: (row.primaryGoals as string[]) || [],
    preferredFormats: (row.preferredFormats as string[]) || [],
    preferredPrograms: (row.preferredPrograms as string[]) || [],
    availabilityJson: (row.availabilityJson as Record<string, unknown>) || {},
    equipmentBrands: (row.equipmentBrands as Record<string, unknown>) || {},
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

function mapVisit(row: Record<string, unknown>): PlayerVisit {
  return {
    id: row.id as string,
    userId: row.userId as string,
    facilityId: row.facilityId as string,
    orgId: row.orgId as string,
    visitType: row.visitType as VisitType,
    visitedAt: row.visitedAt as string,
    createdAt: row.createdAt as string,
    facilityName: row.facilityName as string | undefined,
  };
}

export async function getPickleProfile(
  userId: string,
  orgId?: string | null
): Promise<PicklePlayerProfile | null> {
  if (orgId) {
    const orgResult = await query(
      `SELECT id, user_id as "userId", org_id as "orgId",
              dupr_rating as "duprRating", birthdate,
              primary_goals as "primaryGoals", preferred_formats as "preferredFormats",
              preferred_programs as "preferredPrograms",
              availability_json as "availabilityJson", equipment_brands as "equipmentBrands",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM pickle_player_profiles
       WHERE user_id = $1 AND org_id = $2`,
      [userId, orgId]
    );
    if (orgResult.rows[0]) return mapProfile(orgResult.rows[0]);
  }

  const globalResult = await query(
    `SELECT id, user_id as "userId", org_id as "orgId",
            dupr_rating as "duprRating", birthdate,
            primary_goals as "primaryGoals", preferred_formats as "preferredFormats",
            preferred_programs as "preferredPrograms",
            availability_json as "availabilityJson", equipment_brands as "equipmentBrands",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM pickle_player_profiles
     WHERE user_id = $1 AND org_id IS NULL`,
    [userId]
  );
  return globalResult.rows[0] ? mapProfile(globalResult.rows[0]) : null;
}

export async function upsertPickleProfile(input: UpsertPickleProfileInput): Promise<PicklePlayerProfile> {
  const orgId = input.orgId ?? null;
  const existing = await getPickleProfile(input.userId, orgId);

  if (existing) {
    const result = await query(
      `UPDATE pickle_player_profiles SET
         dupr_rating = COALESCE($3, dupr_rating),
         birthdate = COALESCE($4, birthdate),
         primary_goals = COALESCE($5, primary_goals),
         preferred_formats = COALESCE($6, preferred_formats),
         preferred_programs = COALESCE($7, preferred_programs),
         availability_json = COALESCE($8::jsonb, availability_json),
         equipment_brands = COALESCE($9::jsonb, equipment_brands),
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id as "userId", org_id as "orgId",
                 dupr_rating as "duprRating", birthdate,
                 primary_goals as "primaryGoals", preferred_formats as "preferredFormats",
                 preferred_programs as "preferredPrograms",
                 availability_json as "availabilityJson", equipment_brands as "equipmentBrands",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        existing.id,
        input.userId,
        input.duprRating ?? null,
        input.birthdate ?? null,
        input.primaryGoals ?? null,
        input.preferredFormats ?? null,
        input.preferredPrograms ?? null,
        input.availabilityJson != null ? JSON.stringify(input.availabilityJson) : null,
        input.equipmentBrands != null ? JSON.stringify(input.equipmentBrands) : null,
      ]
    );
    return mapProfile(result.rows[0]);
  }

  const result = await query(
    `INSERT INTO pickle_player_profiles (
       user_id, org_id, dupr_rating, birthdate,
       primary_goals, preferred_formats, preferred_programs,
       availability_json, equipment_brands
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     RETURNING id, user_id as "userId", org_id as "orgId",
               dupr_rating as "duprRating", birthdate,
               primary_goals as "primaryGoals", preferred_formats as "preferredFormats",
               preferred_programs as "preferredPrograms",
               availability_json as "availabilityJson", equipment_brands as "equipmentBrands",
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.userId,
      orgId,
      input.duprRating ?? null,
      input.birthdate ?? null,
      input.primaryGoals ?? [],
      input.preferredFormats ?? [],
      input.preferredPrograms ?? [],
      JSON.stringify(input.availabilityJson ?? {}),
      JSON.stringify(input.equipmentBrands ?? {}),
    ]
  );
  return mapProfile(result.rows[0]);
}

export interface RecordVisitInput {
  userId: string;
  facilityId: string;
  orgId: string;
  visitType?: VisitType;
  visitedAt?: string;
}

export async function recordVisit(input: RecordVisitInput): Promise<PlayerVisit> {
  const result = await query(
    `INSERT INTO player_visits (user_id, facility_id, org_id, visit_type, visited_at)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
     RETURNING id, user_id as "userId", facility_id as "facilityId", org_id as "orgId",
               visit_type as "visitType", visited_at as "visitedAt", created_at as "createdAt"`,
    [
      input.userId,
      input.facilityId,
      input.orgId,
      input.visitType ?? 'drop_in',
      input.visitedAt ?? null,
    ]
  );
  return mapVisit(result.rows[0]);
}

export async function listVisits(
  userId: string,
  orgId: string,
  limit = 50
): Promise<PlayerVisit[]> {
  const result = await query(
    `SELECT v.id, v.user_id as "userId", v.facility_id as "facilityId", v.org_id as "orgId",
            v.visit_type as "visitType", v.visited_at as "visitedAt", v.created_at as "createdAt",
            f.name as "facilityName"
     FROM player_visits v
     JOIN facilities f ON f.id = v.facility_id
     WHERE v.user_id = $1 AND v.org_id = $2
     ORDER BY v.visited_at DESC
     LIMIT $3`,
    [userId, orgId, limit]
  );
  return result.rows.map(mapVisit);
}

export async function getVisitCount(userId: string, orgId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int as count FROM player_visits
     WHERE user_id = $1 AND org_id = $2`,
    [userId, orgId]
  );
  return result.rows[0]?.count ?? 0;
}

export async function getLastVisitAt(userId: string, orgId: string): Promise<string | null> {
  const result = await query(
    `SELECT visited_at as "visitedAt" FROM player_visits
     WHERE user_id = $1 AND org_id = $2
     ORDER BY visited_at DESC
     LIMIT 1`,
    [userId, orgId]
  );
  return result.rows[0]?.visitedAt ?? null;
}

export async function listOrgPlayerProfiles(
  orgId: string,
  limit = 100,
  offset = 0
): Promise<Array<PicklePlayerProfile & { fullName?: string; email?: string }>> {
  const result = await query(
    `SELECT p.id, p.user_id as "userId", p.org_id as "orgId",
            p.dupr_rating as "duprRating", p.birthdate,
            p.primary_goals as "primaryGoals", p.preferred_formats as "preferredFormats",
            p.preferred_programs as "preferredPrograms",
            p.availability_json as "availabilityJson", p.equipment_brands as "equipmentBrands",
            p.created_at as "createdAt", p.updated_at as "updatedAt",
            u.full_name as "fullName", u.email
     FROM pickle_player_profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.org_id = $1 OR p.org_id IS NULL
     ORDER BY p.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [orgId, limit, offset]
  );
  return result.rows.map((row) => ({
    ...mapProfile(row),
    fullName: row.fullName as string | undefined,
    email: row.email as string | undefined,
  }));
}
