import React, { useState } from 'react';
import { isSupportAuthenticated, clearSupportPassword } from '../../api/supportClient';
import { SupportLogin } from './SupportLogin';
import { SupportLayout } from './SupportLayout';
import { SupportDashboard } from './SupportDashboard';
import { SupportUserManagement } from './SupportUserManagement';
import { SupportFacilityManagement } from './SupportFacilityManagement';
import { SupportMemberManagement } from './SupportMemberManagement';
import { SupportBookingManagement } from './SupportBookingManagement';
import { SupportCourtManagement } from './SupportCourtManagement';

export type SupportView =
  | 'dashboard'
  | 'users'
  | 'facilities'
  | 'members'
  | 'bookings'
  | 'courts';

export function SupportConsole() {
  const [authenticated, setAuthenticated] = useState(isSupportAuthenticated());
  const [currentView, setCurrentView] = useState<SupportView>('dashboard');
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const handleLogout = () => {
    clearSupportPassword();
    setAuthenticated(false);
  };

  if (!authenticated) {
    return <SupportLogin onAuthenticated={() => setAuthenticated(true)} />;
  }

  const navigateTo = (view: SupportView, facilityId?: string, userId?: string) => {
    setCurrentView(view);
    if (facilityId !== undefined) setSelectedFacilityId(facilityId);
    if (userId !== undefined) setSelectedUserId(userId);
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <SupportDashboard onNavigate={navigateTo} />;
      case 'users':
        return (
          <SupportUserManagement
            selectedUserId={selectedUserId}
            onSelectUser={(id) => setSelectedUserId(id)}
          />
        );
      case 'facilities':
        return (
          <SupportFacilityManagement
            selectedFacilityId={selectedFacilityId}
            onSelectFacility={(id) => setSelectedFacilityId(id)}
          />
        );
      case 'members':
        return (
          <SupportMemberManagement
            selectedFacilityId={selectedFacilityId}
            onSelectFacility={(id) => setSelectedFacilityId(id)}
            onViewUser={(userId) => navigateTo('users', undefined, userId)}
          />
        );
      case 'bookings':
        return (
          <SupportBookingManagement
            selectedFacilityId={selectedFacilityId}
            onSelectFacility={(id) => setSelectedFacilityId(id)}
          />
        );
      case 'courts':
        return (
          <SupportCourtManagement
            selectedFacilityId={selectedFacilityId}
            onSelectFacility={(id) => setSelectedFacilityId(id)}
          />
        );
      default:
        return <SupportDashboard onNavigate={navigateTo} />;
    }
  };

  return (
    <SupportLayout
      currentView={currentView}
      onNavigate={navigateTo}
      onLogout={handleLogout}
    >
      {renderView()}
    </SupportLayout>
  );
}
