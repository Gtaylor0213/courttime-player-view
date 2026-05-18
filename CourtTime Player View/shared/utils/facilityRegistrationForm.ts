const SESSION_KEY = 'facilityRegistrationData';

const MERGE_PRIORITY_FIELDS = [
  'facilityType',
  'facilityName',
  'primaryLocationLabel',
  'streetAddress',
  'city',
  'state',
  'zipCode',
  'phone',
  'email',
  'description',
  'timezone',
] as const;

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Read persisted registration form from sessionStorage (if any).
 */
export function readPersistedRegistrationFormData(): Record<string, unknown> | null {
  if (typeof sessionStorage === 'undefined') return null;

  const saved = sessionStorage.getItem(SESSION_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Merge persisted session registration data with live form state.
 * Used so Stripe return / auto-submit cannot drop fields like facilityType.
 */
export function mergeRegistrationFormData<T extends Record<string, unknown>>(
  formData: T
): T {
  if (typeof sessionStorage === 'undefined') return formData;

  const parsed = readPersistedRegistrationFormData();
  if (!parsed) return formData;

  try {
    const merged = { ...parsed, ...formData } as T;

    for (const key of MERGE_PRIORITY_FIELDS) {
      const live = formData[key];
      const stored = parsed[key];
      if (!hasMeaningfulValue(live) && hasMeaningfulValue(stored)) {
        (merged as Record<string, unknown>)[key] = stored;
      }
    }

    if (
      !hasMeaningfulValue((formData as Record<string, unknown>).facilityType) &&
      hasMeaningfulValue(parsed.facilityType)
    ) {
      (merged as Record<string, unknown>).facilityType = parsed.facilityType;
    }

    return merged;
  } catch {
    return formData;
  }
}
