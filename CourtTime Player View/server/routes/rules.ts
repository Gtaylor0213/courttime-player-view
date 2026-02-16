/**
 * Booking Rules Configuration Routes
 * Manage facility rule configurations
 */

import express from 'express';
import { getPool } from '../../src/database/connection';

const router = express.Router();

// Get the pool instance for direct queries and transactions
const getDbPool = () => getPool();

/**
 * GET /api/rules/definitions
 * Get all rule definitions (master catalog)
 */
router.get('/definitions', async (req, res, next) => {
  try {
    const { category } = req.query;

    let query = `
      SELECT * FROM booking_rule_definitions
    `;
    const params: any[] = [];

    if (category) {
      params.push(category);
      query += ` WHERE rule_category = $${params.length}`;
    }

    query += ` ORDER BY evaluation_order ASC`;

    const result = await getDbPool().query(query, params);

    res.json({
      success: true,
      definitions: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/rules/definitions/:ruleCode
 * Get a specific rule definition
 */
router.get('/definitions/:ruleCode', async (req, res, next) => {
  try {
    const { ruleCode } = req.params;

    const result = await getDbPool().query(
      `SELECT * FROM booking_rule_definitions WHERE rule_code = $1`,
      [ruleCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Rule definition not found'
      });
    }

    res.json({
      success: true,
      definition: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/rules/facility/:facilityId
 * Get all rule configurations for a facility
 */
router.get('/facility/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { enabledOnly, category } = req.query;

    let query = `
      SELECT frc.*, brd.rule_code, brd.rule_category, brd.rule_name,
             brd.description, brd.default_config, brd.config_schema
      FROM facility_rule_configs frc
      JOIN booking_rule_definitions brd ON frc.rule_definition_id = brd.id
      WHERE frc.facility_id = $1
    `;
    const params: any[] = [facilityId];

    if (enabledOnly === 'true') {
      query += ` AND frc.is_enabled = true`;
    }

    if (category) {
      params.push(category);
      query += ` AND brd.rule_category = $${params.length}`;
    }

    query += ` ORDER BY brd.evaluation_order ASC`;

    const result = await getDbPool().query(query, params);

    res.json({
      success: true,
      rules: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/rules/facility/:facilityId/effective
 * Get effective rules (configured + defaults for unconfigured)
 */
router.get('/facility/:facilityId/effective', async (req, res, next) => {
  try {
    const { facilityId } = req.params;

    // Get all rule definitions
    const definitionsResult = await getDbPool().query(
      `SELECT * FROM booking_rule_definitions ORDER BY evaluation_order ASC`
    );

    // Get facility configs
    const configsResult = await getDbPool().query(
      `SELECT frc.*, brd.rule_code
       FROM facility_rule_configs frc
       JOIN booking_rule_definitions brd ON frc.rule_definition_id = brd.id
       WHERE frc.facility_id = $1`,
      [facilityId]
    );

    const configsByCode = new Map(
      configsResult.rows.map(c => [c.rule_code, c])
    );

    // Merge definitions with configs
    const effectiveRules = definitionsResult.rows.map(def => {
      const config = configsByCode.get(def.rule_code);
      return {
        ...def,
        facilityConfig: config || null,
        isEnabled: config?.is_enabled ?? true, // Default enabled if no config
        effectiveConfig: config?.rule_config || def.default_config,
        appliesToCourts: config?.applies_to_court_ids || null,
        appliesToTiers: config?.applies_to_tier_ids || null
      };
    });

    res.json({
      success: true,
      rules: effectiveRules
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rules/facility/:facilityId
 * Configure a rule for a facility
 */
router.post('/facility/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const {
      ruleCode,
      ruleConfig,
      isEnabled,
      appliesToCourtIds,
      appliesToTierIds,
      priority
    } = req.body;

    if (!ruleCode) {
      return res.status(400).json({
        success: false,
        error: 'ruleCode is required'
      });
    }

    // Get rule definition ID
    const defResult = await getDbPool().query(
      `SELECT id FROM booking_rule_definitions WHERE rule_code = $1`,
      [ruleCode]
    );

    if (defResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Rule definition '${ruleCode}' not found`
      });
    }

    const ruleDefinitionId = defResult.rows[0].id;

    // Check if config already exists
    const existingResult = await getDbPool().query(
      `SELECT id FROM facility_rule_configs
       WHERE facility_id = $1 AND rule_definition_id = $2`,
      [facilityId, ruleDefinitionId]
    );

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing
      result = await getDbPool().query(
        `UPDATE facility_rule_configs SET
          rule_config = COALESCE($1, rule_config),
          is_enabled = COALESCE($2, is_enabled),
          applies_to_court_ids = $3,
          applies_to_tier_ids = $4,
          priority = COALESCE($5, priority),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *`,
        [
          ruleConfig ? JSON.stringify(ruleConfig) : null,
          isEnabled,
          appliesToCourtIds || null,
          appliesToTierIds || null,
          priority,
          existingResult.rows[0].id
        ]
      );
    } else {
      // Insert new
      result = await getDbPool().query(
        `INSERT INTO facility_rule_configs (
          facility_id, rule_definition_id, rule_config, is_enabled,
          applies_to_court_ids, applies_to_tier_ids, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          facilityId,
          ruleDefinitionId,
          ruleConfig ? JSON.stringify(ruleConfig) : null,
          isEnabled ?? true,
          appliesToCourtIds || null,
          appliesToTierIds || null,
          priority || 0
        ]
      );
    }

    // Get full config with definition
    const fullResult = await getDbPool().query(
      `SELECT frc.*, brd.rule_code, brd.rule_category, brd.rule_name
       FROM facility_rule_configs frc
       JOIN booking_rule_definitions brd ON frc.rule_definition_id = brd.id
       WHERE frc.id = $1`,
      [result.rows[0].id]
    );

    res.json({
      success: true,
      rule: fullResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/rules/facility/:facilityId/:ruleCode
 * Update a specific rule configuration
 */
router.put('/facility/:facilityId/:ruleCode', async (req, res, next) => {
  try {
    const { facilityId, ruleCode } = req.params;
    const {
      ruleConfig,
      isEnabled,
      appliesToCourtIds,
      appliesToTierIds,
      priority
    } = req.body;

    // Get rule definition ID
    const defResult = await getDbPool().query(
      `SELECT id FROM booking_rule_definitions WHERE rule_code = $1`,
      [ruleCode]
    );

    if (defResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Rule definition '${ruleCode}' not found`
      });
    }

    const ruleDefinitionId = defResult.rows[0].id;

    const result = await getDbPool().query(
      `UPDATE facility_rule_configs SET
        rule_config = COALESCE($1, rule_config),
        is_enabled = COALESCE($2, is_enabled),
        applies_to_court_ids = COALESCE($3, applies_to_court_ids),
        applies_to_tier_ids = COALESCE($4, applies_to_tier_ids),
        priority = COALESCE($5, priority),
        updated_at = CURRENT_TIMESTAMP
      WHERE facility_id = $6 AND rule_definition_id = $7
      RETURNING *`,
      [
        ruleConfig ? JSON.stringify(ruleConfig) : null,
        isEnabled,
        appliesToCourtIds,
        appliesToTierIds,
        priority,
        facilityId,
        ruleDefinitionId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Rule configuration not found for this facility'
      });
    }

    res.json({
      success: true,
      rule: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/rules/facility/:facilityId/:ruleCode
 * Remove a rule configuration (reverts to default)
 */
router.delete('/facility/:facilityId/:ruleCode', async (req, res, next) => {
  try {
    const { facilityId, ruleCode } = req.params;

    // Get rule definition ID
    const defResult = await getDbPool().query(
      `SELECT id FROM booking_rule_definitions WHERE rule_code = $1`,
      [ruleCode]
    );

    if (defResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Rule definition '${ruleCode}' not found`
      });
    }

    const result = await getDbPool().query(
      `DELETE FROM facility_rule_configs
       WHERE facility_id = $1 AND rule_definition_id = $2
       RETURNING id`,
      [facilityId, defResult.rows[0].id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Rule configuration not found'
      });
    }

    res.json({
      success: true,
      message: 'Rule configuration removed. Rule will use default settings.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rules/facility/:facilityId/bulk
 * Bulk update rule configurations
 */
router.post('/facility/:facilityId/bulk', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      return res.status(400).json({
        success: false,
        error: 'rules must be an array'
      });
    }

    const client = await getDbPool().connect();
    const results: any[] = [];

    try {
      await client.query('BEGIN');

      for (const rule of rules) {
        const { ruleCode, ruleConfig, isEnabled, appliesToCourtIds, appliesToTierIds } = rule;

        // Get rule definition ID
        const defResult = await client.query(
          `SELECT id FROM booking_rule_definitions WHERE rule_code = $1`,
          [ruleCode]
        );

        if (defResult.rows.length === 0) {
          continue; // Skip invalid rule codes
        }

        const ruleDefinitionId = defResult.rows[0].id;

        // Upsert
        const result = await client.query(
          `INSERT INTO facility_rule_configs (
            facility_id, rule_definition_id, rule_config, is_enabled,
            applies_to_court_ids, applies_to_tier_ids
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (facility_id, rule_definition_id)
          DO UPDATE SET
            rule_config = EXCLUDED.rule_config,
            is_enabled = EXCLUDED.is_enabled,
            applies_to_court_ids = EXCLUDED.applies_to_court_ids,
            applies_to_tier_ids = EXCLUDED.applies_to_tier_ids,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *`,
          [
            facilityId,
            ruleDefinitionId,
            ruleConfig ? JSON.stringify(ruleConfig) : null,
            isEnabled ?? true,
            appliesToCourtIds || null,
            appliesToTierIds || null
          ]
        );

        results.push({ ruleCode, ...result.rows[0] });
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        rules: results,
        message: `${results.length} rules configured`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rules/facility/:facilityId/enable-all
 * Enable all rules for a facility with default configs
 */
router.post('/facility/:facilityId/enable-all', async (req, res, next) => {
  try {
    const { facilityId } = req.params;

    // Get all rule definitions
    const defResult = await getDbPool().query(
      `SELECT id, rule_code, default_config FROM booking_rule_definitions`
    );

    const client = await getDbPool().connect();
    try {
      await client.query('BEGIN');

      for (const def of defResult.rows) {
        await client.query(
          `INSERT INTO facility_rule_configs (
            facility_id, rule_definition_id, rule_config, is_enabled
          ) VALUES ($1, $2, $3, true)
          ON CONFLICT (facility_id, rule_definition_id)
          DO UPDATE SET is_enabled = true, updated_at = CURRENT_TIMESTAMP`,
          [facilityId, def.id, JSON.stringify(def.default_config)]
        );
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `${defResult.rows.length} rules enabled for facility`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rules/facility/:facilityId/disable-all
 * Disable all rules for a facility
 */
router.post('/facility/:facilityId/disable-all', async (req, res, next) => {
  try {
    const { facilityId } = req.params;

    await getDbPool().query(
      `UPDATE facility_rule_configs SET is_enabled = false, updated_at = CURRENT_TIMESTAMP
       WHERE facility_id = $1`,
      [facilityId]
    );

    res.json({
      success: true,
      message: 'All rules disabled for facility'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
