import { describe, expect, it } from 'vitest';
import {
  isPickleProductLine,
  PRODUCT_LINE_CLASSIC,
  PRODUCT_LINE_PICKLE,
} from '../../constants/productLine';

describe('isPickleProductLine', () => {
  it('returns true for pickle product line', () => {
    expect(isPickleProductLine(PRODUCT_LINE_PICKLE)).toBe(true);
  });

  it('returns false for classic and other values', () => {
    expect(isPickleProductLine(PRODUCT_LINE_CLASSIC)).toBe(false);
    expect(isPickleProductLine('tennis')).toBe(false);
    expect(isPickleProductLine(null)).toBe(false);
    expect(isPickleProductLine(undefined)).toBe(false);
  });
});
