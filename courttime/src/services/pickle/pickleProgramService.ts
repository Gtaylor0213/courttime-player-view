/**
 * CourtTime-Pickle programs service.
 * Isolated from classic bulletin board / facility booking flows.
 */

import { query, transaction } from '../../database/connection';
import type { PoolClient } from 'pg';
import { PRODUCT_LINE_PICKLE } from '../../../shared/constants/productLine';
import {
  isPickleProgramType,
  type PickleProgramType,
} from '../../../shared/constants/pickleProgramTypes';
import { isOrgAdmin } from './pickleOrgService';
import { isFacilityAdmin } from '../memberService';

export interface ProgramTemplate {
  id: string;
  nationalProgramId?: string | null;
  orgId: string;
  type: PickleProgramType;
  name: string;
  defaultConfig: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramRollout {
  id: string;
  orgId: string;
  templateId: string;
  facilityId: string;
  facilityName?: string;
  templateName?: string;
  templateType?: PickleProgramType;
  createdAt: string;
}

export interface ProgramInstance {
  id: string;
  templateId: string;
  facilityId: string;
  schedule: Record<string, unknown>;
  capacity: number;
  priceCents: number;
  status: string;
  templateName?: string;
  templateType?: PickleProgramType;
  registrationCount?: number;
  spotsRemaining?: number;
  userRegistrationStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramRegistration {
  id: string;
  instanceId: string;
  userId: string;
  status: string;
  paidAt?: string | null;
  attendedAt?: string | null;
  createdAt: string;
}

async function assertPickleFacility(facilityId: string): Promise<{ orgId: string | null }> {
  const result = await query(
    `SELECT org_id as "orgId", product_line as "productLine"
     FROM facilities WHERE id = $1`,
    [facilityId]
  );
  if (result.rows.length === 0) {
    throw new Error('Facility not found');
  }
  const row = result.rows[0];
  if (row.productLine !== PRODUCT_LINE_PICKLE) {
    throw new Error('Programs are only available at CourtTime-Pickle locations');
  }
  return { orgId: row.orgId };
}

async function assertTemplateInOrg(templateId: string, orgId: string): Promise<ProgramTemplate> {
  const result = await query(
    `SELECT id, national_program_id as "nationalProgramId", org_id as "orgId", type, name,
            default_config as "defaultConfig", status,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM org_program_templates
     WHERE id = $1 AND org_id = $2 AND status = 'active'`,
    [templateId, orgId]
  );
  if (result.rows.length === 0) {
    throw new Error('Program template not found');
  }
  return result.rows[0];
}

export async function listProgramTemplates(orgId: string): Promise<ProgramTemplate[]> {
  const result = await query(
    `SELECT id, national_program_id as "nationalProgramId", org_id as "orgId", type, name,
            default_config as "defaultConfig", status,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM org_program_templates
     WHERE org_id = $1 AND status = 'active'
     ORDER BY name`,
    [orgId]
  );
  return result.rows;
}

export async function createProgramTemplate(input: {
  orgId: string;
  nationalProgramId?: string;
  type: string;
  name: string;
  defaultConfig?: Record<string, unknown>;
}): Promise<ProgramTemplate> {
  if (!isPickleProgramType(input.type)) {
    throw new Error('Invalid program type');
  }
  if (!input.name?.trim()) {
    throw new Error('Program name is required');
  }

  const result = await query(
    `INSERT INTO org_program_templates (national_program_id, org_id, type, name, default_config)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, national_program_id as "nationalProgramId", org_id as "orgId", type, name,
               default_config as "defaultConfig", status,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.nationalProgramId || null,
      input.orgId,
      input.type,
      input.name.trim(),
      JSON.stringify(input.defaultConfig || {}),
    ]
  );
  return result.rows[0];
}

export async function updateProgramTemplate(
  templateId: string,
  orgId: string,
  input: {
    nationalProgramId?: string | null;
    type?: string;
    name?: string;
    defaultConfig?: Record<string, unknown>;
  }
): Promise<ProgramTemplate> {
  await assertTemplateInOrg(templateId, orgId);

  if (input.type !== undefined && !isPickleProgramType(input.type)) {
    throw new Error('Invalid program type');
  }

  const result = await query(
    `UPDATE org_program_templates
     SET national_program_id = COALESCE($3, national_program_id),
         type = COALESCE($4, type),
         name = COALESCE($5, name),
         default_config = COALESCE($6, default_config),
         updated_at = NOW()
     WHERE id = $1 AND org_id = $2 AND status = 'active'
     RETURNING id, national_program_id as "nationalProgramId", org_id as "orgId", type, name,
               default_config as "defaultConfig", status,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      templateId,
      orgId,
      input.nationalProgramId === undefined ? null : input.nationalProgramId,
      input.type || null,
      input.name?.trim() || null,
      input.defaultConfig ? JSON.stringify(input.defaultConfig) : null,
    ]
  );
  return result.rows[0];
}

export async function archiveProgramTemplate(templateId: string, orgId: string): Promise<void> {
  await assertTemplateInOrg(templateId, orgId);
  await query(
    `UPDATE org_program_templates SET status = 'archived', updated_at = NOW()
     WHERE id = $1 AND org_id = $2`,
    [templateId, orgId]
  );
}

export async function rolloutProgramTemplate(input: {
  orgId: string;
  templateId: string;
  facilityId: string;
}): Promise<ProgramRollout> {
  await assertTemplateInOrg(input.templateId, input.orgId);
  const facility = await assertPickleFacility(input.facilityId);

  if (facility.orgId !== input.orgId) {
    throw new Error('Facility does not belong to this organization');
  }

  const result = await query(
    `INSERT INTO org_program_rollouts (org_id, template_id, facility_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id, template_id, facility_id) DO UPDATE SET created_at = org_program_rollouts.created_at
     RETURNING id, org_id as "orgId", template_id as "templateId", facility_id as "facilityId",
               created_at as "createdAt"`,
    [input.orgId, input.templateId, input.facilityId]
  );
  return result.rows[0];
}

export async function listProgramRollouts(orgId: string): Promise<ProgramRollout[]> {
  const result = await query(
    `SELECT r.id, r.org_id as "orgId", r.template_id as "templateId", r.facility_id as "facilityId",
            f.name as "facilityName", t.name as "templateName", t.type as "templateType",
            r.created_at as "createdAt"
     FROM org_program_rollouts r
     JOIN facilities f ON f.id = r.facility_id
     JOIN org_program_templates t ON t.id = r.template_id
     WHERE r.org_id = $1
     ORDER BY f.name, t.name`,
    [orgId]
  );
  return result.rows;
}

async function canManageFacilityPrograms(userId: string, facilityId: string): Promise<boolean> {
  const { orgId } = await assertPickleFacility(facilityId);
  if (orgId && (await isOrgAdmin(userId, orgId))) {
    return true;
  }
  return isFacilityAdmin(facilityId, userId);
}

export async function createProgramInstance(input: {
  userId: string;
  templateId: string;
  facilityId: string;
  schedule: Record<string, unknown>;
  capacity?: number;
  priceCents?: number;
  status?: string;
}): Promise<ProgramInstance> {
  const canManage = await canManageFacilityPrograms(input.userId, input.facilityId);
  if (!canManage) {
    throw new Error('Not authorized to create programs at this facility');
  }

  const { orgId } = await assertPickleFacility(input.facilityId);
  if (!orgId) {
    throw new Error('Facility is not linked to an organization');
  }

  const rollout = await query(
    `SELECT 1 FROM org_program_rollouts
     WHERE org_id = $1 AND template_id = $2 AND facility_id = $3`,
    [orgId, input.templateId, input.facilityId]
  );
  if (rollout.rows.length === 0) {
    throw new Error('Program template has not been rolled out to this facility');
  }

  const status = input.status || 'published';
  if (!['draft', 'published', 'cancelled', 'completed'].includes(status)) {
    throw new Error('Invalid instance status');
  }

  const result = await query(
    `INSERT INTO program_instances (template_id, facility_id, schedule, capacity, price_cents, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, template_id as "templateId", facility_id as "facilityId",
               schedule, capacity, price_cents as "priceCents", status,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.templateId,
      input.facilityId,
      JSON.stringify(input.schedule || {}),
      Math.max(1, Math.min(500, input.capacity ?? 16)),
      Math.max(0, input.priceCents ?? 0),
      status,
    ]
  );
  return result.rows[0];
}

export async function listProgramInstancesByFacility(
  facilityId: string,
  options?: { userId?: string; includeDraft?: boolean }
): Promise<ProgramInstance[]> {
  await assertPickleFacility(facilityId);

  const statuses = options?.includeDraft
    ? ['draft', 'published']
    : ['published'];

  const result = await query(
    `SELECT pi.id, pi.template_id as "templateId", pi.facility_id as "facilityId",
            pi.schedule, pi.capacity, pi.price_cents as "priceCents", pi.status,
            t.name as "templateName", t.type as "templateType",
            (SELECT COUNT(*)::int FROM program_registrations pr
             WHERE pr.instance_id = pi.id AND pr.status IN ('registered', 'attended')) as "registrationCount",
            pi.created_at as "createdAt", pi.updated_at as "updatedAt",
            CASE WHEN $3::uuid IS NULL THEN NULL ELSE (
              SELECT pr.status FROM program_registrations pr
              WHERE pr.instance_id = pi.id AND pr.user_id = $3
              LIMIT 1
            ) END as "userRegistrationStatus"
     FROM program_instances pi
     JOIN org_program_templates t ON t.id = pi.template_id
     WHERE pi.facility_id = $1 AND pi.status = ANY($2::varchar[])
     ORDER BY pi.created_at DESC`,
    [facilityId, statuses, options?.userId || null]
  );

  return result.rows.map((row: ProgramInstance) => ({
    ...row,
    spotsRemaining: Math.max(0, row.capacity - (row.registrationCount || 0)),
  }));
}

export async function registerForProgramInstance(
  userId: string,
  instanceId: string
): Promise<ProgramRegistration> {
  return transaction(async (client: PoolClient) => {
    const instanceResult = await client.query(
      `SELECT pi.id, pi.capacity, pi.status, pi.facility_id as "facilityId"
       FROM program_instances pi
       WHERE pi.id = $1
       FOR UPDATE`,
      [instanceId]
    );
    if (instanceResult.rows.length === 0) {
      throw new Error('Program not found');
    }

    const instance = instanceResult.rows[0];
    if (instance.status !== 'published') {
      throw new Error('This program is not open for registration');
    }

    await assertPickleFacility(instance.facilityId);

    const existing = await client.query(
      `SELECT id, status FROM program_registrations
       WHERE instance_id = $1 AND user_id = $2`,
      [instanceId, userId]
    );
    if (existing.rows.length > 0 && existing.rows[0].status !== 'cancelled') {
      throw new Error('You are already registered for this program');
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM program_registrations
       WHERE instance_id = $1 AND status IN ('registered', 'attended')`,
      [instanceId]
    );
    const registeredCount = countResult.rows[0].count as number;
    const registrationStatus = registeredCount >= instance.capacity ? 'waitlisted' : 'registered';

    if (existing.rows.length > 0) {
      const updateResult = await client.query(
        `UPDATE program_registrations
         SET status = $3, updated_at = NOW(), paid_at = NULL, attended_at = NULL
         WHERE instance_id = $1 AND user_id = $2
         RETURNING id, instance_id as "instanceId", user_id as "userId", status,
                   paid_at as "paidAt", attended_at as "attendedAt", created_at as "createdAt"`,
        [instanceId, userId, registrationStatus]
      );
      return updateResult.rows[0];
    }

    const insertResult = await client.query(
      `INSERT INTO program_registrations (instance_id, user_id, status)
       VALUES ($1, $2, $3)
       RETURNING id, instance_id as "instanceId", user_id as "userId", status,
                 paid_at as "paidAt", attended_at as "attendedAt", created_at as "createdAt"`,
      [instanceId, userId, registrationStatus]
    );
    return insertResult.rows[0];
  });
}

export async function cancelProgramRegistration(
  userId: string,
  instanceId: string
): Promise<ProgramRegistration> {
  const result = await query(
    `UPDATE program_registrations
     SET status = 'cancelled', updated_at = NOW()
     WHERE instance_id = $1 AND user_id = $2 AND status IN ('registered', 'waitlisted')
     RETURNING id, instance_id as "instanceId", user_id as "userId", status,
               paid_at as "paidAt", attended_at as "attendedAt", created_at as "createdAt"`,
    [instanceId, userId]
  );
  if (result.rows.length === 0) {
    throw new Error('No active registration found');
  }
  return result.rows[0];
}

export { isOrgAdmin };
