import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Target, Trash2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAppContext } from '../../contexts/AppContext';
import { adminApi, ballMachineApi, facilitiesApi, membersApi } from '../../api/client';
import { toast } from 'sonner';

/**
 * Admin Ball Machine tab (st_marlow_ball_machine feature flag). Sets the keypad code,
 * how many machines exist, pass pricing, and the club-wide hourly rate; also lists and
 * comps passes.
 *
 * The hourly rate lives per-court (courts.ball_machine_fee_cents), so saving it here
 * bulk-applies to every court — same call SetFeesForAllPanel makes.
 */

const DURATIONS = [1, 3, 6, 12] as const;

interface PassHolder {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  durationMonths: number;
  priceCentsAtPurchase: number;
  expiresAt: string;
  status: string;
  grantedBy: string | null;
}

interface ProductForm {
  durationMonths: number;
  priceDollars: string;
  isActive: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function durationLabel(months: number): string {
  return months === 12 ? '1 year' : `${months} month${months === 1 ? '' : 's'}`;
}

function isLive(p: PassHolder): boolean {
  return p.status === 'active' && new Date(p.expiresAt) > new Date();
}

export function BallMachineAdmin() {
  const { selectedFacilityId } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const [accessCode, setAccessCode] = useState('');
  const [machineCount, setMachineCount] = useState('1');
  const [instructions, setInstructions] = useState('');
  const [products, setProducts] = useState<ProductForm[]>([]);
  const [hourlyDollars, setHourlyDollars] = useState('');
  const [holders, setHolders] = useState<PassHolder[]>([]);

  const [members, setMembers] = useState<Array<{ userId: string; fullName: string }>>([]);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantMonths, setGrantMonths] = useState('12');

  const load = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      setLoading(true);
      const res: any = await ballMachineApi.getAdminConfig(selectedFacilityId);
      if (!res.success || !res.data) {
        setUnavailable(true);
        return;
      }
      setUnavailable(false);

      const config = res.data.config ?? {};
      const saved: any[] = Array.isArray(res.data.products) ? res.data.products : [];
      setAccessCode(config.accessCode ?? '');
      setMachineCount(String(config.machineCount ?? 1));
      setInstructions(config.instructions ?? '');

      // Always render all four durations, pre-filled where the club has set a price.
      setProducts(
        DURATIONS.map((months) => {
          const existing = saved.find((p: any) => p.durationMonths === months);
          return {
            durationMonths: months,
            priceDollars: existing ? (existing.priceCents / 100).toFixed(2) : '',
            isActive: existing?.isActive ?? false,
          };
        })
      );

      const holdersRes: any = await ballMachineApi.getPassHolders(selectedFacilityId);
      setHolders(
        holdersRes.success && Array.isArray(holdersRes.data) ? holdersRes.data : []
      );

