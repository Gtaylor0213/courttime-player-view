import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AppProvider, useAppContext } from './contexts/AppContext';
import { useAuth } from './contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthenticatedLayout } from './components/AuthenticatedLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

// Auth pages (public)
import { LoginPage } from './components/LoginPage';
import { UserRegistration } from './components/UserRegistration';
import { FacilityRegistration } from './components/FacilityRegistration';
import { ForgotPassword } from './components/ForgotPassword';
import { ResetPassword } from './components/ResetPassword';
import { AboutPage } from './components/AboutPage';

// Player pages
import { CourtCalendarView } from './components/CourtCalendarView';
import { PlayerProfile } from './components/PlayerProfile';
import { QuickReservation } from './components/QuickReservation';
import { ClubInfo } from './components/ClubInfo';
import { BulletinBoard } from './components/BulletinBoard';
import { FindHittingPartner } from './components/FindHittingPartner';
import { MessagesPage } from './components/MessagesPage';
import { MemberPayments } from './components/MemberPayments';
import { PaymentSuccess } from './components/PaymentSuccess';
import { LockoutPaid } from './components/LockoutPaid';

// Admin pages
import { AdminDashboard } from './components/admin/AdminDashboard';
import { FacilityManagement } from './components/admin/FacilityManagement';
import { CourtManagement } from './components/admin/CourtManagement';
import { BookingManagement } from './components/admin/BookingManagement';
import { AdminBooking } from './components/admin/AdminBooking';
import { MemberManagement } from './components/admin/MemberManagement';
import { HouseholdManagement } from './components/admin/HouseholdManagement';
import { AdminCommunication } from './components/admin/AdminCommunication';
import { AdminMemberPayments } from './components/admin/AdminMemberPayments';
import ProShopAdmin from './components/admin/ProShopAdmin';
import ProShop from './components/ProShop';
import AnnualFeesAdmin from './components/admin/AnnualFeesAdmin';
import AdminReports from './components/admin/AdminReports';

// Support Console
import { SupportConsole } from './components/developer';

// Pickle (CourtTime-Pickle) — only rendered when 'pickleball' feature flag is enabled
import { PickleOrgRegistration } from './components/pickle/PickleOrgRegistration';
import { PickleLocationRegistration } from './components/pickle/PickleLocationRegistration';
import { PickleOrgLayout } from './components/pickle/corporate/PickleOrgLayout';
import { PickleOrgOverview } from './components/pickle/corporate/PickleOrgOverview';
import { PickleLocationsList } from './components/pickle/corporate/PickleLocationsList';
import { PickleLocationDetail } from './components/pickle/corporate/PickleLocationDetail';
import { PickleAddLocationWizard } from './components/pickle/corporate/PickleAddLocationWizard';
import { PickleMembershipAdmin } from './components/pickle/membership/PickleMembershipAdmin';
import { PickleProgramCatalog } from './components/pickle/programs/PickleProgramCatalog';
import { PickleProShopAdmin } from './components/pickle/retail/PickleProShopAdmin';
import { PickleOrgReports } from './components/pickle/reporting/PickleOrgReports';
import { PickleCampaignAdmin } from './components/pickle/campaigns/PickleCampaignAdmin';
import {
  PickleFranchiseAdminLayout,
  PickleFranchiseDashboard,
  PickleFranchiseSetupWizard,
  PickleFranchiseMemberManagement,
  PickleFranchisePrograms,
  PickleFranchiseProShop,
  PickleFranchiseStripe,
} from './components/pickle/franchise';
import { PickleLeaderboard } from './components/pickle/leaderboard/PickleLeaderboard';

function PickleRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { enabledFeatures, featuresLoaded } = useAppContext();
  if (!user) return <Navigate to="/login" replace />;
  if (!featuresLoaded) return null;
  if (!enabledFeatures.includes('pickleball')) return <Navigate to="/calendar" replace />;
  return <>{children}</>;
}

