/**
 * Partner post create/edit validation and payload (Community tab).
 * Kept pure for unit tests and to match server + web (FindHittingPartner).
 */

import type { ApiResponse, ApiErrorCategory } from '../api/client';

export const PARTNER_DESCRIPTION_MIN = 10;
export const PARTNER_EXPIRY_MIN_DAYS = 7;
export const PARTNER_EXPIRY_MAX_DAYS = 90;

export type PartnerPostFormInput = {
  description: string;
  availability: string;
  playStyles: string[];
  expiresInDays: number;
};

export function isPartnerPostFormValid(input: PartnerPostFormInput): boolean {
  const desc = input.description.trim();
  const avail = input.availability.trim();
  if (desc.length < PARTNER_DESCRIPTION_MIN) return false;
  if (avail.length < 1) return false;
  if (input.playStyles.length < 1) return false;
  if (
    typeof input.expiresInDays !== 'number' ||
    Number.isNaN(input.expiresInDays) ||
    input.expiresInDays < PARTNER_EXPIRY_MIN_DAYS ||
    input.expiresInDays > PARTNER_EXPIRY_MAX_DAYS
  ) {
    return false;
  }
  return true;
}

export function buildHittingPartnerCreateBody(
  userId: string,
  facilityId: string,
  input: PartnerPostFormInput
): {
  userId: string;
  facilityId: string;
  availability: string;
  description: string;
  playStyle: string[];
  expiresInDays: number;
} {
  return {
    userId,
    facilityId,
    availability: input.availability.trim(),
    description: input.description.trim(),
    playStyle: [...input.playStyles],
    expiresInDays: input.expiresInDays,
  };
}

export function buildHittingPartnerPatchBody(
  userId: string,
  input: PartnerPostFormInput
): {
  userId: string;
  availability: string;
  description: string;
  playStyle: string[];
  expiresInDays: number;
} {
  return {
    userId,
    availability: input.availability.trim(),
    description: input.description.trim(),
    playStyle: [...input.playStyles],
    expiresInDays: input.expiresInDays,
  };
}

export type PartnerPostFailureUi =
  | { mode: 'silent' }
  | { mode: 'toast'; message: string }
  | { mode: 'reauth'; message: string };

export function partnerPostFailureUi<T = unknown>(res: ApiResponse<T>): PartnerPostFailureUi {
  if (res.errorCategory === 'offline') {
    return { mode: 'silent' };
  }
  if (res.errorCategory === 'unauthorized') {
    return {
      mode: 'reauth',
      message: res.errorMessage || res.error || 'Please sign in again to continue.',
    };
  }
  const msg = res.errorMessage || res.error || 'Could not save post';
  return { mode: 'toast', message: msg };
}

export function logCommunityCreatePost(body: unknown, res: ApiResponse<unknown>): void {
  try {
    console.log(
      `[community.create-post] body=${JSON.stringify(body)} success=${res.success} response=${JSON.stringify({
        success: res.success,
        error: res.error,
        errorMessage: res.errorMessage,
        errorCategory: res.errorCategory as ApiErrorCategory | undefined,
        data: res.data,
        message: res.message,
      })}`
    );
  } catch {
    console.log('[community.create-post] (log serialization failed)', res.success, res.errorCategory);
  }
}
