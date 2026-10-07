import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound, Plus, Target, Trash2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAppContext } from '../../contexts/AppContext';
import { ballMachineApi, membersApi } from '../../api/client';
import { toast } from 'sonner';

/**
 * Admin Ball Machine tab (st_marlow_ball_machine feature flag).
 *
 * A facility can configure one or more named machines (e.g. separate tennis and
 * pickleball machines), each with its own keypad code, instructions, hourly rate,
 * and pass pricing. A pass can also be sold as "all machines" (machineId null),
 * covering every machine at the facility.
 */

const DURATIONS = [1, 3, 6, 12] as const;
const ALL_MACHINES_KEY = '__all__';

interface Machine {
  id: string;
  name: string;
  accessCode: string | null;
  instructions: string | null;
  hourlyFeeCents: number | null;
  machineCount: number;
  isActive: boolean;
  sortOrder: number;
}

interface MachineDraft {
  name: string;
  accessCode: string;
  instructions: string;
  hourlyDollars: string;
  machineCountStr: string;
}

interface Product {
  id: string;
  machineId: string | null;
  durationMonths: number;
  priceCents: number;
  isActive: boolean;
}

interface ProductForm {
  durationMonths: number;
  priceDollars: string;
  isActive: boolean;
}

interface PassHolder {
  id: string;
  userId: string;
  machineId: string | null;
  machineName: string | null;
  fullName: string;
  email: string;
  durationMonths: number;
  priceCentsAtPurchase: number;
  expiresAt: string;
  status: string;
  grantedBy: string | null;
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

function draftFromMachine(m: Machine): MachineDraft {
  return {
    name: m.name,
    accessCode: m.accessCode ?? '',
    instructions: m.instructions ?? '',
    hourlyDollars: m.hourlyFeeCents ? (m.hourlyFeeCents / 100).toFixed(2) : '',
    machineCountStr: String(m.machineCount),
  };
}

function productFormsFor(products: Product[], machineKey: string): ProductForm[] {
  return DURATIONS.map((months) => {
    const existing = products.find(
      (p) => p.durationMonths === months && (p.machineId ?? ALL_MACHINES_KEY) === machineKey
    );
    return {
      durationMonths: months,
      priceDollars: existing ? (existing.priceCents / 100).toFixed(2) : '',
      isActive: existing?.isActive ?? false,
    };
  });
}

/** Pricing sub-section shared by each machine card and the all-machines card. */
function PricingEditor({
  forms,
  onChange,
  onSave,
  saving,
}: {
  forms: ProductForm[];
  onChange: (next: ProductForm[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium text-gray-900">Pass pricing</p>
      <div className="space-y-2">
        {forms.map((p, i) => (
          <div key={p.durationMonths} className="flex items-center gap-3">
            <span className="w-20 text-sm text-gray-700">{durationLabel(p.durationMonths)}</span>
            <div className="relative flex-1 max-w-[140px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                className="pl-7 h-8"
                value={p.priceDollars}
                onChange={(e) =>
                  onChange(forms.map((x, xi) => (xi === i ? { ...x, priceDollars: e.target.value } : x)))
                }
                placeholder="—"
              />
            </div>
            <Switch
              checked={p.isActive}
              onCheckedChange={(checked) =>
                onChange(forms.map((x, xi) => (xi === i ? { ...x, isActive: checked === true } : x)))
              }
            />
            <span className="text-xs text-gray-500 w-16">{p.isActive ? 'For sale' : 'Hidden'}</span>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save pricing'}
      </Button>
    </div>
  );
}

export function BallMachineAdmin() {
  const { selectedFacilityId } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MachineDraft>>({});
  const [productForms, setProductForms] = useState<Record<string, ProductForm[]>>({});
  const [holders, setHolders] = useState<PassHolder[]>([]);
  const [addingMachine, setAddingMachine] = useState(false);
  const [newMachineName, setNewMachineName] = useState('');

  const [members, setMembers] = useState<Array<{ userId: string; fullName: string }>>([]);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantMachineKey, setGrantMachineKey] = useState<string>(ALL_MACHINES_KEY);
  const [grantMonths, setGrantMonths] = useState('12');

  const load = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      setLoading(true);
      const [machinesRes, productsRes, holdersRes]: any[] = await Promise.all([
        ballMachineApi.getMachines(selectedFacilityId),
        ballMachineApi.getProducts(selectedFacilityId),
        ballMachineApi.getPassHolders(selectedFacilityId),
      ]);

      if (!machinesRes.success) {
        setUnavailable(true);
        return;
      }
      setUnavailable(false);

      const machineList: Machine[] = Array.isArray(machinesRes.data) ? machinesRes.data : [];
      setMachines(machineList);

      const nextDrafts: Record<string, MachineDraft> = {};
      machineList.forEach((m) => {
        nextDrafts[m.id] = draftFromMachine(m);
      });
      setDrafts(nextDrafts);

      const products: Product[] = Array.isArray(productsRes.data) ? productsRes.data : [];
      const nextForms: Record<string, ProductForm[]> = {
        [ALL_MACHINES_KEY]: productFormsFor(products, ALL_MACHINES_KEY),
      };
      machineList.forEach((m) => {
        nextForms[m.id] = productFormsFor(products, m.id);
      });
      setProductForms(nextForms);

      setHolders(Array.isArray(holdersRes.data) ? holdersRes.data : []);
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

  const handleAddMachine = async () => {
    if (!selectedFacilityId || !newMachineName.trim()) {
      toast.error('Give the machine a name');
      return;
    }
    setSaving('add-machine');
    try {
      const res: any = await ballMachineApi.createMachine(selectedFacilityId, {
        name: newMachineName.trim(),
      });
      if (res.success) {
        toast.success('Machine added');
        setNewMachineName('');
        setAddingMachine(false);
        await load();
      } else {
        toast.error(res.error || 'Could not add the machine');
      }
    } finally {
      setSaving(null);
    }
  };

  const saveMachine = async (machineId: string) => {
    if (!selectedFacilityId) return;
    const draft = drafts[machineId];
    if (!draft) return;
    const count = parseInt(draft.machineCountStr, 10);
    if (!Number.isInteger(count) || count < 1) {
      toast.error('Machine count must be at least 1');
      return;
    }
    const dollars = draft.hourlyDollars.trim();
    const cents = dollars === '' ? null : Math.round(parseFloat(dollars) * 100);
    if (cents !== null && (!Number.isFinite(cents) || cents <= 0)) {
      toast.error('Hourly rate must be a positive dollar amount, or blank for no charge');
      return;
    }

    setSaving(`machine-${machineId}`);
    try {
      const res: any = await ballMachineApi.updateMachine(selectedFacilityId, machineId, {
        name: draft.name.trim(),
        accessCode: draft.accessCode.trim() || null,
        instructions: draft.instructions.trim() || null,
        hourlyFeeCents: cents,
        machineCount: count,
      });
      if (res.success) {
        toast.success('Machine saved');
        await load();
      } else {
        toast.error(res.error || 'Could not save the machine');
      }
    } finally {
      setSaving(null);
    }
  };

  const toggleActive = async (machine: Machine) => {
    if (!selectedFacilityId) return;
    setSaving(`active-${machine.id}`);
    try {
      const res: any = machine.isActive
        ? await ballMachineApi.deactivateMachine(selectedFacilityId, machine.id)
        : await ballMachineApi.updateMachine(selectedFacilityId, machine.id, { isActive: true });
      if (res.success) {
        toast.success(machine.isActive ? 'Machine deactivated' : 'Machine reactivated');
        await load();
      } else {
        toast.error(res.error || 'Could not update the machine');
      }
    } finally {
      setSaving(null);
    }
  };

  // Active machines first (by sort order), inactive ones after — matches the
  // order rendered below. moveMachine swaps within this exact sequence so the
  // arrows move a card to where it visually appears to go, not its raw sortOrder
  // slot (which can differ once an inactive machine sits between active ones).
  const sortedMachines = [...machines].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });

  const moveMachine = async (machineId: string, direction: -1 | 1) => {
    if (!selectedFacilityId) return;
    const ordered = sortedMachines.map((m) => m.id);
    const idx = ordered.indexOf(machineId);
    const swapWith = idx + direction;
    if (idx < 0 || swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];

    setSaving(`reorder-${machineId}`);
    try {
      const res: any = await ballMachineApi.reorderMachines(selectedFacilityId, ordered);
      if (res.success) {
        await load();
      } else {
        toast.error(res.error || 'Could not reorder machines');
      }
    } finally {
      setSaving(null);
    }
  };

  const savePricing = async (machineKey: string) => {
    if (!selectedFacilityId) return;
    const forms = productForms[machineKey] ?? [];
    const machineId = machineKey === ALL_MACHINES_KEY ? null : machineKey;
    const payload = forms
      .filter((p) => p.priceDollars.trim() !== '')
      .map((p) => ({
        machineId,
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

    setSaving(`pricing-${machineKey}`);
    try {
      const res: any = await ballMachineApi.updateProducts(selectedFacilityId, payload);
      if (res.success) toast.success('Pass pricing saved');
      else toast.error(res.error || 'Could not save pricing');
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
      const machineId = grantMachineKey === ALL_MACHINES_KEY ? null : grantMachineKey;
      const res: any = await ballMachineApi.grantPass(
        selectedFacilityId,
        grantUserId,
        machineId,
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
        const count = res.data?.count ?? 1;
        toast.success(
          count > 1 ? `Access ended — ${count} overlapping passes cancelled` : 'Pass revoked'
        );
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
        <p className="text-sm">The ball machine isn't enabled for this facility.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Target className="h-6 w-6 text-green-700" />
            Ball Machine
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Set up each machine's keypad code, instructions, and pricing. Add a second machine if you
            have, say, a separate tennis and pickleball machine.
          </p>
        </div>
        {!addingMachine && (
          <Button variant="outline" size="sm" onClick={() => setAddingMachine(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add machine
          </Button>
        )}
      </div>

      {addingMachine && (
        <Card className="p-4 flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-machine-name">Machine name</Label>
            <Input
              id="new-machine-name"
              value={newMachineName}
              onChange={(e) => setNewMachineName(e.target.value)}
              placeholder="e.g. Pickleball Ball Machine"
              autoFocus
            />
          </div>
          <Button onClick={handleAddMachine} disabled={saving === 'add-machine'}>
            {saving === 'add-machine' ? 'Adding…' : 'Add'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setAddingMachine(false);
              setNewMachineName('');
            }}
          >
            Cancel
          </Button>
        </Card>
      )}

      {sortedMachines.map((machine, i) => {
        const draft = drafts[machine.id] ?? draftFromMachine(machine);
        const isFirst = i === 0;
        const isLastActive =
          machine.isActive &&
          sortedMachines.filter((m) => m.isActive).slice(-1)[0]?.id === machine.id;

        return (
          <Card key={machine.id} className={`p-5 space-y-4 ${!machine.isActive ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label htmlFor={`name-${machine.id}`}>Name</Label>
                <Input
                  id={`name-${machine.id}`}
                  value={draft.name}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [machine.id]: { ...draft, name: e.target.value } }))
                  }
                />
              </div>
              <div className="flex items-center gap-1 pt-6 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isFirst || saving === `reorder-${machine.id}`}
                  onClick={() => moveMachine(machine.id, -1)}
                  title="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isLastActive || saving === `reorder-${machine.id}`}
                  onClick={() => moveMachine(machine.id, 1)}
                  title="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1.5 pl-2">
                  <Switch
                    checked={machine.isActive}
                    onCheckedChange={() => toggleActive(machine)}
                    disabled={saving === `active-${machine.id}`}
                  />
                  <span className="text-xs text-gray-500 w-14">
                    {machine.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`code-${machine.id}`} className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Keypad code
                </Label>
                <Input
                  id={`code-${machine.id}`}
                  value={draft.accessCode}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [machine.id]: { ...draft, accessCode: e.target.value },
                    }))
                  }
                  placeholder="e.g. 4821"
                  maxLength={32}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`count-${machine.id}`}>Units at this club</Label>
                <Input
                  id={`count-${machine.id}`}
                  type="number"
                  min="1"
                  value={draft.machineCountStr}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [machine.id]: { ...draft, machineCountStr: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`instructions-${machine.id}`}>Instructions (optional)</Label>
              <Input
                id={`instructions-${machine.id}`}
                value={draft.instructions}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [machine.id]: { ...draft, instructions: e.target.value },
                  }))
                }
                placeholder="e.g. Machine is in the shed behind Court 4"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`hourly-${machine.id}`}>Hourly rate (no pass)</Label>
              <div className="relative w-[160px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <Input
                  id={`hourly-${machine.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-7"
                  value={draft.hourlyDollars}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [machine.id]: { ...draft, hourlyDollars: e.target.value },
                    }))
                  }
                  placeholder="—"
                />
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => saveMachine(machine.id)}
              disabled={saving === `machine-${machine.id}`}
            >
              {saving === `machine-${machine.id}` ? 'Saving…' : 'Save machine'}
            </Button>

            <PricingEditor
              forms={productForms[machine.id] ?? productFormsFor([], machine.id)}
              onChange={(next) => setProductForms((prev) => ({ ...prev, [machine.id]: next }))}
              onSave={() => savePricing(machine.id)}
              saving={saving === `pricing-${machine.id}`}
            />
          </Card>
        );
      })}

      {/* All-machines pass pricing */}
      <Card className="p-5 space-y-2">
        <div>
          <h2 className="font-medium text-gray-900">All-machines pass</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            A pass sold here covers every machine at the club, instead of just one.
          </p>
        </div>
        <PricingEditor
          forms={productForms[ALL_MACHINES_KEY] ?? productFormsFor([], ALL_MACHINES_KEY)}
          onChange={(next) => setProductForms((prev) => ({ ...prev, [ALL_MACHINES_KEY]: next }))}
          onSave={() => savePricing(ALL_MACHINES_KEY)}
          saving={saving === `pricing-${ALL_MACHINES_KEY}`}
        />
      </Card>

      {/* Pass holders */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-medium text-gray-900">Pass holders</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {holders.filter(isLive).length} member{holders.filter(isLive).length === 1 ? '' : 's'} with a
            live pass.
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
          {machines.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Machine</Label>
              <Select value={grantMachineKey} onValueChange={setGrantMachineKey}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MACHINES_KEY}>All machines</SelectItem>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
                    {p.machineName ?? 'All machines'} · {durationLabel(p.durationMonths)} · through{' '}
                    {formatDate(p.expiresAt)}
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
