/**
 * Address-based household grouping — the same client-side logic as web's
 * HouseholdManagement: members sharing a street address form a household;
 * members with no address are listed individually as "ungrouped".
 */
export interface HouseholdMember {
  userId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  status?: string;
  membershipType?: string | null;
  isFacilityAdmin: boolean;
}
export interface HouseholdRecord {
  id: string;
  address: string;
  lastNames: string[];
  members: HouseholdMember[];
  isUngrouped: boolean;
}

export function groupMembersIntoHouseholds(
  members: Array<{ userId: string; fullName?: string | null; email?: string | null; streetAddress?: string | null; status?: string; membershipType?: string | null; isFacilityAdmin?: boolean }>
): HouseholdRecord[] {
  const grouped = new Map<string, HouseholdRecord>();
  for (const member of members) {
    const address = (member.streetAddress || '').trim();
    const fullName = (member.fullName || '').trim();
    const parsedLastName = fullName.split(' ').slice(1).join(' ').trim();
    const key = address ? address.toLowerCase() : `__ungrouped:${member.userId}`;
    if (!grouped.has(key)) {
      grouped.set(key, { id: key, address: address || 'No address on file', lastNames: [], members: [], isUngrouped: !address });
    }
    const household = grouped.get(key)!;
    if (parsedLastName && !household.lastNames.includes(parsedLastName)) household.lastNames.push(parsedLastName);
    household.members.push({
      userId: member.userId,
      firstName: fullName.split(' ')[0] || '',
      lastName: parsedLastName,
      fullName,
      email: member.email || '',
      status: member.status,
      membershipType: member.membershipType,
      isFacilityAdmin: Boolean(member.isFacilityAdmin),
    });
  }
  return Array.from(grouped.values()).sort((a, b) => {
    if (a.isUngrouped !== b.isUngrouped) return a.isUngrouped ? 1 : -1;
    if (a.isUngrouped) return (a.members[0]?.fullName || a.members[0]?.email || '').localeCompare(b.members[0]?.fullName || b.members[0]?.email || '');
    return a.address.localeCompare(b.address) || (a.lastNames[0] || '').localeCompare(b.lastNames[0] || '');
  });
}

export function filterHouseholds(households: HouseholdRecord[], term: string): HouseholdRecord[] {
  const q = term.trim().toLowerCase();
  if (!q) return households;
  return households.filter(
    (h) =>
      h.address.toLowerCase().includes(q) ||
      h.lastNames.some((l) => l.toLowerCase().includes(q)) ||
      h.members.some((m) => m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
  );
}
