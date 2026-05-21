import { describe, expect, it } from 'vitest';
import {
  COURT_TYPE_CUSTOM_SELECT,
  courtTypeCustomLabel,
  courtTypeSelectValue,
  isStandardCourtType,
  resolveCourtTypeForSave,
  validateCourtType,
  validateStoredCourtType,
} from '../../constants/courtTypes';

describe('courtTypes', () => {
  it('recognizes standard and dual aliases', () => {
    expect(isStandardCourtType('Tennis')).toBe(true);
    expect(isStandardCourtType('Dual Purpose')).toBe(true);
    expect(isStandardCourtType('Dual')).toBe(true);
    expect(isStandardCourtType('Dual Use')).toBe(true);
    expect(isStandardCourtType('Clubhouse')).toBe(false);
  });

  it('maps custom stored values to custom select', () => {
    expect(courtTypeSelectValue('Volleyball Court')).toBe(COURT_TYPE_CUSTOM_SELECT);
    expect(courtTypeCustomLabel('Volleyball Court')).toBe('Volleyball Court');
  });

  it('resolves custom label for save', () => {
    expect(resolveCourtTypeForSave('Tennis', '')).toBe('Tennis');
    expect(resolveCourtTypeForSave(COURT_TYPE_CUSTOM_SELECT, '  Clubhouse  ')).toBe('Clubhouse');
  });

  it('validates custom label', () => {
    expect(validateCourtType(COURT_TYPE_CUSTOM_SELECT, '')).toMatch(/Enter a name/);
    expect(validateCourtType(COURT_TYPE_CUSTOM_SELECT, 'Pool Deck')).toBeNull();
    expect(validateCourtType('Tennis', '')).toBeNull();
  });

  it('validates stored court type for save', () => {
    expect(validateStoredCourtType('')).toMatch(/Enter a name/);
    expect(validateStoredCourtType('Tennis')).toBeNull();
    expect(validateStoredCourtType('Clubhouse')).toBeNull();
  });
});
