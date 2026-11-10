/**
 * Newsletters written in the support console and emailed to club admins,
 * players or clubs (all or picked), in the same branded layout as the app
 * launch email.
 *
 * Same send model as appLaunchEmailService: every address is claimed in
 * newsletter_sends before its email goes out, so pressing Send again (after a
 * deploy cut a run short, or to retry failures) only reaches people who
 * haven't been sent that issue. An issue can't be edited once sending starts,
 * so everyone gets the same words.
 */
import { query } from '../database/connection';
import { delay } from '../../shared/utils/delay';
import { COURTTIME_TEAM_USER_ID } from '../../shared/constants/courttimeTeam';
import { sendNewsletterEmail, type EmailSendResult } from './emailService';

/**
 * Who an issue goes to. A club admin is anyone who is an active admin of a
 * club; a player is any other account; "clubs" means everyone in a club
 * (its active members and its admins). The selected_* audiences use
 * targetIds: user ids for admins/players, facility ids for clubs.
 */
export type NewsletterAudience =
  | 'all_admins'
  | 'selected_admins'
  | 'all_players'
  | 'selected_players'
  | 'all_clubs'
  | 'selected_clubs';
export const NEWSLETTER_AUDIENCES: NewsletterAudience[] = [
  'all_admins',
  'selected_admins',
  'all_players',
  'selected_players',
  'all_clubs',
  'selected_clubs',
];

export function isSelectedAudience(audience: NewsletterAudience): boolean {
  return audience.startsWith('selected_');
}

export interface NewsletterInput {
  subject: string;
  preheader?: string | null;
  body: string;
  audience: NewsletterAudience;
  /** User ids (selected admins/players) or facility ids (selected clubs); empty otherwise. */
  targetIds: string[];
}

export interface Newsletter extends NewsletterInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface NewsletterListItem extends Newsletter {
  sent: number;
  skipped: number;
  failed: number;
}

/** A picked admin, player or club, for showing the selection back. */
export interface NewsletterTarget {
  id: string;
  label: string;
  detail: string | null;
}

export interface NewsletterRecipient {
  userId: string;
  email: string;
  fullName: string | null;
}

export interface NewsletterJob {
  newsletterId: string;
  status: 'sending' | 'done';
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
}

export interface NewsletterSummary {
  newsletter: Newsletter;
  /** The picked admins, players or clubs (selected_* audiences only). */
  targets: NewsletterTarget[];
  /** Addresses that would get it if Send were pressed now. */
  remaining: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Interrupted mid-send; not retried automatically. */
  unknown: number;
  job: NewsletterJob | null;
}

export class NewsletterError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Spacing between sends; well under Resend's per-second limit. */
export const SEND_INTERVAL_MS = 550;
/** Waits after a 429 before trying the same address again. */
const RATE_LIMIT_BACKOFF_MS = [2000, 5000, 10000, 20000];

const MAX_SUBJECT = 200;
const MAX_PREHEADER = 200;
const MAX_BODY = 50_000;
const MAX_TARGETS = 2000;

// Same exclusions as the app launch email: our own/demo/review addresses (all
// on courttimeapp.com), smoke-test domains, the CourtTime Team sender, and
// deleted accounts. $1 = team user id, $2 = target ids (text[]).
const BASE_RECIPIENTS_WHERE = `
  u.deleted_at IS NULL
  AND u.email LIKE '%_@_%._%'
  AND lower(u.email) NOT LIKE '%courttimeapp.com'
  AND split_part(lower(u.email), '@', 2) NOT IN ('example.com', 'example.org', 'example.net', 'test.com')
  AND u.id <> $1
`;

// A club admin is an active facility_admins row or an active membership
// flagged is_facility_admin (the two mechanisms isFacilityAdminUser checks).
// users.user_type is NOT used: it doesn't track who actually runs a club.
const IS_CLUB_ADMIN = `(
  EXISTS (SELECT 1 FROM facility_admins fa WHERE fa.user_id = u.id AND fa.status = 'active')
  OR EXISTS (
    SELECT 1 FROM facility_memberships fm
    WHERE fm.user_id = u.id AND fm.status = 'active' AND fm.is_facility_admin = true
  )
)`;

