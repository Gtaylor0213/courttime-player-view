import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Package, Plus, Rocket, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

const SKU_CATEGORIES = ['paddle', 'shoe', 'ball', 'apparel', 'grab_and_go'] as const;

interface RetailSku {
  id: string;
  nationalSku: string;
  name: string;
  category: string;
  brand: string | null;
  basePriceCents: number;
  status: string;
}

interface OrgLocation {
  id: string;
  name: string;
}

export function PickleProShopAdmin() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [skus, setSkus] = useState<RetailSku[]>([]);
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [rolloutSkuId, setRolloutSkuId] = useState('');
  const [rolloutFacilityId, setRolloutFacilityId] = useState('all');

  const [form, setForm] = useState({
    nationalSku: '',
    name: '',
    category: 'paddle',
    brand: '',
    basePriceDollars: '',
  });

  const isOrgAdmin = user?.orgAdminOrgs?.some((o) => o.orgId === orgId);

  useEffect(() => {
    if (!orgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgId, isOrgAdmin]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [skuRes, locRes] = await Promise.all([
        pickleApi.listRetailSkus(orgId),
        pickleApi.listLocations(orgId),
      ]);
      if (skuRes.success && skuRes.data) {
        const payload = unwrapApiPayload<{ skus: RetailSku[] }>(skuRes.data);
        if (payload?.skus) setSkus(payload.skus);
      }
      if (locRes.success && locRes.data) {
        const payload = unwrapApiPayload<{ locations: OrgLocation[] }>(locRes.data);
        if (payload?.locations) setLocations(payload.locations);
      }
    } catch {
      toast.error('Failed to load pro shop catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    const dollars = parseFloat(form.basePriceDollars);
    if (Number.isNaN(dollars) || dollars < 0) {
      toast.error('Enter a valid price');
      return;
    }
    setCreating(true);
    try {
      const result = await pickleApi.createRetailSku(orgId, {
        nationalSku: form.nationalSku.trim(),
        name: form.name.trim(),
        category: form.category,
        brand: form.brand.trim() || undefined,
        basePriceCents: Math.round(dollars * 100),
      });
      if (result.success) {
        toast.success('SKU created');
        setForm({ nationalSku: '', name: '', category: 'paddle', brand: '', basePriceDollars: '' });
        await loadData();
      } else {
        toast.error(result.error || 'Failed to create SKU');
      }
    } catch {
      toast.error('Failed to create SKU');
    } finally {
      setCreating(false);
    }
  };

  const handleRollout = async () => {
    if (!orgId || !rolloutSkuId) {
      toast.error('Select a SKU to roll out');
      return;
    }
    try {
      const result = await pickleApi.rolloutRetailSku(orgId, {
        skuId: rolloutSkuId,
        facilityId: rolloutFacilityId === 'all' ? undefined : rolloutFacilityId,
        status: 'active',
      });
      if (result.success) {
        toast.success('SKU rolled out to location(s)');
      } else {
        toast.error(result.error || 'Rollout failed');
      }
    } catch {
      toast.error('Rollout failed');
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to view this page.</p>
        <Button className="mt-4" onClick={() => navigate('/login')}>Log in</Button>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">You do not have access to this organization.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  const orgName = user.orgAdminOrgs?.find((o) => o.orgId === orgId)?.orgName || 'Organization';

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-green-700 font-medium">CourtTime-Pickle · Pro Shop</p>
          <h1 className="text-2xl font-bold text-gray-900">{orgName}</h1>
          <p className="text-gray-500 text-sm">National SKU catalog & rollouts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/pickle/org/${orgId}`)}>
            Org Dashboard
          </Button>
          {locations[0] && (
            <Button
              className="bg-green-700 hover:bg-green-800"
              onClick={() => navigate(`/pickle/org/${orgId}/pos/${locations[0].id}`)}
            >
              <ShoppingBag className="h-4 w-4 mr-2" />
              Open POS
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add National SKU
          </CardTitle>
          <CardDescription>Corporate catalog item — roll out to franchise locations after creation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateSku} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="nationalSku">National SKU</Label>
              <Input
                id="nationalSku"
                required
                placeholder="PKL-PAD-001"
                value={form.nationalSku}
                onChange={(e) => setForm({ ...form, nationalSku: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                placeholder="Pro Paddle 16mm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKU_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                placeholder="Optional"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="price">Base price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="89.99"
                value={form.basePriceDollars}
                onChange={(e) => setForm({ ...form, basePriceDollars: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={creating}>
                {creating ? 'Saving...' : 'Create SKU'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Roll Out SKU
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Select value={rolloutSkuId} onValueChange={setRolloutSkuId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select SKU" />
            </SelectTrigger>
            <SelectContent>
              {skus.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nationalSku} — {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={rolloutFacilityId} onValueChange={setRolloutFacilityId}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleRollout} className="shrink-0">Roll Out</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            SKU Catalog ({skus.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {skus.length === 0 ? (
            <p className="text-sm text-gray-500">No SKUs yet. Add your first product above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">SKU</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{s.nationalSku}</td>
                      <td className="py-2 pr-4">{s.name}{s.brand ? ` · ${s.brand}` : ''}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary">{s.category}</Badge>
                      </td>
                      <td className="py-2 pr-4">${(s.basePriceCents / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
