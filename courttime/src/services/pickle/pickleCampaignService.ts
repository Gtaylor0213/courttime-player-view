/**
 * CourtTime-Pickle marketing campaign service.
 * Segments org players and sends via emailService announcement pattern.
 */

import { query } from '../../database/connection';
import { sendAnnouncementEmail } from '../emailService';
import { isOrgAdmin } from './pickleOrgService';
import type { LifecycleStatus, ActivityLevel } from './pickleLifecycleService';
import { getPlayerLifecycle } from './pickleLifecycleService';

export type CampaignChannel = 'email' | 'push' | 'sms';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'canceled';
export type CampaignSendStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface SegmentFilter {
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  minAge?: number;
  maxAge?: number;
  minDupr?: number;
  maxDupr?: number;
  lifecycleStatus?: LifecycleStatus[];
  activityLevel?: ActivityLevel[];
}

export interface PickleCampaign {
  id: string;
  orgId: string;
  name: string;
  segmentFilter: SegmentFilter;
  channel: CampaignChannel;
  templateBody: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignSend {
  id: string;
  campaignId: string;
  userId: string;
  sentAt: string | null;
  status: CampaignSendStatus;
  errorMessage: string | null;
  createdAt: string;
  fullName?: string;
  email?: string;
}

export interface CreateCampaignInput {
  orgId: string;
  name: string;
  segmentFilter?: SegmentFilter;
  channel?: CampaignChannel;
  templateBody: string;
}

function mapCampaign(row: Record<string, unknown>): PickleCampaign {
  return {
    id: row.id as string,
    orgId: row.orgId as string,
    name: row.name as string,
    segmentFilter: (row.segmentFilter as SegmentFilter) || {},
    channel: row.channel as CampaignChannel,
    templateBody: row.templateBody as string,
    status: row.status as CampaignStatus,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

function mapSend(row: Record<string, unknown>): CampaignSend {
  return {
    id: row.id as string,
    campaignId: row.campaignId as string,
    userId: row.userId as string,
    sentAt: (row.sentAt as string) || null,
    status: row.status as CampaignSendStatus,
    errorMessage: (row.errorMessage as string) || null,
    createdAt: row.createdAt as string,
    fullName: row.fullName as string | undefined,
    email: row.email as string | undefined,
  };
}

function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export async function requireCampaignAdmin(userId: string, orgId: string): Promise<void> {
  const admin = await isOrgAdmin(userId, orgId);
  if (!admin) {
    throw new Error('Not authorized for this organization');
  }
}

export async function createCampaign(input: CreateCampaignInput): Promise<PickleCampaign> {
  const result = await query(
    `INSERT INTO pickle_campaigns (org_id, name, segment_filter, channel, template_body, status)
     VALUES ($1, $2, $3::jsonb, $4, $5, 'draft')
     RETURNING id, org_id as "orgId", name, segment_filter as "segmentFilter",
               channel, template_body as "templateBody", status,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.orgId,
      input.name,
      JSON.stringify(input.segmentFilter ?? {}),
      input.channel ?? 'email',
      input.templateBody,
    ]
  );
  return mapCampaign(result.rows[0]);
}

export async function listCampaigns(orgId: string): Promise<PickleCampaign[]> {
  const result = await query(
    `SELECT id, org_id as "orgId", name, segment_filter as "segmentFilter",
            channel, template_body as "templateBody", status,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM pickle_campaigns
     WHERE org_id = $1
     ORDER BY created_at DESC`,
    [orgId]
  );
  return result.rows.map(mapCampaign);
}

export async function getCampaign(orgId: string, campaignId: string): Promise<PickleCampaign | null> {
  const result = await query(
    `SELECT id, org_id as "orgId", name, segment_filter as "segmentFilter",
            channel, template_body as "templateBody", status,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM pickle_campaigns
     WHERE org_id = $1 AND id = $2`,
    [orgId, campaignId]
  );
  return result.rows[0] ? mapCampaign(result.rows[0]) : null;
}

interface SegmentCandidate {
  userId: string;
  email: string;
  fullName: string;
  gender: string | null;
  birthdate: string | null;
  duprRating: number | null;
}

export async function getOrgPlayerCandidates(orgId: string): Promise<SegmentCandidate[]> {
  const result = await query(
    `SELECT DISTINCT u.id as "userId", u.email, u.full_name as "fullName", u.gender,
            COALESCE(pp_org.birthdate, pp_global.birthdate) as birthdate,
            COALESCE(pp_org.dupr_rating, pp_global.dupr_rating) as "duprRating"
     FROM users u
     LEFT JOIN pickle_player_profiles pp_org
       ON pp_org.user_id = u.id AND pp_org.org_id = $1
     LEFT JOIN pickle_player_profiles pp_global
       ON pp_global.user_id = u.id AND pp_global.org_id IS NULL
     WHERE u.id IN (
       SELECT user_id FROM player_visits WHERE org_id = $1
       UNION
       SELECT user_id FROM member_subscriptions WHERE org_id = $1
       UNION
       SELECT user_id FROM pickle_player_profiles WHERE org_id = $1 OR org_id IS NULL
     )
     ORDER BY u.full_name`,
    [orgId]
  );
  return result.rows.map((row) => ({
    userId: row.userId as string,
    email: row.email as string,
    fullName: row.fullName as string,
    gender: (row.gender as string) || null,
    birthdate: (row.birthdate as string) || null,
    duprRating: row.duprRating != null ? Number(row.duprRating) : null,
  }));
}

export async function segmentMembers(
  orgId: string,
  filter: SegmentFilter
): Promise<SegmentCandidate[]> {
  const candidates = await getOrgPlayerCandidates(orgId);
  const matched: SegmentCandidate[] = [];

  for (const candidate of candidates) {
    if (filter.gender && candidate.gender !== filter.gender) continue;

    const age = ageFromBirthdate(candidate.birthdate);
    if (filter.minAge != null && (age == null || age < filter.minAge)) continue;
    if (filter.maxAge != null && (age == null || age > filter.maxAge)) continue;

    if (filter.minDupr != null) {
      const dupr = candidate.duprRating ?? 0;
      if (dupr < filter.minDupr) continue;
    }
    if (filter.maxDupr != null) {
      const dupr = candidate.duprRating ?? 999;
      if (dupr > filter.maxDupr) continue;
    }

    if (filter.lifecycleStatus?.length || filter.activityLevel?.length) {
      const lifecycle = await getPlayerLifecycle(candidate.userId, orgId);
      if (filter.lifecycleStatus?.length && !filter.lifecycleStatus.includes(lifecycle.status)) {
        continue;
      }
      if (filter.activityLevel?.length && !filter.activityLevel.includes(lifecycle.activity)) {
        continue;
      }
    }

    matched.push(candidate);
  }

  return matched;
}

export async function previewCampaignSegment(
  orgId: string,
  campaignId: string
): Promise<{ count: number; sample: SegmentCandidate[] }> {
  const campaign = await getCampaign(orgId, campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const members = await segmentMembers(orgId, campaign.segmentFilter);
  return {
    count: members.length,
    sample: members.slice(0, 10),
  };
}

export async function sendCampaign(
  orgId: string,
  campaignId: string
): Promise<{ sent: number; failed: number; skipped: number }> {
  const campaign = await getCampaign(orgId, campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sent' || campaign.status === 'canceled') {
    throw new Error(`Campaign is already ${campaign.status}`);
  }

  const orgResult = await query(
    `SELECT name FROM franchise_organizations WHERE id = $1`,
    [orgId]
  );
  const orgName = orgResult.rows[0]?.name || 'CourtTime Pickle';

  const recipients = await segmentMembers(orgId, campaign.segmentFilter);

  await query(
    `UPDATE pickle_campaigns SET status = 'sending', updated_at = NOW()
     WHERE id = $1`,
    [campaignId]
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    if (campaign.channel === 'email') {
      if (!recipient.email) {
        await recordSend(campaignId, recipient.userId, 'skipped', null, 'No email address');
        skipped++;
        continue;
      }

      const result = await sendAnnouncementEmail(
        recipient.email,
        recipient.fullName || 'Player',
        campaign.name,
        campaign.templateBody,
        orgName,
        recipient.userId
      );

      if (result.success) {
        await recordSend(campaignId, recipient.userId, 'sent', new Date().toISOString());
        sent++;
      } else {
        await recordSend(campaignId, recipient.userId, 'failed', null, result.error || 'Send failed');
        failed++;
      }
    } else {
      await recordSend(
        campaignId,
        recipient.userId,
        'skipped',
        null,
        `${campaign.channel} channel not yet implemented`
      );
      skipped++;
    }
  }

  await query(
    `UPDATE pickle_campaigns SET status = 'sent', updated_at = NOW()
     WHERE id = $1`,
    [campaignId]
  );

  return { sent, failed, skipped };
}

async function recordSend(
  campaignId: string,
  userId: string,
  status: CampaignSendStatus,
  sentAt: string | null,
  errorMessage?: string
): Promise<void> {
  await query(
    `INSERT INTO pickle_campaign_sends (campaign_id, user_id, sent_at, status, error_message)
     VALUES ($1, $2, $3::timestamptz, $4, $5)
     ON CONFLICT (campaign_id, user_id)
     DO UPDATE SET sent_at = EXCLUDED.sent_at, status = EXCLUDED.status,
                   error_message = EXCLUDED.error_message`,
    [campaignId, userId, sentAt, status, errorMessage ?? null]
  );
}

export async function listCampaignSends(
  orgId: string,
  campaignId: string
): Promise<CampaignSend[]> {
  const result = await query(
    `SELECT s.id, s.campaign_id as "campaignId", s.user_id as "userId",
            s.sent_at as "sentAt", s.status, s.error_message as "errorMessage",
            s.created_at as "createdAt",
            u.full_name as "fullName", u.email
     FROM pickle_campaign_sends s
     JOIN pickle_campaigns c ON c.id = s.campaign_id
     JOIN users u ON u.id = s.user_id
     WHERE c.org_id = $1 AND s.campaign_id = $2
     ORDER BY s.created_at DESC`,
    [orgId, campaignId]
  );
  return result.rows.map(mapSend);
}

export async function updateCampaignStatus(
  orgId: string,
  campaignId: string,
  status: CampaignStatus
): Promise<PickleCampaign | null> {
  const result = await query(
    `UPDATE pickle_campaigns SET status = $3, updated_at = NOW()
     WHERE org_id = $1 AND id = $2
     RETURNING id, org_id as "orgId", name, segment_filter as "segmentFilter",
               channel, template_body as "templateBody", status,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [orgId, campaignId, status]
  );
  return result.rows[0] ? mapCampaign(result.rows[0]) : null;
}
