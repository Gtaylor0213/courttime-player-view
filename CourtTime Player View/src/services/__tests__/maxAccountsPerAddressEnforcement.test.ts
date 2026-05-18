import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const checkLimitMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock('../maxAccountsPerAddressService', () => ({
  checkMaxAccountsPerAddressAllowed: (...args: unknown[]) => checkLimitMock(...args),
}));

vi.mock('../membershipRequestAdminNotify', () => ({
  notifyFacilityAdminsOfMembershipRequest: vi.fn().mockResolvedValue(undefined),
}));

import { addUserToFacility } from '../authService';
import { updateMemberMembership } from '../memberService';
import { requestFacilityMembership } from '../playerProfileService';

describe('max accounts per address enforcement on join paths', () => {
  beforeEach(() => {
    queryMock.mockReset();
    checkLimitMock.mockReset();
  });

  describe('addUserToFacility', () => {
    it('throws before inserting membership when address is at capacity', async () => {
      checkLimitMock.mockResolvedValue({
        allowed: false,
        message:
          'This address has reached the maximum number of accounts allowed. You cannot join this facility with this address. (4/4 accounts at this address).',
        current: 4,
        max: 4,
      });

      await expect(addUserToFacility('user-5', 'facility-1')).rejects.toThrow(
        'maximum number of accounts'
      );

      expect(checkLimitMock).toHaveBeenCalledWith('facility-1', 'user-5');
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('inserts membership when under the limit', async () => {
      checkLimitMock.mockResolvedValue({ allowed: true, current: 2, max: 4 });
      queryMock
        .mockResolvedValueOnce({
          rows: [{ streetAddress: '123 Main St', lastName: 'Smith' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const ok = await addUserToFacility('user-3', 'facility-1');

      expect(ok).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO facility_memberships'),
        expect.arrayContaining(['user-3', 'facility-1'])
      );
    });
  });

  describe('requestFacilityMembership', () => {
    it('throws before creating a pending request when at capacity', async () => {
      checkLimitMock.mockResolvedValue({
        allowed: false,
        message: 'This address has reached the maximum number of accounts allowed.',
      });
      queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(
        requestFacilityMembership('user-5', 'facility-1', 'Full', true)
      ).rejects.toThrow('maximum number of accounts');

      expect(checkLimitMock).toHaveBeenCalledWith('facility-1', 'user-5');
      const insertCalls = queryMock.mock.calls.filter((call) =>
        String(call[0]).includes('INSERT INTO facility_memberships')
      );
      expect(insertCalls).toHaveLength(0);
    });

    it('creates pending membership when allowed', async () => {
      checkLimitMock.mockResolvedValue({ allowed: true });
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const ok = await requestFacilityMembership('user-2', 'facility-1');

      expect(ok).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO facility_memberships'),
        expect.arrayContaining(['user-2', 'facility-1', 'Full'])
      );
    });
  });

  describe('updateMemberMembership', () => {
    it('blocks admin approval to active when address is at capacity', async () => {
      checkLimitMock.mockResolvedValue({
        allowed: false,
        message: 'This address has reached the maximum number of accounts allowed.',
      });

      await expect(
        updateMemberMembership('facility-1', 'user-5', { status: 'active' })
      ).rejects.toThrow('maximum number of accounts');

      expect(checkLimitMock).toHaveBeenCalledWith('facility-1', 'user-5');
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('does not check limit when status is not active', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });

      const ok = await updateMemberMembership('facility-1', 'user-1', {
        status: 'pending',
      });

      expect(ok).toBe(true);
      expect(checkLimitMock).not.toHaveBeenCalled();
    });

    it('allows admin approval when under the limit', async () => {
      checkLimitMock.mockResolvedValue({ allowed: true });
      queryMock.mockResolvedValueOnce({ rowCount: 1 });

      const ok = await updateMemberMembership('facility-1', 'user-3', {
        status: 'active',
      });

      expect(ok).toBe(true);
      expect(checkLimitMock).toHaveBeenCalledWith('facility-1', 'user-3');
    });
  });
});
