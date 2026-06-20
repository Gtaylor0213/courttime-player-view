import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ShoppingBag, ShoppingCart, X, Plus, Minus, CheckCircle, Receipt, AlertTriangle } from 'lucide-react';
import { proShopApi } from '../api/client';
import { useAppContext } from '../contexts/AppContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const CATEGORY_COLORS: Record<string, string> = {
  clothing: 'bg-blue-100 text-blue-700',
  rackets: 'bg-purple-100 text-purple-700',
  balls: 'bg-yellow-100 text-yellow-700',
  bags: 'bg-orange-100 text-orange-700',
  footwear: 'bg-green-100 text-green-700',
  accessories: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-gray-600',
};

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

type CartItem = { product: any; quantity: number };

export default function ProShop() {
  const { selectedFacilityId: currentFacilityId } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [tab, setTab] = useState<{ unbilled_cents: number; items: any[] } | null>(null);
  const [cardStatus, setCardStatus] = useState<{ has_card: boolean; card_brand?: string; card_last4?: string } | null>(null);
  const [requireCard, setRequireCard] = useState(false);

  useEffect(() => {
    if (searchParams.get('order') === 'success') {
      setOrderSuccess(true);
      setSearchParams({});
    }
  }, []);

  useEffect(() => {
    if (!currentFacilityId) return;
    loadProducts();
    loadTabAndCard();
  }, [currentFacilityId]);

  const loadTabAndCard = async () => {
    const [tabRes, cardRes, settingsRes] = await Promise.all([
      proShopApi.getMyTab(currentFacilityId!),
      proShopApi.getMyCard(currentFacilityId!),
      proShopApi.adminGetSettings(currentFacilityId!).catch(() => null),
    ]);
    if (tabRes.success) {
      const t = (tabRes.data as any)?.data;
      if (t && Number(t.unbilled_cents) > 0) setTab(t);
    }
    if (cardRes.success) setCardStatus((cardRes.data as any)?.data ?? null);
    if (settingsRes?.success) setRequireCard(!!(settingsRes.data as any)?.data?.require_card);
  };

  const loadProducts = async () => {
    setLoading(true);
    const res = await proShopApi.getShopProducts(currentFacilityId!);
    if (res.success) {
      setProducts((res.data as any)?.data ?? []);
    } else if ((res.error as string)?.includes('not enabled')) {
      setUnavailable(true);
    } else {
      toast.error((res.error as string) || 'Failed to load shop');
    }
    setLoading(false);
  };

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        const max = product.stock_quantity;
        if (max !== null && existing.quantity >= max) {
          toast.error(`Only ${max} in stock`);
          return prev;
        }
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast.success(`${product.name} added to cart`);
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev
      .map(i => i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0)
    );
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.product.price_cents * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    const items = cart.map(i => ({ product_id: i.product.id, quantity: i.quantity }));
    const res = await proShopApi.createCheckout(currentFacilityId!, items);
    if (res.success) {
      const data = (res.data as any)?.data ?? res.data as any;
      if (data.devMode) {
        setCart([]);
        setCartOpen(false);
        setOrderSuccess(true);
      } else {
        window.location.href = data.url;
      }
    } else {
      toast.error((res.error as string) || 'Checkout failed');
    }
    setCheckingOut(false);
  };

  if (!currentFacilityId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <ShoppingBag className="h-12 w-12 mb-3" />
        <p className="text-sm">Select a facility to view the shop.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <ShoppingBag className="h-12 w-12 mb-3" />
        <p className="text-sm">Pro Shop is not available for this facility.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Pro Shop</h1>
        </div>
        <Button variant="outline" className="relative" onClick={() => setCartOpen(true)}>
          <ShoppingCart className="h-4 w-4 mr-2" />
          Cart
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Button>
      </div>

      {/* Card-on-file warning */}
      {requireCard && cardStatus && !cardStatus.has_card && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">No card on file</p>
            <p className="text-xs text-amber-600">
              This facility requires a saved payment card. Add one in{' '}
              <button onClick={() => navigate('/payments')} className="underline font-medium">Payments</button>.
            </p>
          </div>
        </div>
      )}

      {/* Open tab balance */}
      {tab && Number(tab.unbilled_cents) > 0 && (
        <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <Receipt className="h-5 w-5 text-indigo-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-indigo-800">
              Open tab: {formatPrice(Number(tab.unbilled_cents))}
            </p>
            <p className="text-xs text-indigo-600">
              {(tab.items ?? []).map((i: any) => `${i.product_name} ×${i.quantity}`).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Order success banner */}
      {orderSuccess && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Order placed successfully!</p>
            <p className="text-xs text-green-600">Your order is confirmed. The facility will prepare it for pickup.</p>
          </div>
          <button onClick={() => setOrderSuccess(false)} className="ml-auto text-green-500 hover:text-green-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Products grid */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ShoppingBag className="h-12 w-12 mb-3" />
          <p className="text-sm">No products available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(product => (
            <Card key={product.id} className="overflow-hidden">
              {product.image_data ? (
                <img src={product.image_data} alt={product.name} className="w-full h-48 object-cover" />
              ) : (
                <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                  <ShoppingBag className="h-12 w-12 text-gray-300" />
                </div>
              )}
              <CardContent className="p-4 space-y-3">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[product.category] || CATEGORY_COLORS.other}`}>
                    {product.category}
                  </span>
                  <h3 className="text-sm font-semibold mt-1">{product.name}</h3>
                  {product.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{product.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-bold">{formatPrice(product.price_cents)}</span>
                    {product.stock_quantity !== null && (
                      <span className="text-xs text-gray-400 ml-2">{product.stock_quantity} left</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addToCart(product)}
                    disabled={product.stock_quantity === 0}
                  >
                    {product.stock_quantity === 0 ? 'Out of stock' : 'Add to Cart'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white w-full max-w-sm h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-base font-semibold">Your Cart</h2>
              <button onClick={() => setCartOpen(false)}><X className="h-5 w-5 text-gray-500" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Your cart is empty.</p>
              ) : (
                cart.map(item => (
                  <div key={item.product.id} className="flex items-center gap-3">
                    {item.product.image_data ? (
                      <img src={item.product.image_data} alt={item.product.name} className="h-12 w-12 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-gray-500">{formatPrice(item.product.price_cents)} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.product.id, -1)} className="p-1 rounded hover:bg-gray-100">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product.id, 1)} className="p-1 rounded hover:bg-gray-100">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="text-sm font-semibold w-16 text-right">
                      {formatPrice(item.product.price_cents * item.quantity)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t space-y-3">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatPrice(cartTotal)}</span>
                </div>
                <Button className="w-full" onClick={handleCheckout} disabled={checkingOut}>
                  {checkingOut ? 'Redirecting...' : 'Checkout'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
