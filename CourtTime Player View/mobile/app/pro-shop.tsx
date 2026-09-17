/**
 * Pro Shop.
 *
 * Mirrors web's `ProShop.tsx`: browse what the club sells, build a basket, and
 * check out through Stripe. Payment happens on Stripe's hosted page in the
 * browser, as everywhere else in the app — card details never reach us.
 *
 * Note the snake_case fields: this route returns database rows directly rather
 * than camelCased DTOs.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { proShopEndpoints } from '../src/api/endpoints';
import { unwrapApiPayload } from '../../shared/api/core';
import { formatCentsAsUsd, openStripeCheckout } from '../src/utils/payments';
import { showAlert } from '../src/utils/alert';
import { useAuth } from '../src/contexts/AuthContext';
import { EmptyState } from '../src/components/EmptyState';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Pro Shop');

interface Product {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price_cents: number;
  stock_quantity: number | null;
}

interface Order {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  items?: Array<{ name: string; quantity: number; price_cents: number }>;
}

function inStock(product: Product): boolean {
  return product.stock_quantity == null || product.stock_quantity > 0;
}

export default function ProShopScreen() {
  const { facilityId } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  // Web's ProShop: open tab balance, card on file, and whether the club requires a card.
  const [tab, setTab] = useState<{ unbilled_cents: number; items?: Array<{ product_name?: string; quantity?: number }> } | null>(null);
  const [cardStatus, setCardStatus] = useState<{ has_card?: boolean; card_brand?: string; card_last4?: string } | null>(null);
  const [requireCard, setRequireCard] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    const [productRes, orderRes, tabRes, cardRes, settingsRes] = await Promise.all([
      proShopEndpoints.products(facilityId),
      proShopEndpoints.myOrders(facilityId),
      proShopEndpoints.myTab(facilityId),
      proShopEndpoints.myCard(facilityId),
      proShopEndpoints.settings(facilityId), // 403 for members; ignored below
    ]);
    if (tabRes.success) {
      const t = unwrapApiPayload<{ unbilled_cents?: number | string; items?: any[] }>(tabRes.data);
      setTab(t && Number(t.unbilled_cents) > 0 ? { unbilled_cents: Number(t.unbilled_cents), items: t.items } : null);
    }
    if (cardRes.success) setCardStatus(unwrapApiPayload<{ has_card?: boolean }>(cardRes.data) ?? null);
    if (settingsRes.success) setRequireCard(!!unwrapApiPayload<{ require_card?: boolean }>(settingsRes.data)?.require_card);

    if (productRes.success) {
      const list = unwrapApiPayload<Product[]>(productRes.data);
      setProducts(Array.isArray(list) ? list : []);
    }
    if (orderRes.success) {
      const list = unwrapApiPayload<Order[]>(orderRes.data);
      setOrders(Array.isArray(list) ? list : []);
    }
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const basketTotalCents = useMemo(
    () =>
      Object.entries(basket).reduce((sum, [productId, qty]) => {
        const product = products.find((p) => p.id === productId);
        return sum + (product ? product.price_cents * qty : 0);
      }, 0),
    [basket, products]
  );

  const basketCount = useMemo(
    () => Object.values(basket).reduce((sum, qty) => sum + qty, 0),
    [basket]
  );

  function adjust(product: Product, delta: number) {
    setBasket((prev) => {
      const next = { ...prev };
      const current = next[product.id] ?? 0;
      const target = current + delta;
      // Never let the basket exceed what the club has on the shelf.
      const cap = product.stock_quantity == null ? Number.MAX_SAFE_INTEGER : product.stock_quantity;
      if (target <= 0) {
        delete next[product.id];
      } else {
        next[product.id] = Math.min(target, cap);
      }
      return next;
    });
  }

  async function checkout() {
    if (!facilityId || basketCount === 0 || checkingOut) return;
    setCheckingOut(true);
    const items = Object.entries(basket).map(([product_id, quantity]) => ({ product_id, quantity }));
    const res = await proShopEndpoints.checkout(facilityId, { items });
    setCheckingOut(false);

    if (!res.success) {
      showAlert('Could not check out', res.error || 'Please try again.');
      return;
    }

    const data = unwrapApiPayload<{ url?: string | null; devMode?: boolean }>(res.data);
    if (data?.url) {
      const opened = await openStripeCheckout(data.url);
      if (!opened) showAlert('Payment', 'Could not open Stripe checkout. Try again.');
      return;
    }

    // No checkout URL means the club is not taking card payments here; the
    // order is recorded for the front desk to settle.
    setBasket({});
    await load();
    showAlert('Order placed', 'Your order is with the front desk. Settle up at the club.');
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'Pro Shop' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (products.length === 0 && orders.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pro Shop' }} />
        <EmptyState
          icon="cart-outline"
          title="Nothing in the shop"
          description="Your club has not listed anything for sale yet."
        />
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Pro Shop' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {requireCard && cardStatus && !cardStatus.has_card ? (
          <View style={styles.noticeWarn}>
            <Ionicons name="card-outline" size={18} color={Colors.warning} />
            <View style={styles.cardText}>
              <Text style={styles.noticeTitle}>No card on file</Text>
              <Text style={styles.noticeText}>This club charges pro shop purchases to a saved card. Add one under Payments.</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/payments')} accessibilityRole="button" accessibilityLabel="Open Payments">
              <Text style={styles.noticeLink}>Payments</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {tab ? (
          <View style={styles.noticeInfo}>
            <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
            <View style={styles.cardText}>
              <Text style={styles.noticeTitle}>Open tab: {formatCentsAsUsd(tab.unbilled_cents)}</Text>
              {tab.items?.length ? (
                <Text style={styles.noticeText} numberOfLines={2}>
                  {tab.items.map((i) => `${i.product_name ?? 'Item'} ×${i.quantity ?? 1}`).join(', ')}
                </Text>
              ) : null}
              {cardStatus?.has_card && cardStatus.card_last4 ? (
                <Text style={styles.noticeText}>Billed to {cardStatus.card_brand ?? 'card'} •••• {cardStatus.card_last4}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
        {products.map((product) => {
          const qty = basket[product.id] ?? 0;
          const available = inStock(product);

          return (
            <View key={product.id} style={styles.card}>
              <View style={styles.cardText}>
                <Text style={styles.name}>{product.name}</Text>
                {product.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {product.description}
                  </Text>
                ) : null}
                <Text style={styles.price}>{formatCentsAsUsd(product.price_cents)}</Text>
                {!available ? (
                  <Text style={styles.outOfStock}>Out of stock</Text>
                ) : product.stock_quantity != null && product.stock_quantity <= 3 ? (
                  <Text style={styles.lowStock}>Only {product.stock_quantity} left</Text>
                ) : null}
              </View>

              {available ? (
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={styles.qtyButton}
                    onPress={() => adjust(product, -1)}
                    disabled={qty === 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove one ${product.name}`}
                  >
                    <Ionicons
                      name="remove"
                      size={18}
                      color={qty === 0 ? Colors.textMuted : Colors.primary}
                    />
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{qty}</Text>
                  <TouchableOpacity
                    style={styles.qtyButton}
                    onPress={() => adjust(product, 1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add one ${product.name}`}
                  >
                    <Ionicons name="add" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}

        {orders.length > 0 && (
          <View style={styles.ordersSection}>
            <Text style={styles.sectionTitle}>Your orders</Text>
            {orders.map((order) => (
              <View key={order.id} style={styles.orderRow}>
                <View style={styles.cardText}>
                  <Text style={styles.orderItems} numberOfLines={2}>
                    {(order.items || []).map((i) => `${i.quantity}× ${i.name}`).join(', ') || 'Order'}
                  </Text>
                  <Text style={styles.orderMeta}>
                    {new Date(order.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    · {order.status}
                  </Text>
                </View>
                <Text style={styles.price}>{formatCentsAsUsd(order.total_cents)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 96 }} />
      </ScrollView>

      {basketCount > 0 ? (
        <View style={styles.basketBar}>
          <View style={styles.cardText}>
            <Text style={styles.basketCount}>
              {basketCount} item{basketCount === 1 ? '' : 's'}
            </Text>
            <Text style={styles.basketTotal}>{formatCentsAsUsd(basketTotalCents)}</Text>
          </View>
          <TouchableOpacity
            style={styles.checkoutButton}
            onPress={checkout}
            disabled={checkingOut}
            accessibilityRole="button"
            accessibilityLabel="Check out"
          >
            <Text style={styles.checkoutText}>{checkingOut ? 'Opening…' : 'Check out'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  cardText: { flex: 1 },
  name: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  description: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  price: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 4,
  },
  outOfStock: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  noticeWarn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.warning + '14', borderWidth: 1, borderColor: Colors.warning + '55',
    borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  noticeInfo: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary + '10', borderWidth: 1, borderColor: Colors.primary + '44',
    borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  noticeTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  noticeText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  noticeLink: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
  lowStock: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  ordersSection: { marginTop: Spacing.lg, gap: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  orderItems: { fontSize: FontSize.sm, color: Colors.text },
  orderMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  basketBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  basketCount: { fontSize: FontSize.xs, color: Colors.textSecondary },
  basketTotal: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  checkoutButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  checkoutText: {
    color: Colors.textInverse,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
});
