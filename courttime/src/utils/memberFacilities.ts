import { facilitiesApi, playerProfileApi } from '../api/client';
import { unwrapApiPayload } from '../../shared/api/core';
import { sortFacilitiesByName } from '../../shared/utils/facilitySort';
import { safeDisplayText } from '../../shared/utils/safeDisplayText';

export type MemberFacilityRow = {
  facilityId: string;
  facilityName: string;
  membershipType?: string;
  status?: string;
  isFacilityAdmin?: boolean;
};

function facilityNameFromApiData(data: unknown): string {
  const payload = unwrapApiPayload<{ facility?: { name?: unknown }; name?: unknown }>(data);
  const facility =
    (payload as { facility?: { name?: unknown } } | undefined)?.facility ?? payload;
  return safeDisplayText((facility as { name?: unknown } | undefined)?.name);
}

export async function fetchFacilityDisplayName(facilityId: string): Promise<string> {
  try {
    const response = await facilitiesApi.getById(facilityId);
    if (!response.success) return '';
    return facilityNameFromApiData(response.data);
  } catch {
    return '';
  }
}

export async function enrichMemberFacilityRows(
  rows: MemberFacilityRow[],
): Promise<MemberFacilityRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (row.facilityName) return row;
      const name = await fetchFacilityDisplayName(row.facilityId);
      return name ? { ...row, facilityName: name } : row;
    }),
  );
}

export function facilityIdsFromAuthUser(user: {
  memberFacilities?: string[];
  adminFacilities?: string[];
}): string[] {
  return Array.from(
    new Set([...(user.memberFacilities || []), ...(user.adminFacilities || [])]),
  );
}

export function memberFacilityRowsFromAuthUser(user: {
  memberFacilities?: string[];
  adminFacilities?: string[];
}): MemberFacilityRow[] {
  const adminSet = new Set(user.adminFacilities || []);
  return facilityIdsFromAuthUser(user).map((facilityId) => ({
    facilityId,
    facilityName: '',
    membershipType: adminSet.has(facilityId) ? 'Administrator' : 'Member',
    status: 'active',
    isFacilityAdmin: adminSet.has(facilityId),
  }));
}

function mapProfileMembershipRows(
  raw: Array<Record<string, unknown>>,
): MemberFacilityRow[] {
  return raw
    .map((m) => {
      const facilityId = m.facilityId ?? m.id;
      if (facilityId == null || String(facilityId) === '') return null;
      return {
        facilityId: String(facilityId),
        facilityName: safeDisplayText(m.facilityName ?? m.name),
        membershipType: String(m.membershipType ?? 'Member'),
        status: String(m.status ?? 'active'),
        isFacilityAdmin: Boolean(m.isFacilityAdmin),
      };
    })
    .filter((row): row is MemberFacilityRow => row != null);
}

/**
 * Load memberships for Club Info / sidebars: profile API when possible,
 * auth facility IDs + public facility lookup as fallback.
 */
export async function loadMemberFacilitiesForUser(
  userId: string,
  authUser: { memberFacilities?: string[]; adminFacilities?: string[] },
): Promise<{ facilities: MemberFacilityRow[]; profileError?: string }> {
  const authRows = memberFacilityRowsFromAuthUser(authUser);
  let rows: MemberFacilityRow[] = [];
  let profileError: string | undefined;

  const profileResponse = await playerProfileApi.getProfile(userId);
  if (profileResponse.success) {
    const data = profileResponse.data as
      | { profile?: { memberFacilities?: Array<Record<string, unknown>> } }
      | { memberFacilities?: Array<Record<string, unknown>> }
      | undefined;
    const raw =
      data?.profile?.memberFacilities ?? data?.memberFacilities ?? [];
    rows = mapProfileMembershipRows(raw);
  } else {
    profileError = profileResponse.error;
    rows = authRows;
  }

  const byId = new Map(rows.map((row) => [row.facilityId, row]));
  for (const authRow of authRows) {
    if (!byId.has(authRow.facilityId)) {
      byId.set(authRow.facilityId, authRow);
    }
  }

  const facilities = sortFacilitiesByName(
    await enrichMemberFacilityRows(Array.from(byId.values())),
  );
  return { facilities, profileError };
}
