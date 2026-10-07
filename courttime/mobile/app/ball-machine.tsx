/**
 * Ball machine: passes and access codes.
 *
 * Mirrors web's `BallMachine.tsx`. A member buys a pass (all machines, or one
 * specific machine), and a live pass reveals the keypad code for the machines
 * it covers. Booking a machine as part of a court reservation also reveals the
 * code — that check lives server-side in `canViewAccessCode`.
 *
 * Reached from the More tab, which only appears when the facility has the
 * ball machine flag on.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ballMachineEndpoints } from '../src/api/endpoints';
import { unwrapApiPayload } from '../../shared/api/core';
import { ballMachinePassCheckoutUrls } from '../../shared/utils/mobileCheckoutUrls';
import { formatCentsAsUsd, openStripeCheckout } from '../src/utils/payments';
import { showAlert } from '../src/utils/alert';
import { useAuth } from '../src/contexts/AuthContext';
import { EmptyState } from '../src/components/EmptyState';
import { createRouteErrorBoundary } from '../src/components/RouteErrorBoundary';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Ball Machine');

interface Machine {
  id: string;
  name: string;
  isActive: boolean;
  hourlyFeeCents: number | null;
  hasAccessCode: boolean;
}

interface PassProduct {
  id: string;
  machineId: string | null;
  durationMonths: number;
  priceCents: number;
}

interface Pass {
  id: string;
  machineId: string | null;
  durationMonths: number;
  expiresAt: string;
  status: string;
}

interface AccessCode {
  machineName: string;
  accessCode: string;
  instructions?: string | null;
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function passScopeLabel(machineId: string | null, machines: Machine[]): string {
  if (!machineId) return 'All machines';
  return machines.find((m) => m.id === machineId)?.name || 'One machine';
}

export default function BallMachineScreen() {
  const { facilityId } = useAuth();
  const params = useLocalSearchParams();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [products, setProducts] = useState<PassProduct[]>([]);
  const [activePasses, setActivePasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buyingKey, setBuyingKey] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, AccessCode>>({});
  const [codeBusyId, setCodeBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) {
      setLoading(false);
      return;
    }
    const res = await ballMachineEndpoints.status(facilityId);
    if (res.success) {
      const data = unwrapApiPayload<{
        machines?: Machine[];
        products?: PassProduct[];
        activePasses?: Pass[];
      }>(res.data);
      setMachines(Array.isArray(data?.machines) ? data.machines : []);
      setProducts(Array.isArray(data?.products) ? data.products : []);
      setActivePasses(Array.isArray(data?.activePasses) ? data.activePasses : []);
    }
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Returning from Stripe: confirm the pass, then reload so it shows as active.
  const sessionId = typeof params.session_id === 'string' ? params.session_id : null;
  useEffect(() => {
    if (params.passPurchased !== '1' || !sessionId) return;
    let cancelled = false;
    void ballMachineEndpoints.confirmPurchase(sessionId).then(async (res) => {
      if (cancelled) return;
      if (res.success) {
        showAlert('Pass purchased', 'Your ball machine pass is active.');
      } else {
        showAlert(
          'Payment received',
          res.error || 'We could not confirm your pass. Please contact the club.'
        );
      }
      await load();
    });
    return () => {
      cancelled = true;
    };
  }, [params.passPurchased, sessionId, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function buyPass(product: PassProduct) {
    if (!facilityId || buyingKey) return;
    setBuyingKey(product.id);
    const res = await ballMachineEndpoints.purchasePass(facilityId, {
      durationMonths: product.durationMonths,
      machineId: product.machineId,
      ...ballMachinePassCheckoutUrls(),
    });
    setBuyingKey(null);

    const payload = res.success ? unwrapApiPayload<{ url?: string }>(res.data) : null;
    const url = payload?.url || (res.data as { url?: string })?.url;
    if (!url) {
      showAlert('Could not start payment', res.error || 'Please try again.');
      return;
    }
    const opened = await openStripeCheckout(url);
    if (!opened) {
      showAlert('Payment', 'Could not open Stripe checkout. Try again.');
    }
  }

  async function revealCode(machine: Machine) {
    if (!facilityId || codeBusyId) return;
    setCodeBusyId(machine.id);
    const res = await ballMachineEndpoints.accessCode(facilityId, machine.id);
    setCodeBusyId(null);

    if (!res.success) {
      showAlert('Access code', res.error || 'Could not get the code for this machine.');
      return;
    }
    const data = unwrapApiPayload<AccessCode>(res.data);
    if (data?.accessCode) {
      setCodes((prev) => ({ ...prev, [machine.id]: data }));
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: 'Ball Machine' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (machines.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Ball Machine' }} />
        <EmptyState
          icon="tennisball-outline"
          title="No ball machines"
          description="Your club has not set up a ball machine yet."
        />
      </>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: 'Ball Machine' }} />

      {activePasses.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your passes</Text>
          {activePasses.map((pass) => (
            <View key={pass.id} style={styles.passCard}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
              <View style={styles.passText}>
                <Text style={styles.passScope}>{passScopeLabel(pass.machineId, machines)}</Text>
                <Text style={styles.passMeta}>Active until {formatExpiry(pass.expiresAt)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Machines</Text>
        {machines.map((machine) => {
          const code = codes[machine.id];
          return (
            <View key={machine.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.machineName}>{machine.name}</Text>
                {machine.hourlyFeeCents ? (
                  <Text style={styles.machineFee}>
                    {formatCentsAsUsd(machine.hourlyFeeCents)}/hr on a booking
                  </Text>
                ) : null}
              </View>

              {code ? (
                <View style={styles.codeBox}>
                  <Text style={styles.codeLabel}>Keypad code</Text>
                  <Text style={styles.codeValue} accessibilityLabel={`Access code ${code.accessCode}`}>
                    {code.accessCode}
                  </Text>
                  {code.instructions ? (
                    <Text style={styles.codeInstructions}>{code.instructions}</Text>
                  ) : null}
                </View>
              ) : machine.hasAccessCode ? (
                <TouchableOpacity
                  style={styles.codeButton}
                  onPress={() => revealCode(machine)}
                  disabled={codeBusyId === machine.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Show access code for ${machine.name}`}
                >
                  <Ionicons name="keypad-outline" size={16} color={Colors.primary} />
                  <Text style={styles.codeButtonText}>
                    {codeBusyId === machine.id ? 'Checking…' : 'Show access code'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.noCode}>
                  No keypad code set — ask the front desk.
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {products.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Buy a pass</Text>
          <Text style={styles.sectionHint}>
            A pass covers the machine fee for its whole term, and reveals the keypad code.
          </Text>
          {products.map((product) => (
            <TouchableOpacity
              key={product.id}
              style={styles.productRow}
              onPress={() => buyPass(product)}
              disabled={buyingKey !== null}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${product.durationMonths} month pass for ${passScopeLabel(
                product.machineId,
                machines
              )}`}
            >
              <View style={styles.productText}>
                <Text style={styles.productTitle}>
                  {product.durationMonths} month{product.durationMonths === 1 ? '' : 's'}
                </Text>
                <Text style={styles.productScope}>{passScopeLabel(product.machineId, machines)}</Text>
              </View>
              <Text style={styles.productPrice}>
                {buyingKey === product.id ? '…' : formatCentsAsUsd(product.priceCents)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, gap: Spacing.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionHint: { fontSize: FontSize.xs, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: { gap: 2 },
  machineName: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  machineFee: { fontSize: FontSize.xs, color: Colors.textSecondary },
  passCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  passText: { flex: 1 },
  passScope: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  passMeta: { fontSize: FontSize.xs, color: Colors.textSecondary },
  codeBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    gap: 4,
  },
  codeLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  codeValue: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 4,
  },
  codeInstructions: { fontSize: FontSize.xs, color: Colors.textSecondary },
  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  codeButtonText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  noCode: { fontSize: FontSize.xs, color: Colors.textMuted },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  productText: { flex: 1 },
  productTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  productScope: { fontSize: FontSize.xs, color: Colors.textSecondary },
  productPrice: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.primary,
  },
});
