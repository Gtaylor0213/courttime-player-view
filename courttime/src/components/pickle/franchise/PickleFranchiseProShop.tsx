import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { ShoppingBag } from 'lucide-react';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

export function PickleFranchiseProShop() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);

  const isFacilityAdmin = Boolean(facilityId && user?.adminFacilities?.includes(facilityId));

  useEffect(() => {
    if (!facilityId || !isFacilityAdmin) return;
    pickleApi.getFacilitySummary(facilityId).then((res) => {
      if (res.success && res.data) {
        const summary = unwrapApiPayload<{ orgId?: string | null }>(res.data);
        if (summary?.orgId) setOrgId(summary.orgId);
      }
    }).catch(() => undefined);
  }, [facilityId, isFacilityAdmin]);

  if (!isFacilityAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          Facility admin access is required.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Pro Shop</h2>
        <p className="text-sm text-gray-500">Retail and point-of-sale for your location</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Location retail
          </CardTitle>
          <CardDescription>
            Use the POS to sell pro shop items, or manage corporate catalog rollouts from your brand org.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {orgId && facilityId && (
            <>
              <Button
                className="bg-green-700 hover:bg-green-800"
                onClick={() => navigate(`/pickle/org/${orgId}/pos/${facilityId}`)}
              >
                Open POS
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/pickle/org/${orgId}/pro-shop`)}
              >
                Corporate catalog
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
