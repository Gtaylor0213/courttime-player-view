/** Standard display name for a court number (e.g. 3 → "Court 3"). */
export function formatStandardCourtName(courtNumber: number): string {
  return `Court ${courtNumber}`;
}

/** Parse names like "Court 3" or "Court 3a". Returns null for custom names. */
export function parseStandardCourtName(
  name: string
): { courtNumber: number; suffix: string } | null {
  const trimmed = name.trim();
  const match = trimmed.match(/^Court\s+(\d+)([a-zA-Z]*)$/i);
  if (!match) return null;
  const courtNumber = parseInt(match[1], 10);
  if (Number.isNaN(courtNumber)) return null;
  return { courtNumber, suffix: match[2] || '' };
}

/** Whether a standard court name encodes the given court number (letter suffix allowed). */
export function courtNameMatchesNumber(name: string, courtNumber: number): boolean {
  const parsed = parseStandardCourtName(name);
  if (!parsed) return false;
  return parsed.courtNumber === courtNumber;
}

function formatCourtNameWithSuffix(courtNumber: number, suffix: string): string {
  return suffix ? `Court ${courtNumber}${suffix}` : formatStandardCourtName(courtNumber);
}

/**
 * When court number changes: update "Court N" style names to match; leave custom names alone.
 */
export function courtFieldsAfterNumberChange(
  courtNumber: number,
  currentName: string
): { name: string; courtNumber: number } {
  const num = Math.max(1, Math.floor(courtNumber) || 1);
  const trimmed = (currentName || '').trim();
  if (!trimmed) {
    return { courtNumber: num, name: formatStandardCourtName(num) };
  }
  const parsed = parseStandardCourtName(trimmed);
  if (parsed) {
    return {
      courtNumber: num,
      name: formatCourtNameWithSuffix(num, parsed.suffix),
    };
  }
  return { courtNumber: num, name: trimmed };
}

/** Name is free text for calendar display; court number stays independent. */
export function courtFieldsAfterNameChange(
  name: string,
  currentCourtNumber: number
): { name: string; courtNumber: number } {
  return { name: name.trim(), courtNumber: currentCourtNumber };
}

/** Before save: default empty name only; never overwrite a custom label. */
export function normalizeCourtNameAndNumber(input: {
  name: string;
  courtNumber: number;
}): { name: string; courtNumber: number } {
  const courtNumber = Math.max(1, Math.floor(input.courtNumber) || 1);
  const trimmed = (input.name || '').trim();
  return {
    courtNumber,
    name: trimmed || formatStandardCourtName(courtNumber),
  };
}
