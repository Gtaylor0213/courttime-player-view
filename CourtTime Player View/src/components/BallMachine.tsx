import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, KeyRound, Target } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { ballMachineApi } from '../api/client';
import { toast } from 'sonner';

/**
 * Member Ball Machine tab (st_marlow_ball_machine feature flag).
 *
 * Passes bought here are unlimited-use for their term. The per-hour alternative is
 * charged on the booking itself, so this page only explains it.
 */

interface PassProduct {
  id: string;
  durationMonths: number;
  priceCents: number;
}

interface Pass {
  id: string;
  durationMonths: number;
  priceCentsAtPurchase: number;
  startsAt: string;
  expiresAt: string;
  status: string;
  grantedBy: string | null;
}

interface Status {
  machineCount: number;
  instructions: string | null;
  hasAccessCode: boolean;
  products: PassProduct[];
  activePass: Pass | null;
  passes: Pass[];
  hourlyFromCents: number | null;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function durationLabel(months: number): string {
  if (months === 12) return '1 year';
  return `${months} month${months === 1 ? '' : 's'}`;
}

export function BallMachine() {
  const { user } = useAuth();
  const { selectedFacilityId } = useAppContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [buyingMonths, setBuyingMonths] = useState<number | null>(null);
  const confirmInFlightRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      setLoading(true);
      const res: any = await ballMachineApi.getStatus(selectedFacilityId);
      if (res.success && res.data) {
        setStatus(res.data);
        setUnavailable(false);

        // Only pass holders can read the code; a 403 here is expected and silent.
        if (res.data.activePass && res.data.hasAccessCode) {
          const codeRes: any = await ballMachineApi.getAccessCode(selectedFacilityId);
          setAccessCode(codeRes.success ? codeRes.data?.accessCode ?? null : null);
        } else {
          setAccessCode(null);
        }
      } else {
        setStatus(null);
        setUnavailable(true);
      }
    } catch (err) {
      console.error('Error loading ball machine status:', err);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Activate the pass after returning from Stripe Checkout.
  useEffect(() => {
    const success = searchParams.get('passPurchaseSuccess');
    const sessionId = searchParams.get('session_id');
    if (searchParams.get('passPurchaseCancelled') === '1') {
      navigate('/ball-machine', { replace: true });
      return;
    }
    if (success !== '1' || !user?.id) return;

    const finish = () => navigate('/ball-machine', { replace: true });

    if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
      toast.info('Payment received. Refreshing your pass…');
      void load().then(finish);
      return;
    }
    if (confirmInFlightRef.current === sessionId) return;
    confirmInFlightRef.current = sessionId;

    void (async () => {
      try {
        const res: any = await ballMachineApi.confirmPurchase(sessionId);
        if (res.success) {
          toast.success('Your ball machine pass is active.');
        } else {
          toast.error(res.error || 'Payment received but the pass could not be activated.');
        }
      } catch {
        toast.error('Payment received but the pass could not be activated. Contact the club.');
      } finally {
        confirmInFlightRef.current = null;
        await load();
        finish();
      }
    })();
  }, [searchParams, user?.id, navigate, load]);

  const handleBuy = async (durationMonths: number) => {
    if (!selectedFacilityId) return;
    setBuyingMonths(durationMonths);
    try {
      const res: any = await ballMachineApi.purchasePass(selectedFacilityId, durationMonths);
      if (res.success && res.data?.url) {
        window.location.href = res.data.url;
        return;
      }
      toast.error(res.error || 'Could not start checkout.');
    } catch {
      toast.error('Could not start checkout.');
    } finally {
      setBuyingMonths(null);
    }
  };

  if (!selectedFacilityId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Target className="h-12 w-12 mb-3" />
        <p className="text-sm">Select a club to see ball machine passes.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (unavailable || !status) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Target className="h-12 w-12 mb-3" />
        <p className="text-sm">The ball machine isn't available at this club.</p>
      </div>
    );
  }

  const { activePass, products, passes, hourlyFromCents, machineCount } = status;
  const history = passes.filter((p) => p.id !== activePass?.id);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Target className="h-6 w-6 text-green-700" />
          Ball Machine
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Buy a pass for unlimited use, or pay by the hour when you book.
        </p>
      </div>

      {/* Current status */}
      {activePass ? (
        <Card className="p-5 border-green-200 bg-green-50/60">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-green-900">
                {durationLabel(activePass.durationMonths)} pass — unlimited use
              </p>
              <p className="text-sm text-green-800 mt-0.5">
                Active through {formatDate(activePass.expiresAt)}
              </p>

              {accessCode ? (
                <div className="mt-4 rounded-lg border-2 border-green-300 bg-white px-4 py-3 inline-block">
                  <p className="text-xs font-medium uppercase tracking-wide text-green-800 flex items-center gap-1">
                    <KeyRound className="h-3 w-3" />
                    Keypad code
                  </p>
                  <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-green-900">
                    {accessCode}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-green-800">
                  The club hasn't set an access code yet — ask the front desk.
                </p>
              )}

              <p className="text-xs text-green-800 mt-3">
                Tick "Add ball machine" when you book and you won't be charged again.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <p className="font-medium text-gray-900">No active pass</p>
          <p className="text-sm text-gray-500 mt-1">
            {hourlyFromCents
              ? `You can still add the ball machine to any booking at ${formatDollars(hourlyFromCents)}/hr.`
              : 'Buy a pass below to use the ball machine.'}
          </p>
        </Card>
      )}

      {/* Pass options */}
      {products.length > 0 && (
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-3">
            {activePass ? 'Extend or add a pass' : 'Passes'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <Card key={p.id} className="p-4 flex flex-col">
                <p className="font-medium text-gray-900">{durationLabel(p.durationMonths)}</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">
                  {formatDollars(p.priceCents)}
                </p>
                <p className="text-xs text-gray-500 mt-1 flex-1">Unlimited use</p>
                <Button
                  className="mt-3 w-full"
                  onClick={() => handleBuy(p.durationMonths)}
                  disabled={buyingMonths !== null}
                >
                  {buyingMonths === p.durationMonths ? 'Starting…' : 'Buy'}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {products.length === 0 && (
        <Card className="p-5">
          <p className="text-sm text-gray-500">
            This club hasn't set up ball machine passes yet.
          </p>
        </Card>
      )}

      {/* Pay-per-use explainer */}
      {hourlyFromCents !== null && (
        <Card className="p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900">Prefer to pay per session?</p>
            <p className="mt-0.5">
              Add the ball machine when you book and pay {formatDollars(hourlyFromCents)}/hr — no pass
              needed.
            </p>
          </div>
        </Card>
      )}

      {machineCount > 1 && (
        <p className="text-xs text-gray-500">
          This club has {machineCount} ball machines. They're first come, first served when you book.
        </p>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-3">Past passes</h2>
          <Card className="divide-y">
            {history.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {durationLabel(p.durationMonths)} pass
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(p.startsAt)} – {formatDate(p.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    {p.grantedBy ? 'Comped' : formatDollars(p.priceCentsAtPurchase)}
                  </span>
                  <Badge variant="secondary" className="capitalize">
                    {new Date(p.expiresAt) < new Date() ? 'expired' : p.status}
                  </Badge>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

export default BallMachine;
