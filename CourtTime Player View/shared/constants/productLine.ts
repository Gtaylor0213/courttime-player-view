export const PRODUCT_LINE_CLASSIC = 'classic' as const;
export const PRODUCT_LINE_PICKLE = 'pickle' as const;

export type ProductLine = typeof PRODUCT_LINE_CLASSIC | typeof PRODUCT_LINE_PICKLE;

export function isPickleProductLine(productLine?: string | null): boolean {
  return productLine === PRODUCT_LINE_PICKLE;
}
