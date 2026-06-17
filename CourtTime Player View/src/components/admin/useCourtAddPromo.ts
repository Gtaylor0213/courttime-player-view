import { useCallback, useEffect, useMemo, useState } from 'react';
import { paymentsApi } from '../../api/client';
import {
  courtAddPaymentCents,
  formatAnnualPrice,
  getAmountForCourts,
  PER_COURT_CENTS,
} from '../../services/subscriptionPricing';

export type CourtAddPromoValidation = {
  valid: boolean;
  finalAmountCents?: number;
  message?: string;
};

export function useCourtAddPromo(activeCourtCount: number, courtsToAdd: number) {
  const [promoCode, setPromoCode] = useState('');
  const [promoValidation, setPromoValidation] = useState<CourtAddPromoValidation | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);

  const baseAmountCents = useMemo(() => {
    const subscriptionAmount = getAmountForCourts(Math.max(activeCourtCount, 1));
    return courtAddPaymentCents(courtsToAdd, activeCourtCount, subscriptionAmount);
  }, [activeCourtCount, courtsToAdd]);

  const finalAmountCents = promoValidation?.valid
    ? (promoValidation.finalAmountCents ?? baseAmountCents)
    : baseAmountCents;

  const paymentRequired = baseAmountCents > 0;

  useEffect(() => {
    setPromoValidation(null);
  }, [courtsToAdd, baseAmountCents]);

  const resetPromo = useCallback(() => {
    setPromoCode('');
    setPromoValidation(null);
  }, []);

  const handleValidatePromo = useCallback(async () => {
    if (!promoCode.trim() || baseAmountCents <= 0) return;
    setIsValidatingPromo(true);
    try {
      const result = await paymentsApi.validatePromo(promoCode.trim(), { baseAmountCents });
      if (result.success && result.data) {
        const promo = result.data?.data || result.data;
        setPromoValidation(promo);
      } else {
        setPromoValidation({ valid: false, message: result.error || 'Invalid promo code' });
      }
    } catch {
      setPromoValidation({ valid: false, message: 'Error validating promo code' });
    } finally {
      setIsValidatingPromo(false);
    }
  }, [promoCode, baseAmountCents]);

  const handleClearPromo = useCallback(() => {
    resetPromo();
  }, [resetPromo]);

  const appliedPromoCode = promoValidation?.valid ? promoCode.trim() : undefined;

  return {
    promoCode,
    setPromoCode,
    promoValidation,
    setPromoValidation,
    isValidatingPromo,
    baseAmountCents,
    finalAmountCents,
    paymentRequired,
    appliedPromoCode,
    handleValidatePromo,
    handleClearPromo,
    resetPromo,
    perCourtLabel: formatAnnualPrice(PER_COURT_CENTS),
  };
}
