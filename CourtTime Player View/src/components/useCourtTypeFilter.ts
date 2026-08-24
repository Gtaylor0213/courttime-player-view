import { useEffect, useMemo, useState } from 'react';

/** Preferred display order for known sports; unrecognized/custom types append after. */
const KNOWN_ORDER = ['tennis', 'pickleball', 'padel'];

/**
 * Generalizes the court-type filter pattern duplicated across
 * CourtCalendarView/AdminBooking/QuickReservePopup (hasTennisCourts /
 * hasPickleballCourts / hasMultipleCourtTypes + an auto-select effect + a
 * filter memo) so it works for any number of court types, not just two.
 */
export function useCourtTypeFilter<T extends { type: string }>(allCourts: T[]) {
  const courtTypes = useMemo(() => {
    const present = new Set(allCourts.map(c => c.type));
    const known = KNOWN_ORDER.filter(t => present.has(t));
    const other = [...present].filter(t => !KNOWN_ORDER.includes(t)).sort();
    return [...known, ...other];
  }, [allCourts]);

  const [selectedCourtType, setSelectedCourtType] = useState<string | null>(null);

  // Auto-select the only available type, mirroring the prior hasTennisCourts/
  // hasPickleballCourts auto-select behavior for the single-type case.
  useEffect(() => {
    if (courtTypes.length === 1 && selectedCourtType === null) {
      setSelectedCourtType(courtTypes[0]);
    }
  }, [courtTypes, selectedCourtType]);

  const hasMultipleCourtTypes = courtTypes.length > 1;

  const filteredCourts = useMemo(() => {
    if (selectedCourtType === null) return allCourts;
    return allCourts.filter(court => court.type === selectedCourtType);
  }, [allCourts, selectedCourtType]);

  return { courtTypes, selectedCourtType, setSelectedCourtType, hasMultipleCourtTypes, filteredCourts };
}
