/** Pure helpers for the admin Pro Shop screen (cart math + product form parsing). */
import { parseDollarsToCents } from '../../../shared/utils/money';

export const PRO_SHOP_CATEGORIES = [
  { value: 'clothing', label: 'Clothing' },
  { value: 'rackets', label: 'Rackets' },
  { value: 'balls', label: 'Balls' },
  { value: 'bags', label: 'Bags' },
  { value: 'footwear', label: 'Footwear' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'other', label: 'Other' },
] as const;

export type Cart = Record<string, number>;

export function cartItems(cart: Cart): { product_id: string; quantity: number }[] {
  return Object.entries(cart).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
}

export function cartTotalCents(cart: Cart, products: { id: string; price_cents: number }[]): number {
  return Object.entries(cart).reduce((sum, [id, q]) => sum + q * (products.find((p) => p.id === id)?.price_cents ?? 0), 0);
}

/** Step a cart line up/down without dropping below zero or above the stock on hand. */
export function adjustCart(cart: Cart, productId: string, delta: number, stock: number | null): Cart {
  const next = Math.max(0, (cart[productId] ?? 0) + delta);
  const capped = stock == null ? next : Math.min(next, stock);
  const out = { ...cart };
  if (capped === 0) delete out[productId];
  else out[productId] = capped;
  return out;
}

export interface ProductFormValues { name: string; description: string; category: string; priceDollars: string; stock: string; imageData: string | null; isActive: boolean }

export function parseProductForm(v: ProductFormValues): { ok: true; body: { name: string; description: string; category: string; price_cents: number; stock_quantity: number | null; image_data: string | null; is_active: boolean } } | { ok: false; error: string } {
  const name = v.name.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!v.category) return { ok: false, error: 'Pick a category.' };
  const price_cents = parseDollarsToCents(v.priceDollars);
  if (!Number.isFinite(price_cents) || price_cents < 0) return { ok: false, error: 'Enter a valid price.' };
  const stockTrim = v.stock.trim();
  const stock_quantity = stockTrim === '' ? null : Number(stockTrim);
  if (stock_quantity != null && (!Number.isInteger(stock_quantity) || stock_quantity < 0)) return { ok: false, error: 'Stock must be a whole number (leave blank for unlimited).' };
  return { ok: true, body: { name, description: v.description.trim(), category: v.category, price_cents, stock_quantity, image_data: v.imageData, is_active: v.isActive } };
}
