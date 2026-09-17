/**
 * Per-facility feature-flag guard for route handlers.
 *
 * Each feature router (padel, lessons, pro shop, ...) previously defined its
 * own `checkFlag` with the same shape; they differ only in the flag key and
 * the 403 message, so they are built from this factory now.
 */

import type { Response } from 'express';
import { isFeatureEnabled } from '../../src/services/featureFlagService';

/**
 * Returns a guard: resolves true when `featureKey` is enabled for the facility,
 * otherwise writes `403 { success: false, error: message }` and resolves false.
 */
export function requireFeatureFlag(featureKey: string, message: string) {
  return async (facilityId: string, res: Response): Promise<boolean> => {
    if (await isFeatureEnabled(facilityId, featureKey)) return true;
    res.status(403).json({ success: false, error: message });
    return false;
  };
}
