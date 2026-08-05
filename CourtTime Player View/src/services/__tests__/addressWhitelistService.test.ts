import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const issueInviteMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../memberSetupInviteService', async () => {
  const actual = await vi.importActual<typeof import('../memberSetupInviteService')>(
    '../memberSetupInviteService'
  );
  return {
    ...actual,
    issueSetupInviteForWhitelistRow: (...args: unknown[]) => issueInviteMock(...args),
  };
});

import { bulkAddWhitelistedAddresses } from '../addressWhitelistService';

/** Route the mocked query by statement type so tests can script insert/lookup results. */
function mockQueries(options: {
  insert?: (email: string | null) => Array<{ id: string; email: string | null }>;
  existing?: Array<{ id: string; acceptedAt: string | null }>;
}) {
  queryMock.mockImplementation((sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO address_whitelist')) {
      const email = (params[4] ?? null) as string | null;
      return Promise.resolve({ rows: options.insert ? options.insert(email) : [] });
    }
    if (sql.includes('SELECT id, setup_invite_accepted_at')) {
      return Promise.resolve({ rows: options.existing ?? [] });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('bulkAddWhitelistedAddresses', () => {
  beforeEach(() => {
    queryMock.mockReset();
    issueInviteMock.mockReset();
    issueInviteMock.mockResolvedValue(true);
  });

  it('queues one invite per new row with an email', async () => {
    mockQueries({ insert: (email) => [{ id: 'w1', email }] });

    const result = await bulkAddWhitelistedAddresses('fac-1', [
      { address: '1 Main St', lastName: 'Smith', email: 'a@club.com' },
    ]);

    expect(result).toMatchObject({ success: true, added: 1, invitesQueued: 1, resent: 0 });
  });

  it('does not queue an invite for rows without an email', async () => {
    mockQueries({ insert: (email) => [{ id: 'w1', email }] });

    const result = await bulkAddWhitelistedAddresses('fac-1', [
      { address: '1 Main St', lastName: 'Smith' },
    ]);

    expect(result).toMatchObject({ added: 1, invitesQueued: 0 });
  });

  // Regression: the same email listed twice in one spreadsheet must only ever
  // produce a single invite. Issuing two would overwrite the first token and
  // leave the recipient's first email pointing at a dead link.
  it('sends only one invite when the same email appears twice in one file', async () => {
    mockQueries({
      insert: (email) => [{ id: 'w1', email }],
      existing: [{ id: 'w1', acceptedAt: null }],
    });

    const result = await bulkAddWhitelistedAddresses('fac-1', [
      { address: '1 Main St', lastName: 'Smith', email: 'dupe@club.com' },
      { address: '2 Oak Ave', lastName: 'Smith', email: 'DUPE@club.com' },
    ]);

    expect(result.invitesQueued).toBe(1);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('resends to an existing member who has not joined yet', async () => {
    mockQueries({
      insert: () => [],
      existing: [{ id: 'w9', acceptedAt: null }],
    });

    const result = await bulkAddWhitelistedAddresses('fac-1', [
      { address: '1 Main St', lastName: 'Smith', email: 'pending@club.com' },
    ]);

    expect(result).toMatchObject({ added: 0, resent: 1, invitesQueued: 1 });
  });

  it('does not resend to a member who has already joined', async () => {
    mockQueries({
      insert: () => [],
      existing: [{ id: 'w9', acceptedAt: '2026-01-01T00:00:00Z' }],
    });

    const result = await bulkAddWhitelistedAddresses('fac-1', [
      { address: '1 Main St', lastName: 'Smith', email: 'joined@club.com' },
    ]);

    expect(result).toMatchObject({ added: 0, resent: 0, invitesQueued: 0, skipped: 1 });
  });
});