const AUDIENCE_WHERE: Record<NewsletterAudience, string> = {
  all_admins: `AND ${IS_CLUB_ADMIN}`,
  selected_admins: `AND u.id::text = ANY($2::text[]) AND ${IS_CLUB_ADMIN}`,
  all_players: `AND NOT ${IS_CLUB_ADMIN}`,
  selected_players: `AND u.id::text = ANY($2::text[])`,
  all_clubs: `AND (
    ${IS_CLUB_ADMIN}
    OR EXISTS (SELECT 1 FROM facility_memberships fm WHERE fm.user_id = u.id AND fm.status = 'active')
  )`,
  selected_clubs: `AND (
    EXISTS (
      SELECT 1 FROM facility_admins fa
      WHERE fa.user_id = u.id AND fa.status = 'active' AND fa.facility_id = ANY($2::text[])
    )
    OR EXISTS (
      SELECT 1 FROM facility_memberships fm
      WHERE fm.user_id = u.id AND fm.status = 'active' AND fm.facility_id = ANY($2::text[])
    )
  )`,
};

function recipientsSql(audience: NewsletterAudience): string {
  return `
    SELECT DISTINCT ON (lower(u.email))
      u.id AS "userId", lower(u.email) AS email, u.full_name AS "fullName"
    FROM users u
    WHERE ${BASE_RECIPIENTS_WHERE} ${AUDIENCE_WHERE[audience]}
      -- Always reference $2 so Postgres can type it when the audience ignores it.
      AND $2::text[] IS NOT NULL
    ORDER BY lower(u.email), u.created_at
  `;
}

function audienceParams(newsletter: Pick<NewsletterInput, 'audience' | 'targetIds'>) {
  return [COURTTIME_TEAM_USER_ID, isSelectedAudience(newsletter.audience) ? newsletter.targetIds : []];
}

const NEWSLETTER_COLUMNS = `
  n.id, n.subject, n.preheader, n.body, n.audience, n.target_ids AS "targetIds",
  n.created_at AS "createdAt", n.updated_at AS "updatedAt", n.sent_at AS "sentAt"
`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Facility ids are short text slugs (e.g. "sunrise-valley"), not uuids.
const FACILITY_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export function validateNewsletterInput(input: Partial<NewsletterInput> | undefined): NewsletterInput {
  const subject = String(input?.subject ?? '').trim();
  const preheader = String(input?.preheader ?? '').trim();
  const body = String(input?.body ?? '').replace(/\s+$/, '');
  const audience = input?.audience as NewsletterAudience;
  if (!subject) throw new NewsletterError('Add a subject');
  if (subject.length > MAX_SUBJECT) throw new NewsletterError(`Keep the subject under ${MAX_SUBJECT} characters`);
  if (preheader.length > MAX_PREHEADER) throw new NewsletterError(`Keep the preview text under ${MAX_PREHEADER} characters`);
  if (!body.trim()) throw new NewsletterError('Write the email first');
  if (body.length > MAX_BODY) throw new NewsletterError('The email is too long');
  if (!NEWSLETTER_AUDIENCES.includes(audience)) throw new NewsletterError('Choose who it goes to');

  let targetIds: string[] = [];
  if (isSelectedAudience(audience)) {
    const raw = Array.isArray(input?.targetIds) ? input!.targetIds : [];
    targetIds = [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))];
    const valid = audience === 'selected_clubs' ? FACILITY_ID_RE : UUID_RE;
    if (targetIds.length === 0) {
      throw new NewsletterError(audience === 'selected_clubs' ? 'Pick at least one club' : 'Pick at least one person');
    }
    if (targetIds.length > MAX_TARGETS) throw new NewsletterError('Too many picked; use an "all" option instead');
    if (!targetIds.every((id) => valid.test(id))) throw new NewsletterError('Some picked recipients are not valid');
  }
  return { subject, preheader: preheader || null, body, audience, targetIds };
}

export async function listNewsletterRecipients(
  newsletter: Pick<NewsletterInput, 'audience' | 'targetIds'>
): Promise<NewsletterRecipient[]> {
  const result = await query(recipientsSql(newsletter.audience), audienceParams(newsletter));
  return result.rows;
}