// Legal pages (public, no auth)
import { PrivacyPolicyPage } from './components/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/legal/TermsOfServicePage';
import { AccountDeletionPage } from './components/legal/AccountDeletionPage';
import { SupportPage } from './components/legal/SupportPage';

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <NotificationProvider>
        <AppProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/about" element={<AboutPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<UserRegistration />} />
            <Route path="/register/facility" element={<FacilityRegistration />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Legal pages — required public URLs for App Store / Play Store submission */}
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/delete-account" element={<AccountDeletionPage />} />
            <Route path="/support" element={<SupportPage />} />

            {/* Support Console route - bypasses auth */}
            <Route path="/developer/*" element={<SupportConsole />} />

            {/* Protected routes with sidebar layout */}
            <Route element={
              <ProtectedRoute>
                <AuthenticatedLayout />
              </ProtectedRoute>
            }>
              <Route path="/calendar" element={<CourtCalendarView />} />
              <Route path="/profile" element={<PlayerProfile />} />
              <Route path="/quick-reservation" element={<QuickReservation />} />
              <Route path="/club/:clubId" element={<ClubInfo />} />
              <Route path="/bulletin-board" element={<BulletinBoard />} />
              <Route path="/hitting-partner" element={<FindHittingPartner />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/payments" element={<MemberPayments />} />
              <Route path="/payments/success" element={<PaymentSuccess />} />
              <Route path="/lockout-paid" element={<LockoutPaid />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/facilities" element={<FacilityManagement />} />
              <Route path="/admin/courts" element={<CourtManagement />} />
              <Route path="/admin/bookings" element={<BookingManagement />} />
              <Route path="/admin/booking" element={<AdminBooking />} />
              <Route path="/admin/members" element={<MemberManagement />} />
              <Route path="/admin/households" element={<HouseholdManagement />} />
              <Route path="/admin/communication" element={<AdminCommunication />} />
              <Route path="/admin/member-payments" element={<AdminMemberPayments />} />
              <Route path="/admin/pro-shop" element={<ProShopAdmin />} />
              <Route path="/admin/annual-fees" element={<AnnualFeesAdmin />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/shop" element={<ProShop />} />
              <Route path="/admin/email-blast" element={<Navigate to="/admin/communication" replace />} />
            </Route>

            {/* Pickle (CourtTime-Pickle) routes — gated by 'pickleball' feature flag */}
            <Route path="/pickle/register" element={<PickleRoute><PickleOrgRegistration /></PickleRoute>} />
            <Route path="/pickle/register/location/:facilityId" element={<PickleRoute><PickleLocationRegistration /></PickleRoute>} />
            <Route path="/pickle/location/:facilityId/setup" element={<PickleRoute><PickleFranchiseSetupWizard /></PickleRoute>} />
            <Route path="/pickle/location/:facilityId" element={<PickleRoute><PickleFranchiseAdminLayout /></PickleRoute>}>
              <Route index element={<PickleFranchiseDashboard />} />
              <Route path="members" element={<PickleFranchiseMemberManagement />} />
              <Route path="programs" element={<PickleFranchisePrograms />} />
              <Route path="pro-shop" element={<PickleFranchiseProShop />} />
              <Route path="stripe" element={<PickleFranchiseStripe />} />
            </Route>
            <Route path="/pickle/org/:orgId" element={<PickleRoute><PickleOrgLayout /></PickleRoute>}>
              <Route index element={<PickleOrgOverview />} />
              <Route path="locations" element={<PickleLocationsList />} />
              <Route path="locations/add" element={<PickleAddLocationWizard />} />
              <Route path="locations/:locId" element={<PickleLocationDetail />} />
              <Route path="memberships" element={<PickleMembershipAdmin />} />
              <Route path="programs" element={<PickleProgramCatalog />} />
              <Route path="pro-shop" element={<PickleProShopAdmin />} />
              <Route path="reports" element={<PickleOrgReports />} />
              <Route path="campaigns" element={<PickleCampaignAdmin />} />
            </Route>
            <Route path="/pickle/leaderboard/:orgId" element={<PickleRoute><PickleLeaderboard /></PickleRoute>} />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/calendar" replace />} />
            <Route path="*" element={<Navigate to="/calendar" replace />} />
          </Routes>
          <Toaster />
        </AppProvider>
      </NotificationProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
