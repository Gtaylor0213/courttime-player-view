import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Building2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useAppContext } from '../../../contexts/AppContext';
import { cn } from '../../ui/utils';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { pickleFranchiseAdminPath } from '../../../utils/pickleLoginRedirect';

const NAV_ITEMS = [
  { label: 'Dashboard', segment: '' },
  { label: 'Members', segment: 'members' },
  { label: 'Courts', segment: 'courts' },
  { label: 'Programs', segment: 'programs' },
  { label: 'Pro Shop', segment: 'pro-shop' },
  { label: 'Stripe', segment: 'stripe' },
] as const;

export function PickleFranchiseAdminLayout() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { setSelectedFacilityId } = useAppContext();
  const [facilityName, setFacilityName] = useState('Franchise Location');

  const isFacilityAdmin = Boolean(facilityId && user?.adminFacilities?.includes(facilityId));
  const basePath = facilityId ? pickleFranchiseAdminPath(facilityId) : '';

  useEffect(() => {
    if (!facilityId) return;
    setSelectedFacilityId(facilityId);
  }, [facilityId, setSelectedFacilityId]);

  useEffect(() => {
    if (!facilityId) return;
    pickleApi.getFacilitySummary(facilityId).then((res) => {
      if (res.success && res.data) {
        const summary = unwrapApiPayload<{ name?: string; setupStatus?: string }>(res.data);
        if (summary?.name) setFacilityName(summary.name);
        if (summary?.setupStatus === 'pending_setup') {
          navigate(`/pickle/location/${facilityId}/setup`, { replace: true });
        }
      }
    }).catch(() => undefined);
  }, [facilityId, navigate]);

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to view this page.</p>
        <Button className="mt-4 bg-green-700 hover:bg-green-800" onClick={() => navigate('/login')}>
          Log in
        </Button>
      </div>
    );
  }

  if (!isFacilityAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">You do not have admin access to this location.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/calendar')}>
          Go to Calendar
        </Button>
      </div>
    );
  }

  const isTabActive = (segment: string) => {
    if (!segment) {
      return location.pathname === basePath || location.pathname === `${basePath}/`;
    }
    return location.pathname.startsWith(`${basePath}/${segment}`);
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-green-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-green-700 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-700 font-medium">CourtTime-Pickle</p>
                <h1 className="text-2xl font-bold text-gray-900">{facilityName}</h1>
                <p className="text-gray-500 text-sm">Franchise location operator hub</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/calendar')}>
              Player View
            </Button>
          </div>

          <nav className="mt-5 flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {NAV_ITEMS.map(({ label, segment }) => {
              const to = segment ? `${basePath}/${segment}` : basePath;
              const active = isTabActive(segment);
              return (
                <NavLink
                  key={segment || 'dashboard'}
                  to={to}
                  end={!segment}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-green-700 text-white'
                      : 'text-gray-600 hover:bg-green-50 hover:text-green-800'
                  )}
                >
                  {label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
        <Outlet />
      </div>
    </div>
  );
}