/** Recipients with no row yet for this issue, or whose last attempt failed. */
export async function listRemainingNewsletterRecipients(newsletter: Newsletter): Promise<NewsletterRecipient[]> {
  const result = await query(
    `SELECT r.* FROM (${recipientsSql(newsletter.audience)}) r
     LEFT JOIN newsletter_sends s ON s.newsletter_id = $3 AND s.email = r.email
     WHERE s.email IS NULL OR s.status = 'failed'
     ORDER BY r.email`,
    [...audienceParams(newsletter), newsletter.id]
  );
  return result.rows;
}

/** Names for the picked admins, players or clubs, in the order they were picked. */
export async function describeNewsletterTargets(
  newsletter: Pick<NewsletterInput, 'audience' | 'targetIds'>
): Promise<NewsletterTarget[]> {
  if (!isSelectedAudience(newsletter.audience) || newsletter.targetIds.length === 0) return [];
  const result = newsletter.audience === 'selected_clubs'
    ? await query(
        `SELECT id, name AS label, NULLIF(concat_ws(', ', city, state), '') AS detail
         FROM facilities WHERE id = ANY($1::text[])`,
        [newsletter.targetIds]
      )
    : await query(
        `SELECT id, COALESCE(NULLIF(full_name, ''), email) AS label, email AS detail
         FROM users WHERE id::text = ANY($1::text[])`,
        [newsletter.targetIds]
      );
  const byId = new Map<string, NewsletterTarget>(result.rows.map((row: NewsletterTarget) => [row.id, row]));
  return newsletter.targetIds.map((id) => byId.get(id) ?? { id, label: 'No longer exists', detail: id });
}

/**
 * People the "selected admins" / "selected players" pickers can add: the same
 * accounts the matching "all" audience would reach, so a pick always counts.
 */
export async function searchNewsletterPeople(
  role: 'admins' | 'players',
  searchTerm: string
): Promise<NewsletterTarget[]> {
  const term = searchTerm.trim();
  if (term.length < 2) return [];
  const result = await query(
    `SELECT u.id, COALESCE(NULLIF(u.full_name, ''), u.email) AS label,
       concat_ws(' · ', lower(u.email), (
         SELECT string_agg(DISTINCT f.name, ', ')
         FROM facility_memberships fm JOIN facilities f ON f.id = fm.facility_id
         WHERE fm.user_id = u.id AND fm.status = 'active'
       )) AS detail
     FROM users u
     WHERE ${BASE_RECIPIENTS_WHERE} ${AUDIENCE_WHERE[role === 'admins' ? 'all_admins' : 'all_players']}
       AND (u.full_name ILIKE $2 OR u.email ILIKE $2)
     ORDER BY u.full_name NULLS LAST, u.email
     LIMIT 25`,
    [COURTTIME_TEAM_USER_ID, `%${term}%`]
  );
  return result.rows;
}

/** Every club, with how many people "selected clubs" would reach in each. */
export async function listNewsletterClubs(): Promise<(NewsletterTarget & { people: number })[]> {
  const result = await query(
    `SELECT f.id, f.name AS label, NULLIF(concat_ws(', ', f.city, f.state), '') AS detail,
       (SELECT COUNT(DISTINCT lower(u.email)) FROM users u
        WHERE ${BASE_RECIPIENTS_WHERE}
          AND (
            EXISTS (SELECT 1 FROM facility_admins fa
                    WHERE fa.user_id = u.id AND fa.status = 'active' AND fa.facility_id = f.id)
            OR EXISTS (SELECT 1 FROM facility_memberships fm
                       WHERE fm.user_id = u.id AND fm.status = 'active' AND fm.facility_id = f.id)
          ))::int AS people
     FROM facilities f
     ORDER BY f.name`,
    [COURTTIME_TEAM_USER_ID]
  );
  return result.rows;
}

/** How many addresses a draft (saved or not) would reach right now. */
export async function countNewsletterAudience(input: Partial<NewsletterInput>): Promise<number> {
  const audience = input?.audience as NewsletterAudience;
  if (!NEWSLETTER_AUDIENCES.includes(audience)) throw new NewsletterError('Choose who it goes to');
  const targetIds = Array.isArray(input?.targetIds) ? input!.targetIds.map(String) : [];
  if (isSelectedAudience(audience)) {
    const valid = audience === 'selected_clubs' ? FACILITY_ID_RE : UUID_RE;
    if (targetIds.length === 0) return 0;
    if (!targetIds.every((id) => valid.test(id))) throw new NewsletterError('Some picked recipients are not valid');
  }
  return (await listNewsletterRecipients({ audience, targetIds })).length;
}

