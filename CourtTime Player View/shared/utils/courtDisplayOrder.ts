/**
 * Shared ordering for court lists: ascending by court family number, with split
 * (child) courts immediately after their parent (e.g. … 4, 5, 5a, 5b, 6 …).
 */

export interface CourtSortable {
  id: string;
  name?: string;
  courtNumber?: number;
  courtType?: string;
  type?: string;
  parentCourtId?: string | null;
  isSplitCourt?: boolean;
  /** Raw SQL / support API rows */
  court_number?: number;
  court_type?: string;
  parent_court_id?: string | null;
  is_split_court?: boolean;
}

function getNumericCourtNumber(c: CourtSortable): number | undefined {
  const n = c.courtNumber ?? c.court_number;
  return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
}

function parseTrailingCourtName(name: string): { base: number; suffix: string } | null {
  const m = name.trim().match(/(\d+)([a-zA-Z]*)$/);
  if (!m) return null;
  return { base: parseInt(m[1], 10), suffix: (m[2] || '').toLowerCase() };
}

function parentId(c: CourtSortable): string | null {
  const pid = c.parentCourtId ?? c.parent_court_id;
  return pid != null && pid !== '' ? String(pid) : null;
}

function baseNumber(c: CourtSortable, byId: Map<string, CourtSortable>): number {
  const pid = parentId(c);
  if (pid) {
    const parent = byId.get(pid);
    const pn = parent && getNumericCourtNumber(parent);
    if (pn !== undefined) return pn;
  }
  const parsed = c.name ? parseTrailingCourtName(c.name) : null;
  if (parsed) return parsed.base;
  const n = getNumericCourtNumber(c);
  return n ?? 9999;
}

/** 0 = parent / standalone; 1 = split child (immediately after parent for same base) */
function variantTier(c: CourtSortable): number {
  return parentId(c) ? 1 : 0;
}

function nameSuffixForSort(c: CourtSortable): string {
  const parsed = c.name ? parseTrailingCourtName(c.name) : null;
  if (parsed) return parsed.suffix;
  return '';
}

function sortKey(
  c: CourtSortable,
  byId: Map<string, CourtSortable>
): [number, number, string, string] {
  return [
    baseNumber(c, byId),
    variantTier(c),
    nameSuffixForSort(c),
    String(c.id),
  ];
}

function compareKeys(
  a: [number, number, string, string],
  b: [number, number, string, string]
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a[3].localeCompare(b[3]);
}

/** Non-mutating sort for any court-like objects returned from APIs or UI state. */
export function sortCourtsForDisplay<T extends CourtSortable>(courts: T[]): T[] {
  const byId = new Map<string, CourtSortable>();
  for (const c of courts) {
    byId.set(String(c.id), c);
  }
  return [...courts].sort((a, b) =>
    compareKeys(sortKey(a, byId), sortKey(b, byId))
  );
}
