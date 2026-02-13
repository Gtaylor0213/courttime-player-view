import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UnifiedSidebar } from './UnifiedSidebar';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';

function getCurrentPage(pathname: string): string {
  if (pathname.startsWith('/admin/facilities')) return 'facility-management';
  if (pathname.startsWith('/admin/courts')) return 'court-management';
  if (pathname.startsWith('/admin/bookings')) return 'booking-management';
  if (pathname.startsWith('/admin/booking')) return 'admin-booking';
  if (pathname.startsWith('/admin/members')) return 'member-management';
  if (pathname.startsWith('/admin')) return 'admin-dashboard';
  if (pathname.startsWith('/calendar')) return 'court-calendar';
  if (pathname.startsWith('/dashboard')) return 'player-dashboard';
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
  const { sidebarCollapsed, toggleSidebar } = useAppContext();
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
      <div className={`${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        <Outlet />
      </div>
    </div>
  );
}
