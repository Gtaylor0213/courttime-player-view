import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Tag } from 'lucide-react';
import { formatAnnualPrice } from '../../services/subscriptionPricing';
import type { CourtAddPromoValidation } from './useCourtAddPromo';

type Props = {
  courtsToAdd: number;
  baseAmountCents: number;
  finalAmountCents: number;
  paymentRequired: boolean;
  perCourtLabel: string;
  promoCode: string;
  setPromoCode: (value: string) => void;
  promoValidation: CourtAddPromoValidation | null;
  setPromoValidation: (value: CourtAddPromoValidation | null) => void;
  isValidatingPromo: boolean;
  onValidate: () => void;
  onClear: () => void;
};

export function CourtAddPromoSection({
  courtsToAdd,
  baseAmountCents,
  finalAmountCents,
  paymentRequired,
  perCourtLabel,
  promoCode,
  setPromoCode,
  promoValidation,
  setPromoValidation,
  isValidatingPromo,
  onValidate,
  onClear,
}: Props) {
  if (!paymentRequired) {
    return null;
  }

  const chargeableCourts = Math.round(baseAmountCents / 5000) || courtsToAdd;

  return (
    <div className="md:col-span-2 space-y-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div>
        <p className="text-sm font-medium text-gray-900">Platform court fee</p>
        <p className="text-xs text-gray-600 mt-1">
          Adding {courtsToAdd} court{courtsToAdd !== 1 ? 's' : ''} requires a one-time fee of {perCourtLabel} per court
          (until your plan reaches the annual maximum).
        </p>
      </div>

      <div className="bg-white rounded-lg p-3 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">
            {perCourtLabel} × {chargeableCourts} court{chargeableCourts !== 1 ? 's' : ''}
          </span>
          <span>{formatAnnualPrice(baseAmountCents)}</span>
        </div>
        {promoValidation?.valid && baseAmountCents !== finalAmountCents && (
          <div className="flex justify-between items-center text-green-600">
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              Promo: {promoCode}
            </span>
            <span>-{formatAnnualPrice(baseAmountCents - finalAmountCents)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between items-center font-semibold">
          <span>Total due now</span>
          {finalAmountCents === 0 ? (
            <span className="text-green-600">$0.00 (Free)</span>
          ) : (
            <span>{formatAnnualPrice(finalAmountCents)}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1">
          <Tag className="h-3.5 w-3.5" />
          Promo Code
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={promoCode}
            onChange={(e) => {
              setPromoCode(e.target.value.toUpperCase());
              if (promoValidation) setPromoValidation(null);
            }}
            placeholder="Enter promo code"
          />
          {promoValidation?.valid ? (
            <Button type="button" variant="outline" onClick={onClear}>
              Clear
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={onValidate}
              disabled={!promoCode.trim() || isValidatingPromo}
            >
              {isValidatingPromo ? 'Checking...' : 'Apply'}
            </Button>
          )}
        </div>
        {promoValidation && (
          <p className={`text-sm ${promoValidation.valid ? 'text-green-600' : 'text-red-600'}`}>
            {promoValidation.message}
          </p>
        )}
      </div>
    </div>
  );
}
