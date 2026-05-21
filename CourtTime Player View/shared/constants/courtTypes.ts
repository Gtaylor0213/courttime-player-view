/** Preset court types shown in admin dropdowns (stored value = label). */
export const STANDARD_COURT_TYPE_VALUES = ['Tennis', 'Pickleball', 'Dual Purpose'] as const;

export type StandardCourtType = (typeof STANDARD_COURT_TYPE_VALUES)[number];

/** Select value when the admin chooses a custom label (not stored in DB). */
export const COURT_TYPE_CUSTOM_SELECT = '__custom__';

const STANDARD_SET = new Set<string>(STANDARD_COURT_TYPE_VALUES);

/** Legacy / registration values mapped to the standard Dual Purpose label. */
const DUAL_ALIASES = new Set(['dual', 'dual use', 'dual purpose']);

export function isStandardCourtType(value: string | null | undefined): boolean {
  if (value == null || String(value).trim() === '') return false;
  const trimmed = String(value).trim();
  if (STANDARD_SET.has(trimmed)) return true;
  return DUAL_ALIASES.has(trimmed.toLowerCase());
}

/** Normalize stored court_type to a standard select value, or custom sentinel. */
export function courtTypeSelectValue(stored: string | null | undefined): string {
  if (stored == null || String(stored).trim() === '') return 'Tennis';
  const trimmed = String(stored).trim();
  if (trimmed === 'Dual' || trimmed === 'Dual Use') return 'Dual Purpose';
  if (STANDARD_SET.has(trimmed)) return trimmed;
  return COURT_TYPE_CUSTOM_SELECT;
}

/** Label shown in the custom name field when editing a non-standard type. */
export function courtTypeCustomLabel(stored: string | null | undefined): string {
  if (courtTypeSelectValue(stored) !== COURT_TYPE_CUSTOM_SELECT) return '';
  return String(stored ?? '').trim();
}

/** Resolved value to persist (standard label or trimmed custom name). */
export function resolveCourtTypeForSave(
  selectValue: string,
  customLabel: string
): string {
  if (selectValue !== COURT_TYPE_CUSTOM_SELECT) {
    return selectValue;
  }
  return customLabel.trim();
}

export function validateCourtType(
  selectValue: string,
  customLabel: string
): string | null {
  if (selectValue !== COURT_TYPE_CUSTOM_SELECT) {
    return null;
  }
  const label = customLabel.trim();
  if (!label) {
    return 'Enter a name for the custom court type (e.g. Clubhouse, Volleyball Court).';
  }
  if (label.length > 80) {
    return 'Custom court type must be 80 characters or fewer.';
  }
  return null;
}

/** Validate the value saved on the court row (preset or custom label). */
export function validateStoredCourtType(stored: string | null | undefined): string | null {
  const trimmed = String(stored ?? '').trim();
  if (isStandardCourtType(trimmed)) {
    return null;
  }
  if (trimmed.length > 0) {
    if (trimmed.length > 80) {
      return 'Custom court type must be 80 characters or fewer.';
    }
    return null;
  }
  return 'Enter a name for the custom court type (e.g. Clubhouse, Volleyball Court).';
}
