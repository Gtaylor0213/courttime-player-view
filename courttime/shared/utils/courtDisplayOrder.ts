/**
 * Shared ordering for court lists: ascending by court family number, with split
 * (child) courts immediately after their parent (e.g. … 4, 5, 5a, 5b, 6 …).
 *
 * When a facility has both pickleball and non-pickleball courts (e.g. tennis)
 * and no split *hierarchy* (no rows with a parent court id), non-pickleball
 * courts are listed first, then all pickleball courts — each block still sorted
 * by number / parent-child order.
 *
 * Note: `is_split_court` means "can be split", not "has child courts"; we only
 * skip this grouping when at least one court is a split *child* (has parent).
 */

export interface CourtSortable {
  id: string;
  name?: string;
  courtNumber?: number | string;
  courtType?: string;
  type?: string;
  parentCourtId?: string | null;
  isSplitCourt?: boolean;
  /** Raw SQL / support API rows */
  court_number?: number | string;
  court_type?: string;
  parent_court_id?: string | null;
  is_split_court?: boolean;
}

const NULL_UUID_RE = /^0{8}-0000-0000-0000-000000000000$/i;

function getNumericCourtNumber(c: CourtSortable): number | undefined {
  const raw = c.courtNumber ?? c.court_number;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function parseTrailingCourtName(name: string): { base: number; suffix: string } | null {
  const m = name.trim().match(/(\d+)([a-zA-Z]*)$/);
  if (!m) return null;
  return { base: parseInt(m[1], 10), suffix: (m[2] || '').toLowerCase() };
}

function parentId(c: CourtSortable): string | null {
  const pid = c.parentCourtId ?? c.parent_court_id;
  if (pid == null || pid === '') return null;
  const s = String(pid);
  if (NULL_UUID_RE.test(s)) return null;
  return s;
}

/** Normalize sport label from any API / row shape (camelCase or snake_case). */
function normalizedTypeRaw(c: CourtSortable): string {
  const raw = c.courtType ?? c.court_type ?? c.type ?? '';
  if (raw == null) return '';
  return String(raw).toLowerCase().trim();
}

/** Pickleball (and variants) sort after tennis / dual / other when grouping applies. */
function isPickleballCourt(c: CourtSortable): boolean {
  const t = normalizedTypeRaw(c);
  if (t.includes('pickle')) return true;
  if (t === 'pb' || t === 'pball') return true;

  const name = String(c.name || '').toLowerCase();
  if (name.includes('pickle')) return true;
  if (/(^|[^a-z0-9])pb([^a-z0-9]|$)/i.test(name)) return true;

  // Dual line explicitly named for pickleball
  if (t === 'dual' && (name.includes('pickle') || /(^|[^a-z0-9])pb([^a-z0-9]|$)/i.test(name))) return true;

  return false;
}

/** True only when the list includes split *children* (linked to a parent). Parents may have `is_split_court` set merely meaning "can split", which must not disable tennis/pickleball grouping. */
function hasSplitCourtHierarchy(courts: CourtSortable[]): boolean {
  return courts.some((c) => parentId(c));
}

/**
 * True when the list mixes pickleball with other court types and has no split parents/children.
 * In that case we show all non-pickleball courts first, then all pickleball courts.
 */
function shouldGroupNonPickleballThenPickleball(courts: CourtSortable[]): boolean {
  if (courts.length < 2) return false;
  if (hasSplitCourtHierarchy(courts)) return false;
  let hasPickle = false;
  let hasNonPickle = false;
  for (const c of courts) {
    if (isPickleballCourt(c)) hasPickle = true;
    else hasNonPickle = true;
  }
  return hasPickle && hasNonPickle;
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
  courts.forEach((c, index) => {
    const idKey = c.id != null && String(c.id) !== '' ? String(c.id) : `__row_${index}`;
    byId.set(idKey, c);
  });
  const groupBySport = shouldGroupNonPickleballThenPickleball(courts);
  return [...courts].sort((a, b) => {
    if (groupBySport) {
      const ta = isPickleballCourt(a) ? 1 : 0;
      const tb = isPickleballCourt(b) ? 1 : 0;
      if (ta !== tb) return ta - tb;
    }
    return compareKeys(sortKey(a, byId), sortKey(b, byId));
  });
}
