import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny stand-in for users + newsletters + newsletter_sends. The audience SQL
// itself is checked against a real database separately; here each audience
// resolves from the newsletter row the mock holds.
type SendRow = { newsletter_id: string; email: string; status: string; error: string | null };
type Person = { userId: string; email: string; fullName: string | null; admin: boolean; clubs: string[] };
const ID = '11111111-1111-4111-8111-111111111111';
const U1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const U2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const U3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const U4 = 'aaaaaaaa-0000-4000-8000-000000000004';
let people: Person[] = [];
let newsletter: Record<string, any> | null = null;
let sends = new Map<string, SendRow>();
const key = (id: string, email: string) => `${id}|${email}`;

function audienceOf(audience: string, ids: string[]): Person[] {
  const pick = {
    all_admins: (p: Person) => p.admin,
    selected_admins: (p: Person) => p.admin && ids.includes(p.userId),
    all_players: (p: Person) => !p.admin,
    selected_players: (p: Person) => ids.includes(p.userId),
    all_clubs: (p: Person) => p.clubs.length > 0,
    selected_clubs: (p: Person) => p.clubs.some((c) => ids.includes(c)),
  }[audience]!;
  return people.filter(pick);
}

const queryMock = vi.fn(async (sql: string, params: any[] = []) => {
  if (sql.includes('LEFT JOIN newsletter_sends s ON s.newsletter_id = $3')) {
    return {
      rows: audienceOf(newsletter!.audience, params[1])
        .filter((r) => {
          const row = sends.get(key(params[2], r.email));
          return !row || row.status === 'failed';
        })
        .map(({ userId, email, fullName }) => ({ userId, email, fullName })),
    };
  }
  if (sql.includes('FROM newsletters n WHERE n.id = $1')) {
    return { rows: newsletter && newsletter.id === params[0] ? [newsletter] : [] };
  }
  if (sql.includes('FROM facilities WHERE id = ANY')) {
    return { rows: params[0].filter((id: string) => id !== 'gone').map((id: string) => ({ id, label: `Club ${id}`, detail: null })) };
  }
  if (sql.includes('FROM users WHERE id::text = ANY')) {
    return { rows: people.filter((p) => params[0].includes(p.userId)).map((p) => ({ id: p.userId, label: p.fullName, detail: p.email })) };
  }
  if (sql.includes('UPDATE newsletters SET sent_at')) {
    newsletter!.sentAt ??= 'now';
    return { rows: [] };
  }
  if (sql.includes('UPDATE newsletters AS n')) {
    if (!newsletter || newsletter.sentAt) return { rows: [] };
    Object.assign(newsletter, { subject: params[1], preheader: params[2], body: params[3], audience: params[4], targetIds: params[5] });
    return { rows: [newsletter] };
  }
  if (sql.includes('INSERT INTO newsletter_sends')) {
    const [id, email] = params;
    const row = sends.get(key(id, email));
    if (row && row.status !== 'failed') return { rows: [] };
    sends.set(key(id, email), { newsletter_id: id, email, status: 'sending', error: null });
    return { rows: [{ email }] };
  }
  if (sql.includes('UPDATE newsletter_sends')) {
    const [id, email, status, error] = params;
    Object.assign(sends.get(key(id, email))!, { status, error });
    return { rows: [] };
  }
  if (sql.includes('GROUP BY status')) {
    const counts: Record<string, number> = {};
    for (const row of sends.values()) {
      if (row.newsletter_id === params[0]) counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return { rows: Object.entries(counts).map(([status, n]) => ({ status, n })) };
  }
  throw new Error(`unexpected SQL: ${sql}`);
});

const sendMock = vi.fn();
vi.mock('../../database/connection', () => ({ query: (sql: string, params?: any[]) => queryMock(sql, params) }));
vi.mock('../emailService', () => ({ sendNewsletterEmail: (...args: unknown[]) => sendMock(...args) }));

import {
  getNewsletterJob,
  getNewsletterSummary,
  resetNewsletterJobForTests,
  startNewsletterSend,
  updateNewsletter,
  validateNewsletterInput,
} from '../newsletterService';

const noWait = () => Promise.resolve();

async function finish() {
  for (let i = 0; i < 50 && getNewsletterJob()?.status === 'sending'; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
  return getNewsletterJob()!;
}

beforeEach(() => {
  resetNewsletterJobForTests();
  sends = new Map();
  people = [
    { userId: U1, email: 'a@club.com', fullName: 'Ann Lee', admin: true, clubs: ['oak'] },
    { userId: U2, email: 'b@club.com', fullName: 'Bo', admin: true, clubs: ['elm'] },
    { userId: U3, email: 'p@club.com', fullName: 'Pat', admin: false, clubs: ['oak'] },
    { userId: U4, email: 'q@club.com', fullName: 'Quinn', admin: false, clubs: [] },
  ];
  newsletter = { id: ID, subject: 'News', preheader: null, body: 'Hello', audience: 'all_admins', targetIds: [], sentAt: null };
  sendMock.mockReset();
  sendMock.mockResolvedValue({ success: true, status: 200, response: { id: 'r1' } });
});

describe('newsletter validation', () => {
  it('requires a subject, a body and an audience', () => {
    expect(() => validateNewsletterInput({ body: 'x', audience: 'all_admins' })).toThrow(/subject/);
    expect(() => validateNewsletterInput({ subject: 'x', body: '  ', audience: 'all_admins' })).toThrow(/Write/);
    expect(() => validateNewsletterInput({ subject: 'x', body: 'y', audience: 'admins' as any })).toThrow(/Choose/);
    expect(validateNewsletterInput({ subject: ' S ', preheader: ' ', body: 'B\n\n', audience: 'all_players' }))
      .toEqual({ subject: 'S', preheader: null, body: 'B', audience: 'all_players', targetIds: [] });
  });

  it('needs picks for the selected audiences and drops them for the "all" ones', () => {
    const base = { subject: 'S', body: 'B' };
    expect(() => validateNewsletterInput({ ...base, audience: 'selected_admins', targetIds: [] })).toThrow(/at least one person/);
    expect(() => validateNewsletterInput({ ...base, audience: 'selected_clubs' })).toThrow(/at least one club/);
    expect(() => validateNewsletterInput({ ...base, audience: 'selected_players', targetIds: ['not-a-uuid'] })).toThrow(/not valid/);
    expect(() => validateNewsletterInput({ ...base, audience: 'selected_clubs', targetIds: ["x'; drop"] })).toThrow(/not valid/);
    expect(validateNewsletterInput({ ...base, audience: 'selected_players', targetIds: [U1, U1, U2] }).targetIds).toEqual([U1, U2]);
    expect(validateNewsletterInput({ ...base, audience: 'selected_clubs', targetIds: ['oak-club'] }).targetIds).toEqual(['oak-club']);
    expect(validateNewsletterInput({ ...base, audience: 'all_clubs', targetIds: ['oak'] }).targetIds).toEqual([]);
  });
});

describe('newsletter audiences', () => {
  const cases: [string, string[], string[]][] = [
    ['all_admins', [], ['a@club.com', 'b@club.com']],
    ['selected_admins', [U2], ['b@club.com']],
    ['all_players', [], ['p@club.com', 'q@club.com']],
    ['selected_players', [U3], ['p@club.com']],
    ['all_clubs', [], ['a@club.com', 'b@club.com', 'p@club.com']],
    ['selected_clubs', ['oak'], ['a@club.com', 'p@club.com']],
  ];
  it.each(cases)('%s reaches the right people', async (audience, targetIds, expected) => {
    Object.assign(newsletter!, { audience, targetIds });
    await startNewsletterSend(ID, expected.length, noWait);
    await finish();
    expect(sendMock.mock.calls.map((c) => c[0])).toEqual(expected);
  });

  it('passes picks to the query only for selected audiences', async () => {
    Object.assign(newsletter!, { audience: 'all_admins', targetIds: ['oak'] });
    await getNewsletterSummary(ID);
    const call = queryMock.mock.calls.find(([sql]) => sql.includes('s.newsletter_id = $3'))!;
    expect(call[1]![1]).toEqual([]);
  });

  it('names the picks, flagging ones that no longer exist', async () => {
    Object.assign(newsletter!, { audience: 'selected_clubs', targetIds: ['oak', 'gone'] });
    expect((await getNewsletterSummary(ID)).targets).toEqual([
      { id: 'oak', label: 'Club oak', detail: null },
      { id: 'gone', label: 'No longer exists', detail: 'gone' },
    ]);
    Object.assign(newsletter!, { audience: 'selected_players', targetIds: [U3] });
    expect((await getNewsletterSummary(ID)).targets).toEqual([{ id: U3, label: 'Pat', detail: 'p@club.com' }]);
  });
});

describe('newsletter sending', () => {
  it('sends the issue to its audience once and locks it', async () => {
    sendMock
      .mockResolvedValueOnce({ success: true, status: 200 })
      .mockResolvedValueOnce({ success: true, status: null });
    await startNewsletterSend(ID, 2, noWait);
    const job = await finish();

    expect(job).toMatchObject({ newsletterId: ID, status: 'done', total: 2, sent: 1, skipped: 1, failed: 0 });
    expect(sendMock).toHaveBeenCalledWith('a@club.com', expect.objectContaining({ subject: 'News', body: 'Hello' }), U1);
    expect(sendMock.mock.calls.map((c) => c[0])).not.toContain('p@club.com');
    expect(newsletter!.sentAt).toBe('now');
    expect(await getNewsletterSummary(ID)).toMatchObject({ remaining: 0, sent: 1, skipped: 1 });
    await expect(startNewsletterSend(ID, 1, noWait)).rejects.toThrow(/already been sent/);
    await expect(updateNewsletter(ID, { subject: 'x', body: 'y', audience: 'all_admins' })).rejects.toThrow(/already been sent/);
  });

  it('a second run only retries failures and reaches admins added since', async () => {
    sendMock.mockResolvedValueOnce({ success: false, status: 500, error: 'x' });
    await startNewsletterSend(ID, 2, noWait);
    expect(await finish()).toMatchObject({ failed: 1, sent: 1, errorMessage: 'x' });

    people.push({ userId: 'aaaaaaaa-0000-4000-8000-000000000009', email: 'new@club.com', fullName: null, admin: true, clubs: [] });
    sendMock.mockClear();
    await startNewsletterSend(ID, 2, noWait);
    await finish();
    expect(sendMock.mock.calls.map((c) => c[0])).toEqual(['a@club.com', 'new@club.com']);
  });

  it('refuses when the audience changed since the console loaded', async () => {
    await expect(startNewsletterSend(ID, 5, noWait)).rejects.toThrow(/audience changed/);
    expect(sendMock).not.toHaveBeenCalled();
    expect(newsletter!.sentAt).toBeNull();
  });

  it('refuses a second start while sending', async () => {
    sendMock.mockImplementation(() => new Promise(() => {}));
    await startNewsletterSend(ID, 2, noWait);
    await expect(startNewsletterSend(ID, 2, noWait)).rejects.toThrow(/already sending/);
  });

  it('retries the same address after a rate limit', async () => {
    const waits: number[] = [];
    sendMock.mockResolvedValueOnce({ success: false, status: 429, error: 'slow down' });
    await startNewsletterSend(ID, 2, async (ms) => { waits.push(ms); });
    expect(await finish()).toMatchObject({ sent: 2, failed: 0 });
    expect(sendMock.mock.calls.slice(0, 2).map((c) => c[0])).toEqual(['a@club.com', 'a@club.com']);
    expect(waits[0]).toBe(2000);
  });

  it('404s an unknown or malformed id', async () => {
    await expect(getNewsletterSummary('nope')).rejects.toMatchObject({ status: 404 });
    await expect(getNewsletterSummary('22222222-2222-4222-8222-222222222222')).rejects.toMatchObject({ status: 404 });
  });
});
