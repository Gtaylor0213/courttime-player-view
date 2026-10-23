import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendAnnouncementEmailMock = vi.fn();
const notifyFacilityAnnouncementMock = vi.fn();

vi.mock('../emailService', () => ({
  sendAnnouncementEmail: (...args: unknown[]) => sendAnnouncementEmailMock(...args),
}));
vi.mock('../notificationService', () => ({
  notificationService: {
    notifyFacilityAnnouncement: (...args: unknown[]) => notifyFacilityAnnouncementMock(...args),
  },
}));
vi.mock('../../../shared/utils/delay', () => ({ delay: () => Promise.resolve() }));

import {
  DUPLICATE_WINDOW_MS,
  findDuplicateEmailBlast,
  getEmailBlastJob,
  getLatestEmailBlastJob,
  resetEmailBlastJobsForTests,
  startEmailBlast,
} from '../emailBlastService';

const recipients = [
  { userId: 'u1', email: 'a@example.com', fullName: 'A' },
  { userId: 'u2', email: 'b@example.com', fullName: 'B' },
  { userId: 'u3', email: 'c@example.com', fullName: 'C' },
];

function start(overrides: Partial<Parameters<typeof startEmailBlast>[0]> = {}) {
  return startEmailBlast({
    facilityId: 'club-1',
    facilityName: 'Club One',
    subject: 'Courts closed',
    message: 'Resurfacing Monday',
    recipients,
    ...overrides,
  });
}

async function waitUntilDone(jobId: string, facilityId = 'club-1') {
  await vi.waitFor(() => expect(getEmailBlastJob(facilityId, jobId)?.status).toBe('done'));
  return getEmailBlastJob(facilityId, jobId)!;
}

beforeEach(() => {
  resetEmailBlastJobsForTests();
  sendAnnouncementEmailMock.mockReset();
  sendAnnouncementEmailMock.mockResolvedValue({ success: true });
  notifyFacilityAnnouncementMock.mockReset();
  notifyFacilityAnnouncementMock.mockResolvedValue(undefined);
});

describe('startEmailBlast', () => {
  it('returns a sending job immediately and finishes in the background', async () => {
    const job = start();
    expect(job).toMatchObject({ status: 'sending', sent: 0, failed: 0, total: 3 });

    const done = await waitUntilDone(job.jobId);
    expect(done).toMatchObject({ status: 'done', sent: 3, failed: 0, total: 3 });
    expect(done.finishedAt).toBeDefined();
    expect(sendAnnouncementEmailMock).toHaveBeenCalledTimes(3);
    expect(notifyFacilityAnnouncementMock).toHaveBeenCalledWith(
      ['u1', 'u2', 'u3'],
      'Courts closed',
      'Resurfacing Monday'
    );
  });

  it('counts failed and throwing sends and keeps the first error', async () => {
    sendAnnouncementEmailMock
      .mockResolvedValueOnce({ success: false, error: 'bounced' })
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce({ success: true });

    const done = await waitUntilDone(start().jobId);
    expect(done).toMatchObject({ sent: 1, failed: 2, errorMessage: 'bounced' });
  });

  it('does not expose the message body in job snapshots', () => {
    expect(start()).not.toHaveProperty('message');
  });
});

describe('job lookup', () => {
  it('only returns a job to its own facility', async () => {
    const job = start();
    expect(getEmailBlastJob('club-2', job.jobId)).toBeNull();
    expect(getLatestEmailBlastJob('club-2')).toBeNull();
    expect(getLatestEmailBlastJob('club-1')?.jobId).toBe(job.jobId);
    await waitUntilDone(job.jobId);
  });
});

describe('findDuplicateEmailBlast', () => {
  it('matches the same subject and message for the same facility', async () => {
    const job = start();
    expect(findDuplicateEmailBlast('club-1', ' Courts closed ', 'Resurfacing Monday')?.jobId).toBe(job.jobId);
    expect(findDuplicateEmailBlast('club-1', 'Courts closed', 'Different body')).toBeNull();
    expect(findDuplicateEmailBlast('club-2', 'Courts closed', 'Resurfacing Monday')).toBeNull();
    await waitUntilDone(job.jobId);
  });

  it('stops matching a finished blast after the duplicate window', async () => {
    const job = start();
    await waitUntilDone(job.jobId);
    const later = Date.parse(job.startedAt) + DUPLICATE_WINDOW_MS + 1;
    expect(findDuplicateEmailBlast('club-1', 'Courts closed', 'Resurfacing Monday', later)).toBeNull();
  });
});
