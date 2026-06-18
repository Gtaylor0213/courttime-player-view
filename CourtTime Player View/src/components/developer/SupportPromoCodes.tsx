import React, { useState, useEffect } from 'react';
import { Plus, Tag, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { getPromoCodes, createPromoCode, updatePromoCode } from '../../api/supportClient';
import { toast } from 'sonner';

export function SupportPromoCodes() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    description: '',
    discountType: 'full',
    trialMonths: '',
    maxUses: '',
    isInternal: false,
  });

  const loadCodes = async () => {
    setLoading(true);
    const res = await getPromoCodes();
    if (res.success) setCodes(res.data);
    setLoading(false);
  };

  useEffect(() => { loadCodes(); }, []);

  const handleCreate = async () => {
    if (!form.code.trim()) {
      toast.error('Code is required');
      return;
    }
    setCreating(true);
    const res = await createPromoCode({
      code: form.code,
      description: form.description || undefined,
      discountType: form.discountType,
      trialMonths: form.trialMonths ? Number(form.trialMonths) : null,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      isInternal: form.isInternal,
    });
    if (res.success) {
      toast.success(`Promo code ${form.code.toUpperCase()} created`);
      setShowCreate(false);
      setForm({ code: '', description: '', discountType: 'full', trialMonths: '', maxUses: '', isInternal: false });
      loadCodes();
    } else {
      toast.error(res.error || 'Failed to create code');
    }
    setCreating(false);
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const res = await updatePromoCode(id, { isActive });
    if (res.success) {
      toast.success(isActive ? 'Code activated' : 'Code deactivated');
      loadCodes();
    } else {
      toast.error(res.error || 'Failed to update');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Promo Codes</h1>
          <p className="text-sm text-gray-500 mt-1">Create trial codes and discounts for new facility signups</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Code
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <Tag className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-mono font-semibold">{c.code}</p>
                        <button onClick={() => copyCode(c.code)} className="text-gray-400 hover:text-gray-600">
                          {copied === c.code ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        {c.is_internal && <Badge variant="outline" className="text-xs">Internal</Badge>}
                        {c.trial_months && (
                          <Badge className="text-xs bg-blue-100 text-blue-700">{c.trial_months}mo trial</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{c.description || 'No description'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Used {c.current_uses}{c.max_uses ? ` / ${c.max_uses}` : ''} times
                        {c.valid_until && ` · Expires ${new Date(c.valid_until).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={c.is_active ? 'default' : 'secondary'}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={(v) => handleToggleActive(c.id, v)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {codes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No promo codes yet.</p>
          )}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Promo Code</DialogTitle>
            <DialogDescription>Codes are automatically uppercased.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                placeholder="e.g. SUMMER2026"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="What is this code for?"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select value={form.discountType} onValueChange={(v) => setForm((p) => ({ ...p, discountType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full (100% off)</SelectItem>
                    <SelectItem value="percent">Percent</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trial Months (optional)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 3"
                  value={form.trialMonths}
                  onChange={(e) => setForm((p) => ({ ...p, trialMonths: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max Uses (blank = unlimited)</Label>
              <Input
                type="number"
                placeholder="Unlimited"
                value={form.maxUses}
                onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isInternal}
                onCheckedChange={(v) => setForm((p) => ({ ...p, isInternal: v }))}
              />
              <Label>Internal code (e.g. COURTTIME-INTERNAL)</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !form.code.trim()}>
                {creating ? 'Creating...' : 'Create Code'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
