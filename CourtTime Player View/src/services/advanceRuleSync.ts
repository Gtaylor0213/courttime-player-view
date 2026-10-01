/**
 * Keeps the days-in-advance rule identical in its two stores:
 *   - facility_rule_configs ACC-005 row (what the rules engine enforces)
 *   - facilities.booking_rules JSON (what Club Info and the web admin read)
 * Every write path calls one of these so players are never shown one limit while another is enforced.
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

/**
 * Copy the facility's current ACC-005 row into booking_rules JSON. Call after any write to
 * facility_rule_configs that may have touched ACC-005 (rules API, mobile admin, enable/disable all).
 */
export async function mirrorAcc005IntoBookingRules(facilityId: string): Promise<void> {
  const row = await query(
    `SELECT frc.is_enabled AS "isEnabled", frc.rule_config AS "ruleConfig"
     FROM facility_rule_configs frc
     JOIN booking_rule_definitions brd ON brd.id = frc.rule_definition_id
     WHERE frc.facility_id = $1 AND brd.rule_code = 'ACC-005'
     LIMIT 1`,
    [facilityId]
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

  const engineRow = row.rows[0];
  let config: Record<string, any> = {};
  if (engineRow?.ruleConfig) {
    config = typeof engineRow.ruleConfig === 'string' ? JSON.parse(engineRow.ruleConfig) : engineRow.ruleConfig;
  }
  const enabled = !!engineRow?.isEnabled;
  const limit = enabled
    ? normalizeAdvanceDays(config.max_days_ahead)
    : normalizeAdvanceDays(rules.daysInAdvance?.limit ?? rules.advanceBookingDays);

  applyAdvanceRuleToBookingRules(rules, enabled, limit);
  await query(
    `UPDATE facilities SET booking_rules = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [JSON.stringify(rules), facilityId]
  );
}
