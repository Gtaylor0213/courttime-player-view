import { describe, it, expect } from '@jest/globals';
import { userFacingApiMessage } from '../src/utils/apiUserMessages';

describe('userFacingApiMessage', () => {
  it('prefers server error text when present', () => {
    expect(
      userFacingApiMessage({
        success: false,
        error: 'Court is closed',
        errorCategory: 'unknown',
      })
    ).toBe('Court is closed');
  });

  it('falls back to category copy when error is empty', () => {
    expect(
      userFacingApiMessage({
        success: false,
        errorCategory: 'offline',
      })
    ).toBe('You appear to be offline. Please check your connection.');
  });

  it('returns empty string for success', () => {
    expect(userFacingApiMessage({ success: true, error: 'ignored' })).toBe('');
  });
});
