import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny stand-in for the users query + app_launch_email_sends table.
type Row = { email: string; user_id: string; status: string; error: string | null };
let audience: { userId: string; email: string; fullName: string | null }[] = [];
let table = new Map<string, Row>();

const queryMock = vi.fn(async (sql: string, params: any[] = []) => {
  if (sql.includes('LEFT JOIN app_launch_email_sends')) {
    return {
      rows: audience.filter((r) => {
        const row = table.get(r.email);
        return !row || row.status === 'failed';
      }),
    };
  }
  if (sql.includes('INSERT INTO app_launch_email_sends')) {
    const [email, userId] = params;
    const row = table.get(email);
    if (row && row.status !== 'failed') return { rows: [] };
    table.set(email, { email, user_id: userId, status: 'sending', error: null });
    return { rows: [{ email }] };
  }
  if (sql.includes('UPDATE app_launch_email_sends')) {
    const [email, status, error] = params;
    Object.assign(table.get(email)!, { status, error });
    return { rows: [] };
  }
  if (sql.includes('GROUP BY status')) {
    const counts: Record<string, number> = {};
    for (const row of table.values()) counts[row.status] = (counts[row.status] ?? 0) + 1;
    return { rows: Object.entries(counts).map(([status, n]) => ({ status, n })) };
  }
  throw new Error(`unexpected SQL: ${sql}`);
});

const sendMock = vi.fn();
vi.mock('../../database/connection', () => ({ query: (sql: string, params?: any[]) => queryMock(sql, params) }));
vi.mock('../emailService', () => ({ sendAppLaunchEmail: (...args: unknown[]) => sendMock(...args) }));

import {
  getAppLaunchEmailJob,
  getAppLaunchEmailSummary,
  resetAppLaunchEmailJobForTests,
  startAppLaunchEmail,
} from '../appLaunchEmailService';
import { buildAppLaunchEmailHtml, greetingName } from '../appLaunchEmailTemplate';
import { APP_STORE_URL, PLAY_STORE_URL } from '../../../shared/utils/appDownload';

const noWait = () => Promise.resolve();

async function finish() {
  for (let i = 0; i < 50 && getAppLaunchEmailJob()?.status === 'sending'; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
  return getAppLaunchEmailJob()!;
}

beforeEach(() => {
  resetAppLaunchEmailJobForTests();
  table = new Map();
  audience = [
    { userId: 'u1', email: 'a@example.com', fullName: 'Ann Lee' },
    { userId: 'u2', email: 'b@example.com', fullName: 'Bo' },
    { userId: 'u3', email: 'c@example.com', fullName: null },
  ];
  sendMock.mockReset();
  sendMock.mockResolvedValue({ success: true, status: 200, response: { id: 'r1' } });
});

describe('app launch email template', () => {
  it('links both badges to the stores and greets by first name', () => {
    const html = buildAppLaunchEmailHtml('Ann Lee');
    expect(html).toContain('Hi Ann,');
    expect(html).toContain(`href="${APP_STORE_URL}"`);
    expect(html).toContain(`href="${PLAY_STORE_URL}"`);
    expect(html).toContain('https://www.courttimeapp.com/badges/app-store.png');
    expect(html).toContain('https://www.courttimeapp.com/badges/google-play.png');
    expect(html).toContain('https://www.courttimeapp.com/get-app');
    expect(html).toContain('4239 Allenhurst Dr');
  });

  it('escapes names and falls back to "there"', () => {
    expect(buildAppLaunchEmailHtml('<b>x</b>')).toContain('Hi &lt;b&gt;x&lt;/b&gt;,');
    expect(greetingName(null)).toBe('there');
    expect(greetingName('  ')).toBe('there');
    expect(greetingName('123')).toBe('there');
  });
});

describe('app launch email sending', () => {
  it('sends each remaining address once and records the outcome', async () => {
    sendMock
      .mockResolvedValueOnce({ success: true, status: 200, response: { id: 'r1' } })
      .mockResolvedValueOnce({ success: true, status: null })
      .mockResolvedValueOnce({ success: false, status: 422, error: 'Invalid to' });

    await startAppLaunchEmail(3, noWait);
    const job = await finish();

    expect(job).toMatchObject({ status: 'done', total: 3, sent: 1, skipped: 1, failed: 1, errorMessage: 'Invalid to' });
    expect(sendMock).toHaveBeenCalledWith('a@example.com', 'Ann Lee', 'u1');
    expect(await getAppLaunchEmailSummary()).toMatchObject({ remaining: 1, sent: 1, skipped: 1, failed: 1, unknown: 0 });
  });

  it('a second run only retries failures and never re-sends', async () => {
    sendMock.mockResolvedValueOnce({ success: true, status: 200 }).mockResolvedValueOnce({ success: false, status: 500, error: 'x' })
      .mockResolvedValueOnce({ success: true, status: 200 });
    await startAppLaunchEmail(3, noWait);
    await finish();

    sendMock.mockClear();
    await startAppLaunchEmail(1, noWait);
    await finish();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('b@example.com', 'Bo', 'u2');
    expect((await getAppLaunchEmailSummary()).remaining).toBe(0);
    await expect(startAppLaunchEmail(1, noWait)).rejects.toThrow(/already been sent/);
  });

  it('skips an address someone else claimed after the list was read', async () => {
    sendMock.mockImplementationOnce(async () => {
      table.set('b@example.com', { email: 'b@example.com', user_id: 'u2', status: 'sent', error: null });
      return { success: true, status: 200 };
    });
    await startAppLaunchEmail(3, noWait);
    const job = await finish();
    expect(sendMock.mock.calls.map((c) => c[0])).toEqual(['a@example.com', 'c@example.com']);
    expect(job).toMatchObject({ total: 2, sent: 2 });
  });

  it('refuses when the audience changed since the console loaded', async () => {
    await expect(startAppLaunchEmail(5, noWait)).rejects.toThrow(/audience changed/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('refuses a second start while sending', async () => {
    sendMock.mockImplementation(() => new Promise(() => {}));
    await startAppLaunchEmail(3, noWait);
    await expect(startAppLaunchEmail(3, noWait)).rejects.toThrow(/Already sending/);
  });

  it('waits and retries the same address when Resend rate-limits', async () => {
    const waits: number[] = [];
    sendMock
      .mockResolvedValueOnce({ success: false, status: 429, error: 'Too many requests' })
      .mockResolvedValue({ success: true, status: 200 });
    await startAppLaunchEmail(3, async (ms) => { waits.push(ms); });
    const job = await finish();
    expect(job).toMatchObject({ sent: 3, failed: 0 });
    expect(sendMock.mock.calls[0][0]).toBe('a@example.com');
    expect(sendMock.mock.calls[1][0]).toBe('a@example.com');
    expect(waits[0]).toBe(2000);
  });
});
