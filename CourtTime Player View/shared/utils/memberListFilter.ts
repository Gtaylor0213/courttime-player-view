/** Filtering and sorting for the admin member list (web Member Management + app Admin Members). */

export interface MemberListRow {
  fullName?: string | null;
  email?: string | null;
  status?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  /** Membership start date, `YYYY-MM-DD`. */
  startDate?: string | null;
}

export type MemberSortKey = 'default' | 'lastName' | 'address' | 'joinedNewest' | 'joinedOldest';

export const MEMBER_SORT_OPTIONS: { value: MemberSortKey; label: string }[] = [
  { value: 'default', label: 'Recently added' },
  { value: 'lastName', label: 'Last name (A–Z)' },
  { value: 'address', label: 'Address' },
  { value: 'joinedNewest', label: 'Date joined (newest)' },
  { value: 'joinedOldest', label: 'Date joined (oldest)' },
];

export interface MemberListFilters {
  /** Free-text match on name, email, or address. */
  search?: string;
  /** `all` (or empty) matches every status. */
  status?: string;
  /** Matches the start of the member's last name. */
  lastName?: string;
  /** Matches anywhere in street, city, state, or zip. */
  address?: string;
  /** Inclusive `YYYY-MM-DD` bounds on the date joined. */
  joinedFrom?: string;
  joinedTo?: string;
  sort?: MemberSortKey;
}

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLLATE: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };

/** Last word of the full name, skipping suffixes like "Jr." or "III". */
export function memberLastName(fullName?: string | null): string {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1].replace(/\./g, '').toLowerCase())) {
    parts.pop();
  }
  return (parts[parts.length - 1] ?? '').replace(/,$/, '');
}

export function memberAddressText(member: MemberListRow): string {
  return [member.streetAddress, member.city, member.state, member.zipCode]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/** `YYYY-MM-DD` portion of the date joined, or '' when missing. */
function joinedDay(member: MemberListRow): string {
  return String(member.startDate ?? '').slice(0, 10);
}

/** Street name first, then house number, so neighbours on a street sort together. */
function compareAddress(a: MemberListRow, b: MemberListRow): number {
  const split = (m: MemberListRow) => {
    const street = String(m.streetAddress ?? '').trim();
    const match = street.match(/^(\d+\S*)\s+(.*)$/);
    return match ? { name: match[2], number: match[1] } : { name: street, number: '' };
  };
  const sa = split(a);
  const sb = split(b);
  return (
    sa.name.localeCompare(sb.name, undefined, COLLATE) ||
    sa.number.localeCompare(sb.number, undefined, COLLATE) ||
    memberAddressText(a).localeCompare(memberAddressText(b), undefined, COLLATE)
  );
}

function compareName(a: MemberListRow, b: MemberListRow): number {
  return (
    memberLastName(a.fullName).localeCompare(memberLastName(b.fullName), undefined, COLLATE) ||
    String(a.fullName ?? '').localeCompare(String(b.fullName ?? ''), undefined, COLLATE)
  );
}

/** Rows missing the sorted-on value go last regardless of direction. */
function blanksLast<T>(a: T, b: T, value: (row: T) => string, compare: (a: T, b: T) => number): number {
  const blankA = !value(a);
  const blankB = !value(b);
  if (blankA || blankB) return Number(blankA) - Number(blankB);
  return compare(a, b);
}

export function filterAndSortMembers<T extends MemberListRow>(members: T[], filters: MemberListFilters): T[] {
  const search = (filters.search ?? '').trim().toLowerCase();
  const status = filters.status && filters.status !== 'all' ? filters.status : '';
  const lastName = (filters.lastName ?? '').trim().toLowerCase();
  const address = (filters.address ?? '').trim().toLowerCase();
  // Ignore half-typed dates so the list doesn't empty out while the admin is typing.
  const joinedFrom = ISO_DATE.test(filters.joinedFrom ?? '') ? filters.joinedFrom! : '';
  const joinedTo = ISO_DATE.test(filters.joinedTo ?? '') ? filters.joinedTo! : '';

  const result = members.filter((member) => {
    if (status && member.status !== status) return false;
    if (search) {
      const haystack = `${member.fullName ?? ''} ${member.email ?? ''} ${memberAddressText(member)}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (lastName && !memberLastName(member.fullName).toLowerCase().startsWith(lastName)) return false;
    if (address && !memberAddressText(member).toLowerCase().includes(address)) return false;
    if (joinedFrom || joinedTo) {
      const joined = joinedDay(member);
      if (!joined) return false;
      if (joinedFrom && joined < joinedFrom) return false;
      if (joinedTo && joined > joinedTo) return false;
    }
    return true;
  });

  switch (filters.sort) {
    case 'lastName':
      return result.sort((a, b) => blanksLast(a, b, (m) => memberLastName(m.fullName), compareName));
    case 'address':
      return result.sort(
        (a, b) => blanksLast(a, b, (m) => String(m.streetAddress ?? '').trim(), compareAddress) || compareName(a, b),
      );
    case 'joinedNewest':
      return result.sort(
        (a, b) => blanksLast(a, b, joinedDay, (x, y) => joinedDay(y).localeCompare(joinedDay(x))) || compareName(a, b),
      );
    case 'joinedOldest':
      return result.sort(
        (a, b) => blanksLast(a, b, joinedDay, (x, y) => joinedDay(x).localeCompare(joinedDay(y))) || compareName(a, b),
      );
    default:
      return result;
  }
}
