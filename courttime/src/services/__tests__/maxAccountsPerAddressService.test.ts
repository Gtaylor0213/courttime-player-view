import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import {
  checkMaxAccountsPerAddressAllowed,
  getAccountCountAtStreetAddress,
  getMaxAccountsPerAddressConfig,
} from '../maxAccountsPerAddressService';

describe('maxAccountsPerAddressService', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  describe('getMaxAccountsPerAddressConfig', () => {
    it('loads enabled limit from facility_rule_configs (HH-001)', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ isEnabled: true, ruleConfig: { max_members: 4 } }],
      });

      const config = await getMaxAccountsPerAddressConfig('facility-1');

      expect(config).toEqual({ enabled: true, maxMembers: 4 });
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("brd.rule_code = 'HH-001'"),
        ['facility-1']
      );
    });

    it('falls back to facilities.booking_rules when engine row missing', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              bookingRules: JSON.stringify({
                householdMaxMembersEnabled: true,
                householdMaxMembers: '5',
              }),
            },
          ],
        });

      const config = await getMaxAccountsPerAddressConfig('facility-2');

      expect(config).toEqual({ enabled: true, maxMembers: 5 });
    });

    it('returns unlimited when rule is off', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              bookingRules: {
                householdMaxMembersEnabled: false,
                householdMaxMembers: '4',
              },
            },
          ],
        });

      const config = await getMaxAccountsPerAddressConfig('facility-3');

      expect(config).toEqual({ enabled: false, maxMembers: null });
    });
  });

  describe('getAccountCountAtStreetAddress', () => {
    it('counts active and pending members at the same street address', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: '4' }] });

      const count = await getAccountCountAtStreetAddress(
        'facility-1',
        '123 Main St',
        'user-new'
      );

      expect(count).toBe(4);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("fm.status IN ('active', 'pending')"),
        ['facility-1', '123 Main St', 'user-new']
      );
    });
  });

  describe('checkMaxAccountsPerAddressAllowed', () => {
    it('allows join when under the limit', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ isEnabled: true, ruleConfig: { max_members: 4 } }],
        })
        .mockResolvedValueOnce({
          rows: [{ streetAddress: '123 Main St' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const result = await checkMaxAccountsPerAddressAllowed('facility-1', 'user-new');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(3);
      expect(result.max).toBe(4);
    });

    it('blocks join when address is at capacity', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ isEnabled: true, ruleConfig: { max_members: 4 } }],
        })
        .mockResolvedValueOnce({
          rows: [{ streetAddress: '123 Main St' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '4' }] });

      const result = await checkMaxAccountsPerAddressAllowed('facility-1', 'user-fifth');

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(4);
      expect(result.max).toBe(4);
      expect(result.message).toBe("You've hit the max number of accounts under this address.");
    });

    it('allows join when rule is disabled (unlimited)', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [
          {
            bookingRules: { householdMaxMembersEnabled: false },
          },
        ],
      });

      const result = await checkMaxAccountsPerAddressAllowed('facility-1', 'user-any');

      expect(result.allowed).toBe(true);
      expect(queryMock).toHaveBeenCalledTimes(2);
    });

    it('allows join when user has no street address on file', async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ isEnabled: true, ruleConfig: { max_members: 2 } }],
        })
        .mockResolvedValueOnce({ rows: [{ streetAddress: '' }] });

      const result = await checkMaxAccountsPerAddressAllowed('facility-1', 'user-no-address');

      expect(result.allowed).toBe(true);
    });
  });
});
