import { beforeEach, describe, expect, it, vi } from 'vitest';

const clientQueryMock = vi.fn();

/**
 * The service runs everything through one transaction, so the mock hands the
 * callback a client whose query() we can inspect and script.
 */
vi.mock('../../database/connection', () => ({
  transaction: async (callback: (client: unknown) => Promise<unknown>) =>
    callback({ query: (...args: unknown[]) => clientQueryMock(...args) }),
}));

import { deleteUserAccount, SoleFacilityAdminError } from '../accountDeletionService';

/** Every statement the service issues, in order. */
function sqlIssued(): string[] {
  return clientQueryMock.mock.calls.map((call) => String(call[0]).replace(/\s+/g, ' ').trim());
}

function sqlMatching(pattern: RegExp): string[] {
  return sqlIssued().filter((sql) => pattern.test(sql));
}

/**
 * Default happy path: the account exists and is live, sole-admin check finds
 * nothing, writes report one row each.
 */
function scriptHappyPath() {
  clientQueryMock.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes('FROM users WHERE id = $1 FOR UPDATE')) {
      return { rows: [{ id: 'user-1', deleted_at: null }], rowCount: 1 };
    }
    if (text.includes('FROM facility_admins fa')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('UPDATE users')) {
      return { rows: [{ deletedAt: '2026-09-15T18:00:00.000Z' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
}

beforeEach(() => {
  clientQueryMock.mockReset();
  scriptHappyPath();
});

describe('deleteUserAccount', () => {
  it('anonymizes the account rather than deleting the row', async () => {
    await deleteUserAccount('user-1');

    // A row delete would cascade past bookings away and fail outright against
    // the pro-shop tables, which reference users ON DELETE RESTRICT.
    expect(sqlMatching(/DELETE FROM users/)).toHaveLength(0);

    const [update] = sqlMatching(/UPDATE users/);
    expect(update).toContain('deleted_at = CURRENT_TIMESTAMP');
    expect(update).toContain("full_name = 'Deleted Member'");
    expect(update).toContain('phone = NULL');
    expect(update).toContain('street_address = NULL');
  });

  it('frees the email address for a fresh signup', async () => {
    await deleteUserAccount('user-1');
    const [update] = sqlMatching(/UPDATE users/);
    expect(update).toMatch(/email = 'deleted\+' \|\| id \|\|/);
  });

  it('makes the stored password unusable', async () => {
    await deleteUserAccount('user-1');
    const [update] = sqlMatching(/UPDATE users/);
    expect(update).toContain("password_hash = 'account-deleted'");
  });

  it('cancels future bookings but leaves past ones alone', async () => {
    await deleteUserAccount('user-1');
    const [cancel] = sqlMatching(/UPDATE bookings/);
    expect(cancel).toContain("status = 'cancelled'");
    expect(cancel).toContain('booking_date > CURRENT_DATE');
    expect(cancel).toContain('end_time > CURRENT_TIME');
  });

  it('ends memberships instead of deleting them', async () => {
    await deleteUserAccount('user-1');
    // Facility admins keep the record that the membership existed and ended.
    expect(sqlMatching(/DELETE FROM facility_memberships/)).toHaveLength(0);
    const [ended] = sqlMatching(/UPDATE facility_memberships/);
    expect(ended).toContain("status = 'expired'");
  });

  it('purges the personal content the policy says is not retained', async () => {
    await deleteUserAccount('user-1');
    const issued = sqlIssued().join(' | ');
    for (const table of [
      'messages',
      'notifications',
      'hitting_partner_posts',
      'player_profiles',
      'user_preferences',
      'user_push_tokens',
      'password_reset_tokens',
    ]) {
      expect(issued).toContain(`DELETE FROM ${table}`);
    }
  });

  it('keeps the records the policy retains', async () => {
    await deleteUserAccount('user-1');
    const issued = sqlIssued().join(' | ');
    // Financial records (7 years) and abuse/safety records.
    expect(issued).not.toContain('DELETE FROM pro_shop_orders');
    expect(issued).not.toContain('DELETE FROM payment_history');
    expect(issued).not.toContain('DELETE FROM account_strikes');
    expect(issued).not.toContain('DELETE FROM facility_revenue_log');
  });

  it('reports what it cancelled', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FOR UPDATE')) return { rows: [{ id: 'user-1', deleted_at: null }], rowCount: 1 };
      if (text.includes('FROM facility_admins fa')) return { rows: [], rowCount: 0 };
      if (text.includes('UPDATE bookings')) return { rows: [], rowCount: 3 };
      if (text.includes('UPDATE facility_memberships')) return { rows: [], rowCount: 2 };
      if (text.includes('UPDATE users')) return { rows: [{ deletedAt: 'ts' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const summary = await deleteUserAccount('user-1');
    expect(summary.futureBookingsCancelled).toBe(3);
    expect(summary.membershipsEnded).toBe(2);
  });

  it('refuses when the member is a facility\'s only administrator', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FOR UPDATE')) return { rows: [{ id: 'user-1', deleted_at: null }], rowCount: 1 };
      if (text.includes('FROM facility_admins fa')) {
        return { rows: [{ name: 'Fields Club' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(deleteUserAccount('user-1')).rejects.toBeInstanceOf(SoleFacilityAdminError);
    // Nothing destructive ran before the refusal.
    expect(sqlMatching(/UPDATE users|DELETE FROM/)).toHaveLength(0);
  });

  it('names the facilities blocking the deletion', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FOR UPDATE')) return { rows: [{ id: 'user-1', deleted_at: null }], rowCount: 1 };
      if (text.includes('FROM facility_admins fa')) {
        return { rows: [{ name: 'Fields Club' }, { name: 'St Marlo' }], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(deleteUserAccount('user-1')).rejects.toThrow(/Fields Club, St Marlo/);
  });

  it('rejects an unknown account', async () => {
    clientQueryMock.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await expect(deleteUserAccount('nobody')).rejects.toThrow('Account not found');
  });

  it('rejects an account that is already deleted', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FOR UPDATE')) {
        return { rows: [{ id: 'user-1', deleted_at: '2026-01-01' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    await expect(deleteUserAccount('user-1')).rejects.toThrow(/already been deleted/);
  });

  it('survives a table that does not exist in this deployment', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FOR UPDATE')) return { rows: [{ id: 'user-1', deleted_at: null }], rowCount: 1 };
      if (text.includes('FROM facility_admins fa')) return { rows: [], rowCount: 0 };
      if (text.includes('DELETE FROM player_level_group_members')) {
        const error: Error & { code?: string } = new Error('relation does not exist');
        error.code = '42P01';
        throw error;
      }
      if (text.includes('UPDATE users')) return { rows: [{ deletedAt: 'ts' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await expect(deleteUserAccount('user-1')).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('lets a real database error abort the whole deletion', async () => {
    // A partial deletion is the one outcome worse than a failed request.
    clientQueryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FOR UPDATE')) return { rows: [{ id: 'user-1', deleted_at: null }], rowCount: 1 };
      if (text.includes('FROM facility_admins fa')) return { rows: [], rowCount: 0 };
      if (text.includes('DELETE FROM messages')) {
        const error: Error & { code?: string } = new Error('deadlock detected');
        error.code = '40P01';
        throw error;
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(deleteUserAccount('user-1')).rejects.toThrow('deadlock detected');
    expect(sqlMatching(/UPDATE users/)).toHaveLength(0);
  });
});
