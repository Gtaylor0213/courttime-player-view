import { filterAndSortMembers, memberLastName } from '../memberListFilter';

const members = [
  { fullName: 'Ann Zimmer', email: 'ann@x.com', status: 'active', streetAddress: '12 Oak Ln', city: 'Reno', state: 'NV', zipCode: '89501', startDate: '2026-03-10' },
  { fullName: 'Bob Adams Jr.', email: 'bob@x.com', status: 'pending', streetAddress: '9 Oak Ln', city: 'Reno', state: 'NV', zipCode: '89501', startDate: '2025-01-05' },
  { fullName: 'Cara de Martin', email: 'cara@x.com', status: 'active', streetAddress: '100 Birch Rd', city: 'Sparks', state: 'NV', zipCode: '89431', startDate: '2026-08-01' },
  { fullName: 'Dev Okafor', email: 'dev@x.com', status: 'active', streetAddress: null, startDate: null },
];

const names = (list: { fullName: string }[]) => list.map((m) => m.fullName);

describe('memberLastName', () => {
  it('uses the last word and skips suffixes', () => {
    expect(memberLastName('Ann Zimmer')).toBe('Zimmer');
    expect(memberLastName('Bob Adams Jr.')).toBe('Adams');
    expect(memberLastName('Cher')).toBe('Cher');
    expect(memberLastName('')).toBe('');
  });
});

describe('filterAndSortMembers', () => {
  it('keeps API order with no filters', () => {
    expect(filterAndSortMembers(members, {})).toEqual(members);
  });

  it('filters by last name prefix', () => {
    expect(names(filterAndSortMembers(members, { lastName: 'ad' }))).toEqual(['Bob Adams Jr.']);
    expect(filterAndSortMembers(members, { lastName: 'ann' })).toEqual([]);
  });

  it('filters by address across street, city, and zip', () => {
    expect(names(filterAndSortMembers(members, { address: 'oak' }))).toEqual(['Ann Zimmer', 'Bob Adams Jr.']);
    expect(names(filterAndSortMembers(members, { address: '89431' }))).toEqual(['Cara de Martin']);
  });

  it('filters by date joined range, inclusive, ignoring incomplete dates', () => {
    expect(names(filterAndSortMembers(members, { joinedFrom: '2026-03-10', joinedTo: '2026-08-01' }))).toEqual([
      'Ann Zimmer',
      'Cara de Martin',
    ]);
    expect(names(filterAndSortMembers(members, { joinedTo: '2025-12-31' }))).toEqual(['Bob Adams Jr.']);
    expect(filterAndSortMembers(members, { joinedFrom: '2026-0' })).toHaveLength(4);
  });

  it('combines with search and status', () => {
    expect(names(filterAndSortMembers(members, { search: 'reno', status: 'active' }))).toEqual(['Ann Zimmer']);
    expect(filterAndSortMembers(members, { status: 'all' })).toHaveLength(4);
  });

  it('sorts by last name', () => {
    expect(names(filterAndSortMembers(members, { sort: 'lastName' }))).toEqual([
      'Bob Adams Jr.',
      'Cara de Martin',
      'Dev Okafor',
      'Ann Zimmer',
    ]);
  });

  it('sorts by street name then house number, blanks last', () => {
    expect(names(filterAndSortMembers(members, { sort: 'address' }))).toEqual([
      'Cara de Martin',
      'Bob Adams Jr.',
      'Ann Zimmer',
      'Dev Okafor',
    ]);
  });

  it('sorts by date joined in both directions, blanks last', () => {
    expect(names(filterAndSortMembers(members, { sort: 'joinedNewest' }))).toEqual([
      'Cara de Martin',
      'Ann Zimmer',
      'Bob Adams Jr.',
      'Dev Okafor',
    ]);
    expect(names(filterAndSortMembers(members, { sort: 'joinedOldest' }))).toEqual([
      'Bob Adams Jr.',
      'Ann Zimmer',
      'Cara de Martin',
      'Dev Okafor',
    ]);
  });

  it('does not mutate the input', () => {
    const copy = [...members];
    filterAndSortMembers(members, { sort: 'lastName' });
    expect(members).toEqual(copy);
  });
});
