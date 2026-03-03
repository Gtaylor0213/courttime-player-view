import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UnifiedSidebar } from './UnifiedSidebar';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { Menu, AlertTriangle } from 'lucide-react';
import { cn } from './ui/utils';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';

function getCurrentPage(pathname: string): string {
  if (pathname.startsWith('/admin/facilities')) return 'facility-management';
  if (pathname.startsWith('/admin/courts')) return 'court-management';
  if (pathname.startsWith('/admin/bookings')) return 'booking-management';
  if (pathname.startsWith('/admin/booking')) return 'admin-booking';
  if (pathname.startsWith('/admin/members')) return 'member-management';
  if (pathname.startsWith('/admin/households')) return 'household-management';
  if (pathname.startsWith('/admin/communication')) return 'communication';
  if (pathname.startsWith('/admin')) return 'admin-dashboard';
  if (pathname.startsWith('/calendar')) return 'court-calendar';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/quick-reservation')) return 'quick-reservation';
  if (pathname.startsWith('/club/')) return 'club-info';
  if (pathname.startsWith('/bulletin-board')) return 'bulletin-board';
  if (pathname.startsWith('/hitting-partner')) return 'hitting-partner';
  if (pathname.startsWith('/messages')) return 'messages';
  return '';
}

export function AuthenticatedLayout() {
  const { user, logout: authLogout } = useAuth();
  const { sidebarCollapsed, toggleSidebar, setSidebarOpen } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  const currentPage = getCurrentPage(location.pathname);

  const handleLogout = async () => {
    await authLogout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <UnifiedSidebar
        userType={user?.userType || 'player'}
        currentPage={currentPage}
        onLogout={handleLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />
      <div className={cn(
        'transition-all duration-300 ease-in-out',
        sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
      )}>
        {/* Mobile header bar */}
        <div className="sticky top-0 z-30 flex items-center h-14 px-4 bg-white border-b md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <img src={logoImage} alt="CourtTime" className="h-8 w-auto ml-3" />
        </div>
        {/* Suspended membership banner */}
        {user?.suspendedFacilities && user.suspendedFacilities.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Membership Suspended</p>
                {user.suspendedFacilities.map((sf) => (
                  <p key={sf.facilityId} className="mt-1">
                    Your membership at <strong>{sf.facilityName}</strong> is suspended
                    {sf.suspendedUntil ? ` until ${new Date(sf.suspendedUntil).toLocaleDateString()}` : ''}.
                    Contact the facility for assistance.
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
