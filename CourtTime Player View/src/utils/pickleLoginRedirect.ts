import { isPickleProductLine } from '../../shared/constants/productLine';
import { pickleApi, unwrapApiPayload } from '../api/client';
import type { User } from '../contexts/AuthContext';

export interface PickleFacilitySummary {
  id: string;
  name: string;
  productLine: string;
  setupStatus: string;
  orgId?: string | null;
}

export function pickleFranchiseAdminPath(facilityId: string): string {
  return `/pickle/location/${facilityId}/admin`;
}

export function pickleFranchiseSetupPath(facilityId: string): string {
  return `/pickle/location/${facilityId}/setup`;
}

/**
 * Returns a post-login path for single pickle franchise location admins, or null to use the default redirect.
 */
export async function getPicklePostLoginPath(
  user: Pick<User, 'adminFacilities' | 'orgAdminOrgs'>,
  facilities?: PickleFacilitySummary[]
): Promise<string | null> {
  if (user.orgAdminOrgs && user.orgAdminOrgs.length > 0) {
    return null;
  }

  const adminFacilities = user.adminFacilities || [];
  if (adminFacilities.length !== 1) {
    return null;
  }

  const facilityId = adminFacilities[0];
  let summary = facilities?.find((f) => f.id === facilityId);

  if (!summary) {
    const res = await pickleApi.getFacilitySummary(facilityId);
    if (!res.success || !res.data) {
      return null;
    }
    summary = unwrapApiPayload<PickleFacilitySummary>(res.data) ?? undefined;
  }

  if (!summary || !isPickleProductLine(summary.productLine)) {
    return null;
  }

  if (summary.setupStatus === 'pending_setup') {
    return pickleFranchiseSetupPath(facilityId);
  }

  return pickleFranchiseAdminPath(facilityId);
}
