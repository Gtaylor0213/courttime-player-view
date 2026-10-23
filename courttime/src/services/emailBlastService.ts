/**
 * Email blasts run in the background: the admin's request gets a job snapshot
 * right away and the page polls for progress. Sending 180 emails one at a time
 * takes minutes, and a phone that locks or switches networks mid-request used
 * to show "could not reach the server" while the sends kept going — which
 * invited a second, duplicate blast.
 *
 * Jobs live in memory: a server restart forgets them, which only loses the
 * progress display (and the duplicate guard) for blasts started before it.
 */
import { randomUUID } from 'node:crypto';
import { sendAnnouncementEmail } from './emailService';
import { notificationService } from './notificationService';
import { delay } from '../../shared/utils/delay';
import type { EmailBlastJob } from '../../shared/types';

export type { EmailBlastJob };

export interface EmailBlastRecipient {
  userId: string;
  email: string;
  fullName: string;
}

/** A blast with the same subject and message inside this window counts as a resend. */
export const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
/** Finished jobs are kept this long so a reopened page can still show the result. */
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Pause between sends to stay under the email provider's rate limit. */
const SEND_INTERVAL_MS = 250;

interface StoredJob extends EmailBlastJob {
  message: string;
}

const jobs = new Map<string, StoredJob>();

function snapshot({ message: _message, ...job }: StoredJob): EmailBlastJob {
  return { ...job };
}

function pruneOldJobs(now: number) {
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - Date.parse(job.finishedAt) > JOB_RETENTION_MS) jobs.delete(id);
  }
}

function jobsForFacility(facilityId: string): StoredJob[] {
  return [...jobs.values()]
    .filter((job) => job.facilityId === facilityId)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

/** The same subject + message sent (or still sending) for this facility recently. */
export function findDuplicateEmailBlast(
  facilityId: string,
  subject: string,
  message: string,
  now = Date.now()
): EmailBlastJob | null {
  const match = jobsForFacility(facilityId).find(
    (job) =>
      job.subject.trim() === subject.trim() &&
      job.message.trim() === message.trim() &&
      (job.status === 'sending' || now - Date.parse(job.startedAt) < DUPLICATE_WINDOW_MS)
  );
  return match ? snapshot(match) : null;
}

export function getEmailBlastJob(facilityId: string, jobId: string): EmailBlastJob | null {
  const job = jobs.get(jobId);
  return job && job.facilityId === facilityId ? snapshot(job) : null;
}

export function getLatestEmailBlastJob(facilityId: string): EmailBlastJob | null {
  const [latest] = jobsForFacility(facilityId);
  return latest ? snapshot(latest) : null;
}

/** Registers the job and starts sending without waiting for it to finish. */
export function startEmailBlast(input: {
  facilityId: string;
  facilityName: string;
  subject: string;
  message: string;
  recipients: EmailBlastRecipient[];
}): EmailBlastJob {
  const now = Date.now();
  pruneOldJobs(now);

  const job: StoredJob = {
    jobId: randomUUID(),
    facilityId: input.facilityId,
    subject: input.subject,
    message: input.message,
    status: 'sending',
    sent: 0,
    failed: 0,
    total: input.recipients.length,
    startedAt: new Date(now).toISOString(),
  };
  jobs.set(job.jobId, job);

  void runEmailBlast(job, input.facilityName, input.recipients);
  return snapshot(job);
}

async function runEmailBlast(job: StoredJob, facilityName: string, recipients: EmailBlastRecipient[]) {
  try {
    for (let i = 0; i < recipients.length; i++) {
      const member = recipients[i];
      try {
        const result = await sendAnnouncementEmail(
          member.email,
          member.fullName,
          job.subject,
          job.message,
          facilityName,
          member.userId
        );
        if (result.success) {
          job.sent++;
        } else {
          job.failed++;
          job.errorMessage ??= result.error;
        }
      } catch (error) {
        job.failed++;
        job.errorMessage ??= error instanceof Error ? error.message : 'Unknown email send error';
      }

      if (i < recipients.length - 1) {
        await delay(SEND_INTERVAL_MS);
      }
    }

    try {
      await notificationService.notifyFacilityAnnouncement(
        recipients.map((m) => m.userId),
        job.subject,
        job.message
      );
    } catch (notifError) {
      console.error('Error creating in-app notifications:', notifError);
    }
  } catch (error) {
    console.error('Email blast stopped early:', error);
    job.failed = job.total - job.sent;
    job.errorMessage ??= error instanceof Error ? error.message : 'Email blast stopped early';
  } finally {
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
  }
}

/** Test hook: forget every job. */
export function resetEmailBlastJobsForTests() {
  jobs.clear();
}
