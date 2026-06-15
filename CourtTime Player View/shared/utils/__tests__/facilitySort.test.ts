import { sortFacilitiesByName } from '../facilitySort';

describe('sortFacilitiesByName', () => {
  it('sorts by name case-insensitively', () => {
    const input = [
      { id: '3', name: 'Zebra Club' },
      { id: '1', name: 'apple club' },
      { id: '2', name: 'Beta Club' },
    ];
    expect(sortFacilitiesByName(input).map((f) => f.name)).toEqual([
      'apple club',
      'Beta Club',
      'Zebra Club',
    ]);
  });

  it('sorts by facilityName when present', () => {
    const input = [
      { facilityId: '2', facilityName: 'Meadow Tennis' },
      { facilityId: '1', facilityName: 'Alpine Courts' },
    ];
    expect(sortFacilitiesByName(input).map((f) => f.facilityName)).toEqual([
      'Alpine Courts',
      'Meadow Tennis',
    ]);
  });
});
