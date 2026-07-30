import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const clientQueryMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  // Run the callback against a stub client; the real helper only adds
  // BEGIN/COMMIT, which these tests don't assert on.
  transaction: (callback: (client: { query: typeof clientQueryMock }) => unknown) =>
    callback({ query: clientQueryMock }),
}));

import {
  PlayerLevelGroupError,
  assignMembers,
  getBoard,
  reorderGroups,
} from '../playerLevelGroupService';

/** Finds the call whose SQL contains `fragment`, so tests don't depend on call order. */
function callWith(mock: typeof clientQueryMock, fragment: string) {
  const call = mock.mock.calls.find(([sql]) => String(sql).includes(fragment));
  if (!call) throw new Error(`No query containing "${fragment}"`);
  return { sql: String(call[0]), params: call[1] as any[] };
}

/** Mocks the membership check to report every requested id as active. */
function allMembersActive() {
  clientQueryMock.mockImplementationOnce((_sql: string, params: any[]) => ({
    rows: params[1].map((userId: string) => ({ user_id: userId })),
  }));
}

describe('playerLevelGroupService', () => {
  beforeEach(() => {
    queryMock.mockReset();
    clientQueryMock.mockReset();
  });

  describe('getBoard', () => {
    it('buckets roster rows into their tiers and leaves the rest unassigned', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            { id: 'g1', name: '4.0', sortPosition: 0, isVisibleToPlayers: true },
            { id: 'g2', name: '3.5', sortPosition: 1, isVisibleToPlayers: false },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { userId: 'u1', fullName: 'Ava', skillLevel: '4.0', isFacilityAdmin: false, groupId: 'g1', memberSortPosition: 0 },
            { userId: 'u2', fullName: 'Ben', skillLevel: null, isFacilityAdmin: true, groupId: 'g1', memberSortPosition: 1 },
            { userId: 'u3', fullName: 'Cy', skillLevel: '3.5', isFacilityAdmin: false, groupId: 'g2', memberSortPosition: 0 },
            { userId: 'u4', fullName: 'Dee', skillLevel: null, isFacilityAdmin: false, groupId: null, memberSortPosition: null },
          ],
        });

      const board = await getBoard('fac-1');

      expect(board.groups.map((group) => group.id)).toEqual(['g1', 'g2']);
      expect(board.groups[0].members.map((m) => m.userId)).toEqual(['u1', 'u2']);
      expect(board.groups[1].members.map((m) => m.userId)).toEqual(['u3']);
      expect(board.unassigned.map((m) => m.userId)).toEqual(['u4']);
      expect(board.groups[0].isVisibleToPlayers).toBe(true);
      expect(board.groups[1].isVisibleToPlayers).toBe(false);
    });

    it('reports a tier with no members as empty rather than omitting it', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: 'g1', name: '4.0', sortPosition: 0, isVisibleToPlayers: false }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const board = await getBoard('fac-1');

      expect(board.groups[0].members).toEqual([]);
      expect(board.unassigned).toEqual([]);
    });
  });

  describe('assignMembers', () => {
    it('renumbers the tier with the moved player inserted at the requested position', async () => {
      allMembersActive();
      clientQueryMock
        .mockResolvedValueOnce({ rows: [{ id: 'g1' }] }) // group belongs to facility
        .mockResolvedValueOnce({ rows: [] }) // clear prior assignments
        .mockResolvedValueOnce({ rows: [{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'c' }] })
        .mockResolvedValueOnce({ rows: [] }) // insert
        .mockResolvedValueOnce({ rows: [] }); // renumber

      await assignMembers('fac-1', {
        groupId: 'g1',
        userIds: ['new'],
        position: 1,
        addedBy: 'admin-1',
      });

      const renumber = callWith(clientQueryMock, 'SET sort_position = v.pos');
      expect(renumber.params[1]).toEqual(['a', 'new', 'b', 'c']);
      expect(renumber.params[2]).toEqual([0, 1, 2, 3]);
    });

    it('appends when no position is given and clamps a position past the end', async () => {
      const run = async (position?: number) => {
        clientQueryMock.mockReset();
        allMembersActive();
        clientQueryMock
          .mockResolvedValueOnce({ rows: [{ id: 'g1' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ user_id: 'a' }, { user_id: 'b' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        await assignMembers('fac-1', {
          groupId: 'g1',
          userIds: ['new'],
          position,
          addedBy: 'admin-1',
        });
        return callWith(clientQueryMock, 'SET sort_position = v.pos').params[1];
      };

      expect(await run(undefined)).toEqual(['a', 'b', 'new']);
      expect(await run(99)).toEqual(['a', 'b', 'new']);
    });

    it('keeps multi-player moves in the order they were given', async () => {
      allMembersActive();
      clientQueryMock
        .mockResolvedValueOnce({ rows: [{ id: 'g1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ user_id: 'a' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await assignMembers('fac-1', {
        groupId: 'g1',
        userIds: ['x', 'y', 'z'],
        position: 0,
        addedBy: 'admin-1',
      });

      expect(callWith(clientQueryMock, 'SET sort_position = v.pos').params[1]).toEqual([
        'x',
        'y',
        'z',
        'a',
      ]);
    });

    it('unassigns without inserting when groupId is null', async () => {
      allMembersActive();
      clientQueryMock.mockResolvedValueOnce({ rows: [] }); // delete

      await assignMembers('fac-1', { groupId: null, userIds: ['a'], addedBy: 'admin-1' });

      expect(callWith(clientQueryMock, 'DELETE FROM player_level_group_members').params).toEqual([
        'fac-1',
        ['a'],
      ]);
      expect(
        clientQueryMock.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO player_level_group_members')
        )
      ).toBe(false);
    });

    it('rejects players who are not active members of the facility', async () => {
      clientQueryMock.mockResolvedValueOnce({ rows: [{ user_id: 'a' }] }); // only 1 of 2

      await expect(
        assignMembers('fac-1', { groupId: 'g1', userIds: ['a', 'outsider'], addedBy: 'admin-1' })
      ).rejects.toMatchObject({ status: 403 });
    });

    it('rejects a tier that belongs to another facility', async () => {
      allMembersActive();
      clientQueryMock.mockResolvedValueOnce({ rows: [] }); // group lookup misses

      await expect(
        assignMembers('fac-1', { groupId: 'other-facility-group', userIds: ['a'], addedBy: 'admin-1' })
      ).rejects.toMatchObject({ status: 404 });
    });

    it('requires at least one player', async () => {
      await expect(
        assignMembers('fac-1', { groupId: 'g1', userIds: [], addedBy: 'admin-1' })
      ).rejects.toBeInstanceOf(PlayerLevelGroupError);
      expect(clientQueryMock).not.toHaveBeenCalled();
    });
  });

  describe('reorderGroups', () => {
    it('writes positions in the order given', async () => {
      clientQueryMock
        .mockResolvedValueOnce({ rows: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await reorderGroups('fac-1', ['g3', 'g1', 'g2']);

      const update = callWith(clientQueryMock, 'UPDATE player_level_groups');
      expect(update.params[0]).toEqual(['g3', 'g1', 'g2']);
      expect(update.params[1]).toEqual([0, 1, 2]);
    });

    it('refuses a stale order that is missing a tier', async () => {
      clientQueryMock.mockResolvedValueOnce({ rows: [{ id: 'g1' }, { id: 'g2' }] });

      await expect(reorderGroups('fac-1', ['g1'])).rejects.toMatchObject({ status: 409 });
    });

    it('refuses an order naming a tier from another facility', async () => {
      clientQueryMock.mockResolvedValueOnce({ rows: [{ id: 'g1' }, { id: 'g2' }] });

      await expect(reorderGroups('fac-1', ['g1', 'intruder'])).rejects.toMatchObject({
        status: 409,
      });
    });
  });
});
