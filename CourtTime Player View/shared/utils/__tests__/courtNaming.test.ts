import { describe, expect, it } from 'vitest';
import {
  courtFieldsAfterNameChange,
  courtFieldsAfterNumberChange,
  courtNameMatchesNumber,
  formatStandardCourtName,
  normalizeCourtNameAndNumber,
  parseStandardCourtName,
} from '../courtNaming';

describe('courtNaming', () => {
  it('formats and parses standard court names', () => {
    expect(formatStandardCourtName(4)).toBe('Court 4');
    expect(parseStandardCourtName('Court 4')).toEqual({ courtNumber: 4, suffix: '' });
    expect(parseStandardCourtName('Court 5a')).toEqual({ courtNumber: 5, suffix: 'a' });
    expect(parseStandardCourtName('Stadium Court')).toBeNull();
  });

  it('courtNameMatchesNumber compares base number only', () => {
    expect(courtNameMatchesNumber('Court 3', 3)).toBe(true);
    expect(courtNameMatchesNumber('Court 3a', 3)).toBe(true);
    expect(courtNameMatchesNumber('Court 3', 4)).toBe(false);
  });

  it('courtFieldsAfterNumberChange updates standard names only', () => {
    expect(courtFieldsAfterNumberChange(7, 'Court 3')).toEqual({
      courtNumber: 7,
      name: 'Court 7',
    });
    expect(courtFieldsAfterNumberChange(7, 'Stadium Court')).toEqual({
      courtNumber: 7,
      name: 'Stadium Court',
    });
  });

  it('courtFieldsAfterNameChange keeps custom names and court number', () => {
    expect(courtFieldsAfterNameChange('Stadium Court', 2)).toEqual({
      courtNumber: 2,
      name: 'Stadium Court',
    });
    expect(courtFieldsAfterNameChange('Court ', 1)).toEqual({
      courtNumber: 1,
      name: 'Court ',
    });
  });

  it('normalizeCourtNameAndNumber trims whitespace on save', () => {
    expect(normalizeCourtNameAndNumber({ name: '  North  ', courtNumber: 5 })).toEqual({
      name: 'North',
      courtNumber: 5,
    });
  });

  it('normalizeCourtNameAndNumber preserves custom names on save', () => {
    expect(normalizeCourtNameAndNumber({ name: '', courtNumber: 2 })).toEqual({
      name: 'Court 2',
      courtNumber: 2,
    });
    expect(normalizeCourtNameAndNumber({ name: 'Championship', courtNumber: 5 })).toEqual({
      name: 'Championship',
      courtNumber: 5,
    });
    expect(normalizeCourtNameAndNumber({ name: 'Court 8', courtNumber: 3 })).toEqual({
      name: 'Court 8',
      courtNumber: 3,
    });
  });
});
