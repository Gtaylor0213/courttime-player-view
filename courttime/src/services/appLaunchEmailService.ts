/**
 * Sends the one-time app launch email to every CourtTime account, once per
 * email address, from the support console.
 *
 * Every address is claimed in app_launch_email_sends before its email goes
 * out, so pressing Send again (after a deploy cut a run short, or to retry
 * failures) only reaches people who haven't been sent it.
 */
import { query } from '../database/connection';
import { delay } from '../../shared/utils/delay';
import { COURTTIME_TEAM_USER_ID } from '../../shared/constants/courttimeTeam';
import { sendAppLaunchEmail, type EmailSendResult } from './emailService';

export interface AppLaunchRecipient {
  userId: string;
  email: string;
  fullName: string | null;
}

export interface AppLaunchEmailJob {
  status: 'sending' | 'done';
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
}

export interface AppLaunchEmailSummary {
  /** Addresses that would get it if Send were pressed now. */
  remaining: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Interrupted mid-send; not retried automatically. */
  unknown: number;
  job: AppLaunchEmailJob | null;
}

/** Spacing between sends; well under Resend's per-second limit. */
export const SEND_INTERVAL_MS = 550;
/** Waits after a 429 before trying the same address again. */
const RATE_LIMIT_BACKOFF_MS = [2000, 5000, 10000, 20000];

// Accounts that shouldn't get it: our own/demo/review addresses (all on
// courttimeapp.com, including deleted+…@deleted.courttimeapp.com), smoke-test
// accounts on example.com / test.com, the CourtTime Team sender, and deleted
// accounts. One row per address.
const RECIPIENTS_SQL = `
  SELECT DISTINCT ON (lower(u.email))
    u.id AS "userId", lower(u.email) AS email, u.full_name AS "fullName"
  FROM users u
  WHERE u.deleted_at IS NULL
    AND u.email LIKE '%_@_%._%'
    AND lower(u.email) NOT LIKE '%courttimeapp.com'
    AND split_part(lower(u.email), '@', 2) NOT IN ('example.com', 'example.org', 'example.net', 'test.com')
    AND u.id <> $1
  ORDER BY lower(u.email), u.created_at
`;

export async function listAppLaunchRecipients(): Promise<AppLaunchRecipient[]> {
  const result = await query(RECIPIENTS_SQL, [COURTTIME_TEAM_USER_ID]);
  return result.rows;
}

/** Recipients with no row yet, or whose last attempt failed. */
export async function listRemainingAppLaunchRecipients(): Promise<AppLaunchRecipient[]> {
  const result = await query(
    `SELECT r.* FROM (${RECIPIENTS_SQL}) r
     LEFT JOIN app_launch_email_sends s ON s.email = r.email
     WHERE s.email IS NULL OR s.status = 'failed'
     ORDER BY r.email`,
    [COURTTIME_TEAM_USER_ID]
  );
  return result.rows;
}

let currentJob: AppLaunchEmailJob | null = null;

export function getAppLaunchEmailJob(): AppLaunchEmailJob | null {
  return currentJob ? { ...currentJob } : null;
}

export async function getAppLaunchEmailSummary(): Promise<AppLaunchEmailSummary> {
  const [remaining, counts] = await Promise.all([
    listRemainingAppLaunchRecipients(),
    query(`SELECT status, COUNT(*)::int AS n FROM app_launch_email_sends GROUP BY status`),
  ]);
  const byStatus: Record<string, number> = {};
  for (const row of counts.rows) byStatus[row.status] = row.n;
  return {
    remaining: remaining.length,
    sent: byStatus.sent ?? 0,
    skipped: byStatus.skipped ?? 0,
    failed: byStatus.failed ?? 0,
    unknown: byStatus.sending ?? 0,
    job: getAppLaunchEmailJob(),
  };
}

/** Claims the address; false when someone else already has it (sent, skipped or mid-send). */
async function claim(recipient: AppLaunchRecipient): Promise<boolean> {
  const result = await query(
    `INSERT INTO app_launch_email_sends (email, user_id, status)
     VALUES ($1, $2, 'sending')
     ON CONFLICT (email) DO UPDATE
       SET status = 'sending', error = NULL, updated_at = NOW()
       WHERE app_launch_email_sends.status = 'failed'
     RETURNING email`,
    [recipient.email, recipient.userId]
  );
  return result.rows.length > 0;
}

async function record(email: string, status: 'sent' | 'skipped' | 'failed', result: EmailSendResult) {
  const resendId = (result.response as { id?: string } | null | undefined)?.id ?? null;
  await query(
    `UPDATE app_launch_email_sends
     SET status = $2, error = $3, resend_id = $4, updated_at = NOW()
     WHERE email = $1`,
    [email, status, status === 'failed' ? result.error ?? 'Unknown error' : null, resendId]
  );
}

async function sendWithRetry(recipient: AppLaunchRecipient, wait: (ms: number) => Promise<void>) {
  for (let attempt = 0; ; attempt++) {
    const result = await sendAppLaunchEmail(recipient.email, recipient.fullName, recipient.userId);
    if (result.status !== 429 || attempt >= RATE_LIMIT_BACKOFF_MS.length) return result;
    await wait(RATE_LIMIT_BACKOFF_MS[attempt]);
  }
}

export class AppLaunchEmailBusyError extends Error {}

/**
 * Starts sending to everyone remaining and returns right away. `expectedCount`
 * is the number the console showed; if the audience moved since, nothing is
 * sent and the caller should refresh.
 */
export async function startAppLaunchEmail(
  expectedCount: number,
  wait: (ms: number) => Promise<void> = delay
): Promise<AppLaunchEmailJob> {
  if (currentJob?.status === 'sending') throw new AppLaunchEmailBusyError('Already sending');
  const recipients = await listRemainingAppLaunchRecipients();
  if (recipients.length === 0) throw new Error('Everyone has already been sent the email');
  if (recipients.length !== expectedCount) {
    throw new Error(`The audience changed (${recipients.length} now, ${expectedCount} shown). Refresh and try again.`);
  }

  const job: AppLaunchEmailJob = {
    status: 'sending',
    total: recipients.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
  };
  currentJob = job;
  void runJob(job, recipients, wait);
  return { ...job };
}

async function runJob(
  job: AppLaunchEmailJob,
  recipients: AppLaunchRecipient[],
  wait: (ms: number) => Promise<void>
) {
  try {
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      if (!(await claim(recipient))) {
        job.total--;
        continue;
      }
      let result: EmailSendResult;
      try {
        result = await sendWithRetry(recipient, wait);
      } catch (error) {
        result = { success: false, status: null, error: error instanceof Error ? error.message : String(error) };
      }
      if (result.success && result.status === null) {
        job.skipped++;
        await record(recipient.email, 'skipped', result);
      } else if (result.success) {
        job.sent++;
        await record(recipient.email, 'sent', result);
      } else {
        job.failed++;
        job.errorMessage ??= result.error;
        await record(recipient.email, 'failed', result);
      }
      if (i < recipients.length - 1) await wait(SEND_INTERVAL_MS);
    }
  } catch (error) {
    console.error('[AppLaunchEmail] stopped early:', error);
    job.errorMessage ??= error instanceof Error ? error.message : 'Stopped early';
  } finally {
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
    console.log('[AppLaunchEmail] finished', job);
  }
}

/** Test hook. */
export function resetAppLaunchEmailJobForTests() {
  currentJob = null;
}
