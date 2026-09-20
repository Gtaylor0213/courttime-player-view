import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import {
  BULK_RECIPIENT_LIMIT,
  DirectMessageError,
  normalizeRecipientIds,
  sendDirectMessageToMany,
  validateMessageText,
} from '../directMessageService';

/** Finds the call whose SQL contains `fragment`, so tests don't depend on call order. */
function callsWith(fragment: string) {
  return queryMock.mock.calls.filter(([sql]) => String(sql).includes(fragment));
}

/**
 * Mocks the whole happy path: everyone active, no existing thread, and one
 * inserted row per send. Order matters — sendDirectMessageToMany runs the
 * membership check once, then a lookup + insert + message insert per recipient.
 */
function mockHappyPath() {
  queryMock.mockImplementation((sql: string, params: any[]) => {
    if (sql.includes('FROM facility_memberships')) {
      return { rows: params[1].map((userId: string) => ({ user_id: userId })) };
    }
    if (sql.includes('FROM conversations')) return { rows: [] };
    if (sql.includes('INSERT INTO conversations')) return { rows: [{ id: `conv-${params[1]}` }] };
    if (sql.includes('INSERT INTO messages')) {
      return { rows: [{ id: `msg-${params[0]}`, conversationId: params[0], messageText: params[2] }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe('directMessageService', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  describe('normalizeRecipientIds', () => {
    it('de-duplicates ids and drops the sender', () => {
      expect(normalizeRecipientIds(['a', 'b', 'a', 'me'], 'me')).toEqual(['a', 'b']);
    });

    it('rejects an empty selection', () => {
      expect(() => normalizeRecipientIds(['me'], 'me')).toThrow(DirectMessageError);
      expect(() => normalizeRecipientIds([], 'me')).toThrow('Select at least one recipient');
      expect(() => normalizeRecipientIds('not-an-array', 'me')).toThrow(DirectMessageError);
    });

    it('rejects more recipients than the cap', () => {
      const tooMany = Array.from({ length: BULK_RECIPIENT_LIMIT + 1 }, (_, i) => `u${i}`);
      expect(() => normalizeRecipientIds(tooMany, 'me')).toThrow(/at most 30 people/);
      expect(normalizeRecipientIds(tooMany.slice(0, BULK_RECIPIENT_LIMIT), 'me')).toHaveLength(
        BULK_RECIPIENT_LIMIT
      );
    });
  });

  describe('validateMessageText', () => {
    it('trims the body', () => {
      expect(validateMessageText('  hi  ')).toBe('hi');
    });

    it('rejects blank or non-string bodies', () => {
      expect(() => validateMessageText('   ')).toThrow('messageText is required');
      expect(() => validateMessageText(undefined)).toThrow(DirectMessageError);
    });
  });

  describe('sendDirectMessageToMany', () => {
    it('gives each recipient their own conversation rather than one shared thread', async () => {
      mockHappyPath();

      const result = await sendDirectMessageToMany({
        facilityId: 'fac-1',
        senderId: 'me',
        recipientIds: ['a', 'b'],
        messageText: '  court at 9?  ',
      });

      expect(result.sent.map((s) => s.recipientId)).toEqual(['a', 'b']);
      expect(new Set(result.sent.map((s) => s.conversationId)).size).toBe(2);
      expect(result.failed).toEqual([]);
      // Trimmed once, then reused verbatim for every recipient.
      expect(result.messageText).toBe('court at 9?');
      expect(callsWith('INSERT INTO messages').map(([, params]) => params[2])).toEqual([
        'court at 9?',
        'court at 9?',
      ]);
    });

    it('checks the sender and every recipient in one membership query', async () => {
      mockHappyPath();

      await sendDirectMessageToMany({
        facilityId: 'fac-1',
        senderId: 'me',
        recipientIds: ['a', 'b'],
        messageText: 'hi',
      });

      const membershipCalls = callsWith('FROM facility_memberships');
      expect(membershipCalls).toHaveLength(1);
      expect(membershipCalls[0][1]).toEqual(['fac-1', ['a', 'b', 'me']]);
    });

    it('writes nothing when a recipient is not an active member', async () => {
      // Only the sender comes back active.
      queryMock.mockResolvedValueOnce({ rows: [{ user_id: 'me' }] });

      await expect(
        sendDirectMessageToMany({
          facilityId: 'fac-1',
          senderId: 'me',
          recipientIds: ['a', 'b'],
          messageText: 'hi',
        })
      ).rejects.toMatchObject({ status: 403 });

      expect(callsWith('INSERT INTO messages')).toHaveLength(0);
    });

    it('reports a single failed recipient without losing the others', async () => {
      queryMock.mockImplementation((sql: string, params: any[]) => {
        if (sql.includes('FROM facility_memberships')) {
          return { rows: params[1].map((userId: string) => ({ user_id: userId })) };
        }
        if (sql.includes('FROM conversations')) {
          if (params[2] === 'b') throw new Error('deadlock detected');
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO conversations')) return { rows: [{ id: `conv-${params[1]}` }] };
        if (sql.includes('INSERT INTO messages')) {
          return { rows: [{ id: 'msg-1', conversationId: params[0], messageText: params[2] }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await sendDirectMessageToMany({
        facilityId: 'fac-1',
        senderId: 'me',
        recipientIds: ['a', 'b', 'c'],
        messageText: 'hi',
      });

      expect(result.sent.map((s) => s.recipientId)).toEqual(['a', 'c']);
      expect(result.failed).toEqual([{ recipientId: 'b', error: 'deadlock detected' }]);
    });

    it('reuses an existing thread instead of opening a second one', async () => {
      queryMock.mockImplementation((sql: string, params: any[]) => {
        if (sql.includes('FROM facility_memberships')) {
          return { rows: params[1].map((userId: string) => ({ user_id: userId })) };
        }
        if (sql.includes('FROM conversations')) return { rows: [{ id: 'existing-conv' }] };
        if (sql.includes('INSERT INTO messages')) {
          return { rows: [{ id: 'msg-1', conversationId: params[0], messageText: params[2] }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await sendDirectMessageToMany({
        facilityId: 'fac-1',
        senderId: 'me',
        recipientIds: ['a'],
        messageText: 'hi',
      });

      expect(result.sent[0].conversationId).toBe('existing-conv');
      expect(callsWith('INSERT INTO conversations')).toHaveLength(0);
    });
  });
});
