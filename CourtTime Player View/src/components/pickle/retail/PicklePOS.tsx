import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Minus, Plus, ShoppingCart, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

interface RetailSku {
  id: string;
  nationalSku: string;
  name: string;
  category: string;
  basePriceCents: number;
}

interface CartLine {
  sku: RetailSku;
  quantity: number;
}

interface CheckoutResult {
  orderId: string;
  totalCents: number;
  stripeCheckoutPlaceholder: { url: string; note: string };
}

export function PicklePOS() {
  const { orgId, facilityId } = useParams<{ orgId: string; facilityId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [skus, setSkus] = useState<RetailSku[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [lastCheckout, setLastCheckout] = useState<CheckoutResult | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadSkus();
  }, [orgId]);

  const loadSkus = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await pickleApi.listRetailSkus(orgId);
      if (res.success && res.data) {
        const payload = unwrapApiPayload<{ skus: RetailSku[] }>(res.data);
        if (payload?.skus) setSkus(payload.skus);
      }
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const cartTotalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.sku.basePriceCents * line.quantity, 0),
    [cart]
  );

  const addToCart = (sku: RetailSku) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.sku.id === sku.id);
      if (existing) {
        return prev.map((l) =>
          l.sku.id === sku.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { sku, quantity: 1 }];
    });
  };

  const adjustQty = (skuId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.sku.id === skuId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const handleCheckout = async () => {
    if (!orgId || !facilityId || cart.length === 0) return;
    setCheckingOut(true);
    try {
      const result = await pickleApi.retailCheckout(orgId, {
        facilityId,
        lines: cart.map((l) => ({ skuId: l.sku.id, quantity: l.quantity })),
      });
      if (result.success && result.data) {
        const checkout = unwrapApiPayload<CheckoutResult>(result.data);
        if (checkout) {
          setLastCheckout(checkout);
          setCart([]);
          toast.success('Order created — Stripe checkout is stubbed');
        }
      } else {
        toast.error(result.error || 'Checkout failed');
      }
    } catch {
      toast.error('Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p>Please log in to use POS.</p>
        <Button className="mt-4" onClick={() => navigate('/login')}>Log in</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="sticky top-0 z-10 bg-green-800 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs opacity-80">CourtTime-Pickle POS</p>
          <h1 className="font-semibold text-lg">Pro Shop</h1>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(orgId ? `/pickle/org/${orgId}/pro-shop` : '/calendar')}
        >
          Admin
        </Button>
      </header>

      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {skus.map((sku) => (
          <button
            key={sku.id}
            type="button"
            onClick={() => addToCart(sku)}
            className="text-left bg-white rounded-xl border p-3 active:scale-[0.98] transition-transform shadow-sm"
          >
            <Badge variant="secondary" className="mb-2 text-[10px]">{sku.category}</Badge>
            <p className="font-medium text-sm leading-tight">{sku.name}</p>
            <p className="text-green-700 font-bold mt-1">${(sku.basePriceCents / 100).toFixed(2)}</p>
          </button>
        ))}
        {skus.length === 0 && (
          <p className="col-span-full text-center text-gray-500 py-8 text-sm">
            No products available. Roll out SKUs from pro shop admin.
          </p>
        )}
      </div>

      {lastCheckout && (
        <div className="mx-3 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <p className="font-medium">Order {lastCheckout.orderId.slice(0, 8)}… created</p>
          <p className="text-gray-600 mt-1">{lastCheckout.stripeCheckoutPlaceholder.note}</p>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="max-w-lg mx-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ShoppingCart className="h-4 w-4" />
              Cart ({cart.reduce((n, l) => n + l.quantity, 0)})
            </span>
            <span className="text-lg font-bold">${(cartTotalCents / 100).toFixed(2)}</span>
          </div>

          {cart.length > 0 && (
            <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
              {cart.map((line) => (
                <div key={line.sku.id} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1 mr-2">{line.sku.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => adjustQty(line.sku.id, -1)} className="p-1 rounded bg-gray-100">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center">{line.quantity}</span>
                    <button type="button" onClick={() => adjustQty(line.sku.id, 1)} className="p-1 rounded bg-gray-100">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full h-12 text-base bg-green-700 hover:bg-green-800"
            disabled={cart.length === 0 || checkingOut || !facilityId}
            onClick={handleCheckout}
          >
            <CreditCard className="h-5 w-5 mr-2" />
            {checkingOut ? 'Processing...' : 'Charge (Stripe stub)'}
          </Button>
        </div>
      </div>
    </div>
  );
}
