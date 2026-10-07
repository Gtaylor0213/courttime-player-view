import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import {
  CreditCard, Home, MapPin, Sparkles, Users, Calendar,
} from 'lucide-react';
import { pickleApi } from '../../../api/client';

interface MemberSubscription {
  id: string;
  status: string;
  homeFacilityId: string;
  homeFacilityName?: string;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  product?: {
    tier: string;
    name: string;
    nationalSku: string;
    entitlements?: {
      brandWide?: Record<string, boolean | number>;
      homeFacility?: Record<string, boolean | number>;
    };
  };
}

interface EntitlementData {
  isAtHomeFacility: boolean;
  homePerkUsage?: Record<string, { limit: number; used: number; remaining: number }>;
  brandWide?: Record<string, boolean | number> | null;
  dropInPriceCents?: number;
}

interface MemberMembershipCardProps {
  orgId: string;
  facilityId: string;
  className?: string;
}

const TIER_LABELS: Record<string, string> = {
  trial: 'Trial',
  unlimited: 'Unlimited',
  play: 'Play',
  pro: 'Pro',
};

const TIER_COLORS: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-800 border-amber-200',
  play: 'bg-blue-100 text-blue-800 border-blue-200',
  unlimited: 'bg-green-100 text-green-800 border-green-200',
  pro: 'bg-purple-100 text-purple-800 border-purple-200',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function PerkUsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MemberMembershipCard({ orgId, facilityId, className }: MemberMembershipCardProps) {
  const [subscription, setSubscription] = useState<MemberSubscription | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMembership();
  }, [orgId, facilityId]);

  const loadMembership = async () => {
    setLoading(true);
    try {
      const [subRes, entRes] = await Promise.all([
        pickleApi.getMemberSubscription(orgId),
        pickleApi.getMembershipEntitlements(orgId, facilityId),
      ]);

      if (subRes.success && subRes.data) {
        const sub = (subRes.data as { data?: { subscription: MemberSubscription | null } }).data?.subscription
          ?? (subRes.data as { subscription?: MemberSubscription | null }).subscription;
        setSubscription(sub ?? null);
      }

      if (entRes.success && entRes.data) {
        const ent = (entRes.data as { data?: EntitlementData }).data ?? (entRes.data as EntitlementData);
        setEntitlements(ent);
      }
    } catch {
      setSubscription(null);
      setEntitlements(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="pt-6 text-muted-foreground text-sm">
          Loading membership…
        </CardContent>
      </Card>
    );
  }

  if (!subscription?.product) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            Membership
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active membership. Drop-in rate:{' '}
            <span className="font-medium text-foreground">
              {formatPrice(entitlements?.dropInPriceCents ?? 1500)}
            </span>
          </p>
        </CardContent>
      </Card>
    );
  }

  const tier = subscription.product.tier;
  const homeUsage = entitlements?.homePerkUsage ?? {};
  const clinic = homeUsage.clinic;
  const guestPass = homeUsage.guest_pass;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-green-700" />
              {subscription.product.name}
            </CardTitle>
            <CardDescription>{subscription.product.nationalSku}</CardDescription>
          </div>
          <Badge variant="outline" className={TIER_COLORS[tier] || ''}>
            {TIER_LABELS[tier] || tier}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Home className="h-4 w-4" />
            <span>{subscription.homeFacilityName || subscription.homeFacilityId}</span>
          </div>
          {subscription.status === 'trialing' && subscription.trialEndsAt && (
            <div className="flex items-center gap-1.5 text-amber-700">
              <Calendar className="h-4 w-4" />
              <span>Trial ends {formatDate(subscription.trialEndsAt)}</span>
            </div>
          )}
          {subscription.currentPeriodEnd && subscription.status !== 'trialing' && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Renews {formatDate(subscription.currentPeriodEnd)}</span>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-green-50 border border-green-100 p-3 space-y-1">
          <p className="text-xs font-medium text-green-800 uppercase tracking-wide">
            Brand-wide (any location)
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {entitlements?.brandWide?.courtBooking && (
              <Badge variant="secondary">Courts</Badge>
            )}
            {entitlements?.brandWide?.openPlay && (
              <Badge variant="secondary">Open Play</Badge>
            )}
            {entitlements?.brandWide?.leagues && (
              <Badge variant="secondary">Leagues</Badge>
            )}
            {Number(entitlements?.brandWide?.courtDiscountPercent) > 0 && (
              <Badge variant="secondary">
                {entitlements?.brandWide?.courtDiscountPercent}% off courts
              </Badge>
            )}
          </div>
        </div>

        {entitlements?.isAtHomeFacility ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              Home location perks this month
            </p>
            {clinic && clinic.limit > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Clinics</span>
                  <span>{clinic.remaining} of {clinic.limit} left</span>
                </div>
                <PerkUsageBar used={clinic.used} limit={clinic.limit} />
              </div>
            )}
            {guestPass && guestPass.limit > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    Guest passes
                  </span>
                  <span>{guestPass.remaining} of {guestPass.limit} left</span>
                </div>
                <PerkUsageBar used={guestPass.used} limit={guestPass.limit} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Home perks (clinics, guest passes) apply at your home club only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
