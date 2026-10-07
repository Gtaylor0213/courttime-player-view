import { describe, expect, it } from '@jest/globals';
import { adjustCart, cartItems, cartTotalCents, parseProductForm } from '../src/utils/proShopAdmin';

const products = [{ id: 'a', price_cents: 1500 }, { id: 'b', price_cents: 250 }];

describe('pro shop admin helpers', () => {
  it('adjusts cart lines within stock and drops zero lines', () => {
    let cart = adjustCart({}, 'a', 1, 2);
    cart = adjustCart(cart, 'a', 5, 2);
    expect(cart).toEqual({ a: 2 });
    cart = adjustCart(cart, 'b', 3, null);
    expect(cartItems(cart)).toEqual([{ product_id: 'a', quantity: 2 }, { product_id: 'b', quantity: 3 }]);
    expect(cartTotalCents(cart, products)).toBe(3750);
    expect(adjustCart(cart, 'a', -2, 2)).toEqual({ b: 3 });
  });
  it('validates the product form', () => {
    expect(parseProductForm({ name: '', description: '', category: 'balls', priceDollars: '5', stock: '', imageData: null, isActive: true })).toEqual({ ok: false, error: 'Name is required.' });
    const ok = parseProductForm({ name: ' Can of balls ', description: '', category: 'balls', priceDollars: '4.50', stock: '12', imageData: null, isActive: true });
    expect(ok).toEqual({ ok: true, body: { name: 'Can of balls', description: '', category: 'balls', price_cents: 450, stock_quantity: 12, image_data: null, is_active: true } });
    expect(parseProductForm({ name: 'x', description: '', category: 'balls', priceDollars: '1', stock: '1.5', imageData: null, isActive: true }).ok).toBe(false);
    const unlimited = parseProductForm({ name: 'x', description: '', category: 'other', priceDollars: '1', stock: '', imageData: null, isActive: false });
    expect(unlimited.ok && unlimited.body.stock_quantity).toBeNull();
  });
});
