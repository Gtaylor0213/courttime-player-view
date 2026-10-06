/**
 * Keeps the rules that live in two stores identical in both:
 *   - facility_rule_configs rows (what the rules engine enforces)
 *   - facilities.booking_rules JSON (what Club Info and the web admin read)
 * Covers days in advance (ACC-005), weekly/daily individual caps (ACC-002) and max reservation
 * length (CRT-005). Every write path calls one of these so admins and players are never shown
 * one limit while another is enforced.
 */

import { query } from '../database/connection';

export const DEFAULT_ADVANCE_DAYS = 14;

/** Positive whole number of days, or DEFAULT_ADVANCE_DAYS. */
export function normalizeAdvanceDays(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_ADVANCE_DAYS;
}

/** Writes every booking_rules key any reader uses for days in advance. Mutates and returns rules. */
export function applyAdvanceRuleToBookingRules(
  rules: Record<string, any>,
  enabled: boolean,
  limit: number
): Record<string, any> {
  rules.daysInAdvance = { enabled, limit };
  rules.daysInAdvanceEnabled = enabled;
  rules.advanceBookingDays = String(limit);
  rules.advanceBookingDaysUnlimited = !enabled;
  return rules;
}

async function getAcc005DefinitionId(): Promise<string | null> {
  const def = await query(`SELECT id FROM booking_rule_definitions WHERE rule_code = 'ACC-005' LIMIT 1`);
  return def.rows[0]?.id ?? null;
}

/** Upsert (enabled) or remove (disabled) the facility's ACC-005 row. */
export async function upsertAcc005Rule(facilityId: string, enabled: boolean, limit: number): Promise<void> {
  const definitionId = await getAcc005DefinitionId();
  if (!definitionId) return;
  if (enabled) {
    await query(
      `INSERT INTO facility_rule_configs (facility_id, rule_definition_id, rule_config, is_enabled)
       VALUES ($1, $2, $3::jsonb, true)
       ON CONFLICT (facility_id, rule_definition_id)
       DO UPDATE SET rule_config = EXCLUDED.rule_config, is_enabled = true, updated_at = CURRENT_TIMESTAMP`,
      [facilityId, definitionId, JSON.stringify({ max_days_ahead: limit })]
    );
  } else {
    await query(
      `DELETE FROM facility_rule_configs WHERE facility_id = $1 AND rule_definition_id = $2`,
      [facilityId, definitionId]
    );
  }
}

/** Rules whose settings live in both stores; the web admin reads these from booking_rules, not the engine. */
export const MIRRORED_RULE_CODES = ['ACC-002', 'ACC-005', 'CRT-005'] as const;

interface EngineRuleRow {
  isEnabled: boolean;
  config: Record<string, any>;
}

function positiveInt(value: unknown): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Write the weekly/daily individual caps (engine ACC-002) into every booking_rules key the
 * web admin and Club Info read. A cap that is off keeps its last limit. Mutates and returns rules.
 */
export function applyAccountCapsToBookingRules(
  rules: Record<string, any>,
  engineRow: EngineRuleRow | null
): Record<string, any> {
  const config = engineRow?.config ?? {};
  const ruleOn = !!engineRow?.isEnabled;
  const weeklyLimit = positiveInt(config.max_per_week);
  const dailyLimit = positiveInt(config.max_per_day);
  const weeklyEnabled = ruleOn && weeklyLimit !== null;
  const dailyEnabled = ruleOn && config.max_per_day_enabled === true && dailyLimit !== null;

  const userLimits = rules.userLimits && typeof rules.userLimits === 'object' ? rules.userLimits : {};
  const week = {
    enabled: weeklyEnabled,
    limit: weeklyEnabled
      ? weeklyLimit
      : Number(userLimits.perWeekIndividual?.limit ?? rules.courtsPerWeekUser) || 0,
  };
  const day = {
    enabled: dailyEnabled,
    limit: dailyEnabled
      ? dailyLimit
      : Number(userLimits.perDayIndividual?.limit ?? rules.courtsPerDayUser) || 0,
  };
  rules.userLimits = { ...userLimits, perWeekIndividual: week, perDayIndividual: day };
  rules.courtsPerWeekUser = String(week.limit);
  rules.courtsPerWeekUserEnabled = week.enabled;
  rules.maxBookingsPerWeek = String(week.limit);
  rules.maxBookingsPerWeekUnlimited = !week.enabled;
  rules.courtsPerDayUser = String(day.limit);
  rules.courtsPerDayUserEnabled = day.enabled;
  rules.maxBookingsPerDayUnlimited = !day.enabled;
  return rules;
}

