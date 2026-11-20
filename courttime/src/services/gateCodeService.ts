/**
 * Pickleball gate code (Glen Abbey) — a per-facility code admins edit from the
 * Booking Confirmation email template, shown under the Court line in that email.
 * Gated behind FEATURE_FLAGS.GLEN_ABBEY_PICKLEBALL_GATE_CODE.
 */

import { query } from '../database/connection';
import { isFeatureEnabled } from './featureFlagService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

export const GATE_CODE_MAX_LENGTH = 64;

export function normalizeGateCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, GATE_CODE_MAX_LENGTH) : null;
}

export async function getGateCodeSettings(
  facilityId: string
): Promise<{ enabled: boolean; gateCode: string | null }> {
  const enabled = await isFeatureEnabled(facilityId, FEATURE_FLAGS.GLEN_ABBEY_PICKLEBALL_GATE_CODE);
  const result = await query(
    'SELECT pickleball_gate_code AS "gateCode" FROM facilities WHERE id = $1',
    [facilityId]
  );
  return { enabled, gateCode: result.rows[0]?.gateCode ?? null };
}

export async function setGateCode(facilityId: string, raw: unknown): Promise<string | null> {
  const gateCode = normalizeGateCode(raw);
  await query('UPDATE facilities SET pickleball_gate_code = $2 WHERE id = $1', [facilityId, gateCode]);
  return gateCode;
}

/**
 * The code to hand members (confirmation email, post-booking pop-up, calendar
 * notes, push), or null when the flag is off / no code is set.
 */
export async function getActiveGateCode(facilityId: string): Promise<string | null> {
  try {
    const { enabled, gateCode } = await getGateCodeSettings(facilityId);
    return enabled && gateCode ? gateCode : null;
  } catch (error) {
    console.error('Error loading pickleball gate code:', error);
    return null;
  }
}

/** @deprecated alias — use getActiveGateCode. */
export const getGateCodeForEmail = getActiveGateCode;
