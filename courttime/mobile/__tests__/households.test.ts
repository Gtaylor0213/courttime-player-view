import { describe, expect, it } from '@jest/globals';
import { filterHouseholds, groupMembersIntoHouseholds } from '../src/utils/households';

const members = [
  { userId: '1', fullName: 'Ann Smith', email: 'a@x.com', streetAddress: '12 Oak St', isFacilityAdmin: false },
  { userId: '2', fullName: 'Bob Smith', email: 'b@x.com', streetAddress: '12 oak st', isFacilityAdmin: true },
  { userId: '3', fullName: 'Cy Jones', email: 'c@x.com', streetAddress: '', isFacilityAdmin: false },
  { userId: '4', fullName: 'Dee Lee', email: 'd@x.com', streetAddress: '3 Pine Ave', isFacilityAdmin: false },
];

describe('groupMembersIntoHouseholds', () => {
  it('groups by address case-insensitively, ungrouped last', () => {
    const hs = groupMembersIntoHouseholds(members);
    expect(hs.map((h) => h.address)).toEqual(['12 Oak St', '3 Pine Ave', 'No address on file']);
    expect(hs[0]!.members.map((m) => m.userId)).toEqual(['1', '2']);
    expect(hs[0]!.lastNames).toEqual(['Smith']);
    expect(hs[2]!.isUngrouped).toBe(true);
  });
  it('filters by address, last name, member name or email', () => {
    const hs = groupMembersIntoHouseholds(members);
    expect(filterHouseholds(hs, 'pine').map((h) => h.address)).toEqual(['3 Pine Ave']);
    expect(filterHouseholds(hs, 'c@x').map((h) => h.address)).toEqual(['No address on file']);
    expect(filterHouseholds(hs, '')).toHaveLength(3);
  });
});
