import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const sendContentReportEmailMock = vi.fn();
const createNotificationMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));
vi.mock('../emailService', () => ({
  sendContentReportEmail: (...args: unknown[]) => sendContentReportEmailMock(...args),
}));
vi.mock('../notificationService', () => ({
  notificationService: { createNotification: (...args: unknown[]) => createNotificationMock(...args) },
}));

import {
  ModerationError,
  blockUser,
  createContentReport,
  getUsersBlockedEitherWay,
} from '../moderationService';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const CONTENT = '44444444-4444-4444-8444-444444444444';

function callsWith(fragment: string) {
  return queryMock.mock.calls.filter(([sql]) => String(sql).includes(fragment));
}

/** Lets the fire-and-forget report alerts finish before asserting on them. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  queryMock.mockReset();
  sendContentReportEmailMock.mockReset();
  createNotificationMock.mockReset();
});

describe('blockUser', () => {
  it('rejects blocking yourself and malformed ids without touching the database', async () => {
    await expect(blockUser(ME, ME)).rejects.toBeInstanceOf(ModerationError);
    await expect(blockUser(ME, 'not-a-uuid')).rejects.toBeInstanceOf(ModerationError);
    await expect(blockUser(ME, undefined)).rejects.toBeInstanceOf(ModerationError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('404s for an unknown member', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(blockUser(ME, OTHER)).rejects.toMatchObject({ status: 404 });
    expect(callsWith('INSERT INTO user_blocks')).toHaveLength(0);
  });

  it('stores the block and marks their unread direct messages read', async () => {
    queryMock.mockImplementation((sql: string) =>
      sql.includes('FROM users') ? { rows: [{}] } : { rows: [] }
    );
    await blockUser(ME, OTHER);
    expect(callsWith('INSERT INTO user_blocks')[0][1]).toEqual([ME, OTHER]);
    expect(callsWith('UPDATE messages')[0][1]).toEqual([ME, OTHER]);
  });
});

describe('getUsersBlockedEitherWay', () => {
  it('skips the query for an empty list', async () => {
    expect((await getUsersBlockedEitherWay(ME, [])).size).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns the other side of each block', async () => {
    queryMock.mockResolvedValue({ rows: [{ other_id: OTHER }] });
    expect(await getUsersBlockedEitherWay(ME, [OTHER, ADMIN])).toEqual(new Set([OTHER]));
  });
});

describe('createContentReport', () => {
  function mockReportQueries(options: { inserted?: boolean; messageVisible?: boolean } = {}) {
    const { inserted = true, messageVisible = true } = options;
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('FROM messages m')) {
        return { rows: messageVisible ? [{ sender_id: OTHER, message_text: 'rude text', facility_id: 'club-1' }] : [] };
      }
      if (sql.includes('FROM hitting_partner_posts')) {
        return { rows: [{ user_id: OTHER, facility_id: 'club-1', availability: 'Weekends', description: 'rude post' }] };
      }
      if (sql.includes('INSERT INTO content_reports')) return { rows: inserted ? [{ id: 'report-1' }] : [] };
      if (sql.includes('FROM content_reports')) return { rows: [{ id: 'report-existing' }] };
      if (sql.includes('FROM users')) {
        return { rows: [{ id: ME, full_name: 'Me', email: 'me@x.com' }, { id: OTHER, full_name: 'Other', email: 'o@x.com' }] };
      }
      if (sql.includes('FROM facilities')) return { rows: [{ name: 'Club One' }] };
      if (sql.includes('FROM facility_admins')) return { rows: [{ user_id: ADMIN }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
  }

  it('validates type, reason and id', async () => {
    const base = { reporterId: ME, contentType: 'message', contentId: CONTENT, reason: 'spam' };
    await expect(createContentReport({ ...base, contentType: 'booking' })).rejects.toBeInstanceOf(ModerationError);
    await expect(createContentReport({ ...base, reason: 'boring' })).rejects.toBeInstanceOf(ModerationError);
    await expect(createContentReport({ ...base, contentId: 'nope' })).rejects.toMatchObject({ status: 404 });
    expect(callsWith('INSERT INTO content_reports')).toHaveLength(0);
  });

  it('refuses a message the reporter cannot see', async () => {
    mockReportQueries({ messageVisible: false });
    await expect(
      createContentReport({ reporterId: ME, contentType: 'message', contentId: CONTENT, reason: 'harassment' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuses reporting your own content', async () => {
    mockReportQueries();
    await expect(
      createContentReport({ reporterId: OTHER, contentType: 'message', contentId: CONTENT, reason: 'spam' })
    ).rejects.toBeInstanceOf(ModerationError);
  });

  it('stores a server-side snapshot and emails the team; private messages do not notify club admins', async () => {
    mockReportQueries();
    const id = await createContentReport({
      reporterId: ME,
      contentType: 'message',
      contentId: CONTENT,
      reason: 'harassment',
      details: '  keeps messaging me  ',
    });
    expect(id).toBe('report-1');
    const params = callsWith('INSERT INTO content_reports')[0][1];
    expect(params).toEqual([ME, OTHER, 'club-1', 'message', CONTENT, 'harassment', 'keeps messaging me', 'rude text']);

    await flush();
    expect(sendContentReportEmailMock).toHaveBeenCalledTimes(1);
    expect(sendContentReportEmailMock.mock.calls[0][0]).toMatchObject({
      reportId: 'report-1',
      reportedUserName: 'Other',
      facilityName: 'Club One',
      contentSnapshot: 'rude text',
    });
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('notifies club admins about a reported public post', async () => {
    mockReportQueries();
    await createContentReport({
      reporterId: ME,
      contentType: 'hitting_partner_post',
      contentId: CONTENT,
      reason: 'inappropriate',
    });
    await flush();
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(createNotificationMock.mock.calls[0][0]).toBe(ADMIN);
  });

  it('is a quiet no-op when the member already reported it', async () => {
    mockReportQueries({ inserted: false });
    const id = await createContentReport({
      reporterId: ME,
      contentType: 'message',
      contentId: CONTENT,
      reason: 'spam',
    });
    expect(id).toBe('report-existing');
    await flush();
    expect(sendContentReportEmailMock).not.toHaveBeenCalled();
  });
});
