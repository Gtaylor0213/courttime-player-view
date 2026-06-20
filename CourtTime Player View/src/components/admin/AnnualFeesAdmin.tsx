import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DollarSign, Plus, Pencil, Trash2, Users, PlayCircle, History, CreditCard, AlertCircle, CheckCircle, Lock } from 'lucide-react';
import { annualFeesApi } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { toast } from 'sonner';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Tiers tab
// ---------------------------------------------------------------------------

function TiersTab({ facilityId }: { facilityId: string }) {
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', amountDollars: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await annualFeesApi.getTiers(facilityId);
    if (res.success) setTiers(res.data);
    setLoading(false);
  }, [facilityId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', amountDollars: '', description: '' });
    setModalOpen(true);
  }

  function openEdit(tier: any) {
    setEditing(tier);
    setForm({
      name: tier.name,
      amountDollars: (tier.amountCents / 100).toFixed(2),
      description: tier.description ?? '',
    });
    setModalOpen(true);
  }

  async function handleSave() {
    const amountCents = Math.round(parseFloat(form.amountDollars) * 100);
    if (!form.name.trim() || isNaN(amountCents) || amountCents < 0) {
      toast.error('Name and a valid amount are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const res = await annualFeesApi.updateTier(facilityId, editing.id, {
          name: form.name.trim(),
          amountCents,
          description: form.description.trim() || null,
        });
        if (!res.success) throw new Error(res.error);
        toast.success('Tier updated');
      } else {
        const res = await annualFeesApi.createTier(facilityId, {
          name: form.name.trim(),
          amountCents,
          description: form.description.trim() || undefined,
        });
        if (!res.success) throw new Error(res.error);
        toast.success('Tier created');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save tier');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tierId: string) {
    if (!confirm('Delete this tier? Members assigned to it will be unassigned.')) return;
    setDeletingId(tierId);
    const res = await annualFeesApi.deleteTier(facilityId, tierId);
    if (res.success) { toast.success('Tier deleted'); load(); }
    else toast.error(res.error ?? 'Failed to delete tier');
    setDeletingId(null);
  }

  async function handleToggleActive(tier: any) {
    const res = await annualFeesApi.updateTier(facilityId, tier.id, { isActive: !tier.isActive });
    if (res.success) load();
    else toast.error(res.error ?? 'Failed to update tier');
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading tiers…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define the annual fee tiers for your facility. Assign members to tiers on the Members tab.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Tier
        </Button>
      </div>

      {tiers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No tiers yet. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tiers.map(tier => (
            <Card key={tier.id} className={!tier.isActive ? 'opacity-60' : ''}>
              <CardContent className="py-3 px-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{tier.name}</span>
                    {!tier.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  {tier.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{tier.description}</p>
                  )}
                </div>
                <span className="font-semibold text-green-700 whitespace-nowrap">
                  {formatCents(tier.amountCents)}/yr
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleToggleActive(tier)} title={tier.isActive ? 'Deactivate' : 'Activate'}>
                    {tier.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(tier)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(tier.id)}
                    disabled={deletingId === tier.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Tier' : 'New Fee Tier'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Tier Name</Label>
              <Input
                placeholder="e.g. Full Member, Social Member"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Annual Fee (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  className="pl-6"
                  placeholder="0.00"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amountDollars}
                  onChange={e => setForm(f => ({ ...f, amountDollars: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description of this tier"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Tier'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members tab
// ---------------------------------------------------------------------------

function MembersTab({ facilityId }: { facilityId: string }) {
  const [members, setMembers] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, tRes] = await Promise.all([
      annualFeesApi.getMembers(facilityId),
      annualFeesApi.getTiers(facilityId),
    ]);
    if (mRes.success) setMembers(mRes.data);
    if (tRes.success) setTiers(tRes.data.filter((t: any) => t.isActive));
    setLoading(false);
  }, [facilityId]);

  useEffect(() => { load(); }, [load]);

  async function handleTierChange(userId: string, tierId: string) {
    setSaving(userId);
    const res = await annualFeesApi.assignMemberTier(facilityId, userId, tierId === 'none' ? null : tierId);
    if (res.success) {
      setMembers(prev => prev.map(m => {
        if (m.userId !== userId) return m;
        const tier = tiers.find(t => t.id === tierId);
        return { ...m, tierId: tier?.id ?? null, tierName: tier?.name ?? null, tierAmountCents: tier?.amountCents ?? null };
      }));
    } else {
      toast.error(res.error ?? 'Failed to assign tier');
    }
    setSaving(null);
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading members…</div>;

  if (tiers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Create fee tiers on the Tiers tab before assigning members.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assign each active member to an annual fee tier. Members without a tier will not be billed.
      </p>
      <Card>
        <div className="divide-y">
          {members.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">No active members found.</div>
          )}
          {members.map(member => (
            <div key={member.userId} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{member.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {member.hasSavedCard ? (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    {member.cardBrand} ···{member.cardLast4}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">No saved card</span>
                )}
                <Select
                  value={member.tierId ?? 'none'}
                  onValueChange={val => handleTierChange(member.userId, val)}
                  disabled={saving === member.userId}
                >
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue placeholder="No tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tier</SelectItem>
                    {tiers.map(tier => (
                      <SelectItem key={tier.id} value={tier.id}>
                        {tier.name} — {formatCents(tier.amountCents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing tab
// ---------------------------------------------------------------------------

function BillingTab({ facilityId }: { facilityId: string }) {
  const [config, setConfig] = useState<any>(null);
  const [configForm, setConfigForm] = useState({ month: '1', day: '1' });
  const [configSaving, setConfigSaving] = useState(false);

  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runRecords, setRunRecords] = useState<Record<string, any[]>>({});

  useEffect(() => {
    annualFeesApi.getConfig(facilityId).then(res => {
      if (res.success && res.data) {
        setConfig(res.data);
        setConfigForm({ month: String(res.data.billingMonth), day: String(res.data.billingDay) });
      }
    });
    loadHistory();
  }, [facilityId]);

  async function loadHistory() {
    setHistoryLoading(true);
    const res = await annualFeesApi.getBillingHistory(facilityId);
    if (res.success) setHistory(res.data);
    setHistoryLoading(false);
  }

  async function saveConfig() {
    setConfigSaving(true);
    const res = await annualFeesApi.saveConfig(facilityId, Number(configForm.month), Number(configForm.day));
    if (res.success) { setConfig(res.data); toast.success('Billing date saved'); }
    else toast.error(res.error ?? 'Failed to save');
    setConfigSaving(false);
  }

  async function loadPreview() {
    setPreviewLoading(true);
    const res = await annualFeesApi.previewBilling(facilityId);
    if (res.success) setPreview(res.data);
    else toast.error(res.error ?? 'Failed to load preview');
    setPreviewLoading(false);
  }

  async function handleRun() {
    if (!confirm('Run annual billing now? Members with saved cards will be charged immediately.')) return;
    setRunning(true);
    const res = await annualFeesApi.runBilling(facilityId);
    if (res.success) {
      setLastResult(res.data);
      toast.success(`Billing complete — ${res.data.chargedCount} charged, ${res.data.lockoutCount} payment lockouts applied`);
      setPreview(null);
      loadHistory();
    } else {
      toast.error(res.error ?? 'Billing run failed');
    }
    setRunning(false);
  }

  async function toggleRunDetails(runId: string) {
    if (expandedRun === runId) { setExpandedRun(null); return; }
    setExpandedRun(runId);
    if (!runRecords[runId]) {
      const res = await annualFeesApi.getBillingRunRecords(facilityId, runId);
      if (res.success) setRunRecords(prev => ({ ...prev, [runId]: res.data }));
    }
  }

  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {/* Billing date config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Annual Billing Date</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set the month and day when annual fees should be collected each year.
            Days are capped at 28 to avoid month-length issues.
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label>Month</Label>
              <Select value={configForm.month} onValueChange={v => setConfigForm(f => ({ ...f, month: v }))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Day</Label>
              <Select value={configForm.day} onValueChange={v => setConfigForm(f => ({ ...f, day: v }))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map(d => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveConfig} disabled={configSaving}>
              {configSaving ? 'Saving…' : 'Save Date'}
            </Button>
          </div>
          {config && (
            <p className="text-sm text-muted-foreground">
              Current: <span className="font-medium text-foreground">
                {MONTHS[config.billingMonth - 1]} {config.billingDay}
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview & run */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run Annual Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadPreview} disabled={previewLoading}>
              {previewLoading ? 'Loading…' : 'Preview Billing Run'}
            </Button>
            <Button
              onClick={handleRun}
              disabled={running}
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              <PlayCircle className="h-4 w-4 mr-1" />
              {running ? 'Running…' : 'Run Annual Billing'}
            </Button>
          </div>

          {lastResult && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm space-y-1">
              <p className="font-medium text-green-800">Billing run complete ({lastResult.billingYear})</p>
              <p className="text-green-700">Charged: {lastResult.chargedCount} &nbsp;·&nbsp; Lockouts applied: {lastResult.lockoutCount} &nbsp;·&nbsp; Failed: {lastResult.failedCount}</p>
            </div>
          )}

          {preview && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Preview — {preview.billingYear} ({preview.members.length} members with active tiers)
              </p>
              <div className="rounded-md border divide-y text-sm max-h-72 overflow-y-auto">
                {preview.members.length === 0 && (
                  <div className="py-4 text-center text-muted-foreground">
                    No members with active tiers to bill.
                  </div>
                )}
                {preview.members.map((m: any) => (
                  <div key={m.userId} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{m.fullName}</span>
                      <span className="text-xs text-muted-foreground">{m.tierName}</span>
                    </div>
                    <span className="font-medium text-green-700">{formatCents(m.amountCents)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {m.alreadyBilledThisYear ? (
                        <Badge variant="secondary" className="text-xs">Already billed</Badge>
                      ) : m.hasSavedCard ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Card on file
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Lockout
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Billing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="py-4 text-center text-muted-foreground text-sm">Loading…</div>
          ) : history.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-sm">No billing runs yet.</div>
          ) : (
            <div className="space-y-2">
              {history.map(run => (
                <div key={run.id} className="rounded-md border">
                  <button
                    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => toggleRunDetails(run.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{run.billingYear} Annual Billing</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatDate(run.startedAt)}
                        {run.triggeredByName && ` · by ${run.triggeredByName}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="text-green-700 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> {run.chargedCount}
                      </span>
                      <span className="text-amber-600 flex items-center gap-1">
                        <Lock className="h-3 w-3" /> {run.lockoutCount}
                      </span>
                      {run.failedCount > 0 && (
                        <span className="text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {run.failedCount}
                        </span>
                      )}
                    </div>
                  </button>
                  {expandedRun === run.id && (
                    <div className="border-t divide-y text-xs max-h-60 overflow-y-auto">
                      {(runRecords[run.id] ?? []).map(rec => (
                        <div key={rec.id} className="flex items-center gap-3 px-4 py-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{rec.fullName}</span>
                            <span className="text-muted-foreground">{rec.tierName}</span>
                          </div>
                          <span className="text-green-700">{formatCents(rec.amountCents)}</span>
                          <Badge
                            variant="secondary"
                            className={
                              rec.status === 'charged'
                                ? 'bg-green-100 text-green-700'
                                : rec.status === 'lockout_applied'
                                ? 'bg-amber-100 text-amber-700'
                                : rec.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : ''
                            }
                          >
                            {rec.status === 'charged' ? 'Charged'
                              : rec.status === 'lockout_applied' ? 'Lockout'
                              : rec.status === 'failed' ? 'Failed'
                              : rec.status}
                          </Badge>
                          {rec.errorMessage && (
                            <span className="text-red-600 truncate max-w-32" title={rec.errorMessage}>
                              {rec.errorMessage}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AnnualFeesAdmin() {
  const { selectedFacilityId: facilityId } = useAppContext();

  if (!facilityId) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Select a facility to manage annual fees.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <DollarSign className="h-6 w-6 text-green-700" />
        <div>
          <h1 className="text-xl font-semibold">Annual Membership Fees</h1>
          <p className="text-sm text-muted-foreground">Configure tiers, assign members, and run annual billing</p>
        </div>
      </div>

      <Tabs defaultValue="tiers">
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          <TabsTrigger value="tiers">Tiers</TabsTrigger>
          <TabsTrigger value="members">
            <Users className="h-3.5 w-3.5 mr-1" />Members
          </TabsTrigger>
          <TabsTrigger value="billing">
            <PlayCircle className="h-3.5 w-3.5 mr-1" />Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tiers" className="mt-4">
          <TiersTab facilityId={facilityId} />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersTab facilityId={facilityId} />
        </TabsContent>
        <TabsContent value="billing" className="mt-4">
          <BillingTab facilityId={facilityId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
