import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import {
  BarChart3, Users, TrendingUp, DollarSign, PieChart,
} from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

interface RevenueReport {
  totalCents: number;
  startDate: string;
  endDate: string;
  byCategory: Array<{ category: string; amountCents: number; eventCount: number }>;
}

interface ProgramReport {
  stub: boolean;
  note: string;
  registrations: { total: number; byProgram: Array<{ programName: string; count: number }> };
  demographics: {
    gender: Array<{ label: string; count: number }>;
    ageBands: Array<{ band: string; count: number }>;
  };
}

interface LifecycleReport {
  stub: boolean;
  note: string;
  segments: Array<{ segment: string; description: string; playerCount: number }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  memberships: 'Memberships',
  pro_shop: 'Pro Shop',
  academy: 'Academy',
  drop_in: 'Drop-in',
  private_events: 'Private Events',
  sponsorships: 'Sponsorships',
};

export function PickleOrgReports() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [programs, setPrograms] = useState<ProgramReport | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleReport | null>(null);

  const isOrgAdmin = user?.orgAdminOrgs?.some((o) => o.orgId === orgId);

  useEffect(() => {
    if (!orgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }
    loadReports();
  }, [orgId, isOrgAdmin]);

  const loadReports = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [revRes, progRes, lifeRes] = await Promise.all([
        pickleApi.getRevenueReport(orgId),
        pickleApi.getProgramReport(orgId),
        pickleApi.getLifecycleReport(orgId),
      ]);
      if (revRes.success && revRes.data) {
        const r = unwrapApiPayload<RevenueReport>(revRes.data);
        if (r) setRevenue(r);
      }
      if (progRes.success && progRes.data) {
        const p = unwrapApiPayload<ProgramReport>(progRes.data);
        if (p) setPrograms(p);
      }
      if (lifeRes.success && lifeRes.data) {
        const l = unwrapApiPayload<LifecycleReport>(lifeRes.data);
        if (l) setLifecycle(l);
      }
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to view reports.</p>
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
  const maxCategoryCents = Math.max(...(revenue?.byCategory.map((c) => c.amountCents) || [1]), 1);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-green-700 font-medium">CourtTime-Pickle · Reports</p>
          <h1 className="text-2xl font-bold text-gray-900">{orgName}</h1>
          <p className="text-gray-500 text-sm">
            {revenue?.startDate} — {revenue?.endDate}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/pickle/org/${orgId}`)}>
          Org Dashboard
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-xl font-bold">${((revenue?.totalCents || 0) / 100).toFixed(2)}</p>
              <p className="text-xs text-gray-500">Total Revenue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-xl font-bold">{programs?.registrations.total ?? 0}</p>
              <p className="text-xs text-gray-500">Active Members</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-700" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {lifecycle?.segments.find((s) => s.segment === 'new')?.playerCount ?? 0}
              </p>
              <p className="text-xs text-gray-500">New Players (stub)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {revenue?.byCategory.find((c) => c.category === 'pro_shop')?.eventCount ?? 0}
              </p>
              <p className="text-xs text-gray-500">Pro Shop Events</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Revenue by Category
          </CardTitle>
          <CardDescription>From pickle_revenue_events ledger</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {revenue?.byCategory.map((row) => (
            <div key={row.category}>
              <div className="flex justify-between text-sm mb-1">
                <span>{CATEGORY_LABELS[row.category] || row.category}</span>
                <span className="font-medium">${(row.amountCents / 100).toFixed(2)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 rounded-full transition-all"
                  style={{ width: `${Math.max(2, (row.amountCents / maxCategoryCents) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Program Registrations</CardTitle>
            {programs?.stub && <Badge variant="secondary">Stub data</Badge>}
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {programs?.registrations.byProgram.map((p) => (
                  <tr key={p.programName} className="border-b last:border-0">
                    <td className="py-2">{p.programName}</td>
                    <td className="py-2 text-right font-medium">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {programs?.note && (
              <p className="text-xs text-gray-500 mt-3">{programs.note}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Player Lifecycle</CardTitle>
            {lifecycle?.stub && <Badge variant="secondary">Stub data</Badge>}
          </CardHeader>
          <CardContent className="space-y-2">
            {lifecycle?.segments.map((s) => (
              <div key={s.segment} className="flex justify-between text-sm border-b pb-2">
                <div>
                  <p className="font-medium capitalize">{s.segment.replace('_', ' ')}</p>
                  <p className="text-xs text-gray-500">{s.description}</p>
                </div>
                <span className="font-bold">{s.playerCount}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Demographics (stub)</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium mb-2">Gender</p>
            {programs?.demographics.gender.map((g) => (
              <div key={g.label} className="flex justify-between text-sm py-1">
                <span>{g.label}</span>
                <span>{g.count}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Age Bands</p>
            {programs?.demographics.ageBands.map((a) => (
              <div key={a.band} className="flex justify-between text-sm py-1">
                <span>{a.band}</span>
                <span>{a.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