export async function listNewsletters(): Promise<NewsletterListItem[]> {
  const result = await query(
    `SELECT ${NEWSLETTER_COLUMNS},
       COUNT(*) FILTER (WHERE s.status = 'sent')::int AS sent,
       COUNT(*) FILTER (WHERE s.status = 'skipped')::int AS skipped,
       COUNT(*) FILTER (WHERE s.status = 'failed')::int AS failed
     FROM newsletters n
     LEFT JOIN newsletter_sends s ON s.newsletter_id = n.id
     GROUP BY n.id
     ORDER BY n.created_at DESC`
  );
  return result.rows;
}

function checkId(id: string) {
  if (!UUID_RE.test(id)) throw new NewsletterError('Newsletter not found', 404);
}

export async function getNewsletter(id: string): Promise<Newsletter> {
  checkId(id);
  const result = await query(`SELECT ${NEWSLETTER_COLUMNS} FROM newsletters n WHERE n.id = $1`, [id]);
  if (result.rows.length === 0) throw new NewsletterError('Newsletter not found', 404);
  return result.rows[0];
}

export async function createNewsletter(input: Partial<NewsletterInput>): Promise<Newsletter> {
  const { subject, preheader, body, audience, targetIds } = validateNewsletterInput(input);
  const result = await query(
    `INSERT INTO newsletters AS n (subject, preheader, body, audience, target_ids)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${NEWSLETTER_COLUMNS}`,
    [subject, preheader, body, audience, targetIds]
  );
  return result.rows[0];
}

/** Drafts only: once Send has been pressed the words and audience are fixed. */
export async function updateNewsletter(id: string, input: Partial<NewsletterInput>): Promise<Newsletter> {
  checkId(id);
  const { subject, preheader, body, audience, targetIds } = validateNewsletterInput(input);
  const result = await query(
    `UPDATE newsletters AS n
     SET subject = $2, preheader = $3, body = $4, audience = $5, target_ids = $6, updated_at = NOW()
     WHERE n.id = $1 AND n.sent_at IS NULL
     RETURNING ${NEWSLETTER_COLUMNS}`,
    [id, subject, preheader, body, audience, targetIds]
  );
  if (result.rows.length === 0) {
    await getNewsletter(id); // 404 when it doesn't exist
    throw new NewsletterError('This newsletter has already been sent, so it can no longer be edited', 409);
  }
  return result.rows[0];
}

export async function deleteNewsletter(id: string): Promise<void> {
  checkId(id);
  const result = await query(`DELETE FROM newsletters WHERE id = $1 AND sent_at IS NULL RETURNING id`, [id]);
  if (result.rows.length === 0) {
    await getNewsletter(id);
    throw new NewsletterError('Sent newsletters are kept as a record and can’t be deleted', 409);
  }
}

let currentJob: NewsletterJob | null = null;

export function getNewsletterJob(): NewsletterJob | null {
  return currentJob ? { ...currentJob } : null;
}

export async function getNewsletterSummary(id: string): Promise<NewsletterSummary> {
  const newsletter = await getNewsletter(id);
  const [remaining, counts, targets] = await Promise.all([
    listRemainingNewsletterRecipients(newsletter),
    query(
      `SELECT status, COUNT(*)::int AS n FROM newsletter_sends WHERE newsletter_id = $1 GROUP BY status`,
      [id]
    ),
    describeNewsletterTargets(newsletter),
  ]);
  const byStatus: Record<string, number> = {};
  for (const row of counts.rows) byStatus[row.status] = row.n;
  const job = getNewsletterJob();
  return {
    newsletter,
    targets,
    remaining: remaining.length,
    sent: byStatus.sent ?? 0,
    skipped: byStatus.skipped ?? 0,
    failed: byStatus.failed ?? 0,
    unknown: byStatus.sending ?? 0,
    job: job?.newsletterId === id ? job : null,
  };
}

