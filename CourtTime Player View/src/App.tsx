import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { Toaster } from './components/ui/sonner';
import { LoginPage } from './components/LoginPage';
import { CourtCalendarView } from './components/CourtCalendarView';
import { PlayerDashboard } from './components/PlayerDashboard';
import { QuickReservation } from './components/QuickReservation';
import { PlayerProfile } from './components/PlayerProfile';
import { UserRegistration } from './components/UserRegistration';
import { ClubInfo } from './components/ClubInfo';
import { BulletinBoard } from './components/BulletinBoard';
import { FindHittingPartner } from './components/FindHittingPartner';
import { ForgotPassword } from './components/ForgotPassword';
import { ResetPassword } from './components/ResetPassword';
import { FacilityRegistration } from './components/FacilityRegistration';
import { ViewSwitcher } from './components/ViewSwitcher';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { FacilityManagement } from './components/admin/FacilityManagement';
import { CourtManagement } from './components/admin/CourtManagement';
import { BookingManagement } from './components/admin/BookingManagement';
import { AdminBooking } from './components/admin/AdminBooking';
import { MemberManagement } from './components/admin/MemberManagement';
import { Analytics } from './components/admin/Analytics';

type Screen = 'login' | 'court-calendar' | 'player-dashboard' | 'quick-reservation' | 'profile' | 'user-registration' | 'facility-registration' | 'club-info' | 'bulletin-board' | 'hitting-partner' | 'forgot-password' | 'reset-password' | 'admin-dashboard' | 'facility-management' | 'court-management' | 'booking-management' | 'admin-booking' | 'member-management' | 'analytics';

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('sunrise-valley');
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [selectedClubName, setSelectedClubName] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'player' | 'admin'>('player');

  const { user, loading, logout: authLogout } = useAuth();

  // Update screen based on authentication state
  useEffect(() => {
    if (user && currentScreen === 'login') {
      setCurrentScreen('court-calendar');
    } else if (!user && currentScreen !== 'login' && currentScreen !== 'user-registration' && currentScreen !== 'facility-registration' && currentScreen !== 'forgot-password' && currentScreen !== 'reset-password') {
      setCurrentScreen('login');
      setSidebarCollapsed(false);
    }
  }, [user, currentScreen]);

  // Show loading spinner while auth is initializing
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const handleLogin = () => {
    // Authentication is handled by the AuthContext
    // The useEffect will handle navigation when user state changes
  };

  const handleLogout = async () => {
    await authLogout();
    setSidebarCollapsed(false);
    setCurrentScreen('login');
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const navigateToQuickReservation = () => {
    setCurrentScreen('quick-reservation');
  };

  const navigateToPlayerDashboard = () => {
    setCurrentScreen('player-dashboard');
  };

  const navigateToCourtCalendar = () => {
    setCurrentScreen('court-calendar');
  };

  const navigateToProfile = () => {
    setCurrentScreen('profile');
  };

  const navigateToClub = (clubId: string) => {
    setSelectedClubId(clubId);
    setCurrentScreen('club-info');
  };

  const navigateToHittingPartner = () => {
    setCurrentScreen('hitting-partner');
  };

  const navigateToBulletinBoard = (clubId?: string, clubName?: string) => {
    if (clubId && clubName) {
      setSelectedClubId(clubId);
      setSelectedClubName(clubName);
    }
    setCurrentScreen('bulletin-board');
  };

  const navigateBackToClub = () => {
    setCurrentScreen('club-info');
  };

  const navigateBack = () => {
    // Always navigate back to calendar view since it's now the main hub
    setCurrentScreen('court-calendar');
  };

  const handleFacilityChange = (facilityId: string) => {
    setSelectedFacilityId(facilityId);
  };

  // Registration Navigation handlers
  const navigateToUserRegistration = () => {
    setCurrentScreen('user-registration');
  };

  const navigateBackToLogin = () => {
    setCurrentScreen('login');
  };

  const handleUserRegistrationComplete = () => {
    // User is automatically logged in after registration
    // Navigate directly to the court calendar
    setCurrentScreen('court-calendar');
  };

  const navigateToFacilityRegistration = () => {
    setCurrentScreen('facility-registration');
  };

  const handleFacilityRegistrationComplete = () => {
    setCurrentScreen('login');
  };

  const navigateToForgotPassword = () => {
    setCurrentScreen('forgot-password');
  };

  const navigateToResetPassword = () => {
    setCurrentScreen('reset-password');
  };

  const handlePasswordResetComplete = () => {
    setCurrentScreen('login');
  };

  // Admin Navigation handlers
  const navigateToAdminDashboard = () => {
    setCurrentScreen('admin-dashboard');
  };

  const navigateToFacilityManagement = () => {
    setCurrentScreen('facility-management');
  };

  const navigateToCourtManagement = () => {
    setCurrentScreen('court-management');
  };

  const navigateToBookingManagement = () => {
    setCurrentScreen('booking-management');
  };

  const navigateToAdminBooking = () => {
    setCurrentScreen('admin-booking');
  };

  const navigateToMemberManagement = () => {
    setCurrentScreen('member-management');
  };

  const navigateToAnalytics = () => {
    setCurrentScreen('analytics');
  };

  const handleViewModeChange = (mode: 'player' | 'admin') => {
    setViewMode(mode);
    // Navigate to appropriate dashboard when switching modes
    if (mode === 'admin') {
      setCurrentScreen('admin-dashboard');
    } else {
      setCurrentScreen('court-calendar');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* View Switcher - Only show when logged in */}
      {user && <ViewSwitcher viewMode={viewMode} onViewModeChange={handleViewModeChange} />}

      {currentScreen === 'login' && (
        <LoginPage
          onLogin={handleLogin}
          onNavigateToUserRegistration={navigateToUserRegistration}
          onNavigateToFacilityRegistration={navigateToFacilityRegistration}
          onNavigateToForgotPassword={navigateToForgotPassword}
        />
      )}

      {currentScreen === 'forgot-password' && (
        <ForgotPassword
          onBack={navigateBackToLogin}
        />
      )}

      {currentScreen === 'reset-password' && (
        <ResetPassword
          onBack={navigateBackToLogin}
          onResetComplete={handlePasswordResetComplete}
          resetToken="mock-reset-token-123"
        />
      )}
      
      {currentScreen === 'user-registration' && (
        <UserRegistration
          onBack={navigateBackToLogin}
          onRegistrationComplete={handleUserRegistrationComplete}
        />
      )}

      {currentScreen === 'facility-registration' && (
        <FacilityRegistration
          onBack={navigateBackToLogin}
          onRegistrationComplete={handleFacilityRegistrationComplete}
        />
      )}
      
      {currentScreen === 'court-calendar' && (
        <CourtCalendarView
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToProfile={navigateToProfile}
          onNavigateToClub={navigateToClub}
          onNavigateToBulletinBoard={navigateToBulletinBoard}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onLogout={handleLogout}
          selectedFacilityId={selectedFacilityId}
          onFacilityChange={handleFacilityChange}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'player-dashboard' && (
        <PlayerDashboard
          onLogout={handleLogout}
          onQuickBook={navigateToQuickReservation}
          onNavigateToProfile={navigateToProfile}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'profile' && (
        <PlayerProfile
          onBack={navigateToCourtCalendar}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          selectedFacilityId={selectedFacilityId}
          onFacilityChange={handleFacilityChange}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'quick-reservation' && (
        <QuickReservation
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          selectedFacilityId={selectedFacilityId}
          onFacilityChange={handleFacilityChange}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'club-info' && (
        <ClubInfo
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onNavigateToBulletinBoard={navigateToBulletinBoard}
          selectedFacilityId={selectedFacilityId}
          onFacilityChange={handleFacilityChange}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          clubId={selectedClubId}
        />
      )}

      {currentScreen === 'bulletin-board' && (
        <BulletinBoard
          onBack={navigateToCourtCalendar}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToBulletinBoard={navigateToBulletinBoard}
          onNavigateToHittingPartner={navigateToHittingPartner}
          selectedFacilityId={selectedFacilityId}
          onFacilityChange={handleFacilityChange}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          clubId={selectedClubId}
          clubName={selectedClubName}
        />
      )}

      {currentScreen === 'hitting-partner' && (
        <FindHittingPartner
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          selectedFacilityId={selectedFacilityId}
          onFacilityChange={handleFacilityChange}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {/* Admin Pages */}
      {currentScreen === 'admin-dashboard' && (
        <AdminDashboard
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onNavigateToAdminDashboard={navigateToAdminDashboard}
          onNavigateToFacilityManagement={navigateToFacilityManagement}
          onNavigateToCourtManagement={navigateToCourtManagement}
          onNavigateToBookingManagement={navigateToBookingManagement}
          onNavigateToAdminBooking={navigateToAdminBooking}
          onNavigateToMemberManagement={navigateToMemberManagement}
          onNavigateToAnalytics={navigateToAnalytics}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'facility-management' && (
        <FacilityManagement
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onNavigateToAdminDashboard={navigateToAdminDashboard}
          onNavigateToFacilityManagement={navigateToFacilityManagement}
          onNavigateToCourtManagement={navigateToCourtManagement}
          onNavigateToBookingManagement={navigateToBookingManagement}
          onNavigateToAdminBooking={navigateToAdminBooking}
          onNavigateToMemberManagement={navigateToMemberManagement}
          onNavigateToAnalytics={navigateToAnalytics}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'court-management' && (
        <CourtManagement
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onNavigateToAdminDashboard={navigateToAdminDashboard}
          onNavigateToFacilityManagement={navigateToFacilityManagement}
          onNavigateToCourtManagement={navigateToCourtManagement}
          onNavigateToBookingManagement={navigateToBookingManagement}
          onNavigateToAdminBooking={navigateToAdminBooking}
          onNavigateToMemberManagement={navigateToMemberManagement}
          onNavigateToAnalytics={navigateToAnalytics}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'booking-management' && (
        <BookingManagement
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onNavigateToAdminDashboard={navigateToAdminDashboard}
          onNavigateToFacilityManagement={navigateToFacilityManagement}
          onNavigateToCourtManagement={navigateToCourtManagement}
          onNavigateToBookingManagement={navigateToBookingManagement}
          onNavigateToAdminBooking={navigateToAdminBooking}
          onNavigateToMemberManagement={navigateToMemberManagement}
          onNavigateToAnalytics={navigateToAnalytics}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'admin-booking' && (
        <AdminBooking
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onNavigateToAdminDashboard={navigateToAdminDashboard}
          onNavigateToFacilityManagement={navigateToFacilityManagement}
          onNavigateToCourtManagement={navigateToCourtManagement}
          onNavigateToBookingManagement={navigateToBookingManagement}
          onNavigateToAdminBooking={navigateToAdminBooking}
          onNavigateToMemberManagement={navigateToMemberManagement}
          onNavigateToAnalytics={navigateToAnalytics}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'member-management' && (
        <MemberManagement
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onNavigateToAdminDashboard={navigateToAdminDashboard}
          onNavigateToFacilityManagement={navigateToFacilityManagement}
          onNavigateToCourtManagement={navigateToCourtManagement}
          onNavigateToBookingManagement={navigateToBookingManagement}
          onNavigateToAdminBooking={navigateToAdminBooking}
          onNavigateToMemberManagement={navigateToMemberManagement}
          onNavigateToAnalytics={navigateToAnalytics}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      {currentScreen === 'analytics' && (
        <Analytics
          onBack={navigateBack}
          onLogout={handleLogout}
          onNavigateToProfile={navigateToProfile}
          onNavigateToPlayerDashboard={navigateToPlayerDashboard}
          onNavigateToCalendar={navigateToCourtCalendar}
          onNavigateToClub={navigateToClub}
          onNavigateToHittingPartner={navigateToHittingPartner}
          onNavigateToAdminDashboard={navigateToAdminDashboard}
          onNavigateToFacilityManagement={navigateToFacilityManagement}
          onNavigateToCourtManagement={navigateToCourtManagement}
          onNavigateToBookingManagement={navigateToBookingManagement}
          onNavigateToAdminBooking={navigateToAdminBooking}
          onNavigateToMemberManagement={navigateToMemberManagement}
          onNavigateToAnalytics={navigateToAnalytics}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      )}

      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </AuthProvider>
  );
}