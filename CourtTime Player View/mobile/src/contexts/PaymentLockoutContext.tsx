import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSegments } from 'expo-router';
import { Colors } from '../constants/theme';
import { paymentApi } from '../api/client';
import {
  emitPaymentUnlocked,
  normalizeLockoutPayload,
  subscribePaymentLockout,
  type PaymentLockoutInfo,
} from '../paymentLockout/events';
import { PaymentLockoutScreen } from '../components/PaymentLockoutScreen';

interface PaymentLockoutContextValue {
  lockoutInfo: PaymentLockoutInfo | null;
  refreshLockout: () => Promise<void>;
  clearLockout: () => void;
}

const PaymentLockoutContext = createContext<PaymentLockoutContextValue | null>(null);

export function PaymentLockoutProvider({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const rootSegment = segments[0];
  const isLockoutPaidRoute = rootSegment === 'lockout-paid';
  const [lockoutInfo, setLockoutInfo] = useState<PaymentLockoutInfo | null>(null);
  const [checking, setChecking] = useState(true);

  const clearLockout = useCallback(() => {
    setLockoutInfo(null);
    emitPaymentUnlocked();
  }, []);

  const refreshLockout = useCallback(async () => {
    const res = await paymentApi.members.getMyPaymentLockout();
    if (!res.success) return;
    const payload = (res.data as { isLocked?: boolean; lockout?: unknown }) ?? res;
    if (payload.isLocked && payload.lockout) {
      const info = normalizeLockoutPayload(payload);
      if (info) setLockoutInfo(info);
    } else {
      clearLockout();
    }
  }, [clearLockout]);

  useEffect(() => subscribePaymentLockout(setLockoutInfo), []);

  useEffect(() => {
    if (isLockoutPaidRoute) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    void refreshLockout().finally(() => {
      if (!cancelled) setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isLockoutPaidRoute, refreshLockout]);

  const value: PaymentLockoutContextValue = {
    lockoutInfo,
    refreshLockout,
    clearLockout,
  };

  if (checking && !lockoutInfo && !isLockoutPaidRoute) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <PaymentLockoutContext.Provider value={value}>
      {lockoutInfo && !isLockoutPaidRoute ? (
        <PaymentLockoutScreen lockout={lockoutInfo} />
      ) : (
        children
      )}
    </PaymentLockoutContext.Provider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});

export function usePaymentLockout(): PaymentLockoutContextValue {
  const ctx = useContext(PaymentLockoutContext);
  if (!ctx) {
    throw new Error('usePaymentLockout must be used within PaymentLockoutProvider');
  }
  return ctx;
}