/** Claims the address for this issue; false when it's already sent, skipped or mid-send. */
async function claim(newsletterId: string, recipient: NewsletterRecipient): Promise<boolean> {
  const result = await query(
    `INSERT INTO newsletter_sends (newsletter_id, email, user_id, status)
     VALUES ($1, $2, $3, 'sending')
     ON CONFLICT (newsletter_id, email) DO UPDATE
       SET status = 'sending', error = NULL, updated_at = NOW()
       WHERE newsletter_sends.status = 'failed'
     RETURNING email`,
    [newsletterId, recipient.email, recipient.userId]
  );
  return result.rows.length > 0;
}

async function record(
  newsletterId: string,
  email: string,
  status: 'sent' | 'skipped' | 'failed',
  result: EmailSendResult
) {
  const resendId = (result.response as { id?: string } | null | undefined)?.id ?? null;
  await query(
    `UPDATE newsletter_sends
     SET status = $3, error = $4, resend_id = $5, updated_at = NOW()
     WHERE newsletter_id = $1 AND email = $2`,
    [newsletterId, email, status, status === 'failed' ? result.error ?? 'Unknown error' : null, resendId]
  );
}

async function sendWithRetry(
  newsletter: Newsletter,
  recipient: NewsletterRecipient,
  wait: (ms: number) => Promise<void>
) {
  for (let attempt = 0; ; attempt++) {
    const result = await sendNewsletterEmail(recipient.email, newsletter, recipient.userId);
    if (result.status !== 429 || attempt >= RATE_LIMIT_BACKOFF_MS.length) return result;
    await wait(RATE_LIMIT_BACKOFF_MS[attempt]);
  }
}

/**
 * Starts sending this issue to everyone remaining and returns right away.
 * `expectedCount` is the number the console showed; if the audience moved
 * since, nothing is sent and the caller should refresh.
 */
export async function startNewsletterSend(
  id: string,
  expectedCount: number,
  wait: (ms: number) => Promise<void> = delay
): Promise<NewsletterJob> {
  if (currentJob?.status === 'sending') throw new NewsletterError('A newsletter is already sending', 409);
  const newsletter = await getNewsletter(id);
  const recipients = await listRemainingNewsletterRecipients(newsletter);
  if (recipients.length === 0) throw new NewsletterError('Everyone has already been sent this newsletter');
  if (recipients.length !== expectedCount) {
    throw new NewsletterError(
      `The audience changed (${recipients.length} now, ${expectedCount} shown). Refresh and try again.`
    );
  }

  // Lock the words before the first email goes out.
  await query(`UPDATE newsletters SET sent_at = COALESCE(sent_at, NOW()) WHERE id = $1`, [id]);

  const job: NewsletterJob = {
    newsletterId: id,
    status: 'sending',
    total: recipients.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
  };
  currentJob = job;
  void runJob(job, newsletter, recipients, wait);
  return { ...job };
}

async function runJob(
  job: NewsletterJob,
  newsletter: Newsletter,
  recipients: NewsletterRecipient[],
  wait: (ms: number) => Promise<void>
) {
  try {
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      if (!(await claim(newsletter.id, recipient))) {
        job.total--;
        continue;
      }
      let result: EmailSendResult;
      try {
        result = await sendWithRetry(newsletter, recipient, wait);
      } catch (error) {
        result = { success: false, status: null, error: error instanceof Error ? error.message : String(error) };
      }
      if (result.success && result.status === null) {
        job.skipped++;
        await record(newsletter.id, recipient.email, 'skipped', result);
      } else if (result.success) {
        job.sent++;
        await record(newsletter.id, recipient.email, 'sent', result);
      } else {
        job.failed++;
        job.errorMessage ??= result.error;
        await record(newsletter.id, recipient.email, 'failed', result);
      }
      if (i < recipients.length - 1) await wait(SEND_INTERVAL_MS);
    }
  } catch (error) {
    console.error('[Newsletter] stopped early:', error);
    job.errorMessage ??= error instanceof Error ? error.message : 'Stopped early';
  } finally {
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    console.log('[Newsletter] finished', job);
  }
}

/** Test hook. */
export function resetNewsletterJobForTests() {
  currentJob = null;
}
