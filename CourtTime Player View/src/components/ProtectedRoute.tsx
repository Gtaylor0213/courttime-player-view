import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { membersApi, strikesApi } from '../api/client';
import { TermsAcceptanceGate } from './TermsAcceptanceGate';
import { PaymentLockoutScreen } from './PaymentLockoutScreen';
import { StrikeLockoutScreen } from './StrikeLockoutScreen';
import { facilityIdsFromAuthUser } from '../utils/memberFacilities';
import {
  parseStrikeLockoutStatus,
  type StrikeLockoutStatus,
} from '../../shared/utils/strikeLockout';

export interface PaymentLockoutInfo {
  facilityId?: string;
  facilityName?: string;
  lockedAt?: string;
  amountCents?: number | null;
  description?: string | null;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function normalizeLockoutPayload(raw: unknown): PaymentLockoutInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const lockout = (record.lockout ?? record) as Record<string, unknown>;
  if (!lockout.facilityId && !lockout.facilityName) return null;
  return {
    facilityId: lockout.facilityId as string | undefined,
    facilityName: lockout.facilityName as string | undefined,
    lockedAt: lockout.lockedAt as string | undefined,
    amountCents: (lockout.amountCents as number | null | undefined) ?? null,
    description: (lockout.description as string | null | undefined) ?? null,
  };
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, termsLoading, pendingTermsAcceptances } = useAuth();
  const { selectedFacilityId } = useAppContext();
  const location = useLocation();
  const [lockoutInfo, setLockoutInfo] = useState<PaymentLockoutInfo | null>(null);
  const [lockoutChecking, setLockoutChecking] = useState(false);
  const [strikeLockout, setStrikeLockout] = useState<StrikeLockoutStatus | null>(null);
  const [strikeLockoutChecking, setStrikeLockoutChecking] = useState(false);
  const isLockoutPaidPage = location.pathname === '/lockout-paid';
  const isMyReservationsRoute = location.pathname === '/my-reservations';
  const isProfileRoute = location.pathname.startsWith('/profile');

  useEffect(() => {
    const handleLocked = (e: Event) => {
      const detail = normalizeLockoutPayload((e as CustomEvent).detail);
      if (detail) setLockoutInfo(detail);
    };
    const handleUnlocked = () => setLockoutInfo(null);
    window.addEventListener('payment-locked', handleLocked);
    window.addEventListener('payment-unlocked', handleUnlocked);
    return () => {
      window.removeEventListener('payment-locked', handleLocked);
      window.removeEventListener('payment-unlocked', handleUnlocked);
    };
  }, []);

  useEffect(() => {
    if (!user || user.userType === 'admin' || isLockoutPaidPage) return;

    let cancelled = false;
    setLockoutChecking(true);

    const checkPromise = selectedFacilityId
      ? membersApi.getLockoutInfo(selectedFacilityId).then((res) => {
          if (cancelled) return;
          if (!res.success) { setLockoutInfo(null); return; }
          const payload = (res.data as {
            isLocked?: boolean;
            facilityId?: string;
            facilityName?: string | null;
            amountCents?: number | null;
            description?: string | null;
            lockedAt?: string | null;
          }) ?? {};
          if (payload.isLocked) {
            setLockoutInfo({
              facilityId: payload.facilityId ?? selectedFacilityId,
              facilityName: payload.facilityName ?? undefined,
              amountCents: payload.amountCents ?? null,
              description: payload.description ?? null,
              lockedAt: payload.lockedAt ?? undefined,
            });
          } else {
            setLockoutInfo(null);
          }
        })
      : membersApi.getMyPaymentLockout().then((res) => {
          if (cancelled || !res.success) return;
          const payload = (res.data as { isLocked?: boolean; lockout?: unknown }) ?? res;
          if (payload.isLocked && payload.lockout) {
            const info = normalizeLockoutPayload(payload);
            if (info) setLockoutInfo(info);
          } else {
            setLockoutInfo(null);
          }
        });

    checkPromise.finally(() => {
      if (!cancelled) setLockoutChecking(false);
    });

    return () => { cancelled = true; };
  }, [user, isLockoutPaidPage, selectedFacilityId]);

  useEffect(() => {
    if (!user?.id || user.userType === 'admin') {
      setStrikeLockout(null);
      return;
    }

    const facilityId =
      selectedFacilityId && facilityIdsFromAuthUser(user).includes(selectedFacilityId)
        ? selectedFacilityId
        : facilityIdsFromAuthUser(user)[0];

    if (!facilityId) {
      setStrikeLockout(null);
      return;
    }

    let cancelled = false;
    setStrikeLockoutChecking(true);
    strikesApi.checkLockout(user.id, facilityId).then((res) => {
      if (cancelled) return;
      setStrikeLockout(res.success ? parseStrikeLockoutStatus(res.data) : null);
    }).finally(() => {
      if (!cancelled) setStrikeLockoutChecking(false);
    });

    return () => { cancelled = true; };
  }, [user?.id, user?.userType, user?.memberFacilities, user?.adminFacilities, selectedFacilityId]);

  if (loading || (termsLoading && pendingTermsAcceptances.length === 0)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {termsLoading ? 'Checking terms acceptance...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (
    (lockoutChecking && !lockoutInfo && user.userType !== 'admin' && !isLockoutPaidPage) ||
    (strikeLockoutChecking && user.userType !== 'admin')
  ) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Checking account status…</p>
        </div>
      </div>
    );
  }

  if (lockoutInfo && user.userType !== 'admin' && !isLockoutPaidPage && !isMyReservationsRoute) {
    return <PaymentLockoutScreen lockout={lockoutInfo} />;
  }

  if (
    strikeLockout?.isLockedOut &&
    user.userType !== 'admin' &&
    !isProfileRoute
  ) {
    return (
      <StrikeLockoutScreen
        status={strikeLockout}
        facilityName={strikeLockout.facilityName}
      />
    );
  }

  if (pendingTermsAcceptances.length > 0) {
    return <TermsAcceptanceGate />;
  }

  return <>{children}</>;
}
