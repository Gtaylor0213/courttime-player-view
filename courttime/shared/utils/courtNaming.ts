/** Sentinel while the court number field is empty during editing. */
export const EMPTY_COURT_NUMBER_DRAFT = -1;

/** Standard display name for a court number (e.g. 3 → "Court 3"). */
export function formatStandardCourtName(courtNumber: number): string {
  return `Court ${courtNumber}`;
}

export function isCourtNumberEmpty(courtNumber: number): boolean {
  return courtNumber === EMPTY_COURT_NUMBER_DRAFT;
}

/** Value for the court number text input (blank while the user is clearing the field). */
export function courtNumberInputDisplayValue(courtNumber: number): string {
  return isCourtNumberEmpty(courtNumber) ? '' : String(courtNumber);
}

/**
 * Parse raw court number field input. Empty string is allowed while typing.
 * Non-numeric input is ignored (returns null).
 */
export function parseCourtNumberInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return EMPTY_COURT_NUMBER_DRAFT;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

/** Apply a court number field edit (free text while typing). */
export function courtFieldsAfterNumberInputChange(
  raw: string,
  currentName: string
): { name: string; courtNumber: number } {
  const parsed = parseCourtNumberInput(raw);
  if (parsed === null) {
    return { courtNumber: EMPTY_COURT_NUMBER_DRAFT, name: currentName };
  }
  return courtFieldsAfterNumberChange(parsed, currentName);
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
  if (isCourtNumberEmpty(courtNumber)) {
    return { courtNumber: EMPTY_COURT_NUMBER_DRAFT, name: currentName };
  }
  const num = Math.floor(courtNumber);
  if (Number.isNaN(num)) {
    return { courtNumber: EMPTY_COURT_NUMBER_DRAFT, name: currentName };
  }
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

/** True when the court surface is clay (handles "Clay", "Clay Court", etc.). */
export function isClayCourtSurface(surfaceType: string | null | undefined): boolean {
  return String(surfaceType ?? '').trim().toLowerCase().includes('clay');
}

/** Subtitle under the court name on booking calendars (type + optional clay + walk-up). */
export function formatCourtCalendarSubtitle(options: {
  typeLabel: string;
  surfaceType?: string | null;
  isWalkUp?: boolean;
}): string {
  const base = String(options.typeLabel ?? '').trim() || 'Tennis';
  let text = isClayCourtSurface(options.surfaceType) ? `${base} · Clay` : base;
  if (options.isWalkUp) {
    text = `${text} - Walk-up`;
  }
  return text;
}

/** Name is free text for calendar display; court number stays independent. */
export function courtFieldsAfterNameChange(
  name: string,
  currentCourtNumber: number
): { name: string; courtNumber: number } {
  // Preserve spaces while typing (e.g. "Court " before "1"); trim on save via normalizeCourtNameAndNumber.
  return { name, courtNumber: currentCourtNumber };
}

/** Before save: default empty name only; never overwrite a custom label. */
export function normalizeCourtNameAndNumber(input: {
  name: string;
  courtNumber: number;
}): { name: string; courtNumber: number } {
  const courtNumber = isCourtNumberEmpty(input.courtNumber)
    ? EMPTY_COURT_NUMBER_DRAFT
    : Math.floor(input.courtNumber);
  const trimmed = (input.name || '').trim();
  return {
    courtNumber,
    name: trimmed || formatStandardCourtName(courtNumber),
  };
}
