import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import { Label } from '../../ui/label';
import {
  CreditCard, MapPin, Package, RefreshCw, Sparkles, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

interface MembershipProduct {
  id: string;
  nationalSku: string;
  tier: string;
  name: string;
  priceCents: number;
  durationDays: number | null;
  isActive: boolean;
  entitlements?: {
    brandWide?: Record<string, unknown>;
    homeFacility?: Record<string, unknown>;
  };
}

interface OrgLocation {
  id: string;
  name: string;
  city: string;
  state: string;
}

interface ProductRollout {
  facilityId: string;
  facilityName?: string;
  enabled: boolean;
}

const TIER_COLORS: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-800',
  play: 'bg-blue-100 text-blue-800',
  unlimited: 'bg-green-100 text-green-800',
  pro: 'bg-purple-100 text-purple-800',
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PickleMembershipAdmin() {
  const { orgId } = useParams<{ orgId: string }>();
  const { user } = useAuth();
  const [products, setProducts] = useState<MembershipProduct[]>([]);
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [rollouts, setRollouts] = useState<ProductRollout[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [savingRollouts, setSavingRollouts] = useState(false);

  const isOrgAdmin = user?.orgAdminOrgs?.some((o) => o.orgId === orgId);

  useEffect(() => {
    if (!orgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }
    loadCatalog();
  }, [orgId, isOrgAdmin]);

  const loadCatalog = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [productsRes, locationsRes] = await Promise.all([
        pickleApi.listMembershipProducts(orgId, true),
        pickleApi.listLocations(orgId),
      ]);

      if (productsRes.success && productsRes.data) {
        const list = (productsRes.data as { data?: { products: MembershipProduct[] } }).data?.products
          ?? (productsRes.data as { products?: MembershipProduct[] }).products;
        if (list) {
          setProducts(list);
          if (!selectedProductId && list.length > 0) {
            setSelectedProductId(list[0].id);
          }
        }
      }

      if (locationsRes.success && locationsRes.data) {
        const locs = (locationsRes.data as { data?: { locations: OrgLocation[] } }).data?.locations
          ?? (locationsRes.data as { locations?: OrgLocation[] }).locations;
        if (locs) setLocations(locs);
      }
    } catch {
      toast.error('Failed to load membership catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId || !selectedProductId) return;
    loadRollouts(selectedProductId);
  }, [orgId, selectedProductId]);

  const loadRollouts = async (productId: string) => {
    if (!orgId) return;
    try {
      const res = await pickleApi.listProductRollouts(orgId, productId);
      if (res.success && res.data) {
        const existing = (res.data as { data?: { rollouts: Array<{ facilityId: string; facilityName?: string; enabled: boolean }> } }).data?.rollouts
          ?? (res.data as { rollouts?: Array<{ facilityId: string; facilityName?: string; enabled: boolean }> }).rollouts
          ?? [];

        const merged: ProductRollout[] = locations.map((loc) => {
          const found = existing.find((r) => r.facilityId === loc.id);
          return {
            facilityId: loc.id,
            facilityName: loc.name,
            enabled: found?.enabled ?? true,
          };
        });
        setRollouts(merged);
      }
    } catch {
      toast.error('Failed to load rollouts');
    }
  };

  const handleSeedDefaults = async () => {
    if (!orgId) return;
    setSeeding(true);
    try {
      const res = await pickleApi.seedMembershipProducts(orgId);
      if (res.success) {
        toast.success('Default membership tiers seeded');
        await loadCatalog();
      } else {
        toast.error(res.error || 'Failed to seed products');
      }
    } catch {
      toast.error('Failed to seed products');
    } finally {
      setSeeding(false);
    }
  };

  const handleRolloutToggle = (facilityId: string, enabled: boolean) => {
    setRollouts((prev) =>
      prev.map((r) => (r.facilityId === facilityId ? { ...r, enabled } : r))
    );
  };

  const handleSaveRollouts = async () => {
    if (!orgId || !selectedProductId) return;
    setSavingRollouts(true);
    try {
      const res = await pickleApi.setProductRollouts(orgId, selectedProductId, rollouts);
      if (res.success) {
        toast.success('Rollouts saved');
      } else {
        toast.error(res.error || 'Failed to save rollouts');
      }
    } catch {
      toast.error('Failed to save rollouts');
    } finally {
      setSavingRollouts(false);
    }
  };

  if (!isOrgAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 flex flex-col items-center gap-3">
            <AlertCircle className="h-10 w-10 text-amber-500" />
            <p className="text-muted-foreground text-center">
              You do not have access to manage membership catalog for this organization.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
        Loading membership catalog…
      </div>
    );
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-green-700" />
            Membership Catalog
          </h1>
          <p className="text-muted-foreground mt-1">
            National membership products and location rollouts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadCatalog}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleSeedDefaults} disabled={seeding}>
            <Sparkles className="h-4 w-4 mr-1" />
            {seeding ? 'Seeding…' : 'Seed Defaults'}
          </Button>
        </div>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <Package className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No membership products yet.</p>
            <Button onClick={handleSeedDefaults} disabled={seeding}>
              Seed Trial / Unlimited / Play / Pro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
              <CardDescription>
                Brand-wide perks apply at any location; home perks apply at the member&apos;s home club
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedProductId(product.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedProductId === product.id
                      ? 'border-green-600 bg-green-50'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{product.name}</span>
                      <Badge className={TIER_COLORS[product.tier] || ''}>{product.tier}</Badge>
                      {!product.isActive && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {product.nationalSku} · {formatPrice(product.priceCents)}
                      {product.durationDays ? ` / ${product.durationDays}d` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedProduct && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Rollout: {selectedProduct.name}
                </CardTitle>
                <CardDescription>
                  Enable or disable this membership at each franchise location
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {locations.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No franchise locations yet. Invite locations from the org dashboard first.
                  </p>
                ) : (
                  <>
                    {rollouts.map((rollout) => (
                      <div
                        key={rollout.facilityId}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                      >
                        <div>
                          <p className="font-medium">{rollout.facilityName}</p>
                          <p className="text-xs text-muted-foreground">{rollout.facilityId}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`rollout-${rollout.facilityId}`} className="text-sm">
                            {rollout.enabled ? 'Enabled' : 'Disabled'}
                          </Label>
                          <Switch
                            id={`rollout-${rollout.facilityId}`}
                            checked={rollout.enabled}
                            onCheckedChange={(checked) =>
                              handleRolloutToggle(rollout.facilityId, checked)
                            }
                          />
                        </div>
                      </div>
                    ))}
                    <Button onClick={handleSaveRollouts} disabled={savingRollouts}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      {savingRollouts ? 'Saving…' : 'Save Rollouts'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
