/**
 * Canonical facility type options used across registration and admin UI.
 */
export const FACILITY_TYPE_OPTIONS = [
  { value: 'HOA', label: 'HOA' },
  { value: 'Tennis Club', label: 'Tennis Club' },
  { value: 'Tennis Facility', label: 'Tennis Facility' },
  { value: 'Pickleball Club', label: 'Pickleball Club' },
  { value: 'Racquet Club', label: 'Racquet Club' },
  { value: 'Multi-Sport Club', label: 'Multi-Sport Club' },
  { value: 'Public Recreation Facility', label: 'Public Recreation Facility' },
  { value: 'Recreation Center', label: 'Recreation Center' },
  { value: 'Private Sports Club', label: 'Private Sports Club' },
] as const;

export type FacilityTypeValue = (typeof FACILITY_TYPE_OPTIONS)[number]['value'];

const FACILITY_TYPE_VALUES = new Set<string>(
  FACILITY_TYPE_OPTIONS.map((option) => option.value)
);

/** Map legacy/alternate labels to canonical values when loading from the database. */
export const LEGACY_FACILITY_TYPE_MAP: Record<string, FacilityTypeValue> = {
  'HOA Community': 'HOA',
};

/**
 * Normalize a stored facility type for display and editing.
 */
export function normalizeFacilityType(
  rawType: string | null | undefined
): string {
  const trimmed = rawType?.trim();
  if (!trimmed) return '';

  const legacy = LEGACY_FACILITY_TYPE_MAP[trimmed];
  if (legacy) return legacy;

  if (FACILITY_TYPE_VALUES.has(trimmed)) return trimmed;

  return trimmed;
}

/**
 * Options for a Select, including the current value when it is not in the canonical list.
 */
export function getFacilityTypeSelectOptions(
  currentValue: string | null | undefined
): Array<{ value: string; label: string }> {
  const normalized = normalizeFacilityType(currentValue);
  const options = [...FACILITY_TYPE_OPTIONS];

  if (normalized && !FACILITY_TYPE_VALUES.has(normalized)) {
    options.unshift({ value: normalized, label: normalized });
  }

  return options;
}