/**
 * Write the max reservation length (engine CRT-005) into every booking_rules key the web admin
 * and Club Info read. Off keeps the last limit. Mutates and returns rules.
 */
export function applyMaxDurationToBookingRules(
  rules: Record<string, any>,
  engineRow: EngineRuleRow | null
): Record<string, any> {
  const config = engineRow?.config ?? {};
  const minutes = positiveInt(config.max_duration_minutes);
  const enabled = !!engineRow?.isEnabled && minutes !== null;
  const limit = enabled
    ? minutes
    : Number(rules.maxReservationDuration?.limit ?? rules.maxReservationDurationMinutes) || 120;

  rules.maxReservationDuration = { enabled, limit };
  rules.maxReservationDurationEnabled = enabled;
  rules.maxBookingDurationUnlimited = !enabled;
  rules.maxReservationDurationMinutes = String(limit);
  const hours = (limit as number) / 60;
  rules.maxBookingDurationHours = Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);

  // Per-court-type caps ride inside the same engine row; only touch them when the row carries them.
  const byType = config.max_duration_by_court_type;
  if (enabled && byType && typeof byType === 'object') {
    const tennisMinutes = positiveInt(byType.tennisMinutes) ?? limit;
    const pickleballMinutes = positiveInt(byType.pickleballMinutes) ?? limit;
    rules.maxReservationDurationByCourtType = { enabled: !!byType.enabled, tennisMinutes, pickleballMinutes };
    rules.maxReservationDurationByCourtTypeEnabled = !!byType.enabled;
    rules.maxReservationDurationTennisMinutes = String(tennisMinutes);
    rules.maxReservationDurationPickleballMinutes = String(pickleballMinutes);
  }
  return rules;
}

/**
 * Copy the facility's current engine rows into booking_rules JSON, for the given rule codes
 * (default: every mirrored rule). Call after any write to facility_rule_configs — rules API,
 * mobile admin, bulk, enable/disable all — so the web admin shows what the engine enforces.
 * Codes that are not mirrored are ignored.
 */
export async function mirrorEngineRulesIntoBookingRules(
  facilityId: string,
  ruleCodes: readonly string[] = MIRRORED_RULE_CODES
): Promise<void> {
  const codes = ruleCodes.filter((code) => (MIRRORED_RULE_CODES as readonly string[]).includes(code));
  if (codes.length === 0) return;

  const rows = await query(
    `SELECT brd.rule_code AS "ruleCode", frc.is_enabled AS "isEnabled", frc.rule_config AS "ruleConfig"
     FROM facility_rule_configs frc
     JOIN booking_rule_definitions brd ON brd.id = frc.rule_definition_id
     WHERE frc.facility_id = $1 AND brd.rule_code = ANY($2::text[])`,
    [facilityId, codes]
  );
  const facility = await query(`SELECT booking_rules AS "bookingRules" FROM facilities WHERE id = $1`, [facilityId]);
  if (facility.rows.length === 0) return;

  let rules: Record<string, any> = {};
  const raw = facility.rows[0].bookingRules;
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') rules = parsed;
    } catch {
      // Unparseable JSON: leave it alone rather than overwrite unrelated settings.
      return;
    }
  }

  const engineRows = new Map<string, EngineRuleRow>();
  for (const row of rows.rows) {
    let config: Record<string, any> = {};
    if (row.ruleConfig) {
      try {
        config = typeof row.ruleConfig === 'string' ? JSON.parse(row.ruleConfig) : row.ruleConfig;
      } catch {
        config = {};
      }
    }
    engineRows.set(row.ruleCode, { isEnabled: !!row.isEnabled, config: config ?? {} });
  }

  if (codes.includes('ACC-005')) {
    const engineRow = engineRows.get('ACC-005');
    const enabled = !!engineRow?.isEnabled;
    const limit = enabled
      ? normalizeAdvanceDays(engineRow!.config.max_days_ahead)
      : normalizeAdvanceDays(rules.daysInAdvance?.limit ?? rules.advanceBookingDays);
    applyAdvanceRuleToBookingRules(rules, enabled, limit);
  }
  if (codes.includes('ACC-002')) applyAccountCapsToBookingRules(rules, engineRows.get('ACC-002') ?? null);
  if (codes.includes('CRT-005')) applyMaxDurationToBookingRules(rules, engineRows.get('CRT-005') ?? null);

  await query(
    `UPDATE facilities SET booking_rules = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [JSON.stringify(rules), facilityId]
  );
}

/** Days-in-advance only. Kept for callers that changed nothing else. */
export async function mirrorAcc005IntoBookingRules(facilityId: string): Promise<void> {
  await mirrorEngineRulesIntoBookingRules(facilityId, ['ACC-005']);
}
