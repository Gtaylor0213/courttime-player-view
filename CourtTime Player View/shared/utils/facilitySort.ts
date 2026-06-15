/** Resolve display name from facility objects that use `name` or `facilityName`. */
export function facilityDisplayName(item: {
  name?: unknown;
  facilityName?: unknown;
}): string {
  return String(item.facilityName ?? item.name ?? '').trim();
}

/** Sort facilities alphabetically by name (case-insensitive). */
export function sortFacilitiesByName<T extends { name?: unknown; facilityName?: unknown }>(
  facilities: T[],
): T[] {
  return [...facilities].sort((a, b) =>
    facilityDisplayName(a).localeCompare(facilityDisplayName(b), undefined, {
      sensitivity: 'base',
    }),
  );
}