      const courtsRes: any = await facilitiesApi.getCourts(selectedFacilityId);
      const courts = courtsRes?.data?.courts ?? [];
      const rates: number[] = courts
        .map((c: any) => c.ballMachineFeeCents ?? c.ball_machine_fee_cents)
        .filter((v: any) => v != null)
        .map(Number);
      // Only prefill when every court agrees, so saving doesn't silently flatten
      // intentional per-court overrides.
      const uniform = rates.length === courts.length && new Set(rates).size === 1;
      setHourlyDollars(uniform && rates[0] ? (rates[0] / 100).toFixed(2) : '');
    } catch (err) {
      console.error('Error loading ball machine admin:', err);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedFacilityId) return;
    membersApi
      .getFacilityMembers(selectedFacilityId)
      .then((res: any) => {
        const list = res?.data?.members ?? res?.members ?? [];
        setMembers(
          (Array.isArray(list) ? list : []).map((m: any) => ({
            userId: m.userId ?? m.user_id ?? m.id,
            fullName: m.fullName ?? m.full_name ?? m.email,
          }))
        );
      })
      .catch(() => setMembers([]));
  }, [selectedFacilityId]);

  const saveConfig = async () => {
    if (!selectedFacilityId) return;
    const count = parseInt(machineCount, 10);
    if (!Number.isInteger(count) || count < 1) {
      toast.error('Machine count must be at least 1');
      return;
    }
    setSaving('config');
    try {
      const res: any = await ballMachineApi.updateConfig(selectedFacilityId, {
        accessCode: accessCode.trim() || null,
        machineCount: count,
        instructions: instructions.trim() || null,
      });
      if (res.success) toast.success('Ball machine settings saved');
      else toast.error(res.error || 'Could not save settings');
    } finally {
      setSaving(null);
    }
  };

  const savePricing = async () => {
    if (!selectedFacilityId) return;
    const payload = products
      .filter((p) => p.priceDollars.trim() !== '')
      .map((p) => ({
        durationMonths: p.durationMonths,
        priceCents: Math.round(parseFloat(p.priceDollars) * 100),
        isActive: p.isActive,
      }));

    if (payload.some((p) => !Number.isFinite(p.priceCents) || p.priceCents < 0)) {
      toast.error('Prices must be valid dollar amounts');
      return;
    }
    if (payload.length === 0) {
      toast.error('Set a price for at least one pass length');
      return;
    }

    setSaving('pricing');
    try {
      const res: any = await ballMachineApi.updateProducts(selectedFacilityId, payload);
      if (res.success) toast.success('Pass pricing saved');
      else toast.error(res.error || 'Could not save pricing');
    } finally {
      setSaving(null);
    }
  };

  const saveHourly = async () => {
    if (!selectedFacilityId) return;
    const dollars = hourlyDollars.trim();
    const cents = dollars === '' ? null : Math.round(parseFloat(dollars) * 100);
    if (cents !== null && (!Number.isFinite(cents) || cents <= 0)) {
      toast.error('Hourly rate must be a positive dollar amount, or blank for no charge');
      return;
    }

    setSaving('hourly');
    try {
      const courtsRes: any = await facilitiesApi.getCourts(selectedFacilityId);
      const courtIds = (courtsRes?.data?.courts ?? []).map((c: any) => c.id);
      if (courtIds.length === 0) {
        toast.error('This club has no courts to apply the rate to');
        return;
      }
      const res: any = await adminApi.bulkUpdateCourts(courtIds, {
        ballMachineFeeCents: cents,
      });
      if (res.success) {
        toast.success(
          cents === null
            ? 'Hourly ball machine charge removed from all courts'
            : `Hourly rate applied to ${courtIds.length} court${courtIds.length === 1 ? '' : 's'}`
        );
      } else {
        toast.error(res.error || 'Could not apply the hourly rate');
      }
    } finally {
      setSaving(null);
    }
  };

  const handleGrant = async () => {
    if (!selectedFacilityId || !grantUserId) {
      toast.error('Pick a member first');
      return;
    }
    setSaving('grant');
    try {
      const res: any = await ballMachineApi.grantPass(
        selectedFacilityId,
        grantUserId,
        parseInt(grantMonths, 10)
      );
      if (res.success) {
        toast.success('Pass granted');
        setGrantUserId('');
        await load();
      } else {
        toast.error(res.error || 'Could not grant the pass');
      }
    } finally {
      setSaving(null);
    }
  };

  const handleRevoke = async (passId: string) => {
    if (!selectedFacilityId) return;
    setSaving(passId);
    try {
      const res: any = await ballMachineApi.revokePass(selectedFacilityId, passId);
      if (res.success) {
        toast.success('Pass revoked');
        await load();
      } else {
        toast.error(res.error || 'Could not revoke the pass');
      }
    } finally {
      setSaving(null);
    }
  };

  if (!selectedFacilityId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Target className="h-12 w-12 mb-3" />
        <p className="text-sm">Select a facility.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Target className="h-12 w-12 mb-3" />
        <p className="text-sm">The St. Marlow Ball Machine isn't enabled for this facility.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Target className="h-6 w-6 text-green-700" />
          Ball Machine
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Set the keypad code and what members pay to use the machine.
        </p>
      </div>

      {/* Access code + machines */}
      <Card className="p-5 space-y-4">
        <h2 className="font-medium text-gray-900 flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Access
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bm-code">Keypad code</Label>
            <Input
              id="bm-code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="e.g. 4821"
              maxLength={32}
            />
            <p className="text-xs text-gray-500">
              Everyone with access sees this code. Changing it takes effect immediately.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bm-count">Machines at this club</Label>
            <Input
              id="bm-count"
              type="number"
              min="1"
              value={machineCount}
              onChange={(e) => setMachineCount(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Overlapping bookings beyond this many are blocked.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bm-instructions">Instructions (optional)</Label>
          <Input
            id="bm-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Machine is in the shed behind Court 4"
          />
        </div>

        <Button onClick={saveConfig} disabled={saving === 'config'}>
          {saving === 'config' ? 'Saving…' : 'Save access settings'}
        </Button>
      </Card>

      {/* Pass pricing */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-medium text-gray-900">Pass pricing</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            A pass is unlimited use for its term. Turn off any length you don't want to sell.
          </p>
        </div>

        <div className="space-y-3">
          {products.map((p, i) => (
            <div key={p.durationMonths} className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium text-gray-900">
                {durationLabel(p.durationMonths)}
              </span>
              <div className="relative flex-1 max-w-[160px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-7"
                  value={p.priceDollars}
                  onChange={(e) =>
                    setProducts((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, priceDollars: e.target.value } : x))
                    )
                  }
                  placeholder="—"
                />
              </div>
              <Switch
                checked={p.isActive}
                onCheckedChange={(checked) =>
                  setProducts((prev) =>
                    prev.map((x, xi) => (xi === i ? { ...x, isActive: checked === true } : x))
                  )
                }
              />
              <span className="text-xs text-gray-500 w-16">
                {p.isActive ? 'For sale' : 'Hidden'}
              </span>
            </div>
          ))}
        </div>

        <Button onClick={savePricing} disabled={saving === 'pricing'}>
          {saving === 'pricing' ? 'Saving…' : 'Save pricing'}
        </Button>
      </Card>

      {/* Hourly rate */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-medium text-gray-900">Hourly rate</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            What members without a pass pay per hour. Saving applies this to every court; you can
            still override individual courts in Court Management.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="bm-hourly">Per hour</Label>
            <div className="relative w-[160px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <Input
                id="bm-hourly"
                type="number"
                step="0.01"
                min="0"
                className="pl-7"
                value={hourlyDollars}
                onChange={(e) => setHourlyDollars(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>
          <Button variant="outline" onClick={saveHourly} disabled={saving === 'hourly'}>
            {saving === 'hourly' ? 'Applying…' : 'Apply to all courts'}
          </Button>
        </div>
      </Card>

      {/* Pass holders */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-medium text-gray-900">Pass holders</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {holders.filter(isLive).length} member
            {holders.filter(isLive).length === 1 ? '' : 's'} with a live pass.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-gray-50 p-3">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">Comp a pass</Label>
            <Select value={grantUserId} onValueChange={setGrantUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Length</Label>
            <Select value={grantMonths} onValueChange={setGrantMonths}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {durationLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleGrant} disabled={saving === 'grant'}>
            {saving === 'grant' ? 'Granting…' : 'Grant'}
          </Button>
        </div>

        {holders.length === 0 ? (
          <p className="text-sm text-gray-500">No passes sold yet.</p>
        ) : (
          <div className="divide-y border rounded-md">
            {holders.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.fullName}</p>
                  <p className="text-xs text-gray-500">
                    {durationLabel(p.durationMonths)} · through {formatDate(p.expiresAt)}
                    {p.grantedBy ? ' · comped' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={isLive(p) ? 'default' : 'secondary'}>
                    {isLive(p) ? 'Active' : p.status === 'active' ? 'Expired' : p.status}
                  </Badge>
                  {isLive(p) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(p.id)}
                      disabled={saving === p.id}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default BallMachineAdmin;
