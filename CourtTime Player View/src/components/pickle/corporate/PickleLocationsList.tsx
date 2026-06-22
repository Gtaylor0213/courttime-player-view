import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import { Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';

interface OrgLocation {
  id: string;
  name: string;
  city?: string;
  state?: string;
  courtCount?: number;
  memberCount?: number;
  stripeOnboarded?: boolean;
  setupStatus?: 'pending' | 'complete';
  setupMode?: 'complete' | 'quick';
}

export function PickleLocationsList() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadLocations();
  }, [orgId]);

  const loadLocations = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const result = await pickleApi.listLocations(orgId);
      if (result.success && result.data) {
        const payload = unwrapApiPayload<{ locations: OrgLocation[] }>(result.data);
        setLocations(payload?.locations ?? []);
      }
    } catch {
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Locations</h2>
          <p className="text-sm text-gray-500">Franchise locations under your brand</p>
        </div>
        <Button
          className="bg-green-700 hover:bg-green-800 shrink-0"
          onClick={() => navigate(`/pickle/org/${orgId}/locations/new`)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </Button>
      </div>

      {!locations.length ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-gray-500 text-sm mb-4">No locations yet. Provision your first franchise location.</p>
          <Button
            className="bg-green-700 hover:bg-green-800"
            onClick={() => navigate(`/pickle/org/${orgId}/locations/new`)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>City / State</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead className="text-right">Courts</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead>Stripe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc) => (
                <TableRow
                  key={loc.id}
                  className="cursor-pointer hover:bg-green-50/50"
                  onClick={() => navigate(`/pickle/org/${orgId}/locations/${loc.id}`)}
                >
                  <TableCell className="font-medium">{loc.name}</TableCell>
                  <TableCell className="text-gray-500">
                    {[loc.city, loc.state].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    {loc.setupStatus === 'complete' ? (
                      <Badge className="bg-green-100 text-green-800">Complete</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{loc.courtCount ?? '—'}</TableCell>
                  <TableCell className="text-right">{loc.memberCount ?? '—'}</TableCell>
                  <TableCell>
                    {loc.stripeOnboarded ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
