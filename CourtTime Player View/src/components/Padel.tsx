import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trophy, Plus, Users, Calendar, Clock, Settings } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { padelApi, openSpotApi } from '../api/client';
import { CreateSocialPlaySession } from './padel/CreateSocialPlaySession';
import { PadelSessionList, type PadelSessionSummary } from './padel/PadelSessionList';
import { toast } from 'sonner';

interface OpenBooking {
  id: string;
  courtName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  maxPlayers: number | null;
  hostName: string;
  claimedCount: string;
}

/**
 * Member Social Play tab (padel feature flag): create/join Americano/Mexicano
 * sessions (optionally paid drop-in), and claim open spots on other members'
 * bookings.
 */
export function Padel() {
  const { user } = useAuth();
  const { selectedFacilityId } = useAppContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [sessions, setSessions] = useState<PadelSessionSummary[]>([]);
  const [openBookings, setOpenBookings] = useState<OpenBooking[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [dropInRateCents, setDropInRateCents] = useState<number | null>(null);
  const [showPricingEditor, setShowPricingEditor] = useState(false);
  const [pricingInput, setPricingInput] = useState('');
  const [savingPricing, setSavingPricing] = useState(false);

  const isFacilityAdmin = Boolean(selectedFacilityId && user?.adminFacilities?.includes(selectedFacilityId));

  const load = useCallback(async () => {
    if (!selectedFacilityId) return;
    setLoading(true);
    const [sessionsRes, openRes, pricingRes] = await Promise.all([
      padelApi.listSessions(selectedFacilityId),
      openSpotApi.listOpen(selectedFacilityId),
      padelApi.getPricing(selectedFacilityId),
    ]);
    if (sessionsRes.success) {
      setSessions((sessionsRes.data as { sessions: PadelSessionSummary[] }).sessions);
      setUnavailable(false);
    } else {
      setSessions([]);
      setUnavailable(true);
    }
    if (openRes.success) {
      setOpenBookings((openRes.data as { bookings: OpenBooking[] }).bookings);
    }
    if (pricingRes.success) {
      const cents = (pricingRes.data as { dropInRateCents: number | null }).dropInRateCents;
      setDropInRateCents(cents);
      setPricingInput(cents != null ? (cents / 100).toFixed(2) : '');
    }
    setLoading(false);
  }, [selectedFacilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fallback confirmation after the Stripe redirect -- the webhook is authoritative,
  // this just reloads so the player isn't left wondering whether it worked.
  useEffect(() => {
    if (searchParams.get('padelPaymentSuccess') === '1') {
      toast.success('Payment received — you\'re in!');
      void load();
      navigate('/padel', { replace: true });
    } else if (searchParams.get('padelPaymentCancelled') === '1') {
      toast.info('Payment was not completed, so your spot was not held.');
      navigate('/padel', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleJoin = async (sessionId: string) => {
    const res = await padelApi.joinSession(sessionId);
    if (!res.success) {
      toast.error(res.error || 'Could not join session');
      return;
    }
    const data = res.data as { requiresPayment?: boolean; checkoutUrl?: string };
    if (data.requiresPayment && data.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }
    toast.success('Joined session');
    await load();
  };

  const handleStart = async (sessionId: string) => {
    const res = await padelApi.startSession(sessionId);
    if (res.success) {
      toast.success('Session started — round 1 is ready');
      await load();
    } else {
      toast.error(res.error || 'Could not start session');
    }
  };

  const handleClaim = async (bookingId: string) => {
    const res = await openSpotApi.claimSpot(bookingId);
    if (res.success) {
      toast.success('Spot claimed');
      await load();
    } else {
      toast.error(res.error || 'Could not claim spot');
    }
  };

  const handleSavePricing = async () => {
    if (!selectedFacilityId) return;
    const trimmed = pricingInput.trim();
    const cents = trimmed === '' ? null : Math.round(Number(trimmed) * 100);
    if (cents !== null && (!Number.isFinite(cents) || cents <= 0)) {
      toast.error('Enter a valid dollar amount, or leave blank for free/members-only');
      return;
    }
    setSavingPricing(true);
    try {
      const res = await padelApi.setPricing(selectedFacilityId, cents);
      if (res.success) {
        setDropInRateCents(cents);
        toast.success(cents ? `Drop-in rate set to $${(cents / 100).toFixed(2)}/player` : 'Padel is now free/members-only');
        setShowPricingEditor(false);
      } else {
        toast.error(res.error || 'Could not update pricing');
      }
    } finally {
      setSavingPricing(false);
    }
  };

  if (!selectedFacilityId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Trophy className="h-12 w-12 mb-3" />
        <p className="text-sm">Select a facility to view Padel.</p>
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
        <Trophy className="h-12 w-12 mb-3" />
        <p className="text-sm">Padel is not available for this facility.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Padel</h1>
          {dropInRateCents != null && (
            <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
              ${(dropInRateCents / 100).toFixed(2)}/player drop-in
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFacilityAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowPricingEditor((v) => !v)}>
              <Settings className="h-4 w-4 mr-1" /> Pricing
            </Button>
          )}
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Social Play
          </Button>
        </div>
      </div>

      {isFacilityAdmin && showPricingEditor && (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Padel drop-in rate</p>
          <p className="text-xs text-gray-500">
            Per-player fee to join a Social Play session. Leave blank to keep padel free and members-only
            (active membership required). Set a price to open drop-in to any registered member, including
            first-timers, who pay when they join.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">$</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Free / members-only"
              className="w-32"
              value={pricingInput}
              onChange={(e) => setPricingInput(e.target.value)}
            />
            <span className="text-sm text-gray-500">/ player</span>
            <Button size="sm" onClick={handleSavePricing} disabled={savingPricing}>
              {savingPricing ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">Social Play Sessions</h2>
        <PadelSessionList
          sessions={sessions}
          currentUserId={user?.id}
          dropInRateCents={dropInRateCents}
          onJoin={handleJoin}
          onStart={handleStart}
        />
      </div>

      {openBookings.length > 0 && (
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">Open Matches</h2>
          <div className="space-y-3">
            {openBookings.map((b) => (
              <Card key={b.id} className="p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {b.bookingDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {b.startTime}–{b.endTime}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {b.claimedCount}/{b.maxPlayers ?? '?'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{b.courtName} · Hosted by {b.hostName}</p>
                </div>
                <Button size="sm" onClick={() => handleClaim(b.id)}>Claim Spot</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      <CreateSocialPlaySession
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        facilityId={selectedFacilityId}
        dropInRateCents={dropInRateCents}
        onCreated={load}
      />
    </div>
  );
}
